import type {
  AIGateway,
  CompletionParams,
  CompletionResponse,
  EmbeddingParams,
  EmbeddingResponse,
  VisionParams,
  VisionResponse,
  ModerationParams,
  ModerationResponse,
} from './interfaces/ai-gateway.interface';
import { OpenAIProvider } from './providers/openai.provider';
import { AnthropicProvider } from './providers/anthropic.provider';
import { OllamaProvider } from './providers/ollama.provider';
import { PiiSanitizer } from './middleware/pii-sanitizer';
import { CostTracker } from './metrics/cost-tracker';
import type { CostPersistenceStore } from './metrics/cost-tracker';

type ProviderName = 'openai' | 'anthropic' | 'ollama';

export interface AIGatewayConfig {
  defaultProvider: ProviderName;
  fallbackChain: ProviderName[];
  openaiApiKey?: string;
  anthropicApiKey?: string;
  ollamaBaseUrl?: string;
  circuitBreaker?: {
    failureThreshold?: number;
    halfOpenAfterMs?: number;
  };
  costPersistenceStore?: CostPersistenceStore;
  logger?: GatewayLogger;
}

export interface GatewayLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

interface CircuitState {
  failures: number;
  state: 'closed' | 'open' | 'half-open';
  lastFailure: number;
}

const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_HALF_OPEN_AFTER_MS = 30_000;

export class AIGatewayService implements AIGateway {
  private readonly providers: Map<ProviderName, AIGateway>;
  private readonly defaultProvider: ProviderName;
  private readonly fallbackChain: ProviderName[];
  private readonly circuits: Map<ProviderName, CircuitState>;
  private readonly failureThreshold: number;
  private readonly halfOpenAfterMs: number;
  private readonly sanitizer: PiiSanitizer;
  private readonly costTracker: CostTracker;
  private readonly logger: GatewayLogger;

  constructor(config: AIGatewayConfig) {
    this.defaultProvider = config.defaultProvider;
    this.fallbackChain = config.fallbackChain;
    this.failureThreshold =
      config.circuitBreaker?.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
    this.halfOpenAfterMs =
      config.circuitBreaker?.halfOpenAfterMs ?? DEFAULT_HALF_OPEN_AFTER_MS;

    this.providers = new Map<ProviderName, AIGateway>();
    this.providers.set('openai', new OpenAIProvider(config.openaiApiKey));
    this.providers.set('anthropic', new AnthropicProvider(config.anthropicApiKey));
    this.providers.set('ollama', new OllamaProvider(config.ollamaBaseUrl));

    this.circuits = new Map<ProviderName, CircuitState>();
    for (const name of ['openai', 'anthropic', 'ollama'] as ProviderName[]) {
      this.circuits.set(name, {
        failures: 0,
        state: 'closed',
        lastFailure: 0,
      });
    }

    this.sanitizer = new PiiSanitizer();
    this.costTracker = new CostTracker({
      persistenceStore: config.costPersistenceStore,
    });

    this.logger = config.logger ?? createDefaultLogger();
  }

  async complete(params: CompletionParams): Promise<CompletionResponse> {
    const { correlationId } = params;
    this.logger.info('complete: request received', { correlationId });

    const sanitizedMessages = params.messages.map((msg) => {
      const { sanitized, replacements } = this.sanitizer.sanitize(msg.content);
      return { ...msg, content: sanitized, _replacements: replacements };
    });

    const sanitizedParams: CompletionParams = {
      ...params,
      messages: sanitizedMessages.map(({ _replacements, ...msg }) => msg),
    };

    const allReplacements = new Map<string, string>();
    for (const msg of sanitizedMessages) {
      for (const [key, val] of msg._replacements.entries()) {
        allReplacements.set(key, val);
      }
    }

    const providerChain = this.buildProviderChain(params.provider);

    const response = await this.executeWithFallback<CompletionResponse>(
      providerChain,
      correlationId,
      (provider) => provider.complete(sanitizedParams),
    );

    const restoredContent = this.sanitizer.restore(
      response.content,
      allReplacements,
    );

    this.costTracker.record({
      provider: response.provider,
      model: response.model,
      operation: 'complete',
      costUsd: response.costUsd,
      tokens: response.usage.totalTokens,
      userId: params.userId,
      correlationId,
    });

    this.logger.info('complete: request completed', {
      correlationId,
      provider: response.provider,
      model: response.model,
      tokens: response.usage.totalTokens,
      costUsd: response.costUsd,
    });

    return { ...response, content: restoredContent };
  }

  async createEmbedding(params: EmbeddingParams): Promise<EmbeddingResponse> {
    const { correlationId } = params;
    this.logger.info('createEmbedding: request received', { correlationId });

    const providerChain = this.buildProviderChain(undefined, ['openai', 'ollama']);

    const response = await this.executeWithFallback<EmbeddingResponse>(
      providerChain,
      correlationId,
      (provider) => provider.createEmbedding(params),
    );

    this.costTracker.record({
      provider: response.provider,
      model: response.model,
      operation: 'embedding',
      costUsd: response.costUsd,
      tokens: 0,
      userId: params.userId,
      correlationId,
    });

    this.logger.info('createEmbedding: request completed', {
      correlationId,
      provider: response.provider,
      model: response.model,
      costUsd: response.costUsd,
    });

    return response;
  }

  async analyzeImage(params: VisionParams): Promise<VisionResponse> {
    const { correlationId } = params;
    this.logger.info('analyzeImage: request received', { correlationId });

    const providerChain = this.buildProviderChain();

    const response = await this.executeWithFallback<VisionResponse>(
      providerChain,
      correlationId,
      (provider) => provider.analyzeImage(params),
    );

    this.costTracker.record({
      provider: response.provider,
      model: response.model,
      operation: 'vision',
      costUsd: response.costUsd,
      tokens: 0,
      correlationId,
    });

    this.logger.info('analyzeImage: request completed', {
      correlationId,
      provider: response.provider,
      model: response.model,
      costUsd: response.costUsd,
    });

    return response;
  }

  async moderateContent(params: ModerationParams): Promise<ModerationResponse> {
    const { correlationId } = params;
    this.logger.info('moderateContent: request received', { correlationId });

    const { sanitized, replacements: _replacements } = this.sanitizer.sanitize(
      params.text,
    );
    const sanitizedParams: ModerationParams = { ...params, text: sanitized };

    const providerChain = this.buildProviderChain();

    const response = await this.executeWithFallback<ModerationResponse>(
      providerChain,
      correlationId,
      (provider) => provider.moderateContent(sanitizedParams),
    );

    this.costTracker.record({
      provider: 'gateway',
      model: 'moderation',
      operation: 'moderation',
      costUsd: 0,
      tokens: 0,
      correlationId,
    });

    this.logger.info('moderateContent: request completed', {
      correlationId,
      flagged: response.flagged,
    });

    return response;
  }

  getCostTracker(): CostTracker {
    return this.costTracker;
  }

  async destroy(): Promise<void> {
    await this.costTracker.flush();
    this.costTracker.destroy();
  }

  private buildProviderChain(
    preferred?: ProviderName,
    allowedProviders?: ProviderName[],
  ): ProviderName[] {
    const chain: ProviderName[] = [];

    const primary = preferred ?? this.defaultProvider;

    if (!allowedProviders || allowedProviders.includes(primary)) {
      chain.push(primary);
    }

    for (const fallback of this.fallbackChain) {
      if (fallback === primary) {
        continue;
      }
      if (allowedProviders && !allowedProviders.includes(fallback)) {
        continue;
      }
      chain.push(fallback);
    }

    return chain;
  }

  private async executeWithFallback<T>(
    providerChain: ProviderName[],
    correlationId: string,
    fn: (provider: AIGateway) => Promise<T>,
  ): Promise<T> {
    const errors: Array<{ provider: string; error: Error }> = [];

    for (const providerName of providerChain) {
      if (!this.isCircuitAllowed(providerName)) {
        this.logger.warn('circuit open, skipping provider', {
          correlationId,
          provider: providerName,
        });
        continue;
      }

      const provider = this.providers.get(providerName);
      if (!provider) {
        continue;
      }

      try {
        const result = await fn(provider);
        this.recordSuccess(providerName);
        return result;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.recordFailure(providerName);
        errors.push({ provider: providerName, error: err });

        this.logger.warn('provider failed, trying next in chain', {
          correlationId,
          provider: providerName,
          error: err.message,
        });
      }
    }

    const errorMessages = errors
      .map((e) => `${e.provider}: ${e.error.message}`)
      .join('; ');
    throw new Error(
      `All providers in fallback chain failed [correlationId=${correlationId}]: ${errorMessages}`,
    );
  }

  private isCircuitAllowed(provider: ProviderName): boolean {
    const circuit = this.circuits.get(provider);
    if (!circuit) {
      return true;
    }

    if (circuit.state === 'closed') {
      return true;
    }

    if (circuit.state === 'open') {
      const elapsed = Date.now() - circuit.lastFailure;
      if (elapsed >= this.halfOpenAfterMs) {
        circuit.state = 'half-open';
        return true;
      }
      return false;
    }

    return true;
  }

  private recordSuccess(provider: ProviderName): void {
    const circuit = this.circuits.get(provider);
    if (circuit) {
      circuit.failures = 0;
      circuit.state = 'closed';
    }
  }

  private recordFailure(provider: ProviderName): void {
    const circuit = this.circuits.get(provider);
    if (!circuit) {
      return;
    }

    circuit.failures++;
    circuit.lastFailure = Date.now();

    if (circuit.failures >= this.failureThreshold) {
      circuit.state = 'open';
      this.logger.warn('circuit breaker opened', {
        provider,
        failures: circuit.failures,
      });
    }
  }
}

function createDefaultLogger(): GatewayLogger {
  return {
    info(message: string, meta?: Record<string, unknown>) {
      console.log(`[ai-gateway] INFO: ${message}`, meta ?? '');
    },
    warn(message: string, meta?: Record<string, unknown>) {
      console.warn(`[ai-gateway] WARN: ${message}`, meta ?? '');
    },
    error(message: string, meta?: Record<string, unknown>) {
      console.error(`[ai-gateway] ERROR: ${message}`, meta ?? '');
    },
  };
}
