import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { eq, and, lte, sql } from 'drizzle-orm';
import { outboxEvents, type OutboxEvent } from '@marketplace/database';
import type { Database } from '@marketplace/database';
import { StructuredLogger } from '../logger/structured.logger';

export interface EventHandler {
  handle(event: OutboxEvent): Promise<void>;
}

@Injectable()
export class EventDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger: StructuredLogger;
  private readonly handlers: Map<string, EventHandler[]> = new Map();
  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  private isProcessing = false;
  private readonly pollIntervalMs: number;
  private readonly batchSize: number;

  constructor(
    private readonly db: Database,
    pollIntervalMs = 1000,
    batchSize = 50,
  ) {
    this.logger = new StructuredLogger('EventDispatcher');
    this.pollIntervalMs = pollIntervalMs;
    this.batchSize = batchSize;
  }

  onModuleInit(): void {
    this.startPolling();
  }

  onModuleDestroy(): void {
    this.stopPolling();
  }

  registerHandler(eventType: string, handler: EventHandler): void {
    const existing = this.handlers.get(eventType) ?? [];
    existing.push(handler);
    this.handlers.set(eventType, existing);
    this.logger.logWithData(
      'info',
      'Event handler registered',
      { eventType, handlerCount: existing.length },
      'EventDispatcher',
    );
  }

  private startPolling(): void {
    this.pollingInterval = setInterval(async () => {
      if (this.isProcessing) {
        return;
      }
      await this.processPendingEvents();
    }, this.pollIntervalMs);

    this.logger.log(
      `Event dispatcher polling started (interval: ${this.pollIntervalMs}ms)`,
      'EventDispatcher',
    );
  }

  private stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    this.logger.log('Event dispatcher polling stopped', 'EventDispatcher');
  }

  async processPendingEvents(): Promise<number> {
    this.isProcessing = true;
    let processedCount = 0;

    try {
      const pendingEvents = await this.db
        .select()
        .from(outboxEvents)
        .where(
          and(
            eq(outboxEvents.status, 'pending'),
            lte(outboxEvents.retryCount, outboxEvents.maxRetries),
          ),
        )
        .orderBy(outboxEvents.createdAt)
        .limit(this.batchSize);

      if (pendingEvents.length === 0) {
        return 0;
      }

      this.logger.logWithData(
        'info',
        'Processing pending outbox events',
        { count: pendingEvents.length },
        'EventDispatcher',
      );

      for (const event of pendingEvents) {
        const success = await this.dispatchEvent(event);
        if (success) {
          processedCount++;
        }
      }
    } catch (error) {
      this.logger.logError(
        'Error processing pending events',
        error instanceof Error ? error : new Error(String(error)),
        {},
        'EventDispatcher',
      );
    } finally {
      this.isProcessing = false;
    }

    return processedCount;
  }

  private async dispatchEvent(event: OutboxEvent): Promise<boolean> {
    const handlers = this.handlers.get(event.eventType) ?? [];

    if (handlers.length === 0) {
      this.logger.logWithData(
        'warn',
        'No handlers registered for event type',
        { eventType: event.eventType, eventId: event.id },
        'EventDispatcher',
      );
      return false;
    }

    // Mark as processing
    await this.db
      .update(outboxEvents)
      .set({ status: 'processing' })
      .where(eq(outboxEvents.id, event.id));

    try {
      for (const handler of handlers) {
        await handler.handle(event);
      }

      // Mark as dispatched
      await this.db
        .update(outboxEvents)
        .set({
          status: 'dispatched',
          processedAt: new Date(),
        })
        .where(eq(outboxEvents.id, event.id));

      this.logger.logWithData(
        'info',
        'Event dispatched successfully',
        {
          eventId: event.id,
          eventType: event.eventType,
          correlationId: event.correlationId,
          handlerCount: handlers.length,
        },
        'EventDispatcher',
      );

      return true;
    } catch (error) {
      const nextRetryCount = event.retryCount + 1;
      const isFailed = nextRetryCount >= event.maxRetries;

      await this.db
        .update(outboxEvents)
        .set({
          status: isFailed ? 'failed' : 'pending',
          retryCount: nextRetryCount,
          lastError:
            error instanceof Error ? error.message : String(error),
        })
        .where(eq(outboxEvents.id, event.id));

      this.logger.logError(
        'Event dispatch failed',
        error instanceof Error ? error : new Error(String(error)),
        {
          eventId: event.id,
          eventType: event.eventType,
          retryCount: nextRetryCount,
          maxRetries: event.maxRetries,
          isFailed,
        },
        'EventDispatcher',
      );

      return false;
    }
  }
}
