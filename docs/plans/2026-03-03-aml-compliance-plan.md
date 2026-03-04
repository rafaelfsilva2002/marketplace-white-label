# AML Compliance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete AML compliance system with async screening, SAR persistence, manual review queue, travel rule, blacklists DB, and per-wallet rate limiting.

**Architecture:** AmlProvider interface with InternalAdapter (refactored from existing AmlComplianceService). Async BullMQ screening worker. New schema tables for screenings, SARs, review queue, blacklists, rate limits. Moderator/admin REST endpoints.

**Tech Stack:** NestJS, Drizzle ORM, BullMQ, PostgreSQL

**Design Doc:** `docs/plans/2026-03-03-aml-compliance-design.md`

---

## Task 1: AML Schema Tables

**Files:**
- Create: `packages/database/src/schema/aml.ts`
- Modify: `packages/database/src/schema/crypto.ts` — add risk_level, aml_screening_id, aml_status
- Modify: `packages/database/src/schema/index.ts` — export new schema

**Step 1: Create aml.ts schema**

Create file: `packages/database/src/schema/aml.ts`

```typescript
import {
  pgTable, uuid, text, boolean, timestamp, jsonb, integer, real,
  pgEnum, index, unique,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';
import { cryptoTransactions } from './crypto';

export const amlRiskLevelEnum = pgEnum('aml_risk_level', [
  'low', 'medium', 'high', 'critical',
]);

export const amlStatusEnum = pgEnum('aml_status', [
  'pending_aml', 'approved', 'rejected', 'manual_review',
]);

export const sarStatusEnum = pgEnum('sar_status', [
  'pending', 'reviewed', 'filed', 'dismissed',
]);

export const reviewQueueStatusEnum = pgEnum('review_queue_status', [
  'pending', 'in_review', 'approved', 'rejected',
]);

export const reviewPriorityEnum = pgEnum('review_priority', [
  'normal', 'high', 'urgent',
]);

// --- Tables ---

export const amlScreenings = pgTable(
  'aml_screenings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    transactionId: uuid('transaction_id').references(() => cryptoTransactions.id),
    userId: uuid('user_id').notNull().references(() => users.id),
    riskLevel: amlRiskLevelEnum('risk_level').notNull(),
    score: real('score').notNull(),
    approved: boolean('approved').notNull(),
    requiresManualReview: boolean('requires_manual_review').notNull().default(false),
    factors: jsonb('factors').notNull().$type<Array<{ type: string; description: string; weight: number }>>(),
    provider: text('provider').notNull().default('internal'),
    travelRuleData: jsonb('travel_rule_data').$type<Record<string, unknown>>(),
    correlationId: uuid('correlation_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('aml_screenings_user_id_idx').on(table.userId),
    index('aml_screenings_transaction_id_idx').on(table.transactionId),
    index('aml_screenings_risk_level_idx').on(table.riskLevel),
    index('aml_screenings_created_at_idx').on(table.createdAt),
  ],
);

export const suspiciousActivityReports = pgTable(
  'suspicious_activity_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    screeningId: uuid('screening_id').references(() => amlScreenings.id),
    userId: uuid('user_id').notNull().references(() => users.id),
    transactionId: uuid('transaction_id'),
    reportType: text('report_type').notNull(),
    severity: text('severity').notNull(),
    summary: text('summary').notNull(),
    details: jsonb('details').notNull().$type<Record<string, unknown>>(),
    status: sarStatusEnum('status').notNull().default('pending'),
    reviewedBy: uuid('reviewed_by').references(() => users.id),
    reviewedAt: timestamp('reviewed_at'),
    filedAt: timestamp('filed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('sars_user_id_idx').on(table.userId),
    index('sars_screening_id_idx').on(table.screeningId),
    index('sars_status_idx').on(table.status),
    index('sars_created_at_idx').on(table.createdAt),
  ],
);

export const amlReviewQueue = pgTable(
  'aml_review_queue',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    screeningId: uuid('screening_id').notNull().references(() => amlScreenings.id),
    userId: uuid('user_id').notNull().references(() => users.id),
    transactionId: uuid('transaction_id'),
    reason: text('reason').notNull(),
    priority: reviewPriorityEnum('priority').notNull().default('normal'),
    status: reviewQueueStatusEnum('status').notNull().default('pending'),
    assignedTo: uuid('assigned_to').references(() => users.id),
    notes: text('notes'),
    resolvedAt: timestamp('resolved_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('review_queue_status_idx').on(table.status),
    index('review_queue_priority_idx').on(table.priority),
    index('review_queue_assigned_to_idx').on(table.assignedTo),
    index('review_queue_created_at_idx').on(table.createdAt),
  ],
);

export const amlBlacklists = pgTable(
  'aml_blacklists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    address: text('address').notNull(),
    chain: text('chain'),
    reason: text('reason').notNull(),
    source: text('source').notNull().default('manual'),
    addedBy: uuid('added_by').references(() => users.id),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('blacklists_address_idx').on(table.address),
    unique('blacklists_address_chain_unique').on(table.address, table.chain),
  ],
);

export const amlRateLimits = pgTable(
  'aml_rate_limits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    walletAddress: text('wallet_address').notNull(),
    chain: text('chain').notNull(),
    txCount: integer('tx_count').notNull().default(0),
    totalAmountUsd: real('total_amount_usd').notNull().default(0),
    windowStart: timestamp('window_start').defaultNow().notNull(),
    windowHours: integer('window_hours').notNull().default(24),
  },
  (table) => [
    unique('rate_limits_wallet_chain_unique').on(table.walletAddress, table.chain),
  ],
);

// --- Relations ---

export const amlScreeningsRelations = relations(amlScreenings, ({ one }) => ({
  user: one(users, { fields: [amlScreenings.userId], references: [users.id] }),
  transaction: one(cryptoTransactions, { fields: [amlScreenings.transactionId], references: [cryptoTransactions.id] }),
}));

export const sarsRelations = relations(suspiciousActivityReports, ({ one }) => ({
  user: one(users, { fields: [suspiciousActivityReports.userId], references: [users.id] }),
  screening: one(amlScreenings, { fields: [suspiciousActivityReports.screeningId], references: [amlScreenings.id] }),
}));

export const reviewQueueRelations = relations(amlReviewQueue, ({ one }) => ({
  user: one(users, { fields: [amlReviewQueue.userId], references: [users.id] }),
  screening: one(amlScreenings, { fields: [amlReviewQueue.screeningId], references: [amlScreenings.id] }),
}));

// --- Types ---

export type AmlScreening = typeof amlScreenings.$inferSelect;
export type NewAmlScreening = typeof amlScreenings.$inferInsert;
export type SuspiciousActivityReport = typeof suspiciousActivityReports.$inferSelect;
export type NewSuspiciousActivityReport = typeof suspiciousActivityReports.$inferInsert;
export type AmlReviewItem = typeof amlReviewQueue.$inferSelect;
export type NewAmlReviewItem = typeof amlReviewQueue.$inferInsert;
export type AmlBlacklistEntry = typeof amlBlacklists.$inferSelect;
export type NewAmlBlacklistEntry = typeof amlBlacklists.$inferInsert;
```

**Step 2: Update crypto.ts — add AML fields to cryptoTransactions**

Add to `cryptoTransactions` table definition in `packages/database/src/schema/crypto.ts`:

```typescript
riskLevel: text('risk_level'),
amlScreeningId: uuid('aml_screening_id'),
amlStatus: text('aml_status').notNull().default('pending_aml'),
```

**Step 3: Update schema/index.ts — export aml**

Add to `packages/database/src/schema/index.ts`:

```typescript
export * from './aml';
```

**Step 4: Commit**

```bash
git add packages/database/src/schema/aml.ts packages/database/src/schema/crypto.ts packages/database/src/schema/index.ts
git commit -m "feat(database): add AML schema tables + update crypto_transactions with AML fields [fase-3 task-3.2]"
```

---

## Task 2: AmlProvider Interface

**Files:**
- Create: `apps/api/src/modules/aml/aml-provider.interface.ts`
- Create: `apps/api/src/modules/aml/types.ts`

**Step 1: Create types.ts**

Create file: `apps/api/src/modules/aml/types.ts`

```typescript
export type Chain = 'ethereum' | 'polygon' | 'solana';

export interface ScreeningParams {
  userId: string;
  fromAddress: string;
  toAddress: string;
  amount: string;
  amountUsd: number;
  token: string;
  chain: Chain;
  correlationId: string;
}

export interface ScreeningResult {
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  score: number;
  approved: boolean;
  requiresManualReview: boolean;
  factors: RiskFactor[];
  travelRuleRequired: boolean;
}

export interface RiskFactor {
  type: string;
  description: string;
  weight: number;
}

export interface WalletRiskResult {
  address: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  isBlacklisted: boolean;
  factors: RiskFactor[];
}

export interface TravelRuleData {
  originator: { name: string; accountId: string; institution?: string };
  beneficiary: { name: string; accountId: string; institution?: string };
  amount: string;
  currency: string;
  timestamp: string;
}
```

**Step 2: Create aml-provider.interface.ts**

Create file: `apps/api/src/modules/aml/aml-provider.interface.ts`

```typescript
import type { ScreeningParams, ScreeningResult, WalletRiskResult, Chain } from './types';

export const AML_PROVIDER = Symbol('AML_PROVIDER');

export interface AmlProvider {
  screenTransaction(params: ScreeningParams): Promise<ScreeningResult>;
  screenWallet(address: string, chain: Chain): Promise<WalletRiskResult>;
  isBlacklisted(address: string, chain?: Chain): Promise<boolean>;
}
```

**Step 3: Commit**

```bash
git add apps/api/src/modules/aml/
git commit -m "feat(aml): add AmlProvider interface and types [fase-3 task-3.2]"
```

---

## Task 3: InternalAmlAdapter (refactor existing service)

**Files:**
- Create: `apps/api/src/modules/aml/adapters/internal.adapter.ts`
- Modify: existing `aml-compliance.service.ts` — keep as facade that delegates to adapter

**Context:** The existing `AmlComplianceService` at `apps/api/src/modules/crypto/services/aml-compliance.service.ts` has the screening logic. Refactor it into an `InternalAmlAdapter` that implements `AmlProvider`, adding:
- Blacklist lookup from DB (`aml_blacklists` table) instead of in-memory Set
- Per-wallet rate limiting from DB (`aml_rate_limits` table)
- Cross-check with fraud scores (`fraudScores` table)
- Travel rule trigger for txs > $1000 USD

**Step 1: Create InternalAmlAdapter**

Create file: `apps/api/src/modules/aml/adapters/internal.adapter.ts`

```typescript
import { Injectable, Inject } from '@nestjs/common';
import { eq, and, gte, sql } from 'drizzle-orm';
import { DATABASE_TOKEN } from '@/config/database.config';
import {
  amlBlacklists, amlRateLimits, cryptoTransactions, users, fraudScores,
} from '@marketplace/database';
import type { Database } from '@marketplace/database';
import type { AmlProvider } from '../aml-provider.interface';
import type { ScreeningParams, ScreeningResult, WalletRiskResult, RiskFactor, Chain } from '../types';

const LARGE_TX_THRESHOLD_USD = 10_000;
const TRAVEL_RULE_THRESHOLD_USD = 1_000;
const VELOCITY_THRESHOLD_USER = 5;
const VELOCITY_THRESHOLD_WALLET = 10;
const VELOCITY_WINDOW_HOURS = 24;
const NEW_ACCOUNT_DAYS = 7;
const NEW_ACCOUNT_THRESHOLD_USD = 1_000;

const USD_PRICE_FALLBACKS: Record<string, number> = {
  ETH: 3500, MATIC: 0.85, SOL: 150, USDT: 1, USDC: 1,
};

@Injectable()
export class InternalAmlAdapter implements AmlProvider {
  constructor(@Inject(DATABASE_TOKEN) private readonly db: Database) {}

  async screenTransaction(params: ScreeningParams): Promise<ScreeningResult> {
    const factors: RiskFactor[] = [];
    let score = 0;

    // 1. Blacklist check
    if (await this.isBlacklisted(params.fromAddress, params.chain) ||
        await this.isBlacklisted(params.toAddress, params.chain)) {
      return {
        riskLevel: 'critical', score: 1.0, approved: false,
        requiresManualReview: false, factors: [{ type: 'blacklist', description: 'Address is blacklisted', weight: 1.0 }],
        travelRuleRequired: false,
      };
    }

    // 2. Velocity per user
    const userVelocity = await this.checkUserVelocity(params.userId);
    if (userVelocity > VELOCITY_THRESHOLD_USER) {
      score += 0.25;
      factors.push({ type: 'velocity_user', description: `${userVelocity} txs in ${VELOCITY_WINDOW_HOURS}h (limit: ${VELOCITY_THRESHOLD_USER})`, weight: 0.25 });
    }

    // 3. Velocity per wallet
    const walletVelocity = await this.checkWalletVelocity(params.fromAddress, params.chain);
    if (walletVelocity > VELOCITY_THRESHOLD_WALLET) {
      score += 0.20;
      factors.push({ type: 'velocity_wallet', description: `${walletVelocity} txs from wallet in ${VELOCITY_WINDOW_HOURS}h`, weight: 0.20 });
    }

    // 4. Large transaction
    if (params.amountUsd > LARGE_TX_THRESHOLD_USD) {
      score += 0.20;
      factors.push({ type: 'large_tx', description: `$${params.amountUsd} exceeds $${LARGE_TX_THRESHOLD_USD} threshold`, weight: 0.20 });
    }

    // 5. New account
    if (await this.isNewAccount(params.userId) && params.amountUsd > NEW_ACCOUNT_THRESHOLD_USD) {
      score += 0.20;
      factors.push({ type: 'new_account', description: `Account < ${NEW_ACCOUNT_DAYS} days with tx > $${NEW_ACCOUNT_THRESHOLD_USD}`, weight: 0.20 });
    }

    // 6. Cross-check fraud score
    const profileRisk = await this.getProfileFraudScore(params.userId);
    if (profileRisk > 0.5) {
      score += 0.15;
      factors.push({ type: 'fraud_crosscheck', description: `Profile fraud score: ${profileRisk.toFixed(2)}`, weight: 0.15 });
    }

    // Clamp score
    score = Math.min(score, 1.0);

    // Determine risk level
    const riskLevel = this.mapRiskLevel(score);
    const approved = riskLevel !== 'critical';
    const requiresManualReview = riskLevel === 'high';
    const travelRuleRequired = params.amountUsd > TRAVEL_RULE_THRESHOLD_USD;

    // Update wallet rate limit
    await this.incrementWalletRate(params.fromAddress, params.chain, params.amountUsd);

    return { riskLevel, score, approved, requiresManualReview, factors, travelRuleRequired };
  }

  async screenWallet(address: string, chain: Chain): Promise<WalletRiskResult> {
    const blacklisted = await this.isBlacklisted(address, chain);
    return {
      address,
      riskLevel: blacklisted ? 'critical' : 'low',
      isBlacklisted: blacklisted,
      factors: blacklisted ? [{ type: 'blacklist', description: 'Address is blacklisted', weight: 1.0 }] : [],
    };
  }

  async isBlacklisted(address: string, chain?: Chain): Promise<boolean> {
    const conditions = [
      eq(amlBlacklists.address, address.toLowerCase()),
      eq(amlBlacklists.isActive, true),
    ];
    if (chain) {
      // Match specific chain OR null (all chains)
      conditions.push(sql`(${amlBlacklists.chain} = ${chain} OR ${amlBlacklists.chain} IS NULL)`);
    }

    const result = await this.db.query.amlBlacklists.findFirst({
      where: and(...conditions),
    });
    return !!result;
  }

  private async checkUserVelocity(userId: string): Promise<number> {
    const windowStart = new Date(Date.now() - VELOCITY_WINDOW_HOURS * 60 * 60 * 1000);
    const result = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(cryptoTransactions)
      .innerJoin(
        sql`crypto_wallets`,
        sql`crypto_wallets.id = ${cryptoTransactions.walletId}`,
      )
      .where(
        and(
          sql`crypto_wallets.user_id = ${userId}`,
          gte(cryptoTransactions.createdAt, windowStart),
        ),
      );
    return result[0]?.count ?? 0;
  }

  private async checkWalletVelocity(address: string, chain: string): Promise<number> {
    const rateLimit = await this.db.query.amlRateLimits.findFirst({
      where: and(
        eq(amlRateLimits.walletAddress, address.toLowerCase()),
        eq(amlRateLimits.chain, chain),
      ),
    });

    if (!rateLimit) return 0;

    const windowExpired = new Date(rateLimit.windowStart.getTime() + rateLimit.windowHours * 60 * 60 * 1000) < new Date();
    if (windowExpired) return 0;

    return rateLimit.txCount;
  }

  private async incrementWalletRate(address: string, chain: string, amountUsd: number): Promise<void> {
    const existing = await this.db.query.amlRateLimits.findFirst({
      where: and(
        eq(amlRateLimits.walletAddress, address.toLowerCase()),
        eq(amlRateLimits.chain, chain),
      ),
    });

    if (!existing) {
      await this.db.insert(amlRateLimits).values({
        walletAddress: address.toLowerCase(),
        chain,
        txCount: 1,
        totalAmountUsd: amountUsd,
      });
      return;
    }

    const windowExpired = new Date(existing.windowStart.getTime() + existing.windowHours * 60 * 60 * 1000) < new Date();
    if (windowExpired) {
      await this.db.update(amlRateLimits)
        .set({ txCount: 1, totalAmountUsd: amountUsd, windowStart: new Date() })
        .where(eq(amlRateLimits.id, existing.id));
    } else {
      await this.db.update(amlRateLimits)
        .set({
          txCount: existing.txCount + 1,
          totalAmountUsd: existing.totalAmountUsd + amountUsd,
        })
        .where(eq(amlRateLimits.id, existing.id));
    }
  }

  private async isNewAccount(userId: string): Promise<boolean> {
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { createdAt: true },
    });
    if (!user) return true;
    const daysSinceCreation = (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceCreation < NEW_ACCOUNT_DAYS;
  }

  private async getProfileFraudScore(userId: string): Promise<number> {
    const latest = await this.db.query.fraudScores.findFirst({
      where: and(
        eq(fraudScores.userId, userId),
        gte(fraudScores.expiresAt, new Date()),
      ),
      orderBy: (fs, { desc }) => [desc(fs.evaluatedAt)],
    });
    return latest?.score ?? 0;
  }

  private mapRiskLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
    if (score >= 0.7) return 'critical';
    if (score >= 0.5) return 'high';
    if (score >= 0.3) return 'medium';
    return 'low';
  }
}
```

**Step 2: Commit**

```bash
git add apps/api/src/modules/aml/
git commit -m "feat(aml): add InternalAmlAdapter with DB blacklists, wallet rate limiting, fraud cross-check [fase-3 task-3.2]"
```

---

## Task 4: SarService

**Files:**
- Create: `apps/api/src/modules/aml/services/sar.service.ts`

**Step 1: Create SarService**

Create file: `apps/api/src/modules/aml/services/sar.service.ts`

```typescript
import { Injectable, Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DATABASE_TOKEN } from '@/config/database.config';
import { suspiciousActivityReports } from '@marketplace/database';
import { AuditService } from '@/modules/audit/audit.service';
import type { Database, NewSuspiciousActivityReport } from '@marketplace/database';
import type { ScreeningResult } from '../types';

@Injectable()
export class SarService {
  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async createFromScreening(
    screeningId: string,
    userId: string,
    transactionId: string | undefined,
    screeningResult: ScreeningResult,
    correlationId?: string,
  ) {
    const [sar] = await this.db
      .insert(suspiciousActivityReports)
      .values({
        screeningId,
        userId,
        transactionId,
        reportType: 'auto',
        severity: screeningResult.riskLevel as 'high' | 'critical',
        summary: `Auto-generated SAR: ${screeningResult.factors.map(f => f.type).join(', ')}`,
        details: {
          score: screeningResult.score,
          factors: screeningResult.factors,
          travelRuleRequired: screeningResult.travelRuleRequired,
        },
      })
      .returning();

    await this.audit.record({
      userId,
      action: 'aml.sar.created',
      entityType: 'sar',
      entityId: sar.id,
      newValue: { severity: sar.severity, reportType: 'auto' },
      correlationId,
    });

    return sar;
  }

  async updateStatus(
    sarId: string,
    status: 'reviewed' | 'filed' | 'dismissed',
    reviewedBy: string,
  ) {
    const now = new Date();
    const [updated] = await this.db
      .update(suspiciousActivityReports)
      .set({
        status,
        reviewedBy,
        reviewedAt: now,
        ...(status === 'filed' ? { filedAt: now } : {}),
      })
      .where(eq(suspiciousActivityReports.id, sarId))
      .returning();

    await this.audit.record({
      userId: reviewedBy,
      action: `aml.sar.${status}`,
      entityType: 'sar',
      entityId: sarId,
      newValue: { status },
    });

    return updated;
  }

  async list(limit = 50, offset = 0) {
    return this.db.query.suspiciousActivityReports.findMany({
      orderBy: (sar, { desc }) => [desc(sar.createdAt)],
      limit,
      offset,
    });
  }

  async getById(id: string) {
    return this.db.query.suspiciousActivityReports.findFirst({
      where: eq(suspiciousActivityReports.id, id),
    });
  }
}
```

**Step 2: Commit**

```bash
git add apps/api/src/modules/aml/services/sar.service.ts
git commit -m "feat(aml): add SarService for SAR persistence and lifecycle [fase-3 task-3.2]"
```

---

## Task 5: ReviewQueueService

**Files:**
- Create: `apps/api/src/modules/aml/services/review-queue.service.ts`

**Step 1: Create ReviewQueueService**

Create file: `apps/api/src/modules/aml/services/review-queue.service.ts`

```typescript
import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DATABASE_TOKEN } from '@/config/database.config';
import { amlReviewQueue, cryptoTransactions } from '@marketplace/database';
import { OutboxService } from '@/common/events/outbox.service';
import { AuditService } from '@/modules/audit/audit.service';
import { CryptoBalanceService } from '@/modules/crypto/services/crypto-balance.service';
import type { Database } from '@marketplace/database';

@Injectable()
export class ReviewQueueService {
  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    private readonly cryptoBalance: CryptoBalanceService,
  ) {}

  async addToQueue(
    screeningId: string,
    userId: string,
    transactionId: string | undefined,
    reason: string,
    priority: 'normal' | 'high' | 'urgent' = 'normal',
  ) {
    const [item] = await this.db
      .insert(amlReviewQueue)
      .values({ screeningId, userId, transactionId, reason, priority })
      .returning();
    return item;
  }

  async approve(itemId: string, moderatorId: string) {
    const item = await this.getOrThrow(itemId);

    const [updated] = await this.db
      .update(amlReviewQueue)
      .set({ status: 'approved', resolvedAt: new Date() })
      .where(eq(amlReviewQueue.id, itemId))
      .returning();

    // Release the transaction
    if (item.transactionId) {
      await this.db
        .update(cryptoTransactions)
        .set({ amlStatus: 'approved' })
        .where(eq(cryptoTransactions.id, item.transactionId));

      await this.db.transaction(async (tx) => {
        await this.outbox.writeEvent(tx, {
          eventType: 'marketplace.aml.review_approved',
          aggregateType: 'aml_review',
          aggregateId: itemId,
          payload: { itemId, transactionId: item.transactionId, userId: item.userId, moderatorId },
        });
      });
    }

    await this.audit.record({
      userId: moderatorId,
      action: 'aml.review.approved',
      entityType: 'aml_review',
      entityId: itemId,
      newValue: { transactionId: item.transactionId },
    });

    return updated;
  }

  async reject(itemId: string, moderatorId: string, notes?: string) {
    const item = await this.getOrThrow(itemId);

    const [updated] = await this.db
      .update(amlReviewQueue)
      .set({ status: 'rejected', resolvedAt: new Date(), notes })
      .where(eq(amlReviewQueue.id, itemId))
      .returning();

    // Block transaction and refund
    if (item.transactionId) {
      await this.db
        .update(cryptoTransactions)
        .set({ amlStatus: 'rejected' })
        .where(eq(cryptoTransactions.id, item.transactionId));

      await this.db.transaction(async (tx) => {
        await this.outbox.writeEvent(tx, {
          eventType: 'marketplace.aml.review_rejected',
          aggregateType: 'aml_review',
          aggregateId: itemId,
          payload: { itemId, transactionId: item.transactionId, userId: item.userId, moderatorId, notes },
        });
      });
    }

    await this.audit.record({
      userId: moderatorId,
      action: 'aml.review.rejected',
      entityType: 'aml_review',
      entityId: itemId,
      newValue: { transactionId: item.transactionId, notes },
    });

    return updated;
  }

  async assign(itemId: string, assignedTo: string, moderatorId: string) {
    const [updated] = await this.db
      .update(amlReviewQueue)
      .set({ assignedTo, status: 'in_review' })
      .where(eq(amlReviewQueue.id, itemId))
      .returning();
    return updated;
  }

  async listPending(limit = 50, offset = 0) {
    return this.db.query.amlReviewQueue.findMany({
      where: eq(amlReviewQueue.status, 'pending'),
      orderBy: (q, { desc }) => [desc(q.createdAt)],
      limit,
      offset,
    });
  }

  async getById(id: string) {
    return this.db.query.amlReviewQueue.findFirst({
      where: eq(amlReviewQueue.id, id),
    });
  }

  private async getOrThrow(id: string) {
    const item = await this.getById(id);
    if (!item) throw new NotFoundException('Review queue item not found');
    return item;
  }
}
```

**Step 2: Commit**

```bash
git add apps/api/src/modules/aml/services/review-queue.service.ts
git commit -m "feat(aml): add ReviewQueueService with approve/reject/assign [fase-3 task-3.2]"
```

---

## Task 6: AML Screening Worker (BullMQ)

**Files:**
- Create: `apps/workers/src/workers/aml-screening.worker.ts`
- Modify: `apps/workers/src/queues.ts` — add AML_SCREENING queue

**Step 1: Create aml-screening.worker.ts**

Create file: `apps/workers/src/workers/aml-screening.worker.ts`

```typescript
import { Worker, Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import type { Database } from '@marketplace/database';
import { amlScreenings, cryptoTransactions } from '@marketplace/database';
import type { AmlProvider } from '@/modules/aml/aml-provider.interface';
import { QUEUE_NAMES, createRedisConnection } from '../queues';

interface AmlScreeningJobData {
  transactionId: string;
  userId: string;
  fromAddress: string;
  toAddress: string;
  amount: string;
  amountUsd: number;
  token: string;
  chain: string;
  correlationId: string;
}

async function processAmlScreening(
  job: Job<AmlScreeningJobData>,
  db: Database,
  amlProvider: AmlProvider,
): Promise<void> {
  const data = job.data;

  const result = await amlProvider.screenTransaction({
    userId: data.userId,
    fromAddress: data.fromAddress,
    toAddress: data.toAddress,
    amount: data.amount,
    amountUsd: data.amountUsd,
    token: data.token,
    chain: data.chain as any,
    correlationId: data.correlationId,
  });

  // Persist screening result
  const [screening] = await db
    .insert(amlScreenings)
    .values({
      transactionId: data.transactionId,
      userId: data.userId,
      riskLevel: result.riskLevel,
      score: result.score,
      approved: result.approved,
      requiresManualReview: result.requiresManualReview,
      factors: result.factors,
      provider: 'internal',
      travelRuleRequired: result.travelRuleRequired,
      correlationId: data.correlationId,
    })
    .returning();

  // Update transaction with screening result
  const newAmlStatus = result.approved
    ? (result.requiresManualReview ? 'manual_review' : 'approved')
    : 'rejected';

  await db
    .update(cryptoTransactions)
    .set({
      riskLevel: result.riskLevel,
      amlScreeningId: screening.id,
      amlStatus: newAmlStatus,
    })
    .where(eq(cryptoTransactions.id, data.transactionId));
}

export function createAmlScreeningWorker(
  db: Database,
  amlProvider: AmlProvider,
): Worker<AmlScreeningJobData> {
  return new Worker<AmlScreeningJobData>(
    QUEUE_NAMES.AML_SCREENING,
    async (job) => processAmlScreening(job, db, amlProvider),
    {
      connection: createRedisConnection(),
      concurrency: 5,
      limiter: { max: 50, duration: 60_000 },
    },
  );
}
```

**Step 2: Update queues.ts**

Add to `QUEUE_NAMES` in `apps/workers/src/queues.ts`:

```typescript
AML_SCREENING: 'aml-screening',
```

**Step 3: Commit**

```bash
git add apps/workers/src/workers/aml-screening.worker.ts apps/workers/src/queues.ts
git commit -m "feat(aml): add async AML screening worker with BullMQ [fase-3 task-3.2]"
```

---

## Task 7: AML Controller + Blacklist Management

**Files:**
- Create: `apps/api/src/modules/aml/controllers/aml.controller.ts`
- Create: `apps/api/src/modules/aml/services/blacklist.service.ts`

**Step 1: Create BlacklistService**

Create file: `apps/api/src/modules/aml/services/blacklist.service.ts`

```typescript
import { Injectable, Inject } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DATABASE_TOKEN } from '@/config/database.config';
import { amlBlacklists } from '@marketplace/database';
import { AuditService } from '@/modules/audit/audit.service';
import type { Database } from '@marketplace/database';

@Injectable()
export class BlacklistService {
  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async add(address: string, reason: string, addedBy: string, chain?: string) {
    const [entry] = await this.db
      .insert(amlBlacklists)
      .values({ address: address.toLowerCase(), chain, reason, addedBy })
      .returning();

    await this.audit.record({
      userId: addedBy,
      action: 'aml.blacklist.added',
      entityType: 'aml_blacklist',
      entityId: entry.id,
      newValue: { address, chain, reason },
    });

    return entry;
  }

  async remove(id: string, removedBy: string) {
    const [updated] = await this.db
      .update(amlBlacklists)
      .set({ isActive: false })
      .where(eq(amlBlacklists.id, id))
      .returning();

    await this.audit.record({
      userId: removedBy,
      action: 'aml.blacklist.removed',
      entityType: 'aml_blacklist',
      entityId: id,
      newValue: { isActive: false },
    });

    return updated;
  }

  async list(limit = 100, offset = 0) {
    return this.db.query.amlBlacklists.findMany({
      where: eq(amlBlacklists.isActive, true),
      orderBy: (b, { desc }) => [desc(b.createdAt)],
      limit,
      offset,
    });
  }
}
```

**Step 2: Create AmlController**

Create file: `apps/api/src/modules/aml/controllers/aml.controller.ts`

```typescript
import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  UseGuards, Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/modules/auth/guards/roles.guard';
import { Roles } from '@/modules/auth/decorators/roles.decorator';
import { ReviewQueueService } from '../services/review-queue.service';
import { SarService } from '../services/sar.service';
import { BlacklistService } from '../services/blacklist.service';

@Controller('aml')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AmlController {
  constructor(
    private readonly reviewQueue: ReviewQueueService,
    private readonly sarService: SarService,
    private readonly blacklistService: BlacklistService,
  ) {}

  // --- Review Queue (moderator/admin) ---

  @Get('queue')
  @Roles('moderator', 'admin')
  async listQueue(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.reviewQueue.listPending(
      limit ? parseInt(limit) : 50,
      offset ? parseInt(offset) : 0,
    );
  }

  @Get('queue/:id')
  @Roles('moderator', 'admin')
  async getQueueItem(@Param('id') id: string) {
    return this.reviewQueue.getById(id);
  }

  @Post('queue/:id/approve')
  @Roles('moderator', 'admin')
  async approveItem(@Param('id') id: string, @Request() req: any) {
    return this.reviewQueue.approve(id, req.user.id);
  }

  @Post('queue/:id/reject')
  @Roles('moderator', 'admin')
  async rejectItem(@Param('id') id: string, @Request() req: any, @Body() body: { notes?: string }) {
    return this.reviewQueue.reject(id, req.user.id, body.notes);
  }

  @Post('queue/:id/assign')
  @Roles('admin')
  async assignItem(@Param('id') id: string, @Request() req: any, @Body() body: { assignedTo: string }) {
    return this.reviewQueue.assign(id, body.assignedTo, req.user.id);
  }

  // --- SARs (admin only) ---

  @Get('sars')
  @Roles('admin')
  async listSars(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.sarService.list(limit ? parseInt(limit) : 50, offset ? parseInt(offset) : 0);
  }

  @Get('sars/:id')
  @Roles('admin')
  async getSar(@Param('id') id: string) {
    return this.sarService.getById(id);
  }

  @Patch('sars/:id')
  @Roles('admin')
  async updateSar(@Param('id') id: string, @Request() req: any, @Body() body: { status: 'reviewed' | 'filed' | 'dismissed' }) {
    return this.sarService.updateStatus(id, body.status, req.user.id);
  }

  // --- Blacklists (admin only) ---

  @Get('blacklists')
  @Roles('admin')
  async listBlacklists(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.blacklistService.list(limit ? parseInt(limit) : 100, offset ? parseInt(offset) : 0);
  }

  @Post('blacklists')
  @Roles('admin')
  async addToBlacklist(@Request() req: any, @Body() body: { address: string; reason: string; chain?: string }) {
    return this.blacklistService.add(body.address, body.reason, req.user.id, body.chain);
  }

  @Delete('blacklists/:id')
  @Roles('admin')
  async removeFromBlacklist(@Param('id') id: string, @Request() req: any) {
    return this.blacklistService.remove(id, req.user.id);
  }

  // --- Screenings (admin, read-only) ---

  @Get('screenings')
  @Roles('admin')
  async listScreenings(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    const { amlScreenings } = await import('@marketplace/database');
    const results = await this.reviewQueue['db'].query.amlScreenings.findMany({
      orderBy: (s: any, { desc }: any) => [desc(s.createdAt)],
      limit: limit ? parseInt(limit) : 50,
      offset: offset ? parseInt(offset) : 0,
    });
    return results;
  }
}
```

**Step 3: Commit**

```bash
git add apps/api/src/modules/aml/controllers/ apps/api/src/modules/aml/services/blacklist.service.ts
git commit -m "feat(aml): add AmlController + BlacklistService with CRUD endpoints [fase-3 task-3.2]"
```

---

## Task 8: AmlModule + Wire Everything

**Files:**
- Create: `apps/api/src/modules/aml/aml.module.ts`
- Modify: `apps/api/src/app.module.ts` — add AmlModule

**Step 1: Create AmlModule**

Create file: `apps/api/src/modules/aml/aml.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseProvider, DATABASE_TOKEN } from '@/config/database.config';
import { OutboxService } from '@/common/events/outbox.service';
import { AuditService } from '@/modules/audit/audit.service';
import { CryptoModule } from '@/modules/crypto/crypto.module';
import { AML_PROVIDER } from './aml-provider.interface';
import { InternalAmlAdapter } from './adapters/internal.adapter';
import { SarService } from './services/sar.service';
import { ReviewQueueService } from './services/review-queue.service';
import { BlacklistService } from './services/blacklist.service';
import { AmlController } from './controllers/aml.controller';
import type { Database } from '@marketplace/database';

@Module({
  imports: [ConfigModule, CryptoModule],
  controllers: [AmlController],
  providers: [
    DatabaseProvider,
    {
      provide: AuditService,
      useFactory: (db: Database) => new AuditService(db),
      inject: [DATABASE_TOKEN],
    },
    OutboxService,
    {
      provide: AML_PROVIDER,
      useClass: InternalAmlAdapter,
    },
    SarService,
    ReviewQueueService,
    BlacklistService,
  ],
  exports: [AML_PROVIDER, SarService, ReviewQueueService, BlacklistService],
})
export class AmlModule {}
```

**Step 2: Update app.module.ts**

Add import and include `AmlModule` in imports array.

**Step 3: Commit**

```bash
git add apps/api/src/modules/aml/aml.module.ts apps/api/src/app.module.ts
git commit -m "feat(aml): add AmlModule and register in AppModule [fase-3 task-3.2]"
```

---

## Task 9: Update PROGRESS.md

**Files:**
- Modify: `PROGRESS.md`

**Step 1: Add under Fase 3 Concluido:**

```markdown
- [x] 3.2 Compliance AML para transacoes cripto
  - [x] Schema: aml_screenings, suspicious_activity_reports, aml_review_queue, aml_blacklists, aml_rate_limits
  - [x] AmlProvider interface + InternalAmlAdapter (blacklists DB, wallet rate limiting, fraud cross-check)
  - [x] SarService (SAR persistence + lifecycle)
  - [x] ReviewQueueService (approve/reject/assign for moderators)
  - [x] AML Screening Worker (async BullMQ)
  - [x] AmlController (REST endpoints for queue, SARs, blacklists, screenings)
  - [x] BlacklistService (CRUD for admin-managed blacklists)
  - [x] Travel rule for txs > $1000 USD
  - [x] Per-wallet rate limiting
```

**Step 2: Commit**

```bash
git add PROGRESS.md
git commit -m "docs: update PROGRESS.md with Fase 3.2 AML Compliance completion [fase-3 task-3.2]"
```
