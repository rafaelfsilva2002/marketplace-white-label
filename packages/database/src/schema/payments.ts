import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  integer,
  pgEnum,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

export const stripeAccountStatusEnum = pgEnum('stripe_account_status', [
  'pending',
  'active',
  'restricted',
  'disabled',
]);

export const ledgerEntryTypeEnum = pgEnum('ledger_entry_type', [
  'credit',
  'debit',
  'hold',
  'release',
  'refund',
  'fee',
  'payout',
]);

export const stripeAccounts = pgTable(
  'stripe_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    stripeAccountId: text('stripe_account_id').notNull().unique(),
    status: stripeAccountStatusEnum('status').notNull().default('pending'),
    chargesEnabled: text('charges_enabled').notNull().default('false'),
    payoutsEnabled: text('payouts_enabled').notNull().default('false'),
    detailsSubmitted: text('details_submitted').notNull().default('false'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('stripe_accounts_user_id_idx').on(table.userId),
    index('stripe_accounts_stripe_account_id_idx').on(table.stripeAccountId),
    index('stripe_accounts_status_idx').on(table.status),
  ],
);

export const wallets = pgTable(
  'wallets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    balance: integer('balance').notNull().default(0),
    pendingBalance: integer('pending_balance').notNull().default(0),
    currency: text('currency').notNull().default('BRL'),
    version: integer('version').notNull().default(1),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('wallets_user_id_idx').on(table.userId),
    index('wallets_currency_idx').on(table.currency),
  ],
);

export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    walletId: uuid('wallet_id')
      .notNull()
      .references(() => wallets.id, { onDelete: 'cascade' }),
    type: ledgerEntryTypeEnum('type').notNull(),
    amount: integer('amount').notNull(),
    balanceBefore: integer('balance_before').notNull(),
    balanceAfter: integer('balance_after').notNull(),
    description: text('description'),
    referenceType: text('reference_type'),
    referenceId: uuid('reference_id'),
    idempotencyKey: text('idempotency_key').notNull(),
    correlationId: uuid('correlation_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('ledger_entries_wallet_id_idx').on(table.walletId),
    index('ledger_entries_type_idx').on(table.type),
    index('ledger_entries_reference_idx').on(
      table.referenceType,
      table.referenceId,
    ),
    index('ledger_entries_correlation_id_idx').on(table.correlationId),
    index('ledger_entries_created_at_idx').on(table.createdAt),
    unique('ledger_entries_idempotency_key_unique').on(table.idempotencyKey),
  ],
);

export const stripeAccountsRelations = relations(
  stripeAccounts,
  ({ one }) => ({
    user: one(users, {
      fields: [stripeAccounts.userId],
      references: [users.id],
    }),
  }),
);

export const walletsRelations = relations(wallets, ({ one, many }) => ({
  user: one(users, {
    fields: [wallets.userId],
    references: [users.id],
  }),
  ledgerEntries: many(ledgerEntries),
}));

export const ledgerEntriesRelations = relations(ledgerEntries, ({ one }) => ({
  wallet: one(wallets, {
    fields: [ledgerEntries.walletId],
    references: [wallets.id],
  }),
}));

export type StripeAccount = typeof stripeAccounts.$inferSelect;
export type NewStripeAccount = typeof stripeAccounts.$inferInsert;
export type Wallet = typeof wallets.$inferSelect;
export type NewWallet = typeof wallets.$inferInsert;
export type LedgerEntry = typeof ledgerEntries.$inferSelect;
export type NewLedgerEntry = typeof ledgerEntries.$inferInsert;
