import {
  Injectable,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import { eq, and, sql, desc, count } from 'drizzle-orm';
import { profiles, reviews, type Database } from '@marketplace/database';
import { DATABASE_TOKEN } from '@/config/database.config';
import { AuditService } from '@/modules/audit/audit.service';
import { StructuredLogger } from '@/common/logger/structured.logger';
import { getCorrelationId } from '@/common/interceptors/correlation-id.interceptor';
import type { PaginatedResult } from '@marketplace/shared';

export interface ModerationQueueItem {
  id: string;
  type: 'profile' | 'review';
  entityId: string;
  displayName?: string;
  comment?: string;
  rating?: number;
  createdAt: Date;
  status: string;
}

@Injectable()
export class ModerationService {
  private readonly logger = new StructuredLogger('ModerationService');

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
    private readonly auditService: AuditService,
  ) {}

  async getQueue(
    page: number = 1,
    limit: number = 20,
    type?: 'profile' | 'review',
  ): Promise<PaginatedResult<ModerationQueueItem>> {
    const correlationId = getCorrelationId();
    const offset = (page - 1) * limit;
    const items: ModerationQueueItem[] = [];
    let total = 0;

    if (!type || type === 'profile') {
      const unverifiedProfiles = await this.db
        .select()
        .from(profiles)
        .where(
          and(
            eq(profiles.isVerified, false),
            eq(profiles.isActive, true),
          ),
        )
        .orderBy(desc(profiles.createdAt));

      for (const p of unverifiedProfiles) {
        items.push({
          id: p.id,
          type: 'profile',
          entityId: p.id,
          displayName: p.displayName,
          createdAt: p.createdAt,
          status: 'pending_verification',
        });
      }
    }

    if (!type || type === 'review') {
      const pendingReviews = await this.db
        .select()
        .from(reviews)
        .where(
          and(
            sql`${reviews.moderatedBy} IS NULL`,
            eq(reviews.isVisible, 'true'),
          ),
        )
        .orderBy(desc(reviews.createdAt));

      for (const r of pendingReviews) {
        items.push({
          id: r.id,
          type: 'review',
          entityId: r.id,
          comment: r.comment ?? undefined,
          rating: r.rating,
          createdAt: r.createdAt,
          status: 'pending_moderation',
        });
      }
    }

    items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    total = items.length;
    const paginatedItems = items.slice(offset, offset + limit);

    this.logger.logWithData(
      'info',
      'Moderation queue fetched',
      {
        total,
        page,
        limit,
        typeFilter: type ?? 'all',
        correlationId,
      },
      'ModerationService',
    );

    return {
      data: paginatedItems,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async approveProfile(
    profileId: string,
    moderatorId: string,
    correlationId?: string,
  ): Promise<typeof profiles.$inferSelect> {
    const corrId = correlationId ?? getCorrelationId();

    const [profile] = await this.db
      .select()
      .from(profiles)
      .where(eq(profiles.id, profileId))
      .limit(1);

    if (!profile) {
      throw new NotFoundException(`Profile with id ${profileId} not found`);
    }

    const [updated] = await this.db
      .update(profiles)
      .set({
        isVerified: true,
        verifiedBy: moderatorId,
        verifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, profileId))
      .returning();

    await this.auditService.record({
      userId: moderatorId,
      action: 'profile.approved',
      entityType: 'profile',
      entityId: profileId,
      oldValue: { isVerified: false },
      newValue: { isVerified: true, verifiedBy: moderatorId },
      correlationId: corrId,
    });

    this.logger.logWithData(
      'info',
      'Profile approved',
      { profileId, moderatorId, correlationId: corrId },
      'ModerationService',
    );

    return updated;
  }

  async rejectProfile(
    profileId: string,
    moderatorId: string,
    reason?: string,
    correlationId?: string,
  ): Promise<typeof profiles.$inferSelect> {
    const corrId = correlationId ?? getCorrelationId();

    const [profile] = await this.db
      .select()
      .from(profiles)
      .where(eq(profiles.id, profileId))
      .limit(1);

    if (!profile) {
      throw new NotFoundException(`Profile with id ${profileId} not found`);
    }

    const [updated] = await this.db
      .update(profiles)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, profileId))
      .returning();

    await this.auditService.record({
      userId: moderatorId,
      action: 'profile.rejected',
      entityType: 'profile',
      entityId: profileId,
      oldValue: { isActive: true },
      newValue: { isActive: false },
      metadata: reason ? { reason } : undefined,
      correlationId: corrId,
    });

    this.logger.logWithData(
      'info',
      'Profile rejected',
      { profileId, moderatorId, reason, correlationId: corrId },
      'ModerationService',
    );

    return updated;
  }

  async approveReview(
    reviewId: string,
    moderatorId: string,
    correlationId?: string,
  ): Promise<typeof reviews.$inferSelect> {
    const corrId = correlationId ?? getCorrelationId();

    const [review] = await this.db
      .select()
      .from(reviews)
      .where(eq(reviews.id, reviewId))
      .limit(1);

    if (!review) {
      throw new NotFoundException(`Review with id ${reviewId} not found`);
    }

    const [updated] = await this.db
      .update(reviews)
      .set({
        moderatedBy: moderatorId,
        moderatedAt: new Date(),
        isVisible: 'true',
        updatedAt: new Date(),
      })
      .where(eq(reviews.id, reviewId))
      .returning();

    await this.auditService.record({
      userId: moderatorId,
      action: 'review.approved',
      entityType: 'review',
      entityId: reviewId,
      newValue: { moderatedBy: moderatorId, isVisible: 'true' },
      correlationId: corrId,
    });

    this.logger.logWithData(
      'info',
      'Review approved',
      { reviewId, moderatorId, correlationId: corrId },
      'ModerationService',
    );

    return updated;
  }

  async rejectReview(
    reviewId: string,
    moderatorId: string,
    reason?: string,
    correlationId?: string,
  ): Promise<typeof reviews.$inferSelect> {
    const corrId = correlationId ?? getCorrelationId();

    const [review] = await this.db
      .select()
      .from(reviews)
      .where(eq(reviews.id, reviewId))
      .limit(1);

    if (!review) {
      throw new NotFoundException(`Review with id ${reviewId} not found`);
    }

    const [updated] = await this.db
      .update(reviews)
      .set({
        moderatedBy: moderatorId,
        moderatedAt: new Date(),
        isVisible: 'false',
        updatedAt: new Date(),
      })
      .where(eq(reviews.id, reviewId))
      .returning();

    await this.auditService.record({
      userId: moderatorId,
      action: 'review.rejected',
      entityType: 'review',
      entityId: reviewId,
      oldValue: { isVisible: review.isVisible },
      newValue: { isVisible: 'false', moderatedBy: moderatorId },
      metadata: reason ? { reason } : undefined,
      correlationId: corrId,
    });

    this.logger.logWithData(
      'info',
      'Review rejected',
      { reviewId, moderatorId, reason, correlationId: corrId },
      'ModerationService',
    );

    return updated;
  }

  async approve(
    queueItemId: string,
    type: 'profile' | 'review',
    moderatorId: string,
    correlationId?: string,
  ) {
    if (type === 'profile') {
      return this.approveProfile(queueItemId, moderatorId, correlationId);
    }
    return this.approveReview(queueItemId, moderatorId, correlationId);
  }

  async reject(
    queueItemId: string,
    type: 'profile' | 'review',
    moderatorId: string,
    reason?: string,
    correlationId?: string,
  ) {
    if (type === 'profile') {
      return this.rejectProfile(queueItemId, moderatorId, reason, correlationId);
    }
    return this.rejectReview(queueItemId, moderatorId, reason, correlationId);
  }
}
