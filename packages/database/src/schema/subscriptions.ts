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
import { users } from './users';

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'active',
  'past_due',
  'canceled',
  'trialing',
  'paused',
  'unpaid',
]);

export const subscriptionPlanEnum = pgEnum('subscription_plan', [
  'free',
  'basic',
  'professional',
  'premium',
]);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    stripeSubscriptionId: text('stripe_subscription_id').unique(),
    stripePriceId: text('stripe_price_id'),
    plan: subscriptionPlanEnum('plan').notNull().default('free'),
    status: subscriptionStatusEnum('status').notNull().default('active'),
    currentPeriodStart: timestamp('current_period_start'),
    currentPeriodEnd: timestamp('current_period_end'),
    cancelAtPeriodEnd: text('cancel_at_period_end').notNull().default('false'),
    trialStart: timestamp('trial_start'),
    trialEnd: timestamp('trial_end'),
    canceledAt: timestamp('canceled_at'),
    features: jsonb('features').$type<Record<string, boolean>>().default({}),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('subscriptions_user_id_idx').on(table.userId),
    index('subscriptions_status_idx').on(table.status),
    index('subscriptions_plan_idx').on(table.plan),
    index('subscriptions_stripe_subscription_id_idx').on(
      table.stripeSubscriptionId,
    ),
    index('subscriptions_current_period_end_idx').on(
      table.currentPeriodEnd,
    ),
  ],
);

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  user: one(users, {
    fields: [subscriptions.userId],
    references: [users.id],
  }),
}));

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
