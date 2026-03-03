import { Injectable, Inject } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  CompletionParams,
  CompletionResponse,
} from '@marketplace/ai-gateway';
import { StructuredLogger } from '@/common/logger/structured.logger';
import { ExperimentService } from './experiment.service';

export const AI_GATEWAY_TOKEN = Symbol('AI_GATEWAY');

export interface AIGatewayPort {
  complete(params: CompletionParams): Promise<CompletionResponse>;
}

export interface ABRouteParams {
  experimentId: string;
  userId: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  correlationId?: string;
}

export interface ABRouteResult {
  response: CompletionResponse;
  variantId: string;
  variantName: string;
  experimentId: string;
  metrics: {
    latency_ms: number;
    cost_usd: number;
  };
}

@Injectable()
export class ABRouterService {
  private readonly logger = new StructuredLogger('ABRouterService');

  constructor(
    private readonly experimentService: ExperimentService,
    @Inject(AI_GATEWAY_TOKEN) private readonly aiGateway: AIGatewayPort,
  ) {}

  async routeRequest(params: ABRouteParams): Promise<ABRouteResult> {
    const correlationId = params.correlationId ?? randomUUID();

    // Assign variant based on experiment + user
    const variant = await this.experimentService.assignVariant(
      params.experimentId,
      params.userId,
    );

    const config = variant.config;

    // Build completion params with variant overrides
    const completionParams: CompletionParams = {
      messages: this.buildMessages(params.messages, config.prompt),
      model: config.model ?? params.model,
      temperature: config.temperature ?? params.temperature,
      maxTokens: config.maxTokens ?? params.maxTokens,
      provider: config.provider,
      userId: params.userId,
      correlationId,
    };

    this.logger.logWithData(
      'info',
      'AB routing request',
      {
        experimentId: params.experimentId,
        variantId: variant.id,
        variantName: variant.name,
        model: completionParams.model,
        provider: completionParams.provider,
        correlationId,
      },
      'ABRouterService',
    );

    const startTime = Date.now();

    const response = await this.aiGateway.complete(completionParams);

    const latencyMs = Date.now() - startTime;
    const costUsd = response.costUsd;

    const metrics = {
      latency_ms: latencyMs,
      cost_usd: costUsd,
    };

    // Record the result automatically
    await this.experimentService.recordResult(
      params.experimentId,
      variant.id,
      params.userId,
      metrics,
      correlationId,
    );

    this.logger.logWithData(
      'info',
      'AB route completed',
      {
        experimentId: params.experimentId,
        variantId: variant.id,
        variantName: variant.name,
        latencyMs,
        costUsd,
        model: response.model,
        provider: response.provider,
        correlationId,
      },
      'ABRouterService',
    );

    return {
      response,
      variantId: variant.id,
      variantName: variant.name,
      experimentId: params.experimentId,
      metrics,
    };
  }

  private buildMessages(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    promptOverride?: string,
  ): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
    if (!promptOverride) {
      return messages;
    }

    // If a prompt override is provided in the variant config,
    // replace or prepend the system message
    const hasSystemMessage = messages.some((m) => m.role === 'system');

    if (hasSystemMessage) {
      return messages.map((msg) =>
        msg.role === 'system'
          ? { ...msg, content: promptOverride }
          : msg,
      );
    }

    return [{ role: 'system', content: promptOverride }, ...messages];
  }
}
