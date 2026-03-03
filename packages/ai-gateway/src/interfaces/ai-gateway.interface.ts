export interface CompletionMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionParams {
  messages: CompletionMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  userId?: string;
  correlationId: string;
  skipCache?: boolean;
  provider?: 'openai' | 'anthropic' | 'ollama';
}

export interface CompletionResponse {
  content: string;
  model: string;
  provider: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  costUsd: number;
}

export interface EmbeddingParams {
  input: string | string[];
  model?: 'text-embedding-3-small' | 'text-embedding-3-large' | 'local';
  userId?: string;
  correlationId: string;
}

export interface EmbeddingResponse {
  embeddings: number[][];
  model: string;
  provider: string;
  costUsd: number;
}

export interface VisionParams {
  imageUrl: string;
  categories: string[];
  correlationId: string;
}

export interface VisionResponse {
  scores: Record<string, number>;
  labels: string[];
  model: string;
  provider: string;
  costUsd: number;
}

export interface ModerationParams {
  text: string;
  correlationId: string;
}

export interface ModerationResponse {
  flagged: boolean;
  categories: Record<string, boolean>;
  scores: Record<string, number>;
}

export interface AIGateway {
  complete(params: CompletionParams): Promise<CompletionResponse>;
  createEmbedding(params: EmbeddingParams): Promise<EmbeddingResponse>;
  analyzeImage(params: VisionParams): Promise<VisionResponse>;
  moderateContent(params: ModerationParams): Promise<ModerationResponse>;
}
