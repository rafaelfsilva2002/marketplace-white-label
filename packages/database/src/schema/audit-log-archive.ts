import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';

/**
 * Archive table for audit logs older than 90 days.
 * Same schema as `audit_logs` with an additional `archivedAt` timestamp.
 * Populated by the `audit-archival` BullMQ worker on a weekly cron schedule.
 */
export const auditLogsArchive = pgTable(
  'audit_logs_archive',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    correlationId: uuid('correlation_id').notNull(),
    userId: uuid('user_id'),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id'),
    oldValue: jsonb('old_value'),
    newValue: jsonb('new_value'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').notNull(),
    archivedAt: timestamp('archived_at').defaultNow().notNull(),
  },
  (table) => [
    index('audit_logs_archive_correlation_id_idx').on(table.correlationId),
    index('audit_logs_archive_user_id_idx').on(table.userId),
    index('audit_logs_archive_action_idx').on(table.action),
    index('audit_logs_archive_entity_type_entity_id_idx').on(
      table.entityType,
      table.entityId,
    ),
    index('audit_logs_archive_created_at_idx').on(table.createdAt),
    index('audit_logs_archive_archived_at_idx').on(table.archivedAt),
  ],
);

export type AuditLogArchive = typeof auditLogsArchive.$inferSelect;
export type NewAuditLogArchive = typeof auditLogsArchive.$inferInsert;
