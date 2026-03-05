import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';

export interface WebhookRetryJobData {
  eventType: string;
  payload: unknown;
  attempt: number;
  originalEventId: string;
  correlationId: string;
  firstFailedAt: string;
  lastError: string;
}

const MAX_RETRIES = 5;

/** Exponential backoff delays: 30s, 2min, 10min, 1h, 6h */
const RETRY_DELAYS_MS = [
  30_000,       // 30 seconds
  120_000,      // 2 minutes
  600_000,      // 10 minutes
  3_600_000,    // 1 hour
  21_600_000,   // 6 hours
] as const;

@Injectable()
export class WebhookRetryService implements OnModuleDestroy {
  private readonly logger = new Logger(WebhookRetryService.name);
  private readonly queue: Queue<WebhookRetryJobData>;

  constructor(private readonly configService: ConfigService) {
    const redisUrl = this.configService.get<string>('REDIS_URL') || 'redis://localhost:6379';
    const url = new URL(redisUrl);

    this.queue = new Queue<WebhookRetryJobData>('webhook-retry', {
      connection: {
        host: url.hostname,
        port: Number(url.port) || 6379,
        password: url.password || undefined,
        maxRetriesPerRequest: null,
      },
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }

  async scheduleRetry(
    eventType: string,
    payload: unknown,
    attempt: number,
    originalEventId: string,
    error: string,
    correlationId?: string,
  ): Promise<void> {
    if (attempt >= MAX_RETRIES) {
      this.logger.error({
        message: 'CRITICAL: Webhook max retries exhausted, sending to dead letter',
        eventType,
        originalEventId,
        attempt,
        error,
        correlationId,
      });

      await this.queue.add(
        'dead-letter',
        {
          eventType,
          payload,
          attempt,
          originalEventId,
          correlationId: correlationId ?? 'unknown',
          firstFailedAt: new Date().toISOString(),
          lastError: error,
        },
        {
          // Dead letter jobs don't need delay — they sit for manual inspection
          removeOnComplete: false,
          removeOnFail: false,
        },
      );
      return;
    }

    const delay = RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];

    this.logger.warn({
      message: 'Scheduling webhook retry',
      eventType,
      originalEventId,
      attempt: attempt + 1,
      maxRetries: MAX_RETRIES,
      delayMs: delay,
      correlationId,
    });

    await this.queue.add(
      'webhook-retry',
      {
        eventType,
        payload,
        attempt: attempt + 1,
        originalEventId,
        correlationId: correlationId ?? 'unknown',
        firstFailedAt: new Date().toISOString(),
        lastError: error,
      },
      { delay },
    );
  }
}
