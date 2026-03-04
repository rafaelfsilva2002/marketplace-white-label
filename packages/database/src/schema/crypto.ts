import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  jsonb,
  integer,
  pgEnum,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

export const chainEnum = pgEnum('chain', [
  'ethereum',
  'polygon',
  'solana',
]);

export const tokenEnum = pgEnum('token', [
  'USDT',
  'USDC',
]);

export const cryptoTxStatusEnum = pgEnum('crypto_tx_status', [
  'pending',
  'confirming',
  'confirmed',
  'failed',
  'reverted',
]);

export const cryptoLedgerTypeEnum = pgEnum('crypto_ledger_type', [
  'credit',
  'debit',
]);

export const cryptoWallets = pgTable(
  'crypto_wallets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    chain: chainEnum('chain').notNull(),
    address: text('address').notNull(),
    dfnsWalletId: text('dfns_wallet_id').notNull().unique(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('crypto_wallets_user_id_idx').on(table.userId),
    index('crypto_wallets_chain_idx').on(table.chain),
    index('crypto_wallets_address_idx').on(table.address),
    unique('crypto_wallets_user_chain_unique').on(table.userId, table.chain),
  ],
);

export const cryptoTransactions = pgTable(
  'crypto_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    walletId: uuid('wallet_id')
      .notNull()
      .references(() => cryptoWallets.id, { onDelete: 'cascade' }),
    txHash: text('tx_hash'),
    chain: chainEnum('chain').notNull(),
    fromAddress: text('from_address').notNull(),
    toAddress: text('to_address').notNull(),
    amount: text('amount').notNull(),
    token: text('token').notNull(),
    tokenDecimals: integer('token_decimals').notNull().default(6),
    amountBrl: text('amount_brl'),
    status: cryptoTxStatusEnum('status').notNull().default('pending'),
    blockNumber: integer('block_number'),
    gasUsed: text('gas_used'),
    gasFee: text('gas_fee'),
    confirmations: integer('confirmations').notNull().default(0),
    requiredConfirmations: integer('required_confirmations').notNull().default(12),
    dfnsTransferId: text('dfns_transfer_id'),
    idempotencyKey: text('idempotency_key').notNull(),
    correlationId: uuid('correlation_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('crypto_transactions_wallet_id_idx').on(table.walletId),
    index('crypto_transactions_tx_hash_idx').on(table.txHash),
    index('crypto_transactions_chain_idx').on(table.chain),
    index('crypto_transactions_status_idx').on(table.status),
    index('crypto_transactions_from_address_idx').on(table.fromAddress),
    index('crypto_transactions_to_address_idx').on(table.toAddress),
    index('crypto_transactions_created_at_idx').on(table.createdAt),
    unique('crypto_transactions_idempotency_key_unique').on(
      table.idempotencyKey,
    ),
  ],
);

export const cryptoBalances = pgTable(
  'crypto_balances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    chain: chainEnum('chain').notNull(),
    balance: text('balance').notNull().default('0'),
    version: integer('version').notNull().default(1),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    unique('crypto_balances_user_token_chain_unique').on(
      table.userId,
      table.token,
      table.chain,
    ),
    index('crypto_balances_user_id_idx').on(table.userId),
  ],
);

export const cryptoLedger = pgTable(
  'crypto_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    chain: chainEnum('chain').notNull(),
    type: cryptoLedgerTypeEnum('type').notNull(),
    amount: text('amount').notNull(),
    balanceBefore: text('balance_before').notNull(),
    balanceAfter: text('balance_after').notNull(),
    referenceType: text('reference_type').notNull(),
    referenceId: uuid('reference_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    correlationId: uuid('correlation_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('crypto_ledger_user_id_idx').on(table.userId),
    index('crypto_ledger_reference_idx').on(
      table.referenceType,
      table.referenceId,
    ),
    index('crypto_ledger_correlation_id_idx').on(table.correlationId),
    index('crypto_ledger_created_at_idx').on(table.createdAt),
  ],
);

// Relations

export const cryptoWalletsRelations = relations(
  cryptoWallets,
  ({ one, many }) => ({
    user: one(users, {
      fields: [cryptoWallets.userId],
      references: [users.id],
    }),
    transactions: many(cryptoTransactions),
  }),
);

export const cryptoTransactionsRelations = relations(
  cryptoTransactions,
  ({ one }) => ({
    wallet: one(cryptoWallets, {
      fields: [cryptoTransactions.walletId],
      references: [cryptoWallets.id],
    }),
  }),
);

export const cryptoBalancesRelations = relations(
  cryptoBalances,
  ({ one }) => ({
    user: one(users, {
      fields: [cryptoBalances.userId],
      references: [users.id],
    }),
  }),
);

export const cryptoLedgerRelations = relations(
  cryptoLedger,
  ({ one }) => ({
    user: one(users, {
      fields: [cryptoLedger.userId],
      references: [users.id],
    }),
  }),
);

// Types

export type CryptoWallet = typeof cryptoWallets.$inferSelect;
export type NewCryptoWallet = typeof cryptoWallets.$inferInsert;
export type CryptoTransaction = typeof cryptoTransactions.$inferSelect;
export type NewCryptoTransaction = typeof cryptoTransactions.$inferInsert;
export type CryptoBalance = typeof cryptoBalances.$inferSelect;
export type NewCryptoBalance = typeof cryptoBalances.$inferInsert;
export type CryptoLedgerEntry = typeof cryptoLedger.$inferSelect;
export type NewCryptoLedgerEntry = typeof cryptoLedger.$inferInsert;
export type Chain = (typeof chainEnum.enumValues)[number];
export type Token = (typeof tokenEnum.enumValues)[number];
