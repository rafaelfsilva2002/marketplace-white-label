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
      input.userId, input.token, input.chain,
    );

    if (!balance || BigInt(balance.balance) < BigInt(input.amount)) {
      throw new BadRequestException('Insufficient crypto balance');
    }

    const totalAmount = BigInt(input.amount);
    const platformFee = (totalAmount * PLATFORM_FEE_PERCENT) / 100n;
    const professionalAmount = totalAmount - platformFee;

    // Debit user full amount
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

    // Credit professional (minus fee)
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
    const userWallet = await this.walletService.getWallet(input.userId, input.chain);
    const [tx] = await this.db
      .insert(cryptoTransactions)
      .values({
        walletId: userWallet!.id,
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

    await this.audit.record({
      userId: input.userId,
      action: 'crypto.payment.created',
      entityType: 'crypto_transaction',
      entityId: tx.id,
      newValue: {
        amount: input.amount,
        token: input.token,
        chain: input.chain,
        profileId: input.profileId,
      },
    });

    return tx;
  }
}
