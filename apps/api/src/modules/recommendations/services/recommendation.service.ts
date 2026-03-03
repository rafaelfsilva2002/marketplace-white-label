import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { sql, eq, and, desc, notInArray, inArray } from 'drizzle-orm';
import {
  profiles,
  profileViews,
  reviews,
  type Database,
} from '@marketplace/database';
import { DATABASE_TOKEN } from '@/config/database.config';
import { StructuredLogger } from '@/common/logger/structured.logger';
import { getCorrelationId } from '@/common/interceptors/correlation-id.interceptor';

export interface RecommendationResult {
  profile: typeof profiles.$inferSelect;
  similarity: number;
  reason: 'embedding_similarity' | 'top_rated';
}

@Injectable()
export class RecommendationService {
  private readonly logger = new StructuredLogger('RecommendationService');
  private static readonly DEFAULT_LIMIT = 10;
  private static readonly MAX_RECENT_VIEWS = 20;

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
  ) {}

  async getRecommendations(
    userId: string,
    limit?: number,
    correlationId?: string,
  ): Promise<RecommendationResult[]> {
    const corrId = correlationId ?? getCorrelationId();
    const resultLimit = limit ?? RecommendationService.DEFAULT_LIMIT;

    const recentViews = await this.db
      .select({
        profileId: profileViews.profileId,
      })
      .from(profileViews)
      .where(eq(profileViews.viewerId, userId))
      .orderBy(desc(profileViews.createdAt))
      .limit(RecommendationService.MAX_RECENT_VIEWS);

    const viewedProfileIds = recentViews.map((v) => v.profileId);

    if (viewedProfileIds.length === 0) {
      this.logger.logWithData(
        'info',
        'No view history; falling back to top-rated profiles',
        { userId, correlationId: corrId },
        'RecommendationService',
      );
      return this.getTopRatedProfiles(resultLimit, corrId);
    }

    const viewedProfiles = await this.db
      .select({
        embedding: profiles.embedding,
      })
      .from(profiles)
      .where(
        and(
          inArray(profiles.id, viewedProfileIds),
          sql`${profiles.embedding} IS NOT NULL`,
        ),
      );

    const embeddingsWithData = viewedProfiles.filter(
      (p) => p.embedding !== null && p.embedding.length > 0,
    );

    if (embeddingsWithData.length === 0) {
      this.logger.logWithData(
        'info',
        'Viewed profiles have no embeddings; falling back to top-rated',
        { userId, viewedCount: viewedProfileIds.length, correlationId: corrId },
        'RecommendationService',
      );
      return this.getTopRatedProfiles(resultLimit, corrId, viewedProfileIds);
    }

    const dimensions = embeddingsWithData[0].embedding!.length;
    const avgEmbedding = new Array<number>(dimensions).fill(0);

    for (const profile of embeddingsWithData) {
      const emb = profile.embedding!;
      for (let i = 0; i < dimensions; i++) {
        avgEmbedding[i] += emb[i] / embeddingsWithData.length;
      }
    }

    const embeddingString = `[${avgEmbedding.join(',')}]`;

    const conditions = [
      eq(profiles.isActive, true),
      sql`${profiles.embedding} IS NOT NULL`,
    ];

    if (viewedProfileIds.length > 0) {
      conditions.push(notInArray(profiles.id, viewedProfileIds));
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
      .limit(resultLimit);

    const results: RecommendationResult[] = rows.map((row) => ({
      profile: row.profile,
      similarity: Number(row.similarity),
      reason: 'embedding_similarity' as const,
    }));

    this.logger.logWithData(
      'info',
      'Personalized recommendations generated',
      {
        userId,
        viewedCount: viewedProfileIds.length,
        embeddingsUsed: embeddingsWithData.length,
        resultsCount: results.length,
        correlationId: corrId,
      },
      'RecommendationService',
    );

    return results;
  }

  async getSimilarProfiles(
    profileId: string,
    limit?: number,
  ): Promise<RecommendationResult[]> {
    const correlationId = getCorrelationId();
    const resultLimit = limit ?? RecommendationService.DEFAULT_LIMIT;

    const [profile] = await this.db
      .select({
        id: profiles.id,
        embedding: profiles.embedding,
      })
      .from(profiles)
      .where(eq(profiles.id, profileId))
      .limit(1);

    if (!profile) {
      throw new NotFoundException(`Profile with id ${profileId} not found`);
    }

    if (!profile.embedding || profile.embedding.length === 0) {
      this.logger.logWithData(
        'info',
        'Profile has no embedding; returning top-rated as fallback',
        { profileId, correlationId },
        'RecommendationService',
      );
      return this.getTopRatedProfiles(resultLimit, correlationId, [profileId]);
    }

    const embeddingString = `[${profile.embedding.join(',')}]`;

    const similarityExpr = sql<number>`1 - (${profiles.embedding} <=> ${embeddingString}::vector)`;

    const rows = await this.db
      .select({
        profile: profiles,
        similarity: similarityExpr,
      })
      .from(profiles)
      .where(
        and(
          eq(profiles.isActive, true),
          sql`${profiles.embedding} IS NOT NULL`,
          sql`${profiles.id} != ${profileId}`,
        ),
      )
      .orderBy(sql`${profiles.embedding} <=> ${embeddingString}::vector`)
      .limit(resultLimit);

    const results: RecommendationResult[] = rows.map((row) => ({
      profile: row.profile,
      similarity: Number(row.similarity),
      reason: 'embedding_similarity' as const,
    }));

    this.logger.logWithData(
      'info',
      'Similar profiles retrieved',
      {
        profileId,
        resultsCount: results.length,
        correlationId,
      },
      'RecommendationService',
    );

    return results;
  }

  private async getTopRatedProfiles(
    limit: number,
    correlationId: string,
    excludeIds?: string[],
  ): Promise<RecommendationResult[]> {
    const conditions = [eq(profiles.isActive, true)];

    if (excludeIds && excludeIds.length > 0) {
      conditions.push(notInArray(profiles.id, excludeIds));
    }

    const avgRatingExpr = sql<number>`coalesce((
      SELECT avg(${reviews.rating})::real
      FROM ${reviews}
      WHERE ${reviews.profileId} = ${profiles.id}
        AND ${reviews.isVisible} = 'true'
    ), 0)`;

    const rows = await this.db
      .select({
        profile: profiles,
        avgRating: avgRatingExpr,
      })
      .from(profiles)
      .where(and(...conditions))
      .orderBy(sql`${avgRatingExpr} desc`, desc(profiles.searchScore))
      .limit(limit);

    const results: RecommendationResult[] = rows.map((row) => ({
      profile: row.profile,
      similarity: Number(row.avgRating),
      reason: 'top_rated' as const,
    }));

    this.logger.logWithData(
      'info',
      'Top-rated profiles fallback used',
      {
        resultsCount: results.length,
        correlationId,
      },
      'RecommendationService',
    );

    return results;
  }
}
