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

export const workflowStatusEnum = pgEnum('workflow_status', [
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
]);

export const workflowStepStatusEnum = pgEnum('workflow_step_status', [
  'pending',
  'running',
  'completed',
  'failed',
  'skipped',
]);

export const workflows = pgTable(
  'workflows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    status: workflowStatusEnum('status').notNull().default('pending'),
    input: jsonb('input').$type<Record<string, unknown>>(),
    output: jsonb('output').$type<Record<string, unknown>>(),
    error: text('error'),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    correlationId: uuid('correlation_id').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('workflows_name_idx').on(table.name),
    index('workflows_status_idx').on(table.status),
    index('workflows_correlation_id_idx').on(table.correlationId),
    index('workflows_created_at_idx').on(table.createdAt),
    index('workflows_status_created_at_idx').on(table.status, table.createdAt),
  ],
);

export const workflowSteps = pgTable(
  'workflow_steps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workflowId: uuid('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),
    stepName: text('step_name').notNull(),
    status: workflowStepStatusEnum('status').notNull().default('pending'),
    input: jsonb('input').$type<Record<string, unknown>>(),
    output: jsonb('output').$type<Record<string, unknown>>(),
    error: text('error'),
    attempt: integer('attempt').notNull().default(1),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('workflow_steps_workflow_id_idx').on(table.workflowId),
    index('workflow_steps_status_idx').on(table.status),
    index('workflow_steps_workflow_id_step_name_idx').on(
      table.workflowId,
      table.stepName,
    ),
  ],
);

export const workflowsRelations = relations(workflows, ({ many }) => ({
  steps: many(workflowSteps),
}));

export const workflowStepsRelations = relations(workflowSteps, ({ one }) => ({
  workflow: one(workflows, {
    fields: [workflowSteps.workflowId],
    references: [workflows.id],
  }),
}));

export type Workflow = typeof workflows.$inferSelect;
export type NewWorkflow = typeof workflows.$inferInsert;
export type WorkflowStep = typeof workflowSteps.$inferSelect;
export type NewWorkflowStep = typeof workflowSteps.$inferInsert;
