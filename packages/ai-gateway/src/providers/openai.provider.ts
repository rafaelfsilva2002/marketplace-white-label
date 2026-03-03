import OpenAI from 'openai';
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
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
};

const EMBEDDING_COST_PER_1K_TOKENS: Record<string, number> = {
  'text-embedding-3-small': 0.00002,
  'text-embedding-3-large': 0.00013,
};

function estimateCompletionCost(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const pricing = COST_PER_1K_TOKENS[model];
  if (!pricing) {
    return 0;
  }
  return (
    (promptTokens / 1000) * pricing.input +
    (completionTokens / 1000) * pricing.output
  );
}

function estimateEmbeddingCost(model: string, totalTokens: number): number {
  const costPer1k = EMBEDDING_COST_PER_1K_TOKENS[model];
  if (!costPer1k) {
    return 0;
  }
  return (totalTokens / 1000) * costPer1k;
}

export class OpenAIProvider implements AIGateway {
  private readonly client: OpenAI;

  constructor(apiKey?: string) {
    this.client = new OpenAI({
      apiKey: apiKey ?? process.env.OPENAI_API_KEY,
    });
  }

  async complete(params: CompletionParams): Promise<CompletionResponse> {
    const model = params.model ?? 'gpt-4o-mini';

    const response = await this.client.chat.completions.create({
      model,
      messages: params.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens,
    });

    const choice = response.choices[0];
    const promptTokens = response.usage?.prompt_tokens ?? 0;
    const completionTokens = response.usage?.completion_tokens ?? 0;

    return {
      content: choice?.message?.content ?? '',
      model: response.model,
      provider: 'openai',
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
      costUsd: estimateCompletionCost(model, promptTokens, completionTokens),
    };
  }

  async createEmbedding(params: EmbeddingParams): Promise<EmbeddingResponse> {
    const model = params.model === 'local' ? 'text-embedding-3-small' : (params.model ?? 'text-embedding-3-small');

    const input = Array.isArray(params.input) ? params.input : [params.input];

    const response = await this.client.embeddings.create({
      model,
      input,
    });

    const totalTokens = response.usage?.total_tokens ?? 0;

    return {
      embeddings: response.data.map((d) => d.embedding),
      model: response.model,
      provider: 'openai',
      costUsd: estimateEmbeddingCost(model, totalTokens),
    };
  }

  async analyzeImage(params: VisionParams): Promise<VisionResponse> {
    const model = 'gpt-4o';

    const categoryList = params.categories.join(', ');
    const systemPrompt = [
      'You are an image analysis system. Analyze the provided image and score it against the given categories.',
      'Return a JSON object with two fields:',
      '  "scores": an object mapping each category to a confidence score between 0.0 and 1.0',
      '  "labels": an array of strings for any labels detected in the image',
      'Return ONLY valid JSON, no additional text.',
    ].join('\n');

    const response = await this.client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze this image for these categories: ${categoryList}`,
            },
            {
              type: 'image_url',
              image_url: { url: params.imageUrl },
            },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 1024,
    });

    const promptTokens = response.usage?.prompt_tokens ?? 0;
    const completionTokens = response.usage?.completion_tokens ?? 0;

    const rawContent = response.choices[0]?.message?.content ?? '{}';
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
      provider: 'openai',
      costUsd: estimateCompletionCost(model, promptTokens, completionTokens),
    };
  }

  async moderateContent(params: ModerationParams): Promise<ModerationResponse> {
    const response = await this.client.moderations.create({
      input: params.text,
    });

    const result = response.results[0];

    const categories: Record<string, boolean> = {};
    const scores: Record<string, number> = {};

    if (result) {
      for (const [key, value] of Object.entries(result.categories)) {
        categories[key] = value as boolean;
      }
      for (const [key, value] of Object.entries(result.category_scores)) {
        scores[key] = value as number;
      }
    }

    return {
      flagged: result?.flagged ?? false,
      categories,
      scores,
    };
  }
}
