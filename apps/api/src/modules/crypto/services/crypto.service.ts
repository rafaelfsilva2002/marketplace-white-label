import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, and, desc, sql } from 'drizzle-orm';
import { randomUUID, createCipheriv, createDecipheriv, scryptSync } from 'node:crypto';
import {
  Database,
  cryptoWallets,
  cryptoTransactions,
  type CryptoWallet,
  type CryptoTransaction,
} from '@marketplace/database';
import { DATABASE_TOKEN } from '@/config/database.config';
import { StructuredLogger } from '@/common/logger/structured.logger';
import { getCorrelationId } from '@/common/interceptors/correlation-id.interceptor';
import { AuditService } from '@/modules/audit/audit.service';
import { OutboxService } from '@/common/events/outbox.service';
import {
  ChainAdapter,
  type SupportedChain,
} from '../interfaces/chain-adapter.interface';
import { EthereumAdapter } from '../adapters/ethereum.adapter';
import { PolygonAdapter } from '../adapters/polygon.adapter';
import { SolanaAdapter } from '../adapters/solana.adapter';

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT = 'marketplace-crypto-salt';

export interface SendPaymentParams {
  walletId: string;
  to: string;
  amount: string;
  token?: string;
  idempotencyKey: string;
}

export interface TransactionHistoryParams {
  walletId: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class CryptoService {
  private readonly logger: StructuredLogger;
  private readonly adapters: Map<SupportedChain, ChainAdapter>;
  private readonly encryptionKey: Buffer;

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
    private readonly outboxService: OutboxService,
    private readonly ethereumAdapter: EthereumAdapter,
    private readonly polygonAdapter: PolygonAdapter,
    private readonly solanaAdapter: SolanaAdapter,
  ) {
    this.logger = new StructuredLogger('CryptoService');

    this.adapters = new Map<SupportedChain, ChainAdapter>([
      ['ethereum', this.ethereumAdapter],
      ['polygon', this.polygonAdapter],
      ['solana', this.solanaAdapter],
    ]);

    const secret = this.configService.get<string>(
      'CRYPTO_ENCRYPTION_SECRET',
      'default-secret-change-in-production-32chars!',
    );
    this.encryptionKey = scryptSync(secret, SALT, 32);
  }

  async createWallet(
    userId: string,
    chain: SupportedChain,
  ): Promise<CryptoWallet> {
    const correlationId = getCorrelationId();

    const [existing] = await this.db
      .select()
      .from(cryptoWallets)
      .where(
        and(
          eq(cryptoWallets.userId, userId),
          eq(cryptoWallets.chain, chain),
        ),
      )
      .limit(1);

    if (existing) {
      throw new ConflictException(
        `Wallet already exists for chain ${chain}`,
      );
    }

    const adapter = this.getAdapter(chain);
    const keypair = adapter.generateKeypair();

    const encryptedPrivateKey = this.encryptPrivateKey(keypair.privateKey);

    const [wallet] = await this.db
      .insert(cryptoWallets)
      .values({
        userId,
        chain,
        address: keypair.address,
        encryptedPrivateKey,
        isActive: true,
      })
      .returning();

    await this.auditService.record({
      userId,
      action: 'crypto.wallet.created',
      entityType: 'crypto_wallet',
      entityId: wallet.id,
      newValue: {
        chain,
        address: keypair.address,
      },
      correlationId,
    });

    this.logger.logWithData(
      'info',
      'Crypto wallet created',
      {
        walletId: wallet.id,
        userId,
        chain,
        address: keypair.address,
        correlationId,
      },
      'CryptoService',
    );

    return wallet;
  }

  async getBalance(
    walletId: string,
    token?: string,
  ): Promise<{ balance: string; token: string; chain: string }> {
    const wallet = await this.findWalletOrFail(walletId);
    const adapter = this.getAdapter(wallet.chain as SupportedChain);
    const result = await adapter.getBalance(wallet.address, token);

    return {
      balance: result.balance,
      token: result.token,
      chain: wallet.chain,
    };
  }

  async sendPayment(
    userId: string,
    params: SendPaymentParams,
  ): Promise<CryptoTransaction> {
    const correlationId = getCorrelationId();

    const [existingTx] = await this.db
      .select()
      .from(cryptoTransactions)
      .where(eq(cryptoTransactions.idempotencyKey, params.idempotencyKey))
      .limit(1);

    if (existingTx) {
      this.logger.logWithData(
        'info',
        'Duplicate crypto payment detected, returning existing transaction',
        { idempotencyKey: params.idempotencyKey, txId: existingTx.id, correlationId },
        'CryptoService',
      );
      return existingTx;
    }

    const wallet = await this.findWalletOrFail(params.walletId);

    if (wallet.userId !== userId) {
      throw new BadRequestException('Wallet does not belong to this user');
    }

    if (!wallet.isActive) {
      throw new BadRequestException('Wallet is deactivated');
    }

    const chain = wallet.chain as SupportedChain;
    const adapter = this.getAdapter(chain);

    if (!adapter.isValidAddress(params.to)) {
      throw new BadRequestException(
        `Invalid ${chain} address: ${params.to}`,
      );
    }

    const defaultToken = this.getDefaultToken(chain);
    const token = params.token ?? defaultToken;

    const privateKey = this.decryptPrivateKey(wallet.encryptedPrivateKey);

    const [pendingTx] = await this.db
      .insert(cryptoTransactions)
      .values({
        walletId: wallet.id,
        chain,
        fromAddress: wallet.address,
        toAddress: params.to,
        amount: params.amount,
        token,
        status: 'pending',
        idempotencyKey: params.idempotencyKey,
        correlationId,
        metadata: {},
      })
      .returning();

    try {
      const result = await adapter.sendTransaction({
        from: wallet.address,
        to: params.to,
        amount: params.amount,
        token: params.token,
        privateKey,
      });

      const [updatedTx] = await this.db
        .update(cryptoTransactions)
        .set({
          txHash: result.txHash,
          updatedAt: new Date(),
        })
        .where(eq(cryptoTransactions.id, pendingTx.id))
        .returning();

      await this.db.transaction(async (tx) => {
        await this.outboxService.writeEvent(tx, {
          eventType: 'marketplace.crypto.payment.sent',
          aggregateType: 'crypto_transaction',
          aggregateId: updatedTx.id,
          payload: {
            transactionId: updatedTx.id,
            walletId: wallet.id,
            userId,
            txHash: result.txHash,
            chain,
            from: wallet.address,
            to: params.to,
            amount: params.amount,
            token,
            idempotencyKey: params.idempotencyKey,
          },
          correlationId,
        });
      });

      await this.auditService.record({
        userId,
        action: 'crypto.payment.sent',
        entityType: 'crypto_transaction',
        entityId: updatedTx.id,
        newValue: {
          txHash: result.txHash,
          chain,
          from: wallet.address,
          to: params.to,
          amount: params.amount,
          token,
        },
        metadata: { idempotencyKey: params.idempotencyKey },
        correlationId,
      });

      this.logger.logWithData(
        'info',
        'Crypto payment sent',
        {
          transactionId: updatedTx.id,
          txHash: result.txHash,
          walletId: wallet.id,
          userId,
          chain,
          amount: params.amount,
          token,
          correlationId,
        },
        'CryptoService',
      );

      return updatedTx;
    } catch (error) {
      await this.db
        .update(cryptoTransactions)
        .set({
          status: 'failed',
          metadata: {
            error: error instanceof Error ? error.message : String(error),
          },
          updatedAt: new Date(),
        })
        .where(eq(cryptoTransactions.id, pendingTx.id));

      await this.auditService.record({
        userId,
        action: 'crypto.payment.failed',
        entityType: 'crypto_transaction',
        entityId: pendingTx.id,
        newValue: {
          error: error instanceof Error ? error.message : String(error),
          chain,
          from: wallet.address,
          to: params.to,
          amount: params.amount,
          token,
        },
        metadata: { idempotencyKey: params.idempotencyKey },
        correlationId,
      });

      this.logger.logError(
        'Crypto payment failed',
        error instanceof Error ? error : new Error(String(error)),
        {
          transactionId: pendingTx.id,
          walletId: wallet.id,
          userId,
          chain,
          correlationId,
        },
        'CryptoService',
      );

      throw error;
    }
  }

  async getTransactionHistory(
    params: TransactionHistoryParams,
  ): Promise<{ transactions: CryptoTransaction[]; total: number }> {
    const limit = params.limit ?? 50;
    const offset = params.offset ?? 0;

    const transactions = await this.db
      .select()
      .from(cryptoTransactions)
      .where(eq(cryptoTransactions.walletId, params.walletId))
      .orderBy(desc(cryptoTransactions.createdAt))
      .limit(limit)
      .offset(offset);

    const [countResult] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(cryptoTransactions)
      .where(eq(cryptoTransactions.walletId, params.walletId));

    return {
      transactions,
      total: countResult.count,
    };
  }

  async pollTransactionStatus(
    txId: string,
  ): Promise<CryptoTransaction> {
    const correlationId = getCorrelationId();

    const [transaction] = await this.db
      .select()
      .from(cryptoTransactions)
      .where(eq(cryptoTransactions.id, txId))
      .limit(1);

    if (!transaction) {
      throw new NotFoundException(`Transaction ${txId} not found`);
    }

    if (transaction.status !== 'pending' || !transaction.txHash) {
      return transaction;
    }

    const adapter = this.getAdapter(transaction.chain as SupportedChain);
    const status = await adapter.getTransactionStatus(transaction.txHash);

    const mappedStatus = this.mapTxStatus(status.status);

    const [updated] = await this.db
      .update(cryptoTransactions)
      .set({
        status: mappedStatus,
        confirmations: status.confirmations,
        blockNumber: status.blockNumber ?? null,
        updatedAt: new Date(),
      })
      .where(eq(cryptoTransactions.id, txId))
      .returning();

    if (mappedStatus !== 'pending' && mappedStatus !== transaction.status) {
      await this.db.transaction(async (tx) => {
        await this.outboxService.writeEvent(tx, {
          eventType: `marketplace.crypto.transaction.${mappedStatus}`,
          aggregateType: 'crypto_transaction',
          aggregateId: txId,
          payload: {
            transactionId: txId,
            txHash: transaction.txHash,
            chain: transaction.chain,
            status: mappedStatus,
            confirmations: status.confirmations,
            blockNumber: status.blockNumber,
          },
          correlationId,
        });
      });

      await this.auditService.record({
        action: `crypto.transaction.${mappedStatus}`,
        entityType: 'crypto_transaction',
        entityId: txId,
        oldValue: { status: transaction.status },
        newValue: {
          status: mappedStatus,
          confirmations: status.confirmations,
          blockNumber: status.blockNumber,
        },
        correlationId,
      });
    }

    this.logger.logWithData(
      'info',
      'Transaction status polled',
      {
        transactionId: txId,
        txHash: transaction.txHash,
        previousStatus: transaction.status,
        newStatus: mappedStatus,
        confirmations: status.confirmations,
        correlationId,
      },
      'CryptoService',
    );

    return updated;
  }

  async getWalletsByUser(userId: string): Promise<CryptoWallet[]> {
    return this.db
      .select()
      .from(cryptoWallets)
      .where(
        and(
          eq(cryptoWallets.userId, userId),
          eq(cryptoWallets.isActive, true),
        ),
      )
      .orderBy(cryptoWallets.createdAt);
  }

  async getTransactionById(txId: string): Promise<CryptoTransaction> {
    const [transaction] = await this.db
      .select()
      .from(cryptoTransactions)
      .where(eq(cryptoTransactions.id, txId))
      .limit(1);

    if (!transaction) {
      throw new NotFoundException(`Transaction ${txId} not found`);
    }

    return transaction;
  }

  private async findWalletOrFail(walletId: string): Promise<CryptoWallet> {
    const [wallet] = await this.db
      .select()
      .from(cryptoWallets)
      .where(eq(cryptoWallets.id, walletId))
      .limit(1);

    if (!wallet) {
      throw new NotFoundException(`Wallet ${walletId} not found`);
    }

    return wallet;
  }

  private getAdapter(chain: SupportedChain): ChainAdapter {
    const adapter = this.adapters.get(chain);
    if (!adapter) {
      throw new BadRequestException(`Unsupported chain: ${chain}`);
    }
    return adapter;
  }

  private getDefaultToken(chain: SupportedChain): string {
    const defaults: Record<SupportedChain, string> = {
      ethereum: 'ETH',
      polygon: 'MATIC',
      solana: 'SOL',
    };
    return defaults[chain];
  }

  private mapTxStatus(
    status: string,
  ): 'pending' | 'confirmed' | 'failed' | 'reverted' {
    switch (status) {
      case 'confirmed':
        return 'confirmed';
      case 'failed':
        return 'failed';
      case 'reverted':
        return 'reverted';
      default:
        return 'pending';
    }
  }

  private encryptPrivateKey(privateKey: string): string {
    const iv = Buffer.from(randomUUID().replace(/-/g, '').slice(0, IV_LENGTH * 2), 'hex');
    const cipher = createCipheriv(ENCRYPTION_ALGORITHM, this.encryptionKey, iv);

    let encrypted = cipher.update(privateKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  private decryptPrivateKey(encryptedData: string): string {
    const [ivHex, authTagHex, encrypted] = encryptedData.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = createDecipheriv(
      ENCRYPTION_ALGORITHM,
      this.encryptionKey,
      iv,
    );
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}
