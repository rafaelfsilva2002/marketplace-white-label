import { Injectable, Inject } from '@nestjs/common';
import { sql, eq, and } from 'drizzle-orm';
import { profiles, embeddingCache, type Database } from '@marketplace/database';
import { DATABASE_TOKEN } from '@/config/database.config';
import { AI_GATEWAY_TOKEN } from '@/config/ai-gateway.config';
import type { AIGateway } from '@marketplace/ai-gateway';
import { StructuredLogger } from '@/common/logger/structured.logger';
import { getCorrelationId } from '@/common/interceptors/correlation-id.interceptor';
import { createHash, randomUUID } from 'node:crypto';

export interface SemanticSearchOptions {
  city?: string;
  state?: string;
  limit?: number;
  correlationId?: string;
}

export interface SemanticSearchResult {
  profile: typeof profiles.$inferSelect;
  similarity: number;
}

@Injectable()
export class SemanticSearchService {
  private readonly logger = new StructuredLogger('SemanticSearchService');

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
    @Inject(AI_GATEWAY_TOKEN) private readonly aiGateway: AIGateway,
  ) {}

  async search(
    query: string,
    options?: SemanticSearchOptions,
  ): Promise<SemanticSearchResult[]> {
    const correlationId = options?.correlationId ?? getCorrelationId();
    const limit = options?.limit ?? 20;

    const sanitizedQuery = query.trim();

    if (!sanitizedQuery) {
      return [];
    }

    const embeddingResponse = await this.aiGateway.createEmbedding({
      input: sanitizedQuery,
      correlationId,
    });

    const queryEmbedding = embeddingResponse.embeddings[0];

    if (!queryEmbedding || queryEmbedding.length === 0) {
      this.logger.logWithData(
        'warn',
        'Empty embedding returned for query',
        { query: sanitizedQuery, correlationId },
        'SemanticSearchService',
      );
      return [];
    }

    const embeddingString = `[${queryEmbedding.join(',')}]`;

    const conditions = [
      eq(profiles.isActive, true),
      sql`${profiles.embedding} IS NOT NULL`,
    ];

    if (options?.city) {
      conditions.push(eq(profiles.city, options.city));
    }

    if (options?.state) {
      conditions.push(eq(profiles.state, options.state));
    }

    const whereClause = and(...conditions);

    const similarityExpr = sql<number>`1 - (${profiles.embedding} <=> ${embeddingString}::vector)`;

    const rows = await this.db
      .select({
        profile: profiles,
        similarity: similarityExpr,
      })
      .from(profiles)
      .where(whereClause)
      .orderBy(sql`${profiles.embedding} <=> ${embeddingString}::vector`)
      .limit(limit);

    const results: SemanticSearchResult[] = rows.map((row) => ({
      profile: row.profile,
      similarity: Number(row.similarity),
    }));

    await this.cacheQueryEmbedding(sanitizedQuery, queryEmbedding, embeddingResponse.model);

    this.logger.logWithData(
      'info',
      'Semantic search executed',
      {
        query: sanitizedQuery,
        resultsCount: results.length,
        limit,
        city: options?.city,
        state: options?.state,
        model: embeddingResponse.model,
        costUsd: embeddingResponse.costUsd,
        correlationId,
      },
      'SemanticSearchService',
    );

    return results;
  }

  private async cacheQueryEmbedding(
    query: string,
    embedding: number[],
    model: string,
  ): Promise<void> {
    try {
      const contentHash = createHash('sha256').update(query).digest('hex');

      const existing = await this.db
        .select({ id: embeddingCache.id })
        .from(embeddingCache)
        .where(
          and(
            eq(embeddingCache.sourceType, 'search_query'),
            eq(embeddingCache.contentHash, contentHash),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        return;
      }

      await this.db.insert(embeddingCache).values({
        sourceType: 'search_query',
        sourceId: randomUUID(),
        contentHash,
        embedding,
        model,
        metadata: { query },
      });
    } catch (error) {
      this.logger.logError(
        'Failed to cache query embedding',
        error instanceof Error ? error : new Error(String(error)),
        { query },
        'SemanticSearchService',
      );
    }
  }
}
