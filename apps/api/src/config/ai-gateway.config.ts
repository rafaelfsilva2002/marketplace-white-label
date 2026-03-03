import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AIGateway } from '@marketplace/ai-gateway';

export const AI_GATEWAY_TOKEN = Symbol('AI_GATEWAY');

/**
 * Provider for AIGateway.
 *
 * Resolves a concrete AIGateway implementation at runtime using
 * the ConfigService.  Each feature module that requires AI
 * capabilities registers this provider so the gateway can be
 * swapped per-module in tests.
 *
 * The concrete implementation is expected to be configured via
 * environment variables (AI_GATEWAY_PROVIDER, OPENAI_API_KEY, etc.).
 */
export const AIGatewayProvider: Provider<AIGateway> = {
  provide: AI_GATEWAY_TOKEN,
  useFactory: (configService: ConfigService): AIGateway => {
    // Lazy-load the concrete gateway to avoid circular deps at import time.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createAIGateway } = require('@marketplace/ai-gateway');
    return createAIGateway({
      openaiApiKey: configService.get<string>('OPENAI_API_KEY'),
      anthropicApiKey: configService.get<string>('ANTHROPIC_API_KEY'),
      ollamaBaseUrl: configService.get<string>('OLLAMA_BASE_URL'),
      defaultProvider: configService.get<string>('AI_GATEWAY_PROVIDER') ?? 'openai',
    });
  },
  inject: [ConfigService],
};
