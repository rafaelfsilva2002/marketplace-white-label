import { Injectable, Inject } from '@nestjs/common';
import { eq, sql, and, gte, count } from 'drizzle-orm';
import { profileViews, profiles, type Database } from '@marketplace/database';
import { DATABASE_TOKEN } from '@/config/database.config';
import { StructuredLogger } from '@/common/logger/structured.logger';
import { getCorrelationId } from '@/common/interceptors/correlation-id.interceptor';

export interface RecordViewInput {
  profileId: string;
  viewerId?: string;
  sessionId?: string;
  duration?: number;
  source?: string;
  referrer?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface ViewStats {
  totalViews: number;
  uniqueViewers: number;
  viewsLast24h: number;
  viewsLast7d: number;
  viewsLast30d: number;
}

@Injectable()
export class ProfileViewsService {
  private readonly logger = new StructuredLogger('ProfileViewsService');

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
  ) {}

  async recordView(input: RecordViewInput): Promise<void> {
    const correlationId = getCorrelationId();

    await this.db.insert(profileViews).values({
      profileId: input.profileId,
      viewerId: input.viewerId,
      sessionId: input.sessionId,
      duration: input.duration,
      source: input.source,
      referrer: input.referrer,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });

    await this.db
      .update(profiles)
      .set({
        viewsCount: sql`${profiles.viewsCount} + 1`,
      })
      .where(eq(profiles.id, input.profileId));

    this.logger.logWithData(
      'info',
      'Profile view recorded',
      {
        profileId: input.profileId,
        viewerId: input.viewerId ?? 'anonymous',
        source: input.source ?? 'unknown',
        correlationId,
      },
      'ProfileViewsService',
    );
  }

  async getViewStats(profileId: string): Promise<ViewStats> {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [totalResult] = await this.db
      .select({ total: count() })
      .from(profileViews)
      .where(eq(profileViews.profileId, profileId));

    const [uniqueResult] = await this.db
      .select({
        unique: sql<number>`count(distinct coalesce(${profileViews.viewerId}::text, ${profileViews.sessionId}, ${profileViews.ipAddress}))`,
      })
      .from(profileViews)
      .where(eq(profileViews.profileId, profileId));

    const [last24hResult] = await this.db
      .select({ total: count() })
      .from(profileViews)
      .where(
        and(
          eq(profileViews.profileId, profileId),
          gte(profileViews.createdAt, last24h),
        ),
      );

    const [last7dResult] = await this.db
      .select({ total: count() })
      .from(profileViews)
      .where(
        and(
          eq(profileViews.profileId, profileId),
          gte(profileViews.createdAt, last7d),
        ),
      );

    const [last30dResult] = await this.db
      .select({ total: count() })
      .from(profileViews)
      .where(
        and(
          eq(profileViews.profileId, profileId),
          gte(profileViews.createdAt, last30d),
        ),
      );

    return {
      totalViews: totalResult?.total ?? 0,
      uniqueViewers: Number(uniqueResult?.unique ?? 0),
      viewsLast24h: last24hResult?.total ?? 0,
      viewsLast7d: last7dResult?.total ?? 0,
      viewsLast30d: last30dResult?.total ?? 0,
    };
  }
}
