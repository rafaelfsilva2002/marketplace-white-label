import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq, and, gte, sql, count, avg, desc } from 'drizzle-orm';
import {
  profiles,
  profileViews,
  reviews,
  type Database,
} from '@marketplace/database';
import { DATABASE_TOKEN } from '@/config/database.config';
import { StructuredLogger } from '@/common/logger/structured.logger';
import { getCorrelationId } from '@/common/interceptors/correlation-id.interceptor';

export type SuggestedPlan = 'free' | 'basic' | 'professional' | 'premium';

export interface PlanSuggestion {
  suggestedPlan: SuggestedPlan;
  reason: string;
  metrics: ProfileMetrics;
}

export interface ProfileMetrics {
  views30d: number;
  uniqueViews30d: number;
  reviewCount: number;
  avgRating: number;
}

export interface ViewTrend {
  date: string;
  views: number;
}

export interface ProfileAnalytics {
  profileId: string;
  metrics: ProfileMetrics;
  viewTrends: ViewTrend[];
  ratingDistribution: Record<number, number>;
  conversionEstimate: number;
}

@Injectable()
export class PricingService {
  private readonly logger = new StructuredLogger('PricingService');

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
  ) {}

  async suggestPlan(profileId: string): Promise<PlanSuggestion> {
    const correlationId = getCorrelationId();

    await this.assertProfileExists(profileId);

    const metrics = await this.getProfileMetrics(profileId);

    const { suggestedPlan, reason } = this.applyPricingRules(metrics);

    this.logger.logWithData(
      'info',
      'Plan suggestion generated',
      {
        profileId,
        suggestedPlan,
        reason,
        views30d: metrics.views30d,
        avgRating: metrics.avgRating,
        correlationId,
      },
      'PricingService',
    );

    return { suggestedPlan, reason, metrics };
  }

  async getAnalytics(profileId: string): Promise<ProfileAnalytics> {
    const correlationId = getCorrelationId();

    await this.assertProfileExists(profileId);

    const metrics = await this.getProfileMetrics(profileId);
    const viewTrends = await this.getViewTrends(profileId);
    const ratingDistribution = await this.getRatingDistribution(profileId);

    const conversionEstimate = this.estimateConversion(metrics);

    this.logger.logWithData(
      'info',
      'Profile analytics retrieved',
      {
        profileId,
        views30d: metrics.views30d,
        reviewCount: metrics.reviewCount,
        correlationId,
      },
      'PricingService',
    );

    return {
      profileId,
      metrics,
      viewTrends,
      ratingDistribution,
      conversionEstimate,
    };
  }

  private async assertProfileExists(profileId: string): Promise<void> {
    const [profile] = await this.db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.id, profileId))
      .limit(1);

    if (!profile) {
      throw new NotFoundException(`Profile with id ${profileId} not found`);
    }
  }

  private async getProfileMetrics(profileId: string): Promise<ProfileMetrics> {
    const thirtyDaysAgo = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000,
    );

    const [viewsResult] = await this.db
      .select({ total: count() })
      .from(profileViews)
      .where(
        and(
          eq(profileViews.profileId, profileId),
          gte(profileViews.createdAt, thirtyDaysAgo),
        ),
      );

    const [uniqueViewsResult] = await this.db
      .select({
        unique: sql<number>`count(distinct coalesce(${profileViews.viewerId}::text, ${profileViews.sessionId}, ${profileViews.ipAddress}))`,
      })
      .from(profileViews)
      .where(
        and(
          eq(profileViews.profileId, profileId),
          gte(profileViews.createdAt, thirtyDaysAgo),
        ),
      );

    const [reviewResult] = await this.db
      .select({
        reviewCount: count(),
        avgRating: avg(reviews.rating),
      })
      .from(reviews)
      .where(
        and(
          eq(reviews.profileId, profileId),
          eq(reviews.isVisible, 'true'),
        ),
      );

    return {
      views30d: viewsResult?.total ?? 0,
      uniqueViews30d: Number(uniqueViewsResult?.unique ?? 0),
      reviewCount: reviewResult?.reviewCount ?? 0,
      avgRating: reviewResult?.avgRating ? Number(reviewResult.avgRating) : 0,
    };
  }

  private applyPricingRules(metrics: ProfileMetrics): {
    suggestedPlan: SuggestedPlan;
    reason: string;
  } {
    if (metrics.views30d > 500 && metrics.avgRating >= 4.5) {
      return {
        suggestedPlan: 'premium',
        reason:
          'High traffic (>500 views/30d) with excellent rating (>=4.5). ' +
          'Premium plan maximizes visibility and unlocks priority placement.',
      };
    }

    if (metrics.views30d > 200 && metrics.avgRating >= 4.0) {
      return {
        suggestedPlan: 'professional',
        reason:
          'Strong traffic (>200 views/30d) with good rating (>=4.0). ' +
          'Professional plan provides enhanced analytics and promotion tools.',
      };
    }

    if (metrics.views30d > 50) {
      return {
        suggestedPlan: 'basic',
        reason:
          'Growing traffic (>50 views/30d). ' +
          'Basic plan unlocks profile highlights and basic analytics.',
      };
    }

    return {
      suggestedPlan: 'free',
      reason:
        'Early stage profile with limited traffic. ' +
        'Free plan is recommended while building audience and reviews.',
    };
  }

  private async getViewTrends(profileId: string): Promise<ViewTrend[]> {
    const thirtyDaysAgo = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000,
    );

    const rows = await this.db
      .select({
        date: sql<string>`to_char(${profileViews.createdAt}, 'YYYY-MM-DD')`,
        views: count(),
      })
      .from(profileViews)
      .where(
        and(
          eq(profileViews.profileId, profileId),
          gte(profileViews.createdAt, thirtyDaysAgo),
        ),
      )
      .groupBy(sql`to_char(${profileViews.createdAt}, 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(${profileViews.createdAt}, 'YYYY-MM-DD')`);

    return rows.map((row) => ({
      date: row.date,
      views: row.views,
    }));
  }

  private async getRatingDistribution(
    profileId: string,
  ): Promise<Record<number, number>> {
    const rows = await this.db
      .select({
        rating: reviews.rating,
        count: count(),
      })
      .from(reviews)
      .where(
        and(
          eq(reviews.profileId, profileId),
          eq(reviews.isVisible, 'true'),
        ),
      )
      .groupBy(reviews.rating)
      .orderBy(reviews.rating);

    const distribution: Record<number, number> = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };

    for (const row of rows) {
      distribution[row.rating] = row.count;
    }

    return distribution;
  }

  private estimateConversion(metrics: ProfileMetrics): number {
    if (metrics.views30d === 0) {
      return 0;
    }

    // Simple heuristic: higher rating and more reviews correlate with
    // better conversion.  This is a placeholder until a proper ML model
    // is trained on real conversion data.
    const ratingFactor = metrics.avgRating / 5;
    const reviewFactor = Math.min(metrics.reviewCount / 20, 1);
    const baseLine = 0.05; // 5% baseline conversion

    const estimated = baseLine * (1 + ratingFactor + reviewFactor);

    return Math.round(estimated * 10000) / 10000;
  }
}
