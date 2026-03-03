import { Injectable } from '@nestjs/common';
import { outboxEvents, type NewOutboxEvent } from '@marketplace/database';
import { randomUUID } from 'node:crypto';
import { StructuredLogger } from '../logger/structured.logger';
import { getCorrelationId } from '../interceptors/correlation-id.interceptor';

export interface OutboxEventInput {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  correlationId?: string;
}

type DrizzleTransaction = {
  insert: (table: typeof outboxEvents) => {
    values: (values: NewOutboxEvent) => {
      returning: () => Promise<Array<typeof outboxEvents.$inferSelect>>;
    };
  };
};

@Injectable()
export class OutboxService {
  private readonly logger: StructuredLogger;

  constructor() {
    this.logger = new StructuredLogger('OutboxService');
  }

  async writeEvent(
    tx: DrizzleTransaction,
    input: OutboxEventInput,
  ): Promise<typeof outboxEvents.$inferSelect> {
    const correlationId = input.correlationId ?? getCorrelationId();

    const eventRecord: NewOutboxEvent = {
      id: randomUUID(),
      eventType: input.eventType,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      correlationId,
      payload: input.payload,
      metadata: input.metadata ?? {},
      status: 'pending',
      retryCount: 0,
      maxRetries: 5,
    };

    const [inserted] = await tx
      .insert(outboxEvents)
      .values(eventRecord)
      .returning();

    this.logger.logWithData(
      'info',
      'Outbox event written',
      {
        eventId: inserted.id,
        eventType: inserted.eventType,
        aggregateType: inserted.aggregateType,
        aggregateId: inserted.aggregateId,
        correlationId,
      },
      'OutboxService',
    );

    return inserted;
  }

  async writeEvents(
    tx: DrizzleTransaction,
    inputs: OutboxEventInput[],
  ): Promise<Array<typeof outboxEvents.$inferSelect>> {
    const results: Array<typeof outboxEvents.$inferSelect> = [];

    for (const input of inputs) {
      const result = await this.writeEvent(tx, input);
      results.push(result);
    }

    return results;
  }
}
