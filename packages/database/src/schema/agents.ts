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
} from 'drizzle-orm/pg-core';
import { users } from './users';

// ── Enums ────────────────────────────────────────────────────────────

export const agentTypeEnum = pgEnum('agent_type', [
  'moderator',
  'assistant',
  'analyst',
  'pricing',
]);

export const agentStatusEnum = pgEnum('agent_status', [
  'active',
  'paused',
  'disabled',
]);

export const conversationStatusEnum = pgEnum('conversation_status', [
  'active',
  'archived',
]);

export const messageRoleEnum = pgEnum('message_role', [
  'system',
  'user',
  'assistant',
  'tool',
]);

export const agentActionStatusEnum = pgEnum('agent_action_status', [
  'pending',
  'approved',
  'rejected',
  'executed',
]);

// ── Agent Config & Tool JSON types ───────────────────────────────────

export interface AgentConfigJson {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: string[];
  autonomyLevel?: 'low' | 'medium' | 'high';
}

export interface ToolCallJson {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResultJson {
  callId: string;
  name: string;
  result: unknown;
  error?: string;
}

// ── Tables ───────────────────────────────────────────────────────────

export const aiAgents = pgTable(
  'ai_agents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    type: agentTypeEnum('type').notNull(),
    description: text('description'),
    systemPrompt: text('system_prompt').notNull(),
    status: agentStatusEnum('status').notNull().default('active'),
    config: jsonb('config').$type<AgentConfigJson>().notNull().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('ai_agents_type_idx').on(table.type),
    index('ai_agents_status_idx').on(table.status),
    index('ai_agents_name_idx').on(table.name),
  ],
);

export const agentConversations = pgTable(
  'agent_conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => aiAgents.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: conversationStatusEnum('status').notNull().default('active'),
    context: jsonb('context').$type<Record<string, unknown>>().default({}),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('agent_conversations_agent_id_idx').on(table.agentId),
    index('agent_conversations_user_id_idx').on(table.userId),
    index('agent_conversations_status_idx').on(table.status),
    index('agent_conversations_agent_user_idx').on(
      table.agentId,
      table.userId,
    ),
    index('agent_conversations_created_at_idx').on(table.createdAt),
  ],
);

export const agentMessages = pgTable(
  'agent_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => agentConversations.id, { onDelete: 'cascade' }),
    role: messageRoleEnum('role').notNull(),
    content: text('content').notNull(),
    toolCalls: jsonb('tool_calls').$type<ToolCallJson[]>(),
    toolResults: jsonb('tool_results').$type<ToolResultJson[]>(),
    tokens: integer('tokens'),
    costUsd: real('cost_usd'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('agent_messages_conversation_id_idx').on(table.conversationId),
    index('agent_messages_role_idx').on(table.role),
    index('agent_messages_conversation_created_idx').on(
      table.conversationId,
      table.createdAt,
    ),
  ],
);

export const agentActions = pgTable(
  'agent_actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => aiAgents.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id').references(
      () => agentConversations.id,
      { onDelete: 'set null' },
    ),
    actionType: text('action_type').notNull(),
    params: jsonb('params').$type<Record<string, unknown>>().notNull(),
    result: jsonb('result').$type<Record<string, unknown>>(),
    status: agentActionStatusEnum('status').notNull().default('pending'),
    approvedBy: uuid('approved_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    rejectionReason: text('rejection_reason'),
    executedAt: timestamp('executed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('agent_actions_agent_id_idx').on(table.agentId),
    index('agent_actions_conversation_id_idx').on(table.conversationId),
    index('agent_actions_status_idx').on(table.status),
    index('agent_actions_action_type_idx').on(table.actionType),
    index('agent_actions_approved_by_idx').on(table.approvedBy),
    index('agent_actions_created_at_idx').on(table.createdAt),
    index('agent_actions_status_created_at_idx').on(
      table.status,
      table.createdAt,
    ),
  ],
);

// ── Inferred types ───────────────────────────────────────────────────

export type AIAgent = typeof aiAgents.$inferSelect;
export type NewAIAgent = typeof aiAgents.$inferInsert;

export type AgentConversation = typeof agentConversations.$inferSelect;
export type NewAgentConversation = typeof agentConversations.$inferInsert;

export type AgentMessage = typeof agentMessages.$inferSelect;
export type NewAgentMessage = typeof agentMessages.$inferInsert;

export type AgentAction = typeof agentActions.$inferSelect;
export type NewAgentAction = typeof agentActions.$inferInsert;
