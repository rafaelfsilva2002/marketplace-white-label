import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  integer,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core';

export const outboxStatusEnum = pgEnum('outbox_status', [
  'pending',
  'processing',
  'dispatched',
  'failed',
]);

export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventType: text('event_type').notNull(),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: uuid('aggregate_id').notNull(),
    correlationId: uuid('correlation_id').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    status: outboxStatusEnum('status').notNull().default('pending'),
    retryCount: integer('retry_count').notNull().default(0),
    maxRetries: integer('max_retries').notNull().default(5),
    lastError: text('last_error'),
    processedAt: timestamp('processed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('outbox_events_status_idx').on(table.status),
    index('outbox_events_event_type_idx').on(table.eventType),
    index('outbox_events_aggregate_idx').on(
      table.aggregateType,
      table.aggregateId,
    ),
    index('outbox_events_correlation_id_idx').on(table.correlationId),
    index('outbox_events_created_at_idx').on(table.createdAt),
    index('outbox_events_status_created_at_idx').on(
      table.status,
      table.createdAt,
    ),
  ],
);

export type OutboxEvent = typeof outboxEvents.$inferSelect;
export type NewOutboxEvent = typeof outboxEvents.$inferInsert;
