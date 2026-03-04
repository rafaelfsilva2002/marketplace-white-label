import { pgTable, uuid, text, timestamp, pgEnum } from 'drizzle-orm/pg-core';

export const reportStatusEnum = pgEnum('report_status', ['pending', 'resolved', 'dismissed']);

export const reports = pgTable('reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  reporterId: uuid('reporter_id').notNull(),
  entityType: text('entity_type').notNull(), // 'profile', 'review', 'photo'
  entityId: uuid('entity_id').notNull(),
  reason: text('reason').notNull(),
  description: text('description'),
  status: reportStatusEnum('status').notNull().default('pending'),
  resolvedBy: uuid('resolved_by'),
  resolvedAt: timestamp('resolved_at'),
  resolution: text('resolution'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
