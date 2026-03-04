import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DATABASE_TOKEN } from '@/config/database.config';
import { amlReviewQueue, cryptoTransactions } from '@marketplace/database';
import { OutboxService } from '@/common/events/outbox.service';
import { AuditService } from '@/modules/audit/audit.service';
import type { Database } from '@marketplace/database';

@Injectable()
export class ReviewQueueService {
  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  async addToQueue(
    screeningId: string,
    userId: string,
    transactionId: string | undefined,
    reason: string,
    priority: 'normal' | 'high' | 'urgent' = 'normal',
  ) {
    const [item] = await this.db
      .insert(amlReviewQueue)
      .values({ screeningId, userId, transactionId, reason, priority })
      .returning();
    return item;
  }

  async approve(itemId: string, moderatorId: string) {
    const item = await this.getOrThrow(itemId);

    const [updated] = await this.db
      .update(amlReviewQueue)
      .set({ status: 'approved', resolvedAt: new Date() })
      .where(eq(amlReviewQueue.id, itemId))
      .returning();

    if (item.transactionId) {
      await this.db
        .update(cryptoTransactions)
        .set({ amlStatus: 'approved' })
        .where(eq(cryptoTransactions.id, item.transactionId));

      await this.db.transaction(async (tx) => {
        await this.outbox.writeEvent(tx, {
          eventType: 'marketplace.aml.review_approved',
          aggregateType: 'aml_review',
          aggregateId: itemId,
          payload: {
            itemId,
            transactionId: item.transactionId,
            userId: item.userId,
            moderatorId,
          },
        });
      });
    }

    await this.audit.record({
      userId: moderatorId,
      action: 'aml.review.approved',
      entityType: 'aml_review',
      entityId: itemId,
      newValue: { transactionId: item.transactionId },
    });

    return updated;
  }

  async reject(itemId: string, moderatorId: string, notes?: string) {
    const item = await this.getOrThrow(itemId);

    const [updated] = await this.db
      .update(amlReviewQueue)
      .set({ status: 'rejected', resolvedAt: new Date(), notes })
      .where(eq(amlReviewQueue.id, itemId))
      .returning();

    if (item.transactionId) {
      await this.db
        .update(cryptoTransactions)
        .set({ amlStatus: 'rejected' })
        .where(eq(cryptoTransactions.id, item.transactionId));

      await this.db.transaction(async (tx) => {
        await this.outbox.writeEvent(tx, {
          eventType: 'marketplace.aml.review_rejected',
          aggregateType: 'aml_review',
          aggregateId: itemId,
          payload: {
            itemId,
            transactionId: item.transactionId,
            userId: item.userId,
            moderatorId,
            notes,
          },
        });
      });
    }

    await this.audit.record({
      userId: moderatorId,
      action: 'aml.review.rejected',
      entityType: 'aml_review',
      entityId: itemId,
      newValue: { transactionId: item.transactionId, notes },
    });

    return updated;
  }

  async assign(itemId: string, assignedTo: string, moderatorId: string) {
    const [updated] = await this.db
      .update(amlReviewQueue)
      .set({ assignedTo, status: 'in_review' })
      .where(eq(amlReviewQueue.id, itemId))
      .returning();
    return updated;
  }

  async listPending(limit = 50, offset = 0) {
    return this.db.query.amlReviewQueue.findMany({
      where: eq(amlReviewQueue.status, 'pending'),
      orderBy: (q, { desc }) => [desc(q.createdAt)],
      limit,
      offset,
    });
  }

  async getById(id: string) {
    return this.db.query.amlReviewQueue.findFirst({
      where: eq(amlReviewQueue.id, id),
    });
  }

  private async getOrThrow(id: string) {
    const item = await this.getById(id);
    if (!item) throw new NotFoundException('Review queue item not found');
    return item;
  }
}
