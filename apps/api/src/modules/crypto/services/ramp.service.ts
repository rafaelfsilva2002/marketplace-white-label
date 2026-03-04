import { Injectable, Inject } from '@nestjs/common';
import { DATABASE_TOKEN } from '@/config/database.config';
import { CRYPTO_GATEWAY, type CryptoGateway, type Chain, type Token } from '@marketplace/crypto-gateway';
import { OutboxService } from '@/common/events/outbox.service';
import { CryptoBalanceService } from './crypto-balance.service';
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
    private readonly outbox: OutboxService,
  ) {}

  async getQuote(params: { fromCurrency: string; toCurrency: string; amount: string }) {
    return this.gateway.getQuote(params);
  }

  async buyWithBrl(input: BuyWithBrlInput) {
    // Credit crypto balance (BRL debit would be handled by payment processor)
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
