import { Injectable, Inject, ConflictException } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DATABASE_TOKEN } from '@/config/database.config';
import { cryptoBalances, cryptoLedger } from '@marketplace/database';
import type { Database } from '@marketplace/database';

type Chain = 'ethereum' | 'polygon' | 'solana';
type Token = 'ETH' | 'MATIC' | 'SOL' | 'USDT' | 'USDC';

interface CryptoOperationInput {
  userId: string;
  token: string;
  chain: Chain;
  amount: string;
  idempotencyKey: string;
  referenceType: string;
  referenceId: string;
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
        tx, input.userId, input.token, input.chain,
      );

      const balanceBefore = balance.balance;
      const balanceAfter = (BigInt(balanceBefore) + BigInt(input.amount)).toString();

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
        tx, input.userId, input.token, input.chain,
      );

      const balanceBefore = balance.balance;
      const balanceAfter = (BigInt(balanceBefore) - BigInt(input.amount)).toString();

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

  private async getOrCreateBalance(tx: any, userId: string, token: string, chain: Chain) {
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
}
