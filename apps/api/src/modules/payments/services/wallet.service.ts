import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { eq, and, desc, sql } from 'drizzle-orm';
import {
  Database,
  wallets,
  ledgerEntries,
  type Wallet,
  type LedgerEntry,
} from '@marketplace/database';
import { DATABASE_TOKEN } from '@/config/database.config';
import { AuditService } from '@/modules/audit/audit.service';

export interface WalletOperationResult {
  wallet: Wallet;
  ledgerEntry: LedgerEntry;
}

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
    private readonly auditService: AuditService,
  ) {}

  async getOrCreateWallet(userId: string): Promise<Wallet> {
    const [existing] = await this.db
      .select()
      .from(wallets)
      .where(eq(wallets.userId, userId))
      .limit(1);

    if (existing) {
      return existing;
    }

    const [created] = await this.db
      .insert(wallets)
      .values({
        userId,
        balance: 0,
        pendingBalance: 0,
        currency: 'BRL',
        version: 1,
      })
      .returning();

    this.logger.log({
      message: 'Wallet created',
      userId,
      walletId: created.id,
    });

    return created;
  }

  async credit(
    userId: string,
    amount: number,
    idempotencyKey: string,
    description?: string,
    referenceType?: string,
    referenceId?: string,
    correlationId?: string,
  ): Promise<WalletOperationResult> {
    const [existingEntry] = await this.db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.idempotencyKey, idempotencyKey))
      .limit(1);

    if (existingEntry) {
      const [wallet] = await this.db
        .select()
        .from(wallets)
        .where(eq(wallets.id, existingEntry.walletId))
        .limit(1);

      this.logger.log({
        message: 'Duplicate credit detected, returning existing entry',
        idempotencyKey,
      });

      return { wallet, ledgerEntry: existingEntry };
    }

    const wallet = await this.getOrCreateWallet(userId);

    const result = await this.db.transaction(async (tx) => {
      const [currentWallet] = await tx
        .select()
        .from(wallets)
        .where(eq(wallets.id, wallet.id))
        .limit(1);

      const newBalance = currentWallet.balance + amount;

      const [updatedWallet] = await tx
        .update(wallets)
        .set({
          balance: newBalance,
          version: sql`${wallets.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(wallets.id, wallet.id),
            eq(wallets.version, currentWallet.version),
          ),
        )
        .returning();

      if (!updatedWallet) {
        throw new ConflictException(
          'Wallet was modified concurrently. Please retry.',
        );
      }

      const [entry] = await tx
        .insert(ledgerEntries)
        .values({
          walletId: wallet.id,
          type: 'credit',
          amount,
          balanceBefore: currentWallet.balance,
          balanceAfter: newBalance,
          description: description ?? 'Credit',
          referenceType: referenceType ?? null,
          referenceId: referenceId ?? null,
          idempotencyKey,
          correlationId: correlationId ?? null,
        })
        .returning();

      return { wallet: updatedWallet, ledgerEntry: entry };
    });

    await this.auditService.record({
      userId,
      action: 'wallet.credit',
      entityType: 'wallet',
      entityId: wallet.id,
      oldValue: { balance: wallet.balance },
      newValue: { balance: result.wallet.balance, amount },
      metadata: { idempotencyKey, referenceType, referenceId },
      correlationId,
    });

    this.logger.log({
      message: 'Wallet credited',
      userId,
      walletId: wallet.id,
      amount,
      newBalance: result.wallet.balance,
      idempotencyKey,
    });

    return result;
  }

  async debit(
    userId: string,
    amount: number,
    idempotencyKey: string,
    description?: string,
    referenceType?: string,
    referenceId?: string,
    correlationId?: string,
  ): Promise<WalletOperationResult> {
    const [existingEntry] = await this.db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.idempotencyKey, idempotencyKey))
      .limit(1);

    if (existingEntry) {
      const [wallet] = await this.db
        .select()
        .from(wallets)
        .where(eq(wallets.id, existingEntry.walletId))
        .limit(1);

      this.logger.log({
        message: 'Duplicate debit detected, returning existing entry',
        idempotencyKey,
      });

      return { wallet, ledgerEntry: existingEntry };
    }

    const wallet = await this.getOrCreateWallet(userId);

    const result = await this.db.transaction(async (tx) => {
      const [currentWallet] = await tx
        .select()
        .from(wallets)
        .where(eq(wallets.id, wallet.id))
        .limit(1);

      if (currentWallet.balance < amount) {
        throw new ConflictException(
          `Insufficient balance. Available: ${currentWallet.balance}, required: ${amount}`,
        );
      }

      const newBalance = currentWallet.balance - amount;

      const [updatedWallet] = await tx
        .update(wallets)
        .set({
          balance: newBalance,
          version: sql`${wallets.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(wallets.id, wallet.id),
            eq(wallets.version, currentWallet.version),
          ),
        )
        .returning();

      if (!updatedWallet) {
        throw new ConflictException(
          'Wallet was modified concurrently. Please retry.',
        );
      }

      const [entry] = await tx
        .insert(ledgerEntries)
        .values({
          walletId: wallet.id,
          type: 'debit',
          amount,
          balanceBefore: currentWallet.balance,
          balanceAfter: newBalance,
          description: description ?? 'Debit',
          referenceType: referenceType ?? null,
          referenceId: referenceId ?? null,
          idempotencyKey,
          correlationId: correlationId ?? null,
        })
        .returning();

      return { wallet: updatedWallet, ledgerEntry: entry };
    });

    await this.auditService.record({
      userId,
      action: 'wallet.debit',
      entityType: 'wallet',
      entityId: wallet.id,
      oldValue: { balance: wallet.balance },
      newValue: { balance: result.wallet.balance, amount },
      metadata: { idempotencyKey, referenceType, referenceId },
      correlationId,
    });

    this.logger.log({
      message: 'Wallet debited',
      userId,
      walletId: wallet.id,
      amount,
      newBalance: result.wallet.balance,
      idempotencyKey,
    });

    return result;
  }

  async getBalance(userId: string): Promise<{
    balance: number;
    pendingBalance: number;
    currency: string;
  }> {
    const wallet = await this.getOrCreateWallet(userId);

    return {
      balance: wallet.balance,
      pendingBalance: wallet.pendingBalance,
      currency: wallet.currency,
    };
  }

  async getHistory(
    userId: string,
    limit = 50,
    offset = 0,
  ): Promise<{ entries: LedgerEntry[]; total: number }> {
    const wallet = await this.getOrCreateWallet(userId);

    const entries = await this.db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.walletId, wallet.id))
      .orderBy(desc(ledgerEntries.createdAt))
      .limit(limit)
      .offset(offset);

    const [countResult] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.walletId, wallet.id));

    return {
      entries,
      total: countResult.count,
    };
  }
}
