import { Worker, Job, Queue } from 'bullmq';
import { QUEUE_NAMES, createRedisConnection } from '../queues';
import { createLogger } from '../lib/logger';

const logger = createLogger('webhook-retry');

// ---------------------------------------------------------------------------
// Job data types
// ---------------------------------------------------------------------------

export interface WebhookRetryJobData {
  eventType: string;
  payload: unknown;
  attempt: number;
  originalEventId: string;
  correlationId: string;
  firstFailedAt: string;
  lastError: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_RETRIES = 5;

/** Exponential backoff delays: 30s, 2min, 10min, 1h, 6h */
const RETRY_DELAYS_MS = [
  30_000,       // 30 seconds
  120_000,      // 2 minutes
  600_000,      // 10 minutes
  3_600_000,    // 1 hour
  21_600_000,   // 6 hours
] as const;

// ---------------------------------------------------------------------------
// Stripe event type to handler mapping
// We re-route the event through an HTTP call to the API server so that the
// full NestJS DI context (PaymentService, SubscriptionService, etc.) is used.
// This keeps the worker thin and avoids duplicating business logic.
// ---------------------------------------------------------------------------

async function reprocessWebhookEvent(
  eventType: string,
  payload: unknown,
  correlationId: string,
): Promise<void> {
  const apiUrl = process.env.API_INTERNAL_URL || 'http://localhost:3001';

  const response = await fetch(`${apiUrl}/api/v1/webhooks/retry`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Correlation-Id': correlationId,
      'X-Internal-Retry': 'true',
    },
    body: JSON.stringify({ eventType, payload }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => 'Unable to read body');
    throw new Error(
      `Webhook retry API returned ${response.status}: ${body}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Job processor
// ---------------------------------------------------------------------------

async function processWebhookRetryJob(
  job: Job<WebhookRetryJobData>,
): Promise<void> {
  const { eventType, payload, attempt, originalEventId, correlationId, lastError } = job.data;

  // Dead letter jobs are not processed — they sit in the queue for manual inspection
  if (job.name === 'dead-letter') {
    logger.error('Dead letter webhook event stored', {
      originalEventId,
      eventType,
      attempt,
      correlationId,
      lastError,
    });
    return;
  }

  logger.info('Processing webhook retry', {
    originalEventId,
    eventType,
    attempt,
    maxRetries: MAX_RETRIES,
    correlationId,
  });

  try {
    await reprocessWebhookEvent(eventType, payload, correlationId);

    logger.info('Webhook retry succeeded', {
      originalEventId,
      eventType,
      attempt,
      correlationId,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('Webhook retry failed', {
      originalEventId,
      eventType,
      attempt,
      maxRetries: MAX_RETRIES,
      correlationId,
      error: errorMessage,
    });

    if (attempt >= MAX_RETRIES) {
      logger.error('CRITICAL: Webhook max retries exhausted, storing as dead letter', {
        originalEventId,
        eventType,
        attempt,
        correlationId,
        firstFailedAt: job.data.firstFailedAt,
        lastError: errorMessage,
      });
      // Job stays in failed state for manual inspection
      throw new Error(
        `Dead letter: webhook ${originalEventId} (${eventType}) failed after ${attempt} retries: ${errorMessage}`,
      );
    }

    // Schedule next retry with exponential backoff
    const connection = createRedisConnection();
    const retryQueue = new Queue<WebhookRetryJobData>(QUEUE_NAMES.WEBHOOK_RETRY, {
      connection,
    });

    const delay = RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];

    await retryQueue.add(
      'webhook-retry',
      {
        eventType,
        payload,
        attempt: attempt + 1,
        originalEventId,
        correlationId,
        firstFailedAt: job.data.firstFailedAt,
        lastError: errorMessage,
      },
      { delay },
    );

    await retryQueue.close();

    logger.warn('Next webhook retry scheduled', {
      originalEventId,
      eventType,
      nextAttempt: attempt + 1,
      delayMs: delay,
      correlationId,
    });
  }
}

// ---------------------------------------------------------------------------
// Worker factory
// ---------------------------------------------------------------------------

export function createWebhookRetryWorker(): Worker<WebhookRetryJobData> {
  const connection = createRedisConnection();

  const worker = new Worker<WebhookRetryJobData>(
    QUEUE_NAMES.WEBHOOK_RETRY,
    async (job) => processWebhookRetryJob(job),
    {
      connection,
      concurrency: 3,
      limiter: {
        max: 10,
        duration: 60_000,
      },
    },
  );

  worker.on('completed', (job) => {
    logger.info('Webhook retry job completed', {
      jobId: job.id,
      jobName: job.name,
      originalEventId: job.data.originalEventId,
      eventType: job.data.eventType,
      attempt: job.data.attempt,
      correlationId: job.data.correlationId,
    });
  });

  worker.on('failed', (job, error) => {
    logger.error('Webhook retry job failed', {
      jobId: job?.id,
      jobName: job?.name,
      originalEventId: job?.data.originalEventId,
      eventType: job?.data.eventType,
      attempt: job?.data.attempt,
      correlationId: job?.data.correlationId,
      error: error.message,
      stack: error.stack,
    });
  });

  return worker;
}
