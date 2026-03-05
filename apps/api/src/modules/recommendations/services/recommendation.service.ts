import { Injectable, Inject, NotFoundException, Optional } from '@nestjs/common';
import { sql, eq, and, desc, notInArray, inArray } from 'drizzle-orm';
import {
  profiles,
  profileViews,
  reviews,
  type Database,
} from '@marketplace/database';
import { DATABASE_TOKEN } from '@/config/database.config';
import { REDIS_TOKEN } from '@/config/redis.config';
import { StructuredLogger } from '@/common/logger/structured.logger';
import { getCorrelationId } from '@/common/interceptors/correlation-id.interceptor';
import type Redis from 'ioredis';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RecommendationReason =
  | 'weighted_score'
  | 'collaborative'
  | 'trending'
  | 'top_rated'
  | 'diversity';

export interface RecommendationResult {
  profile: typeof profiles.$inferSelect;
  score: number;
  similarity: number;
  reason: RecommendationReason;
}

export interface ScoringWeights {
  embeddingSimilarity: number;
  reviewRating: number;
  viewCount: number;
  recency: number;
  locationProximity: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_WEIGHTS: ScoringWeights = {
  embeddingSimilarity: 0.4,
  reviewRating: 0.2,
  viewCount: 0.15,
  recency: 0.1,
  locationProximity: 0.15,
};

const DIVERSITY_RATIO = 0.2;
const TRENDING_WINDOW_DAYS = 7;
const CO_VIEW_LIMIT = 50;

/** Cache TTL for getRecommendations results (seconds) */
const RECOMMENDATIONS_CACHE_TTL = 5 * 60; // 5 minutes

/** Cache TTL for getSimilarProfiles results (seconds) */
const SIMILAR_PROFILES_CACHE_TTL = 10 * 60; // 10 minutes

// ---------------------------------------------------------------------------
// Pure scoring functions (exported for testing)
// ---------------------------------------------------------------------------

export function computeWeightedScore(
  signals: {
    embeddingSimilarity: number;
    normalizedRating: number;
    normalizedViewCount: number;
    recencyBoost: number;
    locationMatch: number;
  },
  weights: ScoringWeights = DEFAULT_WEIGHTS,
): number {
  return (
    weights.embeddingSimilarity * signals.embeddingSimilarity +
    weights.reviewRating * signals.normalizedRating +
    weights.viewCount * signals.normalizedViewCount +
    weights.recency * signals.recencyBoost +
    weights.locationProximity * signals.locationMatch
  );
}

export function computeRecencyBoost(createdAt: Date, now: Date = new Date()): number {
  const ageInDays = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
  if (ageInDays <= 0) return 1;
  // Decay curve: score = 1 / (1 + ageInDays / 30)
  // Profiles < 30 days old get > 0.5, profiles > 90 days get < 0.25
  return 1 / (1 + ageInDays / 30);
}

export function normalizeViewCount(viewsCount: number, maxViews: number): number {
  if (maxViews <= 0) return 0;
  return Math.min(viewsCount / maxViews, 1);
}

export function injectDiversity<T extends { profile: typeof profiles.$inferSelect }>(
  ranked: T[],
  targetRatio: number = DIVERSITY_RATIO,
): T[] {
  if (ranked.length <= 2) return ranked;

  const targetDiverseCount = Math.max(1, Math.ceil(ranked.length * targetRatio));

  // Collect the cities and services (categories) already represented in top results
  const representedCities = new Set<string>();
  const representedServices = new Set<string>();
  const mainResults: T[] = [];
  const diverseCandidates: T[] = [];

  for (const item of ranked) {
    const city = item.profile.city ?? '';
    const services = item.profile.services ?? [];
    const primaryService = services[0] ?? '';

    const cityAlreadySeen = city !== '' && representedCities.has(city);
    const serviceAlreadySeen = primaryService !== '' && representedServices.has(primaryService);

    if (cityAlreadySeen && serviceAlreadySeen) {
      diverseCandidates.push(item);
    } else {
      mainResults.push(item);
      if (city) representedCities.add(city);
      if (primaryService) representedServices.add(primaryService);
    }
  }

  // If we already have enough diversity, return ranked as-is
  if (diverseCandidates.length === 0) return ranked;

  // Re-integrate diverse candidates: take from diverseCandidates items that bring
  // genuinely new cities/services and insert them into the result
  const finalResults = [...mainResults];
  let injected = 0;

  for (const candidate of diverseCandidates) {
    if (injected >= targetDiverseCount) break;

    const city = candidate.profile.city ?? '';
    const primaryService = (candidate.profile.services ?? [])[0] ?? '';

    const bringsNewCity = city !== '' && !representedCities.has(city);
    const bringsNewService = primaryService !== '' && !representedServices.has(primaryService);

    if (bringsNewCity || bringsNewService) {
      finalResults.push(candidate);
      if (city) representedCities.add(city);
      if (primaryService) representedServices.add(primaryService);
      injected++;
    }
  }

  // Fill remaining slots with leftover candidates in original order
  for (const candidate of diverseCandidates) {
    if (finalResults.length >= ranked.length) break;
    if (!finalResults.includes(candidate)) {
      finalResults.push(candidate);
    }
  }

  return finalResults.slice(0, ranked.length);
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class RecommendationService {
  private readonly logger = new StructuredLogger('RecommendationService');
  private static readonly DEFAULT_LIMIT = 10;
  private static readonly MAX_RECENT_VIEWS = 20;

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
    @Optional() @Inject(REDIS_TOKEN) private readonly redis?: Redis,
  ) {}

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  async getRecommendations(
    userId: string,
    limit?: number,
    correlationId?: string,
  ): Promise<RecommendationResult[]> {
    const corrId = correlationId ?? getCorrelationId();
    const resultLimit = limit ?? RecommendationService.DEFAULT_LIMIT;

    // --- Cache check ---
    const cacheKey = `rec:user:${userId}`;
    const cached = await this.getFromCache<RecommendationResult[]>(cacheKey);
    if (cached) {
      this.logger.logWithData(
        'info',
        'Returning cached recommendations',
        { userId, cacheKey, correlationId: corrId },
        'RecommendationService',
      );
      return cached.slice(0, resultLimit);
    }

    // --- Compute recommendations with error fallback ---
    try {
      const results = await this.computeRecommendations(userId, resultLimit, corrId);

      // --- Cache the result ---
      await this.setInCache(cacheKey, results, RECOMMENDATIONS_CACHE_TTL);

      return results;
    } catch (error) {
      this.logger.logWithData(
        'warn',
        'Recommendation computation failed; falling back to top-rated profiles',
        {
          userId,
          error: (error as Error).message,
          correlationId: corrId,
        },
        'RecommendationService',
      );
      return this.getTopRatedProfiles(resultLimit, corrId);
    }
  }

  // -------------------------------------------------------------------------
  // Core recommendation computation (extracted for caching/fallback)
  // -------------------------------------------------------------------------

  private async computeRecommendations(
    userId: string,
    resultLimit: number,
    corrId: string,
  ): Promise<RecommendationResult[]> {
    const recentViews = await this.db
      .select({ profileId: profileViews.profileId })
      .from(profileViews)
      .where(eq(profileViews.viewerId, userId))
      .orderBy(desc(profileViews.createdAt))
      .limit(RecommendationService.MAX_RECENT_VIEWS);

    const viewedProfileIds = recentViews.map((v) => v.profileId);

    // Cold start: no history at all -> trending profiles
    if (viewedProfileIds.length === 0) {
      this.logger.logWithData(
        'info',
        'Cold start: no view history; returning trending profiles',
        { userId, correlationId: corrId },
        'RecommendationService',
      );
      return this.getTrendingProfiles(resultLimit, corrId);
    }

    // Fetch embeddings of viewed profiles
    const viewedProfiles = await this.db
      .select({ embedding: profiles.embedding })
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

    // No embeddings available -> trending fallback
    if (embeddingsWithData.length === 0) {
      this.logger.logWithData(
        'info',
        'Viewed profiles have no embeddings; falling back to trending',
        { userId, viewedCount: viewedProfileIds.length, correlationId: corrId },
        'RecommendationService',
      );
      return this.getTrendingProfiles(resultLimit, corrId, viewedProfileIds);
    }

    // Compute average embedding from view history
    const dimensions = embeddingsWithData[0].embedding!.length;
    const avgEmbedding = new Array<number>(dimensions).fill(0);
    for (const profile of embeddingsWithData) {
      const emb = profile.embedding!;
      for (let i = 0; i < dimensions; i++) {
        avgEmbedding[i] += emb[i] / embeddingsWithData.length;
      }
    }

    // Get user's primary city from their most-viewed profiles
    const userCity = await this.getUserPrimaryCity(viewedProfileIds);

    // Fetch collaborative filtering candidates
    const coViewIds = await this.getCoViewedProfileIds(viewedProfileIds, userId);

    // Build the main candidate pool with weighted scoring
    const candidates = await this.fetchScoredCandidates(
      avgEmbedding,
      viewedProfileIds,
      userCity,
      resultLimit * 3, // over-fetch for diversity injection
    );

    // Boost collaborative filtering candidates
    for (const candidate of candidates) {
      if (coViewIds.has(candidate.profile.id)) {
        candidate.score *= 1.15; // 15% boost for co-viewed profiles
        candidate.reason = 'collaborative';
      }
    }

    // Sort by final weighted score
    candidates.sort((a, b) => b.score - a.score);

    // Inject diversity
    const diversified = injectDiversity(candidates);

    const results = diversified.slice(0, resultLimit);

    this.logger.logWithData(
      'info',
      'Personalized recommendations generated (weighted + diversity)',
      {
        userId,
        viewedCount: viewedProfileIds.length,
        embeddingsUsed: embeddingsWithData.length,
        coViewCandidates: coViewIds.size,
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

    // --- Cache check ---
    const cacheKey = `rec:similar:${profileId}`;
    const cached = await this.getFromCache<RecommendationResult[]>(cacheKey);
    if (cached) {
      this.logger.logWithData(
        'info',
        'Returning cached similar profiles',
        { profileId, cacheKey, correlationId },
        'RecommendationService',
      );
      return cached.slice(0, resultLimit);
    }

    // --- Compute similar profiles with error fallback ---
    try {
      const results = await this.computeSimilarProfiles(profileId, resultLimit, correlationId);

      // --- Cache the result ---
      await this.setInCache(cacheKey, results, SIMILAR_PROFILES_CACHE_TTL);

      return results;
    } catch (error) {
      // Re-throw NotFoundException -- it's not a computation failure, it's a client error
      if (error instanceof NotFoundException) {
        throw error;
      }

      this.logger.logWithData(
        'warn',
        'Similar profiles computation failed; falling back to top-rated profiles',
        {
          profileId,
          error: (error as Error).message,
          correlationId,
        },
        'RecommendationService',
      );
      return this.getTopRatedProfiles(resultLimit, correlationId, [profileId]);
    }
  }

  // -------------------------------------------------------------------------
  // Core similar profiles computation (extracted for caching/fallback)
  // -------------------------------------------------------------------------

  private async computeSimilarProfiles(
    profileId: string,
    resultLimit: number,
    correlationId: string,
  ): Promise<RecommendationResult[]> {
    const [profile] = await this.db
      .select({
        id: profiles.id,
        embedding: profiles.embedding,
        city: profiles.city,
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

    // Fetch scored candidates around this profile's embedding
    const candidates = await this.fetchScoredCandidates(
      profile.embedding,
      [profileId],
      profile.city,
      resultLimit * 2,
    );

    candidates.sort((a, b) => b.score - a.score);

    const diversified = injectDiversity(candidates);
    const results = diversified.slice(0, resultLimit);

    this.logger.logWithData(
      'info',
      'Similar profiles retrieved (weighted + diversity)',
      { profileId, resultsCount: results.length, correlationId },
      'RecommendationService',
    );

    return results;
  }

  // -------------------------------------------------------------------------
  // Collaborative filtering: co-view signal
  // -------------------------------------------------------------------------

  private async getCoViewedProfileIds(
    viewedProfileIds: string[],
    userId: string,
  ): Promise<Set<string>> {
    if (viewedProfileIds.length === 0) return new Set();

    // Find other users who viewed the same profiles, then get what else they viewed
    const coViewRows = await this.db
      .select({ profileId: profileViews.profileId })
      .from(profileViews)
      .where(
        and(
          // Other users who viewed what our user viewed
          inArray(profileViews.profileId, viewedProfileIds),
          sql`${profileViews.viewerId} != ${userId}`,
          sql`${profileViews.viewerId} IS NOT NULL`,
        ),
      )
      .limit(CO_VIEW_LIMIT);

    // Get the viewers
    const otherViewerRows = await this.db
      .select({ viewerId: profileViews.viewerId })
      .from(profileViews)
      .where(
        and(
          inArray(profileViews.profileId, viewedProfileIds),
          sql`${profileViews.viewerId} != ${userId}`,
          sql`${profileViews.viewerId} IS NOT NULL`,
        ),
      )
      .limit(CO_VIEW_LIMIT);

    const otherViewerIds = [...new Set(otherViewerRows.map((r) => r.viewerId).filter(Boolean) as string[])];

    if (otherViewerIds.length === 0) return new Set();

    // What else did those viewers view?
    const coViewedRows = await this.db
      .select({ profileId: profileViews.profileId })
      .from(profileViews)
      .where(
        and(
          inArray(profileViews.viewerId, otherViewerIds),
          notInArray(profileViews.profileId, viewedProfileIds),
        ),
      )
      .limit(CO_VIEW_LIMIT);

    return new Set(coViewedRows.map((r) => r.profileId));
  }

  // -------------------------------------------------------------------------
  // Weighted scoring: fetch candidates with all signals
  // -------------------------------------------------------------------------

  private async fetchScoredCandidates(
    referenceEmbedding: number[],
    excludeIds: string[],
    userCity: string | null,
    fetchLimit: number,
  ): Promise<RecommendationResult[]> {
    const embeddingString = `[${referenceEmbedding.join(',')}]`;

    const conditions = [
      eq(profiles.isActive, true),
      sql`${profiles.embedding} IS NOT NULL`,
    ];

    if (excludeIds.length > 0) {
      conditions.push(notInArray(profiles.id, excludeIds));
    }

    const similarityExpr = sql<number>`1 - (${profiles.embedding} <=> ${embeddingString}::vector)`;

    const avgRatingExpr = sql<number>`coalesce((
      SELECT avg(${reviews.rating})::real
      FROM ${reviews}
      WHERE ${reviews.profileId} = ${profiles.id}
        AND ${reviews.isVisible} = 'true'
    ), 0)`;

    const rows = await this.db
      .select({
        profile: profiles,
        similarity: similarityExpr,
        avgRating: avgRatingExpr,
      })
      .from(profiles)
      .where(and(...conditions))
      .orderBy(sql`${profiles.embedding} <=> ${embeddingString}::vector`)
      .limit(fetchLimit);

    if (rows.length === 0) return [];

    // Find max views for normalization
    const maxViews = Math.max(...rows.map((r) => r.profile.viewsCount ?? 0), 1);

    const now = new Date();

    return rows.map((row) => {
      const embSim = Math.max(0, Math.min(1, Number(row.similarity)));
      const normalizedRating = Math.min(Number(row.avgRating) / 5, 1);
      const normalizedViews = normalizeViewCount(row.profile.viewsCount ?? 0, maxViews);
      const recency = computeRecencyBoost(row.profile.createdAt, now);
      const locationMatch =
        userCity && row.profile.city && row.profile.city.toLowerCase() === userCity.toLowerCase()
          ? 1
          : 0;

      const score = computeWeightedScore({
        embeddingSimilarity: embSim,
        normalizedRating,
        normalizedViewCount: normalizedViews,
        recencyBoost: recency,
        locationMatch,
      });

      return {
        profile: row.profile,
        score,
        similarity: embSim,
        reason: 'weighted_score' as RecommendationReason,
      };
    });
  }

  // -------------------------------------------------------------------------
  // Cold start: trending profiles (most views in last 7 days)
  // -------------------------------------------------------------------------

  private async getTrendingProfiles(
    limit: number,
    correlationId: string,
    excludeIds?: string[],
  ): Promise<RecommendationResult[]> {
    const conditions = [eq(profiles.isActive, true)];

    if (excludeIds && excludeIds.length > 0) {
      conditions.push(notInArray(profiles.id, excludeIds));
    }

    const recentViewCountExpr = sql<number>`coalesce((
      SELECT count(*)::integer
      FROM ${profileViews}
      WHERE ${profileViews.profileId} = ${profiles.id}
        AND ${profileViews.createdAt} > now() - interval '${sql.raw(String(TRENDING_WINDOW_DAYS))} days'
    ), 0)`;

    const avgRatingExpr = sql<number>`coalesce((
      SELECT avg(${reviews.rating})::real
      FROM ${reviews}
      WHERE ${reviews.profileId} = ${profiles.id}
        AND ${reviews.isVisible} = 'true'
    ), 0)`;

    const rows = await this.db
      .select({
        profile: profiles,
        recentViews: recentViewCountExpr,
        avgRating: avgRatingExpr,
      })
      .from(profiles)
      .where(and(...conditions))
      .orderBy(sql`${recentViewCountExpr} desc`, sql`${avgRatingExpr} desc`)
      .limit(limit);

    const results: RecommendationResult[] = rows.map((row) => ({
      profile: row.profile,
      score: Number(row.recentViews),
      similarity: 0,
      reason: 'trending' as const,
    }));

    this.logger.logWithData(
      'info',
      'Trending profiles returned (cold start)',
      { resultsCount: results.length, windowDays: TRENDING_WINDOW_DAYS, correlationId },
      'RecommendationService',
    );

    return results;
  }

  // -------------------------------------------------------------------------
  // Fallback: top-rated profiles (kept for getSimilarProfiles with no embedding)
  // -------------------------------------------------------------------------

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
      score: Number(row.avgRating),
      similarity: 0,
      reason: 'top_rated' as const,
    }));

    this.logger.logWithData(
      'info',
      'Top-rated profiles fallback used',
      { resultsCount: results.length, correlationId },
      'RecommendationService',
    );

    return results;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async getUserPrimaryCity(viewedProfileIds: string[]): Promise<string | null> {
    if (viewedProfileIds.length === 0) return null;

    const rows = await this.db
      .select({ city: profiles.city })
      .from(profiles)
      .where(inArray(profiles.id, viewedProfileIds));

    // Find the most common city among viewed profiles
    const cityCount = new Map<string, number>();
    for (const row of rows) {
      const city = row.city;
      if (city) {
        cityCount.set(city, (cityCount.get(city) ?? 0) + 1);
      }
    }

    let maxCity: string | null = null;
    let maxCount = 0;
    for (const [city, count] of cityCount) {
      if (count > maxCount) {
        maxCity = city;
        maxCount = count;
      }
    }

    return maxCity;
  }

  // -------------------------------------------------------------------------
  // Redis cache helpers
  // -------------------------------------------------------------------------

  private async getFromCache<T>(key: string): Promise<T | null> {
    if (!this.redis) return null;

    try {
      const raw = await this.redis.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch (error) {
      this.logger.logWithData(
        'warn',
        'Redis cache read failed; proceeding without cache',
        { key, error: (error as Error).message },
        'RecommendationService',
      );
      return null;
    }
  }

  private async setInCache(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (!this.redis) return;

    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (error) {
      this.logger.logWithData(
        'warn',
        'Redis cache write failed; result not cached',
        { key, ttlSeconds, error: (error as Error).message },
        'RecommendationService',
      );
    }
  }
}
