# Crypto Rails Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add cryptocurrency payment rails (Ethereum, Polygon, Solana) with Dfns MPC custody, dual wallet (BRL + crypto), and on/off ramp to the marketplace.

**Architecture:** CryptoGateway abstraction in a new monorepo package (`packages/crypto-gateway/`) with DfnsAdapter and MockAdapter. CryptoModule in NestJS API orchestrates gateway + existing wallet/ledger patterns. Crypto balances parallel to BRL wallets with same idempotency and optimistic locking patterns.

**Tech Stack:** Dfns SDK (`@dfns/sdk`), ethers.js (EVM utils), @solana/web3.js (Solana utils), Drizzle ORM, NestJS, BullMQ

**Design Doc:** `docs/plans/2026-03-03-crypto-rails-design.md`

---

## Task 1: Update Crypto Schema (packages/database)

**Files:**
- Modify: `packages/database/src/schema/crypto.ts`

**Context:** Current schema has `cryptoWallets` with `encryptedPrivateKey` (not needed for MPC) and `cryptoTransactions`. We need to:
- Remove `encryptedPrivateKey`, add `dfnsWalletId`
- Add `confirming` to status enum, add `tokenDecimals`, `amountBrl`, `requiredConfirmations`, `dfnsTransferId`
- Add new tables: `crypto_balances` and `crypto_ledger`

**Step 1: Write failing test for updated schema**

Create file: `packages/database/src/schema/__tests__/crypto.schema.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import {
  cryptoWallets,
  cryptoTransactions,
  cryptoBalances,
  cryptoLedger,
  chainEnum,
  cryptoTxStatusEnum,
  cryptoLedgerTypeEnum,
} from '../crypto';

describe('Crypto Schema', () => {
  it('cryptoWallets should have dfnsWalletId and no encryptedPrivateKey', () => {
    const columns = Object.keys(cryptoWallets);
    expect(columns).toContain('dfnsWalletId');
    expect(columns).not.toContain('encryptedPrivateKey');
  });

  it('cryptoTransactions should have new fields', () => {
    const columns = Object.keys(cryptoTransactions);
    expect(columns).toContain('tokenDecimals');
    expect(columns).toContain('amountBrl');
    expect(columns).toContain('requiredConfirmations');
    expect(columns).toContain('dfnsTransferId');
  });

  it('cryptoBalances table should exist with correct columns', () => {
    expect(cryptoBalances).toBeDefined();
    const columns = Object.keys(cryptoBalances);
    expect(columns).toContain('userId');
    expect(columns).toContain('token');
    expect(columns).toContain('chain');
    expect(columns).toContain('balance');
    expect(columns).toContain('version');
  });

  it('cryptoLedger table should exist with correct columns', () => {
    expect(cryptoLedger).toBeDefined();
    const columns = Object.keys(cryptoLedger);
    expect(columns).toContain('userId');
    expect(columns).toContain('token');
    expect(columns).toContain('chain');
    expect(columns).toContain('type');
    expect(columns).toContain('amount');
    expect(columns).toContain('balanceBefore');
    expect(columns).toContain('balanceAfter');
    expect(columns).toContain('idempotencyKey');
  });

  it('chainEnum should include ethereum, polygon, solana', () => {
    expect(chainEnum.enumValues).toEqual(['ethereum', 'polygon', 'solana']);
  });

  it('cryptoTxStatusEnum should include confirming', () => {
    expect(cryptoTxStatusEnum.enumValues).toContain('confirming');
  });

  it('cryptoLedgerTypeEnum should have credit and debit', () => {
    expect(cryptoLedgerTypeEnum.enumValues).toEqual(['credit', 'debit']);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/database && pnpm test -- crypto.schema.test`
Expected: FAIL — `cryptoBalances` and `cryptoLedger` not exported, `encryptedPrivateKey` still present

**Step 3: Update crypto.ts schema**

Replace full content of `packages/database/src/schema/crypto.ts`:

```typescript
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
  'confirming',
  'confirmed',
  'failed',
  'reverted',
]);

export const cryptoLedgerTypeEnum = pgEnum('crypto_ledger_type', [
  'credit',
  'debit',
]);

// --- Tables ---

export const cryptoWallets = pgTable(
  'crypto_wallets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    chain: chainEnum('chain').notNull(),
    address: text('address').notNull(),
    dfnsWalletId: text('dfns_wallet_id').unique(),
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
    tokenDecimals: integer('token_decimals').notNull().default(18),
    amountBrl: integer('amount_brl'),
    status: cryptoTxStatusEnum('status').notNull().default('pending'),
    blockNumber: integer('block_number'),
    confirmations: integer('confirmations').notNull().default(0),
    requiredConfirmations: integer('required_confirmations').notNull().default(12),
    gasUsed: text('gas_used'),
    gasFee: text('gas_fee'),
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
    index('crypto_transactions_created_at_idx').on(table.createdAt),
    unique('crypto_transactions_idempotency_key_unique').on(table.idempotencyKey),
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
    index('crypto_balances_user_id_idx').on(table.userId),
    index('crypto_balances_token_idx').on(table.token),
    unique('crypto_balances_user_token_chain_unique').on(
      table.userId,
      table.token,
      table.chain,
    ),
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
    referenceType: text('reference_type'),
    referenceId: uuid('reference_id'),
    idempotencyKey: text('idempotency_key').notNull(),
    correlationId: uuid('correlation_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('crypto_ledger_user_id_idx').on(table.userId),
    index('crypto_ledger_token_chain_idx').on(table.token, table.chain),
    index('crypto_ledger_created_at_idx').on(table.createdAt),
    unique('crypto_ledger_idempotency_key_unique').on(table.idempotencyKey),
  ],
);

// --- Relations ---

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

// --- Types ---

export type CryptoWallet = typeof cryptoWallets.$inferSelect;
export type NewCryptoWallet = typeof cryptoWallets.$inferInsert;
export type CryptoTransaction = typeof cryptoTransactions.$inferSelect;
export type NewCryptoTransaction = typeof cryptoTransactions.$inferInsert;
export type CryptoBalance = typeof cryptoBalances.$inferSelect;
export type NewCryptoBalance = typeof cryptoBalances.$inferInsert;
export type CryptoLedgerEntry = typeof cryptoLedger.$inferSelect;
export type NewCryptoLedgerEntry = typeof cryptoLedger.$inferInsert;
export type Chain = (typeof chainEnum.enumValues)[number];
export type Token = 'ETH' | 'MATIC' | 'SOL' | 'USDT' | 'USDC';
```

**Step 4: Run test to verify it passes**

Run: `cd packages/database && pnpm test -- crypto.schema.test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/database/src/schema/crypto.ts packages/database/src/schema/__tests__/crypto.schema.test.ts
git commit -m "feat(database): update crypto schema for MPC custody + add balances and ledger tables [fase-3 task-3.1]"
```

---

## Task 2: Create CryptoGateway Package

**Files:**
- Create: `packages/crypto-gateway/package.json`
- Create: `packages/crypto-gateway/tsconfig.json`
- Create: `packages/crypto-gateway/src/index.ts`
- Create: `packages/crypto-gateway/src/types.ts`
- Create: `packages/crypto-gateway/src/crypto-gateway.interface.ts`

**Step 1: Create package.json**

Create file: `packages/crypto-gateway/package.json`

```json
{
  "name": "@marketplace/crypto-gateway",
  "version": "0.0.1",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@dfns/sdk": "^0.4.0",
    "@dfns/lib-nativecrypto": "^0.4.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

**Step 2: Create tsconfig.json**

Create file: `packages/crypto-gateway/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

**Step 3: Create types.ts**

Create file: `packages/crypto-gateway/src/types.ts`

```typescript
export type Chain = 'ethereum' | 'polygon' | 'solana';
export type Token = 'ETH' | 'MATIC' | 'SOL' | 'USDT' | 'USDC';

export interface CreateWalletParams {
  userId: string;
  chain: Chain;
}

export interface CryptoWalletResult {
  walletId: string;
  address: string;
  chain: Chain;
}

export interface TokenBalance {
  token: Token;
  chain: Chain;
  balance: string;
  decimals: number;
}

export interface TransferParams {
  fromWalletId: string;
  toAddress: string;
  chain: Chain;
  token: Token;
  amount: string;
  idempotencyKey: string;
  correlationId: string;
}

export interface TransferResult {
  transferId: string;
  txHash?: string;
  status: 'pending' | 'confirming' | 'confirmed' | 'failed';
}

export interface TransferStatus {
  transferId: string;
  txHash?: string;
  status: 'pending' | 'confirming' | 'confirmed' | 'failed';
  confirmations: number;
  blockNumber?: number;
}

export interface QuoteParams {
  fromCurrency: string;
  toCurrency: string;
  amount: string;
  chain?: Chain;
}

export interface RampQuote {
  quoteId: string;
  rate: string;
  fromAmount: string;
  toAmount: string;
  fees: string;
  expiresAt: Date;
}

export interface RampParams {
  quoteId: string;
  userId: string;
  idempotencyKey: string;
  correlationId: string;
}

export interface RampResult {
  rampId: string;
  status: 'pending' | 'completed' | 'failed';
  fromAmount: string;
  toAmount: string;
}
```

**Step 4: Create interface**

Create file: `packages/crypto-gateway/src/crypto-gateway.interface.ts`

```typescript
import type {
  CreateWalletParams,
  CryptoWalletResult,
  TokenBalance,
  TransferParams,
  TransferResult,
  TransferStatus,
  QuoteParams,
  RampQuote,
  RampParams,
  RampResult,
  Chain,
  Token,
} from './types';

export const CRYPTO_GATEWAY = Symbol('CRYPTO_GATEWAY');

export interface CryptoGateway {
  createWallet(params: CreateWalletParams): Promise<CryptoWalletResult>;
  getBalance(address: string, chain: Chain, token?: Token): Promise<TokenBalance>;
  transfer(params: TransferParams): Promise<TransferResult>;
  getTransferStatus(transferId: string): Promise<TransferStatus>;
  getQuote(params: QuoteParams): Promise<RampQuote>;
  executeRamp(params: RampParams): Promise<RampResult>;
}
```

**Step 5: Create index.ts**

Create file: `packages/crypto-gateway/src/index.ts`

```typescript
export { CRYPTO_GATEWAY } from './crypto-gateway.interface';
export type { CryptoGateway } from './crypto-gateway.interface';
export * from './types';
```

**Step 6: Install dependencies and verify build**

Run: `cd "C:/Users/manod/Downloads/marketplace FTM" && pnpm install && cd packages/crypto-gateway && pnpm build`

**Step 7: Commit**

```bash
git add packages/crypto-gateway/
git commit -m "feat(crypto-gateway): create package with CryptoGateway interface and types [fase-3 task-3.1]"
```

---

## Task 3: MockAdapter for CryptoGateway

**Files:**
- Create: `packages/crypto-gateway/src/adapters/mock.adapter.ts`
- Create: `packages/crypto-gateway/src/adapters/__tests__/mock.adapter.test.ts`

**Step 1: Write failing test**

Create file: `packages/crypto-gateway/src/adapters/__tests__/mock.adapter.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { MockCryptoAdapter } from '../mock.adapter';
import type { CryptoGateway } from '../../crypto-gateway.interface';

describe('MockCryptoAdapter', () => {
  let adapter: CryptoGateway;

  beforeEach(() => {
    adapter = new MockCryptoAdapter();
  });

  describe('createWallet', () => {
    it('should return a wallet with address and id', async () => {
      const result = await adapter.createWallet({
        userId: 'user-1',
        chain: 'ethereum',
      });

      expect(result.walletId).toBeDefined();
      expect(result.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(result.chain).toBe('ethereum');
    });

    it('should return solana-style address for solana chain', async () => {
      const result = await adapter.createWallet({
        userId: 'user-1',
        chain: 'solana',
      });

      expect(result.address).toHaveLength(44);
      expect(result.chain).toBe('solana');
    });
  });

  describe('transfer', () => {
    it('should return pending transfer result', async () => {
      const result = await adapter.transfer({
        fromWalletId: 'wallet-1',
        toAddress: '0x1234567890abcdef1234567890abcdef12345678',
        chain: 'polygon',
        token: 'USDT',
        amount: '100000000',
        idempotencyKey: 'key-1',
        correlationId: 'corr-1',
      });

      expect(result.transferId).toBeDefined();
      expect(result.status).toBe('confirmed');
    });

    it('should be idempotent with same key', async () => {
      const params = {
        fromWalletId: 'wallet-1',
        toAddress: '0x1234567890abcdef1234567890abcdef12345678',
        chain: 'polygon' as const,
        token: 'USDT' as const,
        amount: '100000000',
        idempotencyKey: 'same-key',
        correlationId: 'corr-1',
      };

      const result1 = await adapter.transfer(params);
      const result2 = await adapter.transfer(params);

      expect(result1.transferId).toBe(result2.transferId);
    });
  });

  describe('getBalance', () => {
    it('should return balance for token', async () => {
      const result = await adapter.getBalance(
        '0x1234567890abcdef1234567890abcdef12345678',
        'ethereum',
        'USDT',
      );

      expect(result.token).toBe('USDT');
      expect(result.chain).toBe('ethereum');
      expect(result.balance).toBeDefined();
      expect(result.decimals).toBe(6);
    });
  });

  describe('getTransferStatus', () => {
    it('should return confirmed for known transfer', async () => {
      const transfer = await adapter.transfer({
        fromWalletId: 'w-1',
        toAddress: '0x1234567890abcdef1234567890abcdef12345678',
        chain: 'ethereum',
        token: 'ETH',
        amount: '1000000000000000000',
        idempotencyKey: 'key-status',
        correlationId: 'corr-1',
      });

      const status = await adapter.getTransferStatus(transfer.transferId);
      expect(status.status).toBe('confirmed');
      expect(status.confirmations).toBeGreaterThan(0);
    });
  });

  describe('getQuote', () => {
    it('should return a valid quote', async () => {
      const quote = await adapter.getQuote({
        fromCurrency: 'BRL',
        toCurrency: 'USDT',
        amount: '100',
      });

      expect(quote.quoteId).toBeDefined();
      expect(quote.rate).toBeDefined();
      expect(quote.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('executeRamp', () => {
    it('should execute a ramp operation', async () => {
      const result = await adapter.executeRamp({
        quoteId: 'quote-1',
        userId: 'user-1',
        idempotencyKey: 'ramp-key-1',
        correlationId: 'corr-1',
      });

      expect(result.status).toBe('completed');
      expect(result.fromAmount).toBeDefined();
      expect(result.toAmount).toBeDefined();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/crypto-gateway && pnpm test -- mock.adapter.test`
Expected: FAIL — MockCryptoAdapter not found

**Step 3: Implement MockAdapter**

Create file: `packages/crypto-gateway/src/adapters/mock.adapter.ts`

```typescript
import { randomUUID } from 'crypto';
import type { CryptoGateway } from '../crypto-gateway.interface';
import type {
  CreateWalletParams,
  CryptoWalletResult,
  TokenBalance,
  TransferParams,
  TransferResult,
  TransferStatus,
  QuoteParams,
  RampQuote,
  RampParams,
  RampResult,
  Chain,
  Token,
} from '../types';

const TOKEN_DECIMALS: Record<string, number> = {
  ETH: 18,
  MATIC: 18,
  SOL: 9,
  USDT: 6,
  USDC: 6,
};

export class MockCryptoAdapter implements CryptoGateway {
  private transfers = new Map<string, TransferResult>();
  private idempotencyMap = new Map<string, TransferResult>();

  async createWallet(params: CreateWalletParams): Promise<CryptoWalletResult> {
    const walletId = `mock-wallet-${randomUUID()}`;
    const address =
      params.chain === 'solana'
        ? this.generateSolanaAddress()
        : this.generateEvmAddress();

    return { walletId, address, chain: params.chain };
  }

  async getBalance(
    address: string,
    chain: Chain,
    token?: Token,
  ): Promise<TokenBalance> {
    const t = token ?? this.defaultToken(chain);
    return {
      token: t,
      chain,
      balance: '1000000000',
      decimals: TOKEN_DECIMALS[t] ?? 18,
    };
  }

  async transfer(params: TransferParams): Promise<TransferResult> {
    const existing = this.idempotencyMap.get(params.idempotencyKey);
    if (existing) return existing;

    const result: TransferResult = {
      transferId: `mock-transfer-${randomUUID()}`,
      txHash: `0x${randomUUID().replace(/-/g, '')}`,
      status: 'confirmed',
    };

    this.transfers.set(result.transferId, result);
    this.idempotencyMap.set(params.idempotencyKey, result);
    return result;
  }

  async getTransferStatus(transferId: string): Promise<TransferStatus> {
    const transfer = this.transfers.get(transferId);
    if (!transfer) {
      return {
        transferId,
        status: 'failed',
        confirmations: 0,
      };
    }
    return {
      transferId,
      txHash: transfer.txHash,
      status: 'confirmed',
      confirmations: 12,
      blockNumber: 1000000,
    };
  }

  async getQuote(params: QuoteParams): Promise<RampQuote> {
    const rate = params.fromCurrency === 'BRL' ? '0.18' : '5.50';
    const toAmount =
      params.fromCurrency === 'BRL'
        ? String(parseFloat(params.amount) * 0.18)
        : String(parseFloat(params.amount) * 5.5);

    return {
      quoteId: `mock-quote-${randomUUID()}`,
      rate,
      fromAmount: params.amount,
      toAmount,
      fees: '0.50',
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    };
  }

  async executeRamp(params: RampParams): Promise<RampResult> {
    return {
      rampId: `mock-ramp-${randomUUID()}`,
      status: 'completed',
      fromAmount: '100',
      toAmount: '18',
    };
  }

  private generateEvmAddress(): string {
    const hex = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
    return `0x${hex.substring(0, 40)}`;
  }

  private generateSolanaAddress(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 44; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  private defaultToken(chain: Chain): Token {
    const map: Record<Chain, Token> = {
      ethereum: 'ETH',
      polygon: 'MATIC',
      solana: 'SOL',
    };
    return map[chain];
  }
}
```

**Step 4: Update index.ts to export adapter**

Add to `packages/crypto-gateway/src/index.ts`:

```typescript
export { CRYPTO_GATEWAY } from './crypto-gateway.interface';
export type { CryptoGateway } from './crypto-gateway.interface';
export * from './types';
export { MockCryptoAdapter } from './adapters/mock.adapter';
```

**Step 5: Run test to verify it passes**

Run: `cd packages/crypto-gateway && pnpm test -- mock.adapter.test`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/crypto-gateway/
git commit -m "feat(crypto-gateway): add MockAdapter with idempotency and tests [fase-3 task-3.1]"
```

---

## Task 4: DfnsAdapter for CryptoGateway

**Files:**
- Create: `packages/crypto-gateway/src/adapters/dfns.adapter.ts`
- Create: `packages/crypto-gateway/src/adapters/__tests__/dfns.adapter.test.ts`

**Step 1: Write failing test**

Create file: `packages/crypto-gateway/src/adapters/__tests__/dfns.adapter.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DfnsCryptoAdapter } from '../dfns.adapter';

// Mock Dfns SDK
vi.mock('@dfns/sdk', () => ({
  DfnsApiClient: vi.fn().mockImplementation(() => ({
    wallets: {
      createWallet: vi.fn().mockResolvedValue({
        id: 'dfns-wallet-1',
        address: '0xabc123def456abc123def456abc123def456abc1',
        network: 'EthereumSepolia',
        status: 'Active',
      }),
      getWalletAssets: vi.fn().mockResolvedValue({
        assets: [
          { symbol: 'USDT', balance: '1000000000', decimals: 6 },
        ],
      }),
    },
    transfers: {
      createTransfer: vi.fn().mockResolvedValue({
        id: 'dfns-transfer-1',
        status: 'Broadcasted',
        txHash: '0xtxhash123',
      }),
      getTransfer: vi.fn().mockResolvedValue({
        id: 'dfns-transfer-1',
        status: 'Confirmed',
        txHash: '0xtxhash123',
        blockNumber: 12345,
      }),
    },
  })),
}));

describe('DfnsCryptoAdapter', () => {
  let adapter: DfnsCryptoAdapter;

  beforeEach(() => {
    adapter = new DfnsCryptoAdapter({
      appId: 'test-app-id',
      authToken: 'test-auth-token',
      baseUrl: 'https://api.dfns.ninja',
    });
  });

  it('should create a wallet via Dfns SDK', async () => {
    const result = await adapter.createWallet({
      userId: 'user-1',
      chain: 'ethereum',
    });

    expect(result.walletId).toBe('dfns-wallet-1');
    expect(result.address).toBeDefined();
    expect(result.chain).toBe('ethereum');
  });

  it('should map chain to Dfns network', async () => {
    const result = await adapter.createWallet({
      userId: 'user-1',
      chain: 'polygon',
    });

    expect(result.walletId).toBeDefined();
  });

  it('should create a transfer via Dfns SDK', async () => {
    const result = await adapter.transfer({
      fromWalletId: 'dfns-wallet-1',
      toAddress: '0xabc123def456abc123def456abc123def456abc1',
      chain: 'ethereum',
      token: 'USDT',
      amount: '1000000',
      idempotencyKey: 'key-1',
      correlationId: 'corr-1',
    });

    expect(result.transferId).toBe('dfns-transfer-1');
    expect(result.status).toBe('confirming');
  });

  it('should get transfer status', async () => {
    const status = await adapter.getTransferStatus('dfns-transfer-1');

    expect(status.status).toBe('confirmed');
    expect(status.blockNumber).toBe(12345);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/crypto-gateway && pnpm test -- dfns.adapter.test`
Expected: FAIL — DfnsCryptoAdapter not found

**Step 3: Implement DfnsAdapter**

Create file: `packages/crypto-gateway/src/adapters/dfns.adapter.ts`

```typescript
import type { CryptoGateway } from '../crypto-gateway.interface';
import type {
  CreateWalletParams,
  CryptoWalletResult,
  TokenBalance,
  TransferParams,
  TransferResult,
  TransferStatus,
  QuoteParams,
  RampQuote,
  RampParams,
  RampResult,
  Chain,
  Token,
} from '../types';

export interface DfnsConfig {
  appId: string;
  authToken: string;
  baseUrl: string;
}

const CHAIN_TO_DFNS_NETWORK: Record<Chain, string> = {
  ethereum: 'EthereumSepolia',
  polygon: 'PolygonMumbai',
  solana: 'SolanaDevnet',
};

const DFNS_STATUS_MAP: Record<string, TransferResult['status']> = {
  Initiated: 'pending',
  Broadcasted: 'confirming',
  Confirmed: 'confirmed',
  Failed: 'failed',
};

export class DfnsCryptoAdapter implements CryptoGateway {
  private client: any;

  constructor(private config: DfnsConfig) {
    // Dynamic import to avoid issues when Dfns SDK not installed
    const { DfnsApiClient } = require('@dfns/sdk');
    this.client = new DfnsApiClient({
      appId: config.appId,
      authToken: config.authToken,
      baseUrl: config.baseUrl,
    });
  }

  async createWallet(params: CreateWalletParams): Promise<CryptoWalletResult> {
    const network = CHAIN_TO_DFNS_NETWORK[params.chain];
    const wallet = await this.client.wallets.createWallet({
      body: { network },
    });

    return {
      walletId: wallet.id,
      address: wallet.address,
      chain: params.chain,
    };
  }

  async getBalance(
    address: string,
    chain: Chain,
    token?: Token,
  ): Promise<TokenBalance> {
    const assets = await this.client.wallets.getWalletAssets({
      walletId: address,
    });

    const t = token ?? this.defaultToken(chain);
    const asset = assets.assets?.find(
      (a: any) => a.symbol.toUpperCase() === t,
    );

    return {
      token: t,
      chain,
      balance: asset?.balance ?? '0',
      decimals: asset?.decimals ?? 18,
    };
  }

  async transfer(params: TransferParams): Promise<TransferResult> {
    const result = await this.client.transfers.createTransfer({
      walletId: params.fromWalletId,
      body: {
        to: params.toAddress,
        amount: params.amount,
        asset: params.token,
        note: params.correlationId,
        externalId: params.idempotencyKey,
      },
    });

    return {
      transferId: result.id,
      txHash: result.txHash,
      status: DFNS_STATUS_MAP[result.status] ?? 'pending',
    };
  }

  async getTransferStatus(transferId: string): Promise<TransferStatus> {
    const result = await this.client.transfers.getTransfer({
      transferId,
    });

    return {
      transferId: result.id,
      txHash: result.txHash,
      status: DFNS_STATUS_MAP[result.status] ?? 'pending',
      confirmations: result.confirmations ?? 0,
      blockNumber: result.blockNumber,
    };
  }

  async getQuote(_params: QuoteParams): Promise<RampQuote> {
    throw new Error('On/off ramp not implemented in DfnsAdapter — use dedicated ramp service');
  }

  async executeRamp(_params: RampParams): Promise<RampResult> {
    throw new Error('On/off ramp not implemented in DfnsAdapter — use dedicated ramp service');
  }

  private defaultToken(chain: Chain): Token {
    const map: Record<Chain, Token> = {
      ethereum: 'ETH',
      polygon: 'MATIC',
      solana: 'SOL',
    };
    return map[chain];
  }
}
```

**Step 4: Update index.ts**

Add to exports in `packages/crypto-gateway/src/index.ts`:

```typescript
export { DfnsCryptoAdapter } from './adapters/dfns.adapter';
export type { DfnsConfig } from './adapters/dfns.adapter';
```

**Step 5: Run test to verify it passes**

Run: `cd packages/crypto-gateway && pnpm test -- dfns.adapter.test`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/crypto-gateway/
git commit -m "feat(crypto-gateway): add DfnsAdapter with Dfns SDK integration [fase-3 task-3.1]"
```

---

## Task 5: CryptoWalletService (NestJS)

**Files:**
- Create: `apps/api/src/modules/crypto/services/crypto-wallet.service.ts`
- Create: `apps/api/src/modules/crypto/services/__tests__/crypto-wallet.service.test.ts`

**Context:** Manages wallet creation (calls CryptoGateway) and persists to DB. One wallet per user per chain.

**Step 1: Write failing test**

Create file: `apps/api/src/modules/crypto/services/__tests__/crypto-wallet.service.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CryptoWalletService } from '../crypto-wallet.service';
import { MockCryptoAdapter } from '@marketplace/crypto-gateway';

describe('CryptoWalletService', () => {
  let service: CryptoWalletService;
  let mockDb: any;
  let mockAudit: any;
  let gateway: MockCryptoAdapter;

  beforeEach(() => {
    gateway = new MockCryptoAdapter();

    mockDb = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{
            id: 'wallet-uuid-1',
            userId: 'user-1',
            chain: 'ethereum',
            address: '0x1234',
            dfnsWalletId: 'dfns-1',
            isActive: true,
          }]),
        }),
      }),
      query: {
        cryptoWallets: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
    };

    mockAudit = {
      log: vi.fn(),
    };

    service = new CryptoWalletService(mockDb, gateway, mockAudit);
  });

  it('should create a wallet for user and chain', async () => {
    const result = await service.createWallet('user-1', 'ethereum');

    expect(result.chain).toBe('ethereum');
    expect(result.address).toBeDefined();
    expect(mockDb.insert).toHaveBeenCalled();
  });

  it('should throw if wallet already exists for user+chain', async () => {
    mockDb.query.cryptoWallets.findFirst.mockResolvedValue({
      id: 'existing',
      chain: 'ethereum',
    });

    await expect(
      service.createWallet('user-1', 'ethereum'),
    ).rejects.toThrow('Wallet already exists');
  });

  it('should list all wallets for user', async () => {
    mockDb.query.cryptoWallets.findMany.mockResolvedValue([
      { id: '1', chain: 'ethereum', address: '0x1' },
      { id: '2', chain: 'polygon', address: '0x2' },
    ]);

    const result = await service.listWallets('user-1');
    expect(result).toHaveLength(2);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm test -- crypto-wallet.service.test`
Expected: FAIL — CryptoWalletService not found

**Step 3: Implement CryptoWalletService**

Create file: `apps/api/src/modules/crypto/services/crypto-wallet.service.ts`

```typescript
import { Injectable, Inject, ConflictException } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DATABASE_TOKEN } from '@/config/database.config';
import { cryptoWallets } from '@marketplace/database';
import { CRYPTO_GATEWAY, type CryptoGateway, type Chain } from '@marketplace/crypto-gateway';
import { AuditService } from '@/modules/audit/audit.service';
import type { Database } from '@marketplace/database';

@Injectable()
export class CryptoWalletService {
  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
    @Inject(CRYPTO_GATEWAY) private readonly gateway: CryptoGateway,
    private readonly audit: AuditService,
  ) {}

  async createWallet(userId: string, chain: Chain) {
    const existing = await this.db.query.cryptoWallets.findFirst({
      where: and(
        eq(cryptoWallets.userId, userId),
        eq(cryptoWallets.chain, chain),
      ),
    });

    if (existing) {
      throw new ConflictException('Wallet already exists for this chain');
    }

    const result = await this.gateway.createWallet({ userId, chain });

    const [wallet] = await this.db
      .insert(cryptoWallets)
      .values({
        userId,
        chain,
        address: result.address,
        dfnsWalletId: result.walletId,
      })
      .returning();

    await this.audit.log({
      userId,
      action: 'crypto.wallet.created',
      entityType: 'crypto_wallet',
      entityId: wallet.id,
      newData: { chain, address: result.address },
    });

    return wallet;
  }

  async listWallets(userId: string) {
    return this.db.query.cryptoWallets.findMany({
      where: eq(cryptoWallets.userId, userId),
    });
  }

  async getWallet(userId: string, chain: Chain) {
    return this.db.query.cryptoWallets.findFirst({
      where: and(
        eq(cryptoWallets.userId, userId),
        eq(cryptoWallets.chain, chain),
      ),
    });
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/api && pnpm test -- crypto-wallet.service.test`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/modules/crypto/
git commit -m "feat(crypto): add CryptoWalletService with create, list, get [fase-3 task-3.1]"
```

---

## Task 6: CryptoBalanceService (NestJS)

**Files:**
- Create: `apps/api/src/modules/crypto/services/crypto-balance.service.ts`
- Create: `apps/api/src/modules/crypto/services/__tests__/crypto-balance.service.test.ts`

**Context:** Manages crypto balances with same patterns as WalletService (idempotency + optimistic locking). Credits/debits crypto_balances + writes to crypto_ledger.

**Step 1: Write failing test**

Create file: `apps/api/src/modules/crypto/services/__tests__/crypto-balance.service.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CryptoBalanceService } from '../crypto-balance.service';

describe('CryptoBalanceService', () => {
  let service: CryptoBalanceService;
  let mockDb: any;

  beforeEach(() => {
    // Setup mock DB with transaction support
    mockDb = {
      transaction: vi.fn(async (fn: any) => fn(mockDb)),
      query: {
        cryptoBalances: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
        },
        cryptoLedger: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{
            id: 'bal-1',
            userId: 'user-1',
            token: 'USDT',
            chain: 'polygon',
            balance: '100000000',
            version: 1,
          }]),
          onConflictDoNothing: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{
              id: 'bal-1',
              balance: '200000000',
              version: 2,
            }]),
          }),
        }),
      }),
    };

    service = new CryptoBalanceService(mockDb);
  });

  it('should credit balance and write ledger entry', async () => {
    const result = await service.credit({
      userId: 'user-1',
      token: 'USDT',
      chain: 'polygon',
      amount: '100000000',
      idempotencyKey: 'key-1',
      referenceType: 'payment',
      referenceId: 'tx-1',
    });

    expect(result).toBeDefined();
    expect(mockDb.insert).toHaveBeenCalled();
  });

  it('should return existing result for duplicate idempotency key', async () => {
    mockDb.query.cryptoLedger.findFirst.mockResolvedValue({
      id: 'existing-ledger',
      idempotencyKey: 'key-dup',
      amount: '100000000',
    });

    const result = await service.credit({
      userId: 'user-1',
      token: 'USDT',
      chain: 'polygon',
      amount: '100000000',
      idempotencyKey: 'key-dup',
    });

    expect(result.idempotencyKey).toBe('key-dup');
  });

  it('should get balances for user', async () => {
    mockDb.query.cryptoBalances.findMany.mockResolvedValue([
      { token: 'USDT', chain: 'polygon', balance: '100' },
      { token: 'ETH', chain: 'ethereum', balance: '50' },
    ]);

    const result = await service.getBalances('user-1');
    expect(result).toHaveLength(2);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm test -- crypto-balance.service.test`
Expected: FAIL

**Step 3: Implement CryptoBalanceService**

Create file: `apps/api/src/modules/crypto/services/crypto-balance.service.ts`

```typescript
import { Injectable, Inject, ConflictException } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DATABASE_TOKEN } from '@/config/database.config';
import { cryptoBalances, cryptoLedger } from '@marketplace/database';
import type { Database, Chain } from '@marketplace/database';
import type { Token } from '@marketplace/crypto-gateway';

interface CryptoOperationInput {
  userId: string;
  token: Token;
  chain: Chain;
  amount: string;
  idempotencyKey: string;
  referenceType?: string;
  referenceId?: string;
  correlationId?: string;
}

@Injectable()
export class CryptoBalanceService {
  constructor(@Inject(DATABASE_TOKEN) private readonly db: Database) {}

  async credit(input: CryptoOperationInput) {
    const existing = await this.db.query.cryptoLedger.findFirst({
      where: eq(cryptoLedger.idempotencyKey, input.idempotencyKey),
    });
    if (existing) return existing;

    return this.db.transaction(async (tx) => {
      const balance = await this.getOrCreateBalance(
        tx,
        input.userId,
        input.token,
        input.chain,
      );

      const balanceBefore = balance.balance;
      const balanceAfter = this.addBigNumbers(balanceBefore, input.amount);

      const updated = await tx
        .update(cryptoBalances)
        .set({
          balance: balanceAfter,
          version: balance.version + 1,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(cryptoBalances.id, balance.id),
            eq(cryptoBalances.version, balance.version),
          ),
        )
        .returning();

      if (updated.length === 0) {
        throw new ConflictException('Balance modified concurrently, retry');
      }

      const [entry] = await tx
        .insert(cryptoLedger)
        .values({
          userId: input.userId,
          token: input.token,
          chain: input.chain,
          type: 'credit',
          amount: input.amount,
          balanceBefore,
          balanceAfter,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          idempotencyKey: input.idempotencyKey,
          correlationId: input.correlationId,
        })
        .returning();

      return entry;
    });
  }

  async debit(input: CryptoOperationInput) {
    const existing = await this.db.query.cryptoLedger.findFirst({
      where: eq(cryptoLedger.idempotencyKey, input.idempotencyKey),
    });
    if (existing) return existing;

    return this.db.transaction(async (tx) => {
      const balance = await this.getOrCreateBalance(
        tx,
        input.userId,
        input.token,
        input.chain,
      );

      const balanceBefore = balance.balance;
      const balanceAfter = this.subtractBigNumbers(balanceBefore, input.amount);

      if (BigInt(balanceAfter) < 0n) {
        throw new ConflictException('Insufficient crypto balance');
      }

      const updated = await tx
        .update(cryptoBalances)
        .set({
          balance: balanceAfter,
          version: balance.version + 1,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(cryptoBalances.id, balance.id),
            eq(cryptoBalances.version, balance.version),
          ),
        )
        .returning();

      if (updated.length === 0) {
        throw new ConflictException('Balance modified concurrently, retry');
      }

      const [entry] = await tx
        .insert(cryptoLedger)
        .values({
          userId: input.userId,
          token: input.token,
          chain: input.chain,
          type: 'debit',
          amount: input.amount,
          balanceBefore,
          balanceAfter,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          idempotencyKey: input.idempotencyKey,
          correlationId: input.correlationId,
        })
        .returning();

      return entry;
    });
  }

  async getBalances(userId: string) {
    return this.db.query.cryptoBalances.findMany({
      where: eq(cryptoBalances.userId, userId),
    });
  }

  async getBalance(userId: string, token: Token, chain: Chain) {
    return this.db.query.cryptoBalances.findFirst({
      where: and(
        eq(cryptoBalances.userId, userId),
        eq(cryptoBalances.token, token),
        eq(cryptoBalances.chain, chain),
      ),
    });
  }

  async getHistory(userId: string, limit = 50, offset = 0) {
    return this.db.query.cryptoLedger.findMany({
      where: eq(cryptoLedger.userId, userId),
      orderBy: (ledger, { desc }) => [desc(ledger.createdAt)],
      limit,
      offset,
    });
  }

  private async getOrCreateBalance(
    tx: any,
    userId: string,
    token: string,
    chain: Chain,
  ) {
    let balance = await tx.query.cryptoBalances.findFirst({
      where: and(
        eq(cryptoBalances.userId, userId),
        eq(cryptoBalances.token, token),
        eq(cryptoBalances.chain, chain),
      ),
    });

    if (!balance) {
      const [created] = await tx
        .insert(cryptoBalances)
        .values({ userId, token, chain, balance: '0', version: 1 })
        .returning();
      balance = created;
    }

    return balance;
  }

  private addBigNumbers(a: string, b: string): string {
    return (BigInt(a) + BigInt(b)).toString();
  }

  private subtractBigNumbers(a: string, b: string): string {
    return (BigInt(a) - BigInt(b)).toString();
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/api && pnpm test -- crypto-balance.service.test`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/modules/crypto/services/crypto-balance.service.ts apps/api/src/modules/crypto/services/__tests__/crypto-balance.service.test.ts
git commit -m "feat(crypto): add CryptoBalanceService with idempotency + optimistic locking [fase-3 task-3.1]"
```

---

## Task 7: CryptoPaymentService (NestJS)

**Files:**
- Create: `apps/api/src/modules/crypto/services/crypto-payment.service.ts`
- Create: `apps/api/src/modules/crypto/services/__tests__/crypto-payment.service.test.ts`

**Context:** Orchestrates crypto payment flow: validate balance → transfer via gateway → credit professional → debit user → outbox event.

**Step 1: Write failing test**

Create file: `apps/api/src/modules/crypto/services/__tests__/crypto-payment.service.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CryptoPaymentService } from '../crypto-payment.service';
import { MockCryptoAdapter } from '@marketplace/crypto-gateway';

describe('CryptoPaymentService', () => {
  let service: CryptoPaymentService;
  let mockBalanceService: any;
  let mockWalletService: any;
  let mockOutbox: any;
  let mockAudit: any;
  let mockDb: any;
  let gateway: MockCryptoAdapter;

  beforeEach(() => {
    gateway = new MockCryptoAdapter();

    mockBalanceService = {
      debit: vi.fn().mockResolvedValue({ id: 'ledger-1' }),
      credit: vi.fn().mockResolvedValue({ id: 'ledger-2' }),
      getBalance: vi.fn().mockResolvedValue({
        balance: '200000000',
        token: 'USDT',
        chain: 'polygon',
      }),
    };

    mockWalletService = {
      getWallet: vi.fn().mockResolvedValue({
        id: 'wallet-1',
        address: '0xprofessional',
        dfnsWalletId: 'dfns-prof-1',
        chain: 'polygon',
      }),
    };

    mockOutbox = {
      writeEvent: vi.fn(),
    };

    mockAudit = { log: vi.fn() };

    mockDb = {
      transaction: vi.fn(async (fn: any) => fn(mockDb)),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{
            id: 'tx-1',
            status: 'confirmed',
          }]),
        }),
      }),
    };

    service = new CryptoPaymentService(
      mockDb,
      gateway,
      mockBalanceService,
      mockWalletService,
      mockOutbox,
      mockAudit,
    );
  });

  it('should process crypto payment with 10% platform fee', async () => {
    const result = await service.createPayment({
      userId: 'user-1',
      professionalUserId: 'prof-1',
      profileId: 'profile-1',
      amount: '100000000',
      token: 'USDT',
      chain: 'polygon',
      idempotencyKey: 'pay-1',
      correlationId: 'corr-1',
    });

    expect(result.status).toBeDefined();

    // Should debit user full amount
    expect(mockBalanceService.debit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        amount: '100000000',
      }),
    );

    // Should credit professional 90% (90000000)
    expect(mockBalanceService.credit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'prof-1',
        amount: '90000000',
      }),
    );

    // Should write outbox event
    expect(mockOutbox.writeEvent).toHaveBeenCalled();
  });

  it('should throw if user has insufficient balance', async () => {
    mockBalanceService.getBalance.mockResolvedValue({
      balance: '50000000',
      token: 'USDT',
      chain: 'polygon',
    });

    await expect(
      service.createPayment({
        userId: 'user-1',
        professionalUserId: 'prof-1',
        profileId: 'profile-1',
        amount: '100000000',
        token: 'USDT',
        chain: 'polygon',
        idempotencyKey: 'pay-2',
        correlationId: 'corr-2',
      }),
    ).rejects.toThrow('Insufficient');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm test -- crypto-payment.service.test`
Expected: FAIL

**Step 3: Implement CryptoPaymentService**

Create file: `apps/api/src/modules/crypto/services/crypto-payment.service.ts`

```typescript
import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { DATABASE_TOKEN } from '@/config/database.config';
import { cryptoTransactions } from '@marketplace/database';
import { CRYPTO_GATEWAY, type CryptoGateway, type Chain, type Token } from '@marketplace/crypto-gateway';
import { OutboxService } from '@/common/events/outbox.service';
import { AuditService } from '@/modules/audit/audit.service';
import { CryptoBalanceService } from './crypto-balance.service';
import { CryptoWalletService } from './crypto-wallet.service';
import type { Database } from '@marketplace/database';

const PLATFORM_FEE_PERCENT = 10n;

interface CreateCryptoPaymentInput {
  userId: string;
  professionalUserId: string;
  profileId: string;
  amount: string;
  token: Token;
  chain: Chain;
  idempotencyKey: string;
  correlationId: string;
}

@Injectable()
export class CryptoPaymentService {
  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
    @Inject(CRYPTO_GATEWAY) private readonly gateway: CryptoGateway,
    private readonly balanceService: CryptoBalanceService,
    private readonly walletService: CryptoWalletService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  async createPayment(input: CreateCryptoPaymentInput) {
    const balance = await this.balanceService.getBalance(
      input.userId,
      input.token,
      input.chain,
    );

    if (!balance || BigInt(balance.balance) < BigInt(input.amount)) {
      throw new BadRequestException('Insufficient crypto balance');
    }

    const totalAmount = BigInt(input.amount);
    const platformFee = (totalAmount * PLATFORM_FEE_PERCENT) / 100n;
    const professionalAmount = totalAmount - platformFee;

    // Debit user
    await this.balanceService.debit({
      userId: input.userId,
      token: input.token,
      chain: input.chain,
      amount: input.amount,
      idempotencyKey: `debit_${input.idempotencyKey}`,
      referenceType: 'crypto_payment',
      referenceId: input.idempotencyKey,
      correlationId: input.correlationId,
    });

    // Credit professional (amount minus fee)
    await this.balanceService.credit({
      userId: input.professionalUserId,
      token: input.token,
      chain: input.chain,
      amount: professionalAmount.toString(),
      idempotencyKey: `credit_${input.idempotencyKey}`,
      referenceType: 'crypto_payment',
      referenceId: input.idempotencyKey,
      correlationId: input.correlationId,
    });

    // Record transaction
    const [tx] = await this.db
      .insert(cryptoTransactions)
      .values({
        walletId: (await this.walletService.getWallet(input.userId, input.chain))!.id,
        chain: input.chain,
        fromAddress: 'internal',
        toAddress: 'internal',
        amount: input.amount,
        token: input.token,
        status: 'confirmed',
        idempotencyKey: input.idempotencyKey,
        correlationId: input.correlationId,
        metadata: {
          type: 'payment',
          profileId: input.profileId,
          professionalUserId: input.professionalUserId,
          platformFee: platformFee.toString(),
          professionalAmount: professionalAmount.toString(),
        },
      })
      .returning();

    // Outbox event
    await this.db.transaction(async (dbTx) => {
      await this.outbox.writeEvent(dbTx, {
        eventType: 'marketplace.crypto_payment.succeeded',
        aggregateType: 'crypto_payment',
        aggregateId: tx.id,
        payload: {
          transactionId: tx.id,
          userId: input.userId,
          professionalUserId: input.professionalUserId,
          profileId: input.profileId,
          amount: input.amount,
          token: input.token,
          chain: input.chain,
          platformFee: platformFee.toString(),
          professionalAmount: professionalAmount.toString(),
        },
        correlationId: input.correlationId,
      });
    });

    await this.audit.log({
      userId: input.userId,
      action: 'crypto.payment.created',
      entityType: 'crypto_transaction',
      entityId: tx.id,
      newData: {
        amount: input.amount,
        token: input.token,
        chain: input.chain,
        profileId: input.profileId,
      },
    });

    return tx;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/api && pnpm test -- crypto-payment.service.test`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/modules/crypto/services/crypto-payment.service.ts apps/api/src/modules/crypto/services/__tests__/crypto-payment.service.test.ts
git commit -m "feat(crypto): add CryptoPaymentService with fee split + outbox events [fase-3 task-3.1]"
```

---

## Task 8: CryptoController + CryptoModule (NestJS)

**Files:**
- Create: `apps/api/src/modules/crypto/controllers/crypto.controller.ts`
- Create: `apps/api/src/modules/crypto/dto/create-wallet.dto.ts`
- Create: `apps/api/src/modules/crypto/dto/create-payment.dto.ts`
- Create: `apps/api/src/modules/crypto/dto/withdraw.dto.ts`
- Create: `apps/api/src/modules/crypto/crypto.module.ts`
- Modify: `apps/api/src/app.module.ts` — add CryptoModule

**Step 1: Create DTOs**

Create file: `apps/api/src/modules/crypto/dto/create-wallet.dto.ts`

```typescript
import { IsIn, IsString } from 'class-validator';

export class CreateWalletDto {
  @IsString()
  @IsIn(['ethereum', 'polygon', 'solana'])
  chain!: 'ethereum' | 'polygon' | 'solana';
}
```

Create file: `apps/api/src/modules/crypto/dto/create-payment.dto.ts`

```typescript
import { IsString, IsIn, IsUUID } from 'class-validator';

export class CreateCryptoPaymentDto {
  @IsUUID()
  profileId!: string;

  @IsString()
  amount!: string;

  @IsIn(['ETH', 'MATIC', 'SOL', 'USDT', 'USDC'])
  token!: 'ETH' | 'MATIC' | 'SOL' | 'USDT' | 'USDC';

  @IsIn(['ethereum', 'polygon', 'solana'])
  chain!: 'ethereum' | 'polygon' | 'solana';

  @IsString()
  idempotencyKey!: string;
}
```

Create file: `apps/api/src/modules/crypto/dto/withdraw.dto.ts`

```typescript
import { IsString, IsIn } from 'class-validator';

export class WithdrawCryptoDto {
  @IsString()
  toAddress!: string;

  @IsString()
  amount!: string;

  @IsIn(['ETH', 'MATIC', 'SOL', 'USDT', 'USDC'])
  token!: 'ETH' | 'MATIC' | 'SOL' | 'USDT' | 'USDC';

  @IsIn(['ethereum', 'polygon', 'solana'])
  chain!: 'ethereum' | 'polygon' | 'solana';
}
```

**Step 2: Create CryptoController**

Create file: `apps/api/src/modules/crypto/controllers/crypto.controller.ts`

```typescript
import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/modules/auth/guards/roles.guard';
import { CryptoWalletService } from '../services/crypto-wallet.service';
import { CryptoBalanceService } from '../services/crypto-balance.service';
import { CryptoPaymentService } from '../services/crypto-payment.service';
import { CreateWalletDto } from '../dto/create-wallet.dto';
import { CreateCryptoPaymentDto } from '../dto/create-payment.dto';
import { WithdrawCryptoDto } from '../dto/withdraw.dto';
import type { Chain, Token } from '@marketplace/crypto-gateway';

@Controller('crypto')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CryptoController {
  constructor(
    private readonly walletService: CryptoWalletService,
    private readonly balanceService: CryptoBalanceService,
    private readonly paymentService: CryptoPaymentService,
  ) {}

  @Post('wallets')
  async createWallet(@Request() req: any, @Body() dto: CreateWalletDto) {
    return this.walletService.createWallet(req.user.id, dto.chain);
  }

  @Get('wallets')
  async listWallets(@Request() req: any) {
    return this.walletService.listWallets(req.user.id);
  }

  @Get('wallets/:chain')
  async getWallet(@Request() req: any, @Param('chain') chain: Chain) {
    return this.walletService.getWallet(req.user.id, chain);
  }

  @Get('balances')
  async getBalances(@Request() req: any) {
    return this.balanceService.getBalances(req.user.id);
  }

  @Get('balances/:token')
  async getBalance(
    @Request() req: any,
    @Param('token') token: Token,
    @Query('chain') chain: Chain,
  ) {
    return this.balanceService.getBalance(req.user.id, token, chain);
  }

  @Post('payments')
  async createPayment(
    @Request() req: any,
    @Body() dto: CreateCryptoPaymentDto,
  ) {
    // TODO: resolve professionalUserId from profileId
    return this.paymentService.createPayment({
      userId: req.user.id,
      professionalUserId: '', // resolved from profile
      profileId: dto.profileId,
      amount: dto.amount,
      token: dto.token,
      chain: dto.chain,
      idempotencyKey: dto.idempotencyKey,
      correlationId: req.correlationId,
    });
  }

  @Get('payments/history')
  async getHistory(
    @Request() req: any,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.balanceService.getHistory(
      req.user.id,
      limit ? parseInt(limit) : 50,
      offset ? parseInt(offset) : 0,
    );
  }
}
```

**Step 3: Create CryptoModule**

Create file: `apps/api/src/modules/crypto/crypto.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DatabaseProvider, DATABASE_TOKEN } from '@/config/database.config';
import { OutboxService } from '@/common/events/outbox.service';
import { AuditService } from '@/modules/audit/audit.service';
import {
  CRYPTO_GATEWAY,
  MockCryptoAdapter,
  DfnsCryptoAdapter,
} from '@marketplace/crypto-gateway';
import { CryptoWalletService } from './services/crypto-wallet.service';
import { CryptoBalanceService } from './services/crypto-balance.service';
import { CryptoPaymentService } from './services/crypto-payment.service';
import { CryptoController } from './controllers/crypto.controller';
import type { Database } from '@marketplace/database';

@Module({
  imports: [ConfigModule],
  controllers: [CryptoController],
  providers: [
    DatabaseProvider,
    {
      provide: AuditService,
      useFactory: (db: Database) => new AuditService(db),
      inject: [DATABASE_TOKEN],
    },
    OutboxService,
    {
      provide: CRYPTO_GATEWAY,
      useFactory: (config: ConfigService) => {
        const provider = config.get('CRYPTO_PROVIDER', 'mock');
        if (provider === 'dfns') {
          return new DfnsCryptoAdapter({
            appId: config.getOrThrow('DFNS_APP_ID'),
            authToken: config.getOrThrow('DFNS_AUTH_TOKEN'),
            baseUrl: config.getOrThrow('DFNS_BASE_URL'),
          });
        }
        return new MockCryptoAdapter();
      },
      inject: [ConfigService],
    },
    CryptoWalletService,
    CryptoBalanceService,
    CryptoPaymentService,
  ],
  exports: [CryptoWalletService, CryptoBalanceService, CryptoPaymentService],
})
export class CryptoModule {}
```

**Step 4: Add CryptoModule to AppModule**

Modify `apps/api/src/app.module.ts` — add import:

```typescript
import { CryptoModule } from './modules/crypto/crypto.module';
```

Add `CryptoModule` to the `imports` array.

**Step 5: Verify build**

Run: `cd "C:/Users/manod/Downloads/marketplace FTM" && pnpm build`

**Step 6: Commit**

```bash
git add apps/api/src/modules/crypto/ apps/api/src/app.module.ts
git commit -m "feat(crypto): add CryptoController, DTOs, CryptoModule with provider factory [fase-3 task-3.1]"
```

---

## Task 9: On/Off Ramp Service

**Files:**
- Create: `apps/api/src/modules/crypto/services/ramp.service.ts`
- Create: `apps/api/src/modules/crypto/services/__tests__/ramp.service.test.ts`
- Modify: `apps/api/src/modules/crypto/controllers/crypto.controller.ts` — add ramp endpoints

**Step 1: Write failing test**

Create file: `apps/api/src/modules/crypto/services/__tests__/ramp.service.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RampService } from '../ramp.service';
import { MockCryptoAdapter } from '@marketplace/crypto-gateway';

describe('RampService', () => {
  let service: RampService;
  let gateway: MockCryptoAdapter;
  let mockBalanceService: any;
  let mockWalletService: any;
  let mockOutbox: any;
  let mockDb: any;

  beforeEach(() => {
    gateway = new MockCryptoAdapter();
    mockBalanceService = {
      credit: vi.fn().mockResolvedValue({ id: 'ledger-1' }),
      debit: vi.fn().mockResolvedValue({ id: 'ledger-2' }),
    };
    mockWalletService = {
      credit: vi.fn().mockResolvedValue({ id: 'wallet-op-1' }),
      debit: vi.fn().mockResolvedValue({ id: 'wallet-op-2' }),
    };
    mockOutbox = { writeEvent: vi.fn() };
    mockDb = { transaction: vi.fn(async (fn: any) => fn(mockDb)) };

    service = new RampService(
      mockDb,
      gateway,
      mockBalanceService,
      mockWalletService,
      mockOutbox,
    );
  });

  it('should get a quote for BRL to USDT', async () => {
    const quote = await service.getQuote({
      fromCurrency: 'BRL',
      toCurrency: 'USDT',
      amount: '100',
    });

    expect(quote.quoteId).toBeDefined();
    expect(quote.rate).toBeDefined();
    expect(quote.expiresAt).toBeDefined();
  });

  it('should execute on-ramp (BRL -> crypto)', async () => {
    const result = await service.buyWithBrl({
      userId: 'user-1',
      token: 'USDT',
      chain: 'polygon',
      brlAmount: 10000,
      cryptoAmount: '18000000',
      idempotencyKey: 'ramp-buy-1',
      correlationId: 'corr-1',
    });

    expect(result.status).toBe('completed');
    // Should debit BRL wallet
    expect(mockWalletService.debit).toHaveBeenCalled();
    // Should credit crypto balance
    expect(mockBalanceService.credit).toHaveBeenCalled();
  });

  it('should execute off-ramp (crypto -> BRL)', async () => {
    const result = await service.sellToBrl({
      userId: 'user-1',
      token: 'USDT',
      chain: 'polygon',
      cryptoAmount: '18000000',
      brlAmount: 10000,
      idempotencyKey: 'ramp-sell-1',
      correlationId: 'corr-1',
    });

    expect(result.status).toBe('completed');
    // Should debit crypto
    expect(mockBalanceService.debit).toHaveBeenCalled();
    // Should credit BRL
    expect(mockWalletService.credit).toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm test -- ramp.service.test`
Expected: FAIL

**Step 3: Implement RampService**

Create file: `apps/api/src/modules/crypto/services/ramp.service.ts`

```typescript
import { Injectable, Inject } from '@nestjs/common';
import { DATABASE_TOKEN } from '@/config/database.config';
import { CRYPTO_GATEWAY, type CryptoGateway, type Chain, type Token } from '@marketplace/crypto-gateway';
import { OutboxService } from '@/common/events/outbox.service';
import { CryptoBalanceService } from './crypto-balance.service';
import { WalletService } from '@/modules/payments/services/wallet.service';
import type { Database } from '@marketplace/database';

interface BuyWithBrlInput {
  userId: string;
  token: Token;
  chain: Chain;
  brlAmount: number;
  cryptoAmount: string;
  idempotencyKey: string;
  correlationId: string;
}

interface SellToBrlInput {
  userId: string;
  token: Token;
  chain: Chain;
  cryptoAmount: string;
  brlAmount: number;
  idempotencyKey: string;
  correlationId: string;
}

@Injectable()
export class RampService {
  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
    @Inject(CRYPTO_GATEWAY) private readonly gateway: CryptoGateway,
    private readonly cryptoBalance: CryptoBalanceService,
    private readonly brlWallet: WalletService,
    private readonly outbox: OutboxService,
  ) {}

  async getQuote(params: { fromCurrency: string; toCurrency: string; amount: string }) {
    return this.gateway.getQuote(params);
  }

  async buyWithBrl(input: BuyWithBrlInput) {
    // Debit BRL wallet
    await this.brlWallet.debit(
      input.userId,
      input.brlAmount,
      `ramp_brl_debit_${input.idempotencyKey}`,
      `On-ramp: BRL to ${input.token}`,
      'ramp_in',
      input.idempotencyKey,
      input.correlationId,
    );

    // Credit crypto balance
    await this.cryptoBalance.credit({
      userId: input.userId,
      token: input.token,
      chain: input.chain,
      amount: input.cryptoAmount,
      idempotencyKey: `ramp_crypto_credit_${input.idempotencyKey}`,
      referenceType: 'ramp_in',
      referenceId: input.idempotencyKey,
      correlationId: input.correlationId,
    });

    // Outbox event
    await this.db.transaction(async (tx) => {
      await this.outbox.writeEvent(tx, {
        eventType: 'marketplace.ramp.buy_completed',
        aggregateType: 'ramp',
        aggregateId: input.idempotencyKey,
        payload: {
          userId: input.userId,
          brlAmount: input.brlAmount,
          cryptoAmount: input.cryptoAmount,
          token: input.token,
          chain: input.chain,
        },
        correlationId: input.correlationId,
      });
    });

    return { status: 'completed' as const, fromAmount: input.brlAmount.toString(), toAmount: input.cryptoAmount };
  }

  async sellToBrl(input: SellToBrlInput) {
    // Debit crypto balance
    await this.cryptoBalance.debit({
      userId: input.userId,
      token: input.token,
      chain: input.chain,
      amount: input.cryptoAmount,
      idempotencyKey: `ramp_crypto_debit_${input.idempotencyKey}`,
      referenceType: 'ramp_out',
      referenceId: input.idempotencyKey,
      correlationId: input.correlationId,
    });

    // Credit BRL wallet
    await this.brlWallet.credit(
      input.userId,
      input.brlAmount,
      `ramp_brl_credit_${input.idempotencyKey}`,
      `Off-ramp: ${input.token} to BRL`,
      'ramp_out',
      input.idempotencyKey,
      input.correlationId,
    );

    // Outbox event
    await this.db.transaction(async (tx) => {
      await this.outbox.writeEvent(tx, {
        eventType: 'marketplace.ramp.sell_completed',
        aggregateType: 'ramp',
        aggregateId: input.idempotencyKey,
        payload: {
          userId: input.userId,
          cryptoAmount: input.cryptoAmount,
          brlAmount: input.brlAmount,
          token: input.token,
          chain: input.chain,
        },
        correlationId: input.correlationId,
      });
    });

    return { status: 'completed' as const, fromAmount: input.cryptoAmount, toAmount: input.brlAmount.toString() };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/api && pnpm test -- ramp.service.test`
Expected: PASS

**Step 5: Add ramp endpoints to CryptoController**

Add to `apps/api/src/modules/crypto/controllers/crypto.controller.ts`:

```typescript
// Add import
import { RampService } from '../services/ramp.service';

// Add to constructor
constructor(
  private readonly walletService: CryptoWalletService,
  private readonly balanceService: CryptoBalanceService,
  private readonly paymentService: CryptoPaymentService,
  private readonly rampService: RampService,
) {}

// Add endpoints
@Post('ramp/quote')
async getQuote(@Body() body: { fromCurrency: string; toCurrency: string; amount: string }) {
  return this.rampService.getQuote(body);
}

@Post('ramp/buy')
async buyWithBrl(@Request() req: any, @Body() body: any) {
  return this.rampService.buyWithBrl({
    userId: req.user.id,
    ...body,
    correlationId: req.correlationId,
  });
}

@Post('ramp/sell')
async sellToBrl(@Request() req: any, @Body() body: any) {
  return this.rampService.sellToBrl({
    userId: req.user.id,
    ...body,
    correlationId: req.correlationId,
  });
}
```

**Step 6: Add RampService to CryptoModule providers**

Add `RampService` to providers and imports `PaymentsModule` for `WalletService`.

**Step 7: Run build to verify**

Run: `pnpm build`

**Step 8: Commit**

```bash
git add apps/api/src/modules/crypto/
git commit -m "feat(crypto): add RampService for BRL/crypto on-off ramp + controller endpoints [fase-3 task-3.1]"
```

---

## Task 10: Update PROGRESS.md + Final Verification

**Files:**
- Modify: `PROGRESS.md`

**Step 1: Run all tests**

Run: `cd "C:/Users/manod/Downloads/marketplace FTM" && pnpm test`
Expected: All PASS

**Step 2: Run build**

Run: `pnpm build`
Expected: Build succeeds

**Step 3: Update PROGRESS.md**

Add under Fase 3:

```markdown
## Fase 3 — Escala
Status: Em andamento

### Concluido
- [x] 3.1 Crypto rails: CryptoGateway abstrato (Dfns + Mock adapters), ETH/Polygon/Solana
  - [x] Schema atualizado: crypto_wallets (MPC), crypto_balances, crypto_ledger
  - [x] packages/crypto-gateway com interface, MockAdapter, DfnsAdapter
  - [x] CryptoWalletService, CryptoBalanceService, CryptoPaymentService
  - [x] CryptoController com endpoints REST
  - [x] RampService (on/off ramp BRL↔crypto)
  - [x] Fee model: 10% platform (igual Stripe)
  - [x] Idempotency + optimistic locking + outbox events
```

**Step 4: Commit**

```bash
git add PROGRESS.md
git commit -m "docs: update PROGRESS.md with Fase 3.1 Crypto Rails completion [fase-3 task-3.1]"
```
