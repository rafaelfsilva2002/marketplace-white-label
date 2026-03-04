import { Injectable, Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DATABASE_TOKEN } from '@/config/database.config';
import { suspiciousActivityReports } from '@marketplace/database';
import { AuditService } from '@/modules/audit/audit.service';
import type {
  Database,
  NewSuspiciousActivityReport,
} from '@marketplace/database';
import type { ScreeningResult } from '../types';

@Injectable()
export class SarService {
  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async createFromScreening(
    screeningId: string,
    userId: string,
    transactionId: string | undefined,
    screeningResult: ScreeningResult,
    correlationId?: string,
  ) {
    const [sar] = await this.db
      .insert(suspiciousActivityReports)
      .values({
        screeningId,
        userId,
        transactionId,
        reportType: 'auto',
        severity: screeningResult.riskLevel as 'high' | 'critical',
        summary: `Auto-generated SAR: ${screeningResult.factors.map((f) => f.type).join(', ')}`,
        details: {
          score: screeningResult.score,
          factors: screeningResult.factors,
          travelRuleRequired: screeningResult.travelRuleRequired,
        },
      })
      .returning();

    await this.audit.record({
      userId,
      action: 'aml.sar.created',
      entityType: 'sar',
      entityId: sar.id,
      newValue: { severity: sar.severity, reportType: 'auto' },
      correlationId,
    });

    return sar;
  }

  async updateStatus(
    sarId: string,
    status: 'reviewed' | 'filed' | 'dismissed',
    reviewedBy: string,
  ) {
    const now = new Date();
    const [updated] = await this.db
      .update(suspiciousActivityReports)
      .set({
        status,
        reviewedBy,
        reviewedAt: now,
        ...(status === 'filed' ? { filedAt: now } : {}),
      })
      .where(eq(suspiciousActivityReports.id, sarId))
      .returning();

    await this.audit.record({
      userId: reviewedBy,
      action: `aml.sar.${status}`,
      entityType: 'sar',
      entityId: sarId,
      newValue: { status },
    });

    return updated;
  }

  async list(limit = 50, offset = 0) {
    return this.db.query.suspiciousActivityReports.findMany({
      orderBy: (sar, { desc }) => [desc(sar.createdAt)],
      limit,
      offset,
    });
  }

  async getById(id: string) {
    return this.db.query.suspiciousActivityReports.findFirst({
      where: eq(suspiciousActivityReports.id, id),
    });
  }
}
