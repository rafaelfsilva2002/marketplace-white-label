import { Worker, Job, Queue } from 'bullmq';
import { sql, lt } from 'drizzle-orm';
import { auditLogs, auditLogsArchive } from '@marketplace/database';
import type { Database } from '@marketplace/database';
import { QUEUE_NAMES, createRedisConnection } from '../queues';
import { createLogger } from '../lib/logger';

const logger = createLogger('audit-archival');

// ---------------------------------------------------------------------------
// Job data types
// ---------------------------------------------------------------------------

export interface AuditArchivalJobData {
  type: 'archive-old-logs';
  correlationId: string;
  retentionDays?: number;
  batchSize?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_RETENTION_DAYS = 90;
const DEFAULT_BATCH_SIZE = 1000;

// ---------------------------------------------------------------------------
// Job processor
// ---------------------------------------------------------------------------

async function processAuditArchivalJob(
  job: Job<AuditArchivalJobData>,
  db: Database,
): Promise<void> {
  const {
    correlationId,
    retentionDays = DEFAULT_RETENTION_DAYS,
    batchSize = DEFAULT_BATCH_SIZE,
  } = job.data;

  logger.info('Starting audit log archival', {
    correlationId,
    retentionDays,
    batchSize,
  });

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  let totalArchived = 0;
  let hasMore = true;

  while (hasMore) {
    // Process in batches to avoid long-running transactions and memory spikes
    const archived = await db.transaction(async (tx) => {
      // Select a batch of old entries
      const oldEntries = await tx
        .select()
        .from(auditLogs)
        .where(lt(auditLogs.createdAt, cutoffDate))
        .limit(batchSize);

      if (oldEntries.length === 0) {
        return 0;
      }

      // Insert into archive table with archivedAt timestamp
      await tx.insert(auditLogsArchive).values(
        oldEntries.map((entry) => ({
          id: entry.id,
          correlationId: entry.correlationId,
          userId: entry.userId,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          oldValue: entry.oldValue,
          newValue: entry.newValue,
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
          metadata: entry.metadata,
          createdAt: entry.createdAt,
        })),
      );

      // Delete archived entries from main table
      const entryIds = oldEntries.map((e) => e.id);
      await tx.delete(auditLogs).where(
        sql`${auditLogs.id} = ANY(${entryIds}::uuid[])`,
      );

      return oldEntries.length;
    });

    totalArchived += archived;

    if (archived < batchSize) {
      hasMore = false;
    }

    if (archived > 0) {
      logger.info('Batch archived', {
        correlationId,
        batchArchived: archived,
        totalArchived,
      });

      // Update job progress
      await job.updateProgress(totalArchived);
    }
  }

  // Count remaining entries for the summary log
  const [remainingResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(auditLogs);

  const remaining = remainingResult?.count ?? 0;

  logger.info(`Archived ${totalArchived} entries, ${remaining} remaining`, {
    correlationId,
    totalArchived,
    remaining,
    retentionDays,
  });
}

// ---------------------------------------------------------------------------
// Cron schedule setup
// ---------------------------------------------------------------------------

async function setupCronSchedule(): Promise<void> {
  const connection = createRedisConnection();
  const queue = new Queue<AuditArchivalJobData>(QUEUE_NAMES.AUDIT_ARCHIVAL, {
    connection,
  });

  // Remove any existing repeatable jobs to avoid duplicates on restart
  const existingJobs = await queue.getRepeatableJobs();
  for (const existingJob of existingJobs) {
    await queue.removeRepeatableByKey(existingJob.key);
  }

  // Schedule weekly archival: every Sunday at 03:00 UTC
  await queue.add(
    'archive-old-logs',
    {
      type: 'archive-old-logs',
      correlationId: `cron-audit-archival-${Date.now()}`,
    },
    {
      repeat: {
        pattern: '0 3 * * 0', // Every Sunday at 03:00 UTC
      },
      removeOnComplete: 10,
      removeOnFail: 50,
    },
  );

  logger.info('Audit archival cron schedule registered (weekly, Sundays 03:00 UTC)');

  await queue.close();
}

// ---------------------------------------------------------------------------
// Worker factory
// ---------------------------------------------------------------------------

export function createAuditArchivalWorker(
  db: Database,
): Worker<AuditArchivalJobData> {
  const connection = createRedisConnection();

  const worker = new Worker<AuditArchivalJobData>(
    QUEUE_NAMES.AUDIT_ARCHIVAL,
    async (job) => processAuditArchivalJob(job, db),
    {
      connection,
      concurrency: 1, // Only one archival job at a time
      limiter: {
        max: 1,
        duration: 60_000,
      },
    },
  );

  worker.on('completed', (job) => {
    logger.info('Audit archival job completed', {
      jobId: job.id,
      jobName: job.name,
      correlationId: job.data.correlationId,
    });
  });

  worker.on('failed', (job, error) => {
    logger.error('Audit archival job failed', {
      jobId: job?.id,
      jobName: job?.name,
      correlationId: job?.data.correlationId,
      error: error.message,
      stack: error.stack,
    });
  });

  // Set up the cron schedule
  setupCronSchedule().catch((error) => {
    logger.error('Failed to set up audit archival cron schedule', {
      error: error instanceof Error ? error.message : String(error),
    });
  });

  return worker;
}
