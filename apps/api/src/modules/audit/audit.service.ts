import { Injectable } from '@nestjs/common';
import { auditLogs, type NewAuditLog } from '@marketplace/database';
import type { Database } from '@marketplace/database';
import { StructuredLogger } from '../../common/logger/structured.logger';
import { getCorrelationId } from '../../common/interceptors/correlation-id.interceptor';

export interface AuditEntry {
  userId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  correlationId?: string;
}

@Injectable()
export class AuditService {
  private readonly logger: StructuredLogger;

  constructor(private readonly db: Database) {
    this.logger = new StructuredLogger('AuditService');
  }

  async record(entry: AuditEntry): Promise<void> {
    const correlationId = entry.correlationId ?? getCorrelationId();

    const auditRecord: NewAuditLog = {
      correlationId,
      userId: entry.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      oldValue: entry.oldValue as Record<string, unknown> | null,
      newValue: entry.newValue as Record<string, unknown> | null,
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent,
      metadata: entry.metadata,
    };

    try {
      await this.db.insert(auditLogs).values(auditRecord);

      this.logger.logWithData(
        'info',
        'Audit entry recorded',
        {
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          userId: entry.userId,
          correlationId,
        },
        'AuditService',
      );
    } catch (error) {
      this.logger.logError(
        'Failed to record audit entry',
        error instanceof Error ? error : new Error(String(error)),
        {
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          correlationId,
        },
        'AuditService',
      );
      throw error;
    }
  }

  async recordBatch(entries: AuditEntry[]): Promise<void> {
    const correlationId = getCorrelationId();

    const records: NewAuditLog[] = entries.map((entry) => ({
      correlationId: entry.correlationId ?? correlationId,
      userId: entry.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      oldValue: entry.oldValue as Record<string, unknown> | null,
      newValue: entry.newValue as Record<string, unknown> | null,
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent,
      metadata: entry.metadata,
    }));

    try {
      await this.db.insert(auditLogs).values(records);

      this.logger.logWithData(
        'info',
        'Audit batch recorded',
        {
          count: entries.length,
          correlationId,
        },
        'AuditService',
      );
    } catch (error) {
      this.logger.logError(
        'Failed to record audit batch',
        error instanceof Error ? error : new Error(String(error)),
        {
          count: entries.length,
          correlationId,
        },
        'AuditService',
      );
      throw error;
    }
  }
}
