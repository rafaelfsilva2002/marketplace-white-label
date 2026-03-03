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

interface OllamaChatResponse {
  model: string;
  message: {
    role: string;
    content: string;
  };
  prompt_eval_count?: number;
  eval_count?: number;
}

interface OllamaEmbeddingResponse {
  embedding: number[];
}

export class OllamaProvider implements AIGateway {
  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Ollama API error ${response.status}: ${errorText}`,
      );
    }

    return response.json() as Promise<T>;
  }

  async complete(params: CompletionParams): Promise<CompletionResponse> {
    const model = params.model ?? 'llama3.2';

    const messages = params.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const response = await this.post<OllamaChatResponse>('/api/chat', {
      model,
      messages,
      stream: false,
      options: {
        temperature: params.temperature ?? 0.7,
        ...(params.maxTokens ? { num_predict: params.maxTokens } : {}),
      },
    });

    const promptTokens = response.prompt_eval_count ?? 0;
    const completionTokens = response.eval_count ?? 0;

    return {
      content: response.message.content,
      model: response.model,
      provider: 'ollama',
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
      costUsd: 0,
    };
  }

  async createEmbedding(params: EmbeddingParams): Promise<EmbeddingResponse> {
    const model = params.model === 'local' ? 'nomic-embed-text' : (params.model ?? 'nomic-embed-text');

    const inputs = Array.isArray(params.input) ? params.input : [params.input];

    const embeddings: number[][] = [];

    for (const input of inputs) {
      const response = await this.post<OllamaEmbeddingResponse>(
        '/api/embeddings',
        {
          model,
          prompt: input,
        },
      );
      embeddings.push(response.embedding);
    }

    return {
      embeddings,
      model,
      provider: 'ollama',
      costUsd: 0,
    };
  }

  async analyzeImage(params: VisionParams): Promise<VisionResponse> {
    const model = 'llava';
    const categoryList = params.categories.join(', ');

    const systemPrompt = [
      'You are an image analysis system. Analyze the provided image and score it against the given categories.',
      'Return a JSON object with two fields:',
      '  "scores": an object mapping each category to a confidence score between 0.0 and 1.0',
      '  "labels": an array of strings for any labels detected in the image',
      'Return ONLY valid JSON, no additional text.',
    ].join('\n');

    let images: string[] = [];
    if (params.imageUrl.startsWith('data:')) {
      const match = params.imageUrl.match(/^data:image\/\w+;base64,(.+)$/);
      if (match) {
        images = [match[1]];
      }
    } else {
      const imageResponse = await fetch(params.imageUrl);
      const buffer = await imageResponse.arrayBuffer();
      images = [Buffer.from(buffer).toString('base64')];
    }

    const response = await this.post<OllamaChatResponse>('/api/chat', {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Analyze this image for these categories: ${categoryList}`,
          images,
        },
      ],
      stream: false,
      options: {
        temperature: 0.1,
        num_predict: 1024,
      },
    });

    let parsed: { scores?: Record<string, number>; labels?: string[] };
    try {
      parsed = JSON.parse(response.message.content);
    } catch {
      parsed = { scores: {}, labels: [] };
    }

    return {
      scores: parsed.scores ?? {},
      labels: parsed.labels ?? [],
      model: response.model,
      provider: 'ollama',
      costUsd: 0,
    };
  }

  async moderateContent(params: ModerationParams): Promise<ModerationResponse> {
    const model = 'llama3.2';

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

    const response = await this.post<OllamaChatResponse>('/api/chat', {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Moderate this content:\n\n${params.text}`,
        },
      ],
      stream: false,
      options: {
        temperature: 0.0,
        num_predict: 512,
      },
    });

    let parsed: {
      flagged?: boolean;
      categories?: Record<string, boolean>;
      scores?: Record<string, number>;
    };
    try {
      parsed = JSON.parse(response.message.content);
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
