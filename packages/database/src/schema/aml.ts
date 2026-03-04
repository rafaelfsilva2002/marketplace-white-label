import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  jsonb,
  integer,
  real,
  pgEnum,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';
import { cryptoTransactions } from './crypto';

export const amlRiskLevelEnum = pgEnum('aml_risk_level', [
  'low',
  'medium',
  'high',
  'critical',
]);

export const amlStatusEnum = pgEnum('aml_status', [
  'pending_aml',
  'approved',
  'rejected',
  'manual_review',
]);

export const sarStatusEnum = pgEnum('sar_status', [
  'pending',
  'reviewed',
  'filed',
  'dismissed',
]);

export const reviewQueueStatusEnum = pgEnum('review_queue_status', [
  'pending',
  'in_review',
  'approved',
  'rejected',
]);

export const reviewPriorityEnum = pgEnum('review_priority', [
  'normal',
  'high',
  'urgent',
]);

// --- Tables ---

export const amlScreenings = pgTable(
  'aml_screenings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    transactionId: uuid('transaction_id').references(
      () => cryptoTransactions.id,
    ),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    riskLevel: amlRiskLevelEnum('risk_level').notNull(),
    score: real('score').notNull(),
    approved: boolean('approved').notNull(),
    requiresManualReview: boolean('requires_manual_review')
      .notNull()
      .default(false),
    factors: jsonb('factors')
      .notNull()
      .$type<Array<{ type: string; description: string; weight: number }>>(),
    provider: text('provider').notNull().default('internal'),
    travelRuleData: jsonb('travel_rule_data').$type<Record<string, unknown>>(),
    correlationId: uuid('correlation_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('aml_screenings_user_id_idx').on(table.userId),
    index('aml_screenings_transaction_id_idx').on(table.transactionId),
    index('aml_screenings_risk_level_idx').on(table.riskLevel),
    index('aml_screenings_created_at_idx').on(table.createdAt),
  ],
);

export const suspiciousActivityReports = pgTable(
  'suspicious_activity_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    screeningId: uuid('screening_id').references(() => amlScreenings.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    transactionId: uuid('transaction_id'),
    reportType: text('report_type').notNull(),
    severity: text('severity').notNull(),
    summary: text('summary').notNull(),
    details: jsonb('details').notNull().$type<Record<string, unknown>>(),
    status: sarStatusEnum('status').notNull().default('pending'),
    reviewedBy: uuid('reviewed_by').references(() => users.id),
    reviewedAt: timestamp('reviewed_at'),
    filedAt: timestamp('filed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('sars_user_id_idx').on(table.userId),
    index('sars_screening_id_idx').on(table.screeningId),
    index('sars_status_idx').on(table.status),
    index('sars_created_at_idx').on(table.createdAt),
  ],
);

export const amlReviewQueue = pgTable(
  'aml_review_queue',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    screeningId: uuid('screening_id')
      .notNull()
      .references(() => amlScreenings.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    transactionId: uuid('transaction_id'),
    reason: text('reason').notNull(),
    priority: reviewPriorityEnum('priority').notNull().default('normal'),
    status: reviewQueueStatusEnum('status').notNull().default('pending'),
    assignedTo: uuid('assigned_to').references(() => users.id),
    notes: text('notes'),
    resolvedAt: timestamp('resolved_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('review_queue_status_idx').on(table.status),
    index('review_queue_priority_idx').on(table.priority),
    index('review_queue_assigned_to_idx').on(table.assignedTo),
    index('review_queue_created_at_idx').on(table.createdAt),
  ],
);

export const amlBlacklists = pgTable(
  'aml_blacklists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    address: text('address').notNull(),
    chain: text('chain'),
    reason: text('reason').notNull(),
    source: text('source').notNull().default('manual'),
    addedBy: uuid('added_by').references(() => users.id),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('blacklists_address_idx').on(table.address),
    unique('blacklists_address_chain_unique').on(table.address, table.chain),
  ],
);

export const amlRateLimits = pgTable(
  'aml_rate_limits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    walletAddress: text('wallet_address').notNull(),
    chain: text('chain').notNull(),
    txCount: integer('tx_count').notNull().default(0),
    totalAmountUsd: real('total_amount_usd').notNull().default(0),
    windowStart: timestamp('window_start').defaultNow().notNull(),
    windowHours: integer('window_hours').notNull().default(24),
  },
  (table) => [
    unique('rate_limits_wallet_chain_unique').on(
      table.walletAddress,
      table.chain,
    ),
  ],
);

// --- Relations ---

export const amlScreeningsRelations = relations(amlScreenings, ({ one }) => ({
  user: one(users, {
    fields: [amlScreenings.userId],
    references: [users.id],
  }),
  transaction: one(cryptoTransactions, {
    fields: [amlScreenings.transactionId],
    references: [cryptoTransactions.id],
  }),
}));

export const sarsRelations = relations(
  suspiciousActivityReports,
  ({ one }) => ({
    user: one(users, {
      fields: [suspiciousActivityReports.userId],
      references: [users.id],
    }),
    screening: one(amlScreenings, {
      fields: [suspiciousActivityReports.screeningId],
      references: [amlScreenings.id],
    }),
  }),
);

export const reviewQueueRelations = relations(amlReviewQueue, ({ one }) => ({
  user: one(users, {
    fields: [amlReviewQueue.userId],
    references: [users.id],
  }),
  screening: one(amlScreenings, {
    fields: [amlReviewQueue.screeningId],
    references: [amlScreenings.id],
  }),
}));

// --- Types ---

export type AmlScreening = typeof amlScreenings.$inferSelect;
export type NewAmlScreening = typeof amlScreenings.$inferInsert;
export type SuspiciousActivityReport =
  typeof suspiciousActivityReports.$inferSelect;
export type NewSuspiciousActivityReport =
  typeof suspiciousActivityReports.$inferInsert;
export type AmlReviewItem = typeof amlReviewQueue.$inferSelect;
export type NewAmlReviewItem = typeof amlReviewQueue.$inferInsert;
export type AmlBlacklistEntry = typeof amlBlacklists.$inferSelect;
export type NewAmlBlacklistEntry = typeof amlBlacklists.$inferInsert;
