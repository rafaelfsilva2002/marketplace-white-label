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

export const cryptoTxStatusEnum = pgEnum('crypto_tx_status', [
  'pending',
  'confirmed',
  'failed',
  'reverted',
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
    encryptedPrivateKey: text('encrypted_private_key').notNull(),
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
    status: cryptoTxStatusEnum('status').notNull().default('pending'),
    blockNumber: integer('block_number'),
    gasUsed: text('gas_used'),
    gasFee: text('gas_fee'),
    confirmations: integer('confirmations').notNull().default(0),
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

export type CryptoWallet = typeof cryptoWallets.$inferSelect;
export type NewCryptoWallet = typeof cryptoWallets.$inferInsert;
export type CryptoTransaction = typeof cryptoTransactions.$inferSelect;
export type NewCryptoTransaction = typeof cryptoTransactions.$inferInsert;
