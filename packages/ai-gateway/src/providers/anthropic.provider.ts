import Anthropic from '@anthropic-ai/sdk';
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
} from '../interfaces/ai-gateway.interface';

const COST_PER_1K_TOKENS: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-20250514': { input: 0.003, output: 0.015 },
  'claude-3-5-sonnet-20241022': { input: 0.003, output: 0.015 },
  'claude-3-5-haiku-20241022': { input: 0.0008, output: 0.004 },
  'claude-3-opus-20240229': { input: 0.015, output: 0.075 },
  'claude-3-haiku-20240307': { input: 0.00025, output: 0.00125 },
};

function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = COST_PER_1K_TOKENS[model];
  if (!pricing) {
    return 0;
  }
  return (
    (inputTokens / 1000) * pricing.input +
    (outputTokens / 1000) * pricing.output
  );
}

export class AnthropicProvider implements AIGateway {
  private readonly client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({
      apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY,
    });
  }

  async complete(params: CompletionParams): Promise<CompletionResponse> {
    const model = params.model ?? 'claude-3-5-haiku-20241022';

    const systemMessage = params.messages.find((m) => m.role === 'system');
    const nonSystemMessages = params.messages.filter((m) => m.role !== 'system');

    const response = await this.client.messages.create({
      model,
      max_tokens: params.maxTokens ?? 4096,
      ...(systemMessage ? { system: systemMessage.content } : {}),
      messages: nonSystemMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      temperature: params.temperature ?? 0.7,
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    const content = textBlock && 'text' in textBlock ? textBlock.text : '';

    return {
      content,
      model: response.model,
      provider: 'anthropic',
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
      costUsd: estimateCost(
        model,
        response.usage.input_tokens,
        response.usage.output_tokens,
      ),
    };
  }

  async createEmbedding(_params: EmbeddingParams): Promise<EmbeddingResponse> {
    throw new Error(
      'NOT_SUPPORTED: Anthropic does not provide an embeddings API. Use OpenAI or Ollama provider instead.',
    );
  }

  async analyzeImage(params: VisionParams): Promise<VisionResponse> {
    const model = 'claude-sonnet-4-20250514';
    const categoryList = params.categories.join(', ');

    const systemPrompt = [
      'You are an image analysis system. Analyze the provided image and score it against the given categories.',
      'Return a JSON object with two fields:',
      '  "scores": an object mapping each category to a confidence score between 0.0 and 1.0',
      '  "labels": an array of strings for any labels detected in the image',
      'Return ONLY valid JSON, no additional text.',
    ].join('\n');

    let imageSource: Anthropic.ImageBlockParam['source'];

    if (params.imageUrl.startsWith('data:')) {
      const match = params.imageUrl.match(
        /^data:(image\/\w+);base64,(.+)$/,
      );
      if (!match) {
        throw new Error('Invalid base64 image data URL');
      }
      imageSource = {
        type: 'base64',
        media_type: match[1] as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
        data: match[2],
      };
    } else {
      imageSource = {
        type: 'url',
        url: params.imageUrl,
      };
    }

    const response = await this.client.messages.create({
      model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: imageSource,
            },
            {
              type: 'text',
              text: `Analyze this image for these categories: ${categoryList}`,
            },
          ],
        },
      ],
      temperature: 0.1,
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    const rawContent = textBlock && 'text' in textBlock ? textBlock.text : '{}';

    let parsed: { scores?: Record<string, number>; labels?: string[] };
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      parsed = { scores: {}, labels: [] };
    }

    return {
      scores: parsed.scores ?? {},
      labels: parsed.labels ?? [],
      model,
      provider: 'anthropic',
      costUsd: estimateCost(
        model,
        response.usage.input_tokens,
        response.usage.output_tokens,
      ),
    };
  }

  async moderateContent(params: ModerationParams): Promise<ModerationResponse> {
    const model = 'claude-3-5-haiku-20241022';

    const systemPrompt = [
      'You are a content moderation system. Analyze the provided text for the following categories:',
      '- sexual: sexually explicit content',
      '- hate: hateful or discriminatory content',
      '- harassment: harassment or bullying',
      '- self-harm: self-harm or suicide content',
      '- violence: violent or graphic content',
      '- illegal: illegal activities or content',
      '',
      'Return a JSON object with:',
      '  "flagged": boolean (true if any category score > 0.7)',
      '  "categories": object mapping each category to boolean (true if detected)',
      '  "scores": object mapping each category to a confidence score between 0.0 and 1.0',
      'Return ONLY valid JSON, no additional text.',
    ].join('\n');

    const response = await this.client.messages.create({
      model,
      max_tokens: 512,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Moderate this content:\n\n${params.text}`,
        },
      ],
      temperature: 0.0,
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    const rawContent = textBlock && 'text' in textBlock ? textBlock.text : '{}';

    let parsed: {
      flagged?: boolean;
      categories?: Record<string, boolean>;
      scores?: Record<string, number>;
    };
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      parsed = { flagged: false, categories: {}, scores: {} };
    }

    return {
      flagged: parsed.flagged ?? false,
      categories: parsed.categories ?? {},
      scores: parsed.scores ?? {},
    };
  }
}
