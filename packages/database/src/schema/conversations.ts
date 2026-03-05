import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  varchar,
  pgEnum,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

export const messageTypeEnum = pgEnum('message_type', [
  'text',
  'image',
  'system',
]);

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    participantOneId: uuid('participant_one_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    participantTwoId: uuid('participant_two_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lastMessageAt: timestamp('last_message_at'),
    lastMessagePreview: varchar('last_message_preview', { length: 200 }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('conversations_participant_one_idx').on(table.participantOneId),
    index('conversations_participant_two_idx').on(table.participantTwoId),
    index('conversations_last_message_at_idx').on(table.lastMessageAt),
    unique('conversations_participants_unique').on(
      table.participantOneId,
      table.participantTwoId,
    ),
  ],
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    senderId: uuid('sender_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    type: messageTypeEnum('type').notNull().default('text'),
    isRead: boolean('is_read').notNull().default(false),
    readAt: timestamp('read_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('messages_conversation_id_idx').on(table.conversationId),
    index('messages_sender_id_idx').on(table.senderId),
    index('messages_created_at_idx').on(table.createdAt),
    index('messages_conversation_created_idx').on(
      table.conversationId,
      table.createdAt,
    ),
    index('messages_unread_idx').on(
      table.conversationId,
      table.isRead,
    ),
  ],
);

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  participantOne: one(users, {
    fields: [conversations.participantOneId],
    references: [users.id],
    relationName: 'conversationsAsParticipantOne',
  }),
  participantTwo: one(users, {
    fields: [conversations.participantTwoId],
    references: [users.id],
    relationName: 'conversationsAsParticipantTwo',
  }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  sender: one(users, {
    fields: [messages.senderId],
    references: [users.id],
    relationName: 'messagesBySender',
  }),
}));

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
