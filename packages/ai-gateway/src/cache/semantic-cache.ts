import { createHash } from 'node:crypto';

export interface SemanticCacheConfig {
  similarityThreshold?: number;
  ttlDays?: number;
}

export interface CacheStore {
  findByHash(hash: string): Promise<{ embedding: number[]; createdAt: Date } | null>;
  findBySimilarity(
    embedding: number[],
    threshold: number,
  ): Promise<{ embedding: number[]; createdAt: Date } | null>;
  store(hash: string, text: string, embedding: number[]): Promise<void>;
  deleteExpired(ttlDays: number): Promise<number>;
}

export class SemanticCache {
  private readonly similarityThreshold: number;
  private readonly ttlDays: number;
  private readonly store: CacheStore;

  constructor(store: CacheStore, config?: SemanticCacheConfig) {
    this.store = store;
    this.similarityThreshold = config?.similarityThreshold ?? 0.95;
    this.ttlDays = config?.ttlDays ?? 7;
  }

  async getOrCreate(
    text: string,
    generateFn: () => Promise<number[]>,
  ): Promise<number[]> {
    const hash = this.computeHash(text);

    const exactMatch = await this.store.findByHash(hash);
    if (exactMatch && !this.isExpired(exactMatch.createdAt)) {
      return exactMatch.embedding;
    }

    const generated = await generateFn();

    const similarMatch = await this.store.findBySimilarity(
      generated,
      this.similarityThreshold,
    );
    if (similarMatch && !this.isExpired(similarMatch.createdAt)) {
      await this.store.store(hash, text, generated);
      return similarMatch.embedding;
    }

    await this.store.store(hash, text, generated);
    return generated;
  }

  async cleanup(): Promise<number> {
    return this.store.deleteExpired(this.ttlDays);
  }

  private computeHash(text: string): string {
    return createHash('sha256').update(text).digest('hex');
  }

  private isExpired(createdAt: Date): boolean {
    const now = Date.now();
    const ttlMs = this.ttlDays * 24 * 60 * 60 * 1000;
    return now - createdAt.getTime() > ttlMs;
  }
}

export class InMemoryCacheStore implements CacheStore {
  private readonly entries: Map<
    string,
    { hash: string; text: string; embedding: number[]; createdAt: Date }
  > = new Map();

  async findByHash(
    hash: string,
  ): Promise<{ embedding: number[]; createdAt: Date } | null> {
    const entry = this.entries.get(hash);
    if (!entry) {
      return null;
    }
    return { embedding: entry.embedding, createdAt: entry.createdAt };
  }

  async findBySimilarity(
    embedding: number[],
    threshold: number,
  ): Promise<{ embedding: number[]; createdAt: Date } | null> {
    let bestMatch: { embedding: number[]; createdAt: Date } | null = null;
    let bestSimilarity = -1;

    for (const entry of this.entries.values()) {
      const similarity = cosineSimilarity(embedding, entry.embedding);
      if (similarity >= threshold && similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = { embedding: entry.embedding, createdAt: entry.createdAt };
      }
    }

    return bestMatch;
  }

  async store(hash: string, text: string, embedding: number[]): Promise<void> {
    this.entries.set(hash, {
      hash,
      text,
      embedding,
      createdAt: new Date(),
    });
  }

  async deleteExpired(ttlDays: number): Promise<number> {
    const now = Date.now();
    const ttlMs = ttlDays * 24 * 60 * 60 * 1000;
    let deleted = 0;

    for (const [key, entry] of this.entries.entries()) {
      if (now - entry.createdAt.getTime() > ttlMs) {
        this.entries.delete(key);
        deleted++;
      }
    }

    return deleted;
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) {
    return 0;
  }

  return dotProduct / denominator;
}
