import {
  Injectable,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import { eq, and, sql, desc, count } from 'drizzle-orm';
import { profiles, reviews, reports, type Database } from '@marketplace/database';
import { CreateReportDto } from '../dto/create-report.dto';
import { ResolveReportDto } from '../dto/resolve-report.dto';
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

type ModerationQueueSqlRow = {
  id: string;
  type: 'profile' | 'review';
  entityId: string;
  displayName: string | null;
  comment: string | null;
  rating: number | null;
  createdAt: Date | string;
  status: string;
};

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
    const profileWhere = and(
      eq(profiles.isVerified, false),
      eq(profiles.isActive, true),
    );
    const reviewWhere = and(
      sql`${reviews.moderatedBy} IS NULL`,
      eq(reviews.isVisible, 'true'),
    );

    let total = 0;
    let paginatedItems: ModerationQueueItem[] = [];

    if (type === 'profile') {
      const [countRow] = await this.db
        .select({ total: count() })
        .from(profiles)
        .where(profileWhere)
        .limit(1);

      total = Number(countRow?.total ?? 0);

      const rows = await this.db
        .select({
          id: profiles.id,
          type: sql<'profile'>`'profile'`,
          entityId: profiles.id,
          displayName: profiles.displayName,
          comment: sql<string | null>`null`,
          rating: sql<number | null>`null`,
          createdAt: profiles.createdAt,
          status: sql<string>`'pending_verification'`,
        })
        .from(profiles)
        .where(profileWhere)
        .orderBy(desc(profiles.createdAt))
        .limit(limit)
        .offset(offset);

      paginatedItems = rows.map((row) => ({
        id: row.id,
        type: 'profile',
        entityId: row.entityId,
        displayName: row.displayName ?? undefined,
        comment: undefined,
        rating: undefined,
        createdAt:
          row.createdAt instanceof Date
            ? row.createdAt
            : new Date(row.createdAt),
        status: row.status,
      }));
    } else if (type === 'review') {
      const [countRow] = await this.db
        .select({ total: count() })
        .from(reviews)
        .where(reviewWhere)
        .limit(1);

      total = Number(countRow?.total ?? 0);

      const rows = await this.db
        .select({
          id: reviews.id,
          type: sql<'review'>`'review'`,
          entityId: reviews.id,
          displayName: sql<string | null>`null`,
          comment: reviews.comment,
          rating: reviews.rating,
          createdAt: reviews.createdAt,
          status: sql<string>`'pending_moderation'`,
        })
        .from(reviews)
        .where(reviewWhere)
        .orderBy(desc(reviews.createdAt))
        .limit(limit)
        .offset(offset);

      paginatedItems = rows.map((row) => ({
        id: row.id,
        type: 'review',
        entityId: row.entityId,
        displayName: undefined,
        comment: row.comment ?? undefined,
        rating: row.rating ?? undefined,
        createdAt:
          row.createdAt instanceof Date
            ? row.createdAt
            : new Date(row.createdAt),
        status: row.status,
      }));
    } else {
      const [[profileCountRow], [reviewCountRow]] = await Promise.all([
        this.db
          .select({ total: count() })
          .from(profiles)
          .where(profileWhere)
          .limit(1),
        this.db
          .select({ total: count() })
          .from(reviews)
          .where(reviewWhere)
          .limit(1),
      ]);

      total =
        Number(profileCountRow?.total ?? 0) +
        Number(reviewCountRow?.total ?? 0);

      const rows = await this.db.execute(sql<ModerationQueueSqlRow>`
        select
          ${profiles.id} as "id",
          'profile'::text as "type",
          ${profiles.id} as "entityId",
          ${profiles.displayName} as "displayName",
          null::text as "comment",
          null::integer as "rating",
          ${profiles.createdAt} as "createdAt",
          'pending_verification'::text as "status"
        from ${profiles}
        where ${profiles.isVerified} = false and ${profiles.isActive} = true
        union all
        select
          ${reviews.id} as "id",
          'review'::text as "type",
          ${reviews.id} as "entityId",
          null::text as "displayName",
          ${reviews.comment} as "comment",
          ${reviews.rating} as "rating",
          ${reviews.createdAt} as "createdAt",
          'pending_moderation'::text as "status"
        from ${reviews}
        where ${reviews.moderatedBy} is null and ${reviews.isVisible} = 'true'
        order by "createdAt" desc
        limit ${limit}
        offset ${offset}
      `);

      const normalizedRows = rows as unknown as ModerationQueueSqlRow[];

      paginatedItems = normalizedRows.map((row) => ({
        id: row.id,
        type: row.type,
        entityId: row.entityId,
        displayName: row.displayName ?? undefined,
        comment: row.comment ?? undefined,
        rating: row.rating ?? undefined,
        createdAt:
          row.createdAt instanceof Date
            ? row.createdAt
            : new Date(row.createdAt),
        status: row.status,
      }));
    }

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

  async createReport(
    reporterId: string,
    dto: CreateReportDto,
    correlationId?: string,
  ): Promise<typeof reports.$inferSelect> {
    const corrId = correlationId ?? getCorrelationId();

    const [report] = await this.db
      .insert(reports)
      .values({
        reporterId,
        entityType: dto.entityType,
        entityId: dto.entityId,
        reason: dto.reason,
        description: dto.description,
      })
      .returning();

    await this.auditService.record({
      userId: reporterId,
      action: 'report.created',
      entityType: 'report',
      entityId: report.id,
      newValue: report as unknown as Record<string, unknown>,
      correlationId: corrId,
    });

    this.logger.logWithData(
      'info',
      'Report created',
      {
        reportId: report.id,
        reporterId,
        entityType: dto.entityType,
        entityId: dto.entityId,
        correlationId: corrId,
      },
      'ModerationService',
    );

    return report;
  }

  async getReports(
    status?: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<PaginatedResult<typeof reports.$inferSelect>> {
    const offset = (page - 1) * limit;

    const conditions = [];
    if (status) {
      conditions.push(eq(reports.status, status as 'pending' | 'resolved' | 'dismissed'));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalResult] = await this.db
      .select({ total: count() })
      .from(reports)
      .where(whereClause);

    const total = totalResult?.total ?? 0;

    const data = await this.db
      .select()
      .from(reports)
      .where(whereClause)
      .orderBy(desc(reports.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async resolveReport(
    reportId: string,
    moderatorId: string,
    dto: ResolveReportDto,
    correlationId?: string,
  ): Promise<typeof reports.$inferSelect> {
    const corrId = correlationId ?? getCorrelationId();

    const [existing] = await this.db
      .select()
      .from(reports)
      .where(eq(reports.id, reportId))
      .limit(1);

    if (!existing) {
      throw new NotFoundException(`Report with id ${reportId} not found`);
    }

    const [updated] = await this.db
      .update(reports)
      .set({
        status: dto.status as 'resolved' | 'dismissed',
        resolvedBy: moderatorId,
        resolvedAt: new Date(),
        resolution: dto.resolution,
        updatedAt: new Date(),
      })
      .where(eq(reports.id, reportId))
      .returning();

    await this.auditService.record({
      userId: moderatorId,
      action: `report.${dto.status}`,
      entityType: 'report',
      entityId: reportId,
      oldValue: { status: existing.status },
      newValue: { status: dto.status, resolvedBy: moderatorId, resolution: dto.resolution },
      correlationId: corrId,
    });

    this.logger.logWithData(
      'info',
      `Report ${dto.status}`,
      { reportId, moderatorId, status: dto.status, correlationId: corrId },
      'ModerationService',
    );

    return updated;
  }
}
