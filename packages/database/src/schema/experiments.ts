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
import { relations } from 'drizzle-orm';

export const experimentStatusEnum = pgEnum('experiment_status', [
  'draft',
  'running',
  'completed',
  'archived',
]);

export const experiments = pgTable(
  'experiments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    description: text('description'),
    status: experimentStatusEnum('status').notNull().default('draft'),
    startedAt: timestamp('started_at'),
    endedAt: timestamp('ended_at'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('experiments_name_idx').on(table.name),
    index('experiments_status_idx').on(table.status),
    index('experiments_created_at_idx').on(table.createdAt),
  ],
);

export interface ExperimentVariantConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  prompt?: string;
  provider?: 'openai' | 'anthropic' | 'ollama';
  [key: string]: unknown;
}

export const experimentVariants = pgTable(
  'experiment_variants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    experimentId: uuid('experiment_id')
      .notNull()
      .references(() => experiments.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    weight: integer('weight').notNull().default(50),
    config: jsonb('config').$type<ExperimentVariantConfig>().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('experiment_variants_experiment_id_idx').on(table.experimentId),
  ],
);

export interface ExperimentMetrics {
  latency_ms?: number;
  cost_usd?: number;
  quality_score?: number;
  user_rating?: number;
  [key: string]: unknown;
}

export const experimentResults = pgTable(
  'experiment_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    experimentId: uuid('experiment_id')
      .notNull()
      .references(() => experiments.id, { onDelete: 'cascade' }),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => experimentVariants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id'),
    correlationId: uuid('correlation_id'),
    metrics: jsonb('metrics').$type<ExperimentMetrics>().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('experiment_results_experiment_id_idx').on(table.experimentId),
    index('experiment_results_variant_id_idx').on(table.variantId),
    index('experiment_results_user_id_idx').on(table.userId),
    index('experiment_results_correlation_id_idx').on(table.correlationId),
    index('experiment_results_created_at_idx').on(table.createdAt),
    index('experiment_results_experiment_variant_idx').on(
      table.experimentId,
      table.variantId,
    ),
  ],
);

export const experimentsRelations = relations(experiments, ({ many }) => ({
  variants: many(experimentVariants),
  results: many(experimentResults),
}));

export const experimentVariantsRelations = relations(
  experimentVariants,
  ({ one, many }) => ({
    experiment: one(experiments, {
      fields: [experimentVariants.experimentId],
      references: [experiments.id],
    }),
    results: many(experimentResults),
  }),
);

export const experimentResultsRelations = relations(
  experimentResults,
  ({ one }) => ({
    experiment: one(experiments, {
      fields: [experimentResults.experimentId],
      references: [experiments.id],
    }),
    variant: one(experimentVariants, {
      fields: [experimentResults.variantId],
      references: [experimentVariants.id],
    }),
  }),
);

export type Experiment = typeof experiments.$inferSelect;
export type NewExperiment = typeof experiments.$inferInsert;
export type ExperimentVariant = typeof experimentVariants.$inferSelect;
export type NewExperimentVariant = typeof experimentVariants.$inferInsert;
export type ExperimentResult = typeof experimentResults.$inferSelect;
export type NewExperimentResult = typeof experimentResults.$inferInsert;
