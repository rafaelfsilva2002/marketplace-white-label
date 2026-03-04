import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  integer,
  real,
  pgEnum,
  index,
  customType,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { profiles } from './profiles';

const vector = customType<{
  data: number[];
  driverParam: string;
  config: { dimensions: number };
}>({
  dataType(config) {
    return `vector(${config?.dimensions ?? 1536})`;
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: unknown): number[] {
    const str = String(value);
    return str
      .replace('[', '')
      .replace(']', '')
      .split(',')
      .map(Number);
  },
});

export const embeddingSourceEnum = pgEnum('embedding_source', [
  'profile_bio',
  'profile_services',
  'review_comment',
  'search_query',
]);

export const moderationStatusEnum = pgEnum('moderation_status', [
  'pending',
  'approved',
  'rejected',
  'escalated',
]);

export const moderationTypeEnum = pgEnum('moderation_type', [
  'photo',
  'text',
  'profile',
  'review',
]);

export const fraudScoreRiskEnum = pgEnum('fraud_score_risk', [
  'low',
  'medium',
  'high',
  'critical',
]);

export const embeddingCache = pgTable(
  'embedding_cache',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceType: embeddingSourceEnum('source_type').notNull(),
    sourceId: uuid('source_id').notNull(),
    contentHash: text('content_hash').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    model: text('model').notNull().default('text-embedding-3-small'),
    tokenCount: integer('token_count'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('embedding_cache_source_type_source_id_idx').on(
      table.sourceType,
      table.sourceId,
    ),
    index('embedding_cache_content_hash_idx').on(table.contentHash),
    index('embedding_cache_model_idx').on(table.model),
  ],
);

export const moderationQueue = pgTable(
  'moderation_queue',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: moderationTypeEnum('type').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: moderationStatusEnum('status').notNull().default('pending'),
    autoScore: real('auto_score'),
    autoReason: text('auto_reason'),
    autoLabels: jsonb('auto_labels').$type<string[]>(),
    reviewedBy: uuid('reviewed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    reviewedAt: timestamp('reviewed_at'),
    reviewNote: text('review_note'),
    contentSnapshot: jsonb('content_snapshot').$type<Record<string, unknown>>(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('moderation_queue_status_idx').on(table.status),
    index('moderation_queue_type_idx').on(table.type),
    index('moderation_queue_user_id_idx').on(table.userId),
    index('moderation_queue_entity_type_entity_id_idx').on(
      table.entityType,
      table.entityId,
    ),
    index('moderation_queue_reviewed_by_idx').on(table.reviewedBy),
    index('moderation_queue_created_at_idx').on(table.createdAt),
    index('moderation_queue_status_created_at_idx').on(
      table.status,
      table.createdAt,
    ),
  ],
);

export const fraudScores = pgTable(
  'fraud_scores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    profileId: uuid('profile_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    riskLevel: fraudScoreRiskEnum('risk_level').notNull().default('low'),
    score: real('score').notNull().default(0),
    signals: jsonb('signals').$type<Record<string, unknown>>().notNull(),
    model: text('model').notNull(),
    modelVersion: text('model_version').notNull(),
    evaluatedAt: timestamp('evaluated_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('fraud_scores_user_id_idx').on(table.userId),
    index('fraud_scores_profile_id_idx').on(table.profileId),
    index('fraud_scores_risk_level_idx').on(table.riskLevel),
    index('fraud_scores_score_idx').on(table.score),
    index('fraud_scores_evaluated_at_idx').on(table.evaluatedAt),
    index('fraud_scores_expires_at_idx').on(table.expiresAt),
  ],
);

export type EmbeddingCacheEntry = typeof embeddingCache.$inferSelect;
export type NewEmbeddingCacheEntry = typeof embeddingCache.$inferInsert;
export type ModerationQueueItem = typeof moderationQueue.$inferSelect;
export type NewModerationQueueItem = typeof moderationQueue.$inferInsert;
export type FraudScore = typeof fraudScores.$inferSelect;
export type NewFraudScore = typeof fraudScores.$inferInsert;
