import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { eq, and, desc, count } from 'drizzle-orm';
import { reviews, type Database } from '@marketplace/database';
import { DATABASE_TOKEN } from '@/config/database.config';
import { OutboxService } from '@/common/events/outbox.service';
import { AuditService } from '@/modules/audit/audit.service';
import { StructuredLogger } from '@/common/logger/structured.logger';
import { getCorrelationId } from '@/common/interceptors/correlation-id.interceptor';
import { CreateReviewDto } from '../dto/create-review.dto';
import { UpdateReviewDto } from '../dto/update-review.dto';
import type { PaginatedResult } from '@marketplace/shared';

@Injectable()
export class ReviewService {
  private readonly logger = new StructuredLogger('ReviewService');

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
    private readonly outboxService: OutboxService,
    private readonly auditService: AuditService,
  ) {}

  async create(
    dto: CreateReviewDto,
    reviewerId: string,
    correlationId?: string,
  ): Promise<typeof reviews.$inferSelect> {
    const corrId = correlationId ?? getCorrelationId();

    const existing = await this.db
      .select({ id: reviews.id })
      .from(reviews)
      .where(
        and(
          eq(reviews.profileId, dto.profileId),
          eq(reviews.reviewerId, reviewerId),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictException(
        'You have already reviewed this profile',
      );
    }

    const result = await this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(reviews)
        .values({
          profileId: dto.profileId,
          reviewerId,
          rating: dto.rating,
          comment: dto.comment,
        })
        .returning();

      await this.outboxService.writeEvent(tx, {
        eventType: 'marketplace.review.created',
        aggregateType: 'review',
        aggregateId: created.id,
        payload: {
          reviewId: created.id,
          profileId: created.profileId,
          reviewerId: created.reviewerId,
          rating: created.rating,
          comment: created.comment,
        },
        correlationId: corrId,
      });

      return created;
    });

    await this.auditService.record({
      userId: reviewerId,
      action: 'review.created',
      entityType: 'review',
      entityId: result.id,
      newValue: result as unknown as Record<string, unknown>,
      correlationId: corrId,
    });

    this.logger.logWithData(
      'info',
      'Review created',
      {
        reviewId: result.id,
        profileId: dto.profileId,
        reviewerId,
        rating: dto.rating,
        correlationId: corrId,
      },
      'ReviewService',
    );

    return result;
  }

  async findByProfile(
    profileId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<PaginatedResult<typeof reviews.$inferSelect>> {
    const offset = (page - 1) * limit;

    const whereClause = and(
      eq(reviews.profileId, profileId),
      eq(reviews.isVisible, 'true'),
    );

    const [totalResult] = await this.db
      .select({ total: count() })
      .from(reviews)
      .where(whereClause);

    const total = totalResult?.total ?? 0;

    const data = await this.db
      .select()
      .from(reviews)
      .where(whereClause)
      .orderBy(desc(reviews.createdAt))
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

  async findById(id: string): Promise<typeof reviews.$inferSelect> {
    const [review] = await this.db
      .select()
      .from(reviews)
      .where(eq(reviews.id, id))
      .limit(1);

    if (!review) {
      throw new NotFoundException(`Review with id ${id} not found`);
    }

    return review;
  }

  async update(
    id: string,
    dto: UpdateReviewDto,
    userId: string,
    correlationId?: string,
  ): Promise<typeof reviews.$inferSelect> {
    const corrId = correlationId ?? getCorrelationId();

    const existing = await this.findById(id);

    if (existing.reviewerId !== userId) {
      throw new ForbiddenException('You can only update your own reviews');
    }

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (dto.rating !== undefined) updateData.rating = dto.rating;
    if (dto.comment !== undefined) updateData.comment = dto.comment;

    const result = await this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(reviews)
        .set(updateData)
        .where(eq(reviews.id, id))
        .returning();

      await this.outboxService.writeEvent(tx, {
        eventType: 'marketplace.review.updated',
        aggregateType: 'review',
        aggregateId: id,
        payload: {
          reviewId: id,
          profileId: existing.profileId,
          reviewerId: userId,
          updatedFields: Object.keys(dto).filter(
            (k) => (dto as Record<string, unknown>)[k] !== undefined,
          ),
        },
        correlationId: corrId,
      });

      return updated;
    });

    await this.auditService.record({
      userId,
      action: 'review.updated',
      entityType: 'review',
      entityId: id,
      oldValue: existing as unknown as Record<string, unknown>,
      newValue: result as unknown as Record<string, unknown>,
      correlationId: corrId,
    });

    this.logger.logWithData(
      'info',
      'Review updated',
      { reviewId: id, correlationId: corrId },
      'ReviewService',
    );

    return result;
  }

  async delete(
    id: string,
    userId: string,
    correlationId?: string,
  ): Promise<void> {
    const corrId = correlationId ?? getCorrelationId();

    const existing = await this.findById(id);

    if (existing.reviewerId !== userId) {
      throw new ForbiddenException('You can only delete your own reviews');
    }

    await this.db
      .update(reviews)
      .set({ isVisible: 'false', updatedAt: new Date() })
      .where(eq(reviews.id, id));

    await this.auditService.record({
      userId,
      action: 'review.deleted',
      entityType: 'review',
      entityId: id,
      oldValue: existing as unknown as Record<string, unknown>,
      correlationId: corrId,
    });

    this.logger.logWithData(
      'info',
      'Review soft deleted',
      { reviewId: id, correlationId: corrId },
      'ReviewService',
    );
  }
}
