import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import Stripe from 'stripe';
import { Database, stripeAccounts } from '@marketplace/database';
import { DATABASE_TOKEN } from '@/config/database.config';
import { OutboxService } from '@/common/events/outbox.service';
import { AuditService } from '@/modules/audit/audit.service';
import { StripeService } from './stripe.service';
import { WalletService } from './wallet.service';

export interface CreatePaymentInput {
  userId: string;
  profileId: string;
  amount: number;
  description?: string;
  idempotencyKey: string;
}

export interface PaymentResult {
  paymentIntentId: string;
  clientSecret: string;
  status: string;
  amount: number;
  currency: string;
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly stripe: Stripe;

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
    private readonly configService: ConfigService,
    private readonly stripeService: StripeService,
    private readonly walletService: WalletService,
    private readonly outboxService: OutboxService,
    private readonly auditService: AuditService,
  ) {
    this.stripe = this.stripeService.getStripeInstance();
  }

  async createPayment(input: CreatePaymentInput): Promise<PaymentResult> {
    const [professionalAccount] = await this.db
      .select()
      .from(stripeAccounts)
      .where(eq(stripeAccounts.userId, input.profileId))
      .limit(1);

    const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
      amount: input.amount,
      currency: 'brl',
      description: input.description ?? 'Marketplace payment',
      metadata: {
        userId: input.userId,
        profileId: input.profileId,
        idempotencyKey: input.idempotencyKey,
      },
    };

    if (professionalAccount) {
      const platformFee = Math.round(input.amount * 0.1);
      paymentIntentParams.application_fee_amount = platformFee;
      paymentIntentParams.transfer_data = {
        destination: professionalAccount.stripeAccountId,
      };
    }

    const paymentIntent = await this.stripe.paymentIntents.create(
      paymentIntentParams,
      { idempotencyKey: input.idempotencyKey },
    );

    await this.auditService.record({
      userId: input.userId,
      action: 'payment.created',
      entityType: 'payment_intent',
      entityId: paymentIntent.id,
      newValue: {
        amount: input.amount,
        profileId: input.profileId,
        status: paymentIntent.status,
      },
      metadata: { idempotencyKey: input.idempotencyKey },
    });

    this.logger.log({
      message: 'Payment intent created',
      paymentIntentId: paymentIntent.id,
      userId: input.userId,
      profileId: input.profileId,
      amount: input.amount,
      idempotencyKey: input.idempotencyKey,
    });

    return {
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret!,
      status: paymentIntent.status,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
    };
  }

  async confirmPayment(
    paymentIntentId: string,
    userId: string,
  ): Promise<{ status: string }> {
    const paymentIntent =
      await this.stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.metadata.userId !== userId) {
      throw new BadRequestException(
        'Payment intent does not belong to this user',
      );
    }

    if (paymentIntent.status === 'succeeded') {
      return { status: 'succeeded' };
    }

    if (paymentIntent.status !== 'requires_confirmation') {
      throw new BadRequestException(
        `Payment cannot be confirmed in status: ${paymentIntent.status}`,
      );
    }

    const confirmed = await this.stripe.paymentIntents.confirm(
      paymentIntentId,
    );

    await this.auditService.record({
      userId,
      action: 'payment.confirmed',
      entityType: 'payment_intent',
      entityId: paymentIntentId,
      oldValue: { status: paymentIntent.status },
      newValue: { status: confirmed.status },
    });

    this.logger.log({
      message: 'Payment intent confirmed',
      paymentIntentId,
      userId,
      status: confirmed.status,
    });

    return { status: confirmed.status };
  }

  async processPaymentSucceeded(
    paymentIntent: Stripe.PaymentIntent,
  ): Promise<void> {
    const { userId, profileId, idempotencyKey } = paymentIntent.metadata;

    if (!profileId || !idempotencyKey) {
      this.logger.warn({
        message: 'Payment intent missing required metadata',
        paymentIntentId: paymentIntent.id,
      });
      return;
    }

    const creditIdempotencyKey = `credit_${idempotencyKey}`;
    const platformFeePercent = 0.1;
    const totalAmount = paymentIntent.amount;
    const platformFee = Math.round(totalAmount * platformFeePercent);
    const professionalAmount = totalAmount - platformFee;

    await this.walletService.credit(
      profileId,
      professionalAmount,
      creditIdempotencyKey,
      `Payment received: ${paymentIntent.description ?? 'Marketplace payment'}`,
      'payment_intent',
      paymentIntent.id,
    );

    await this.db.transaction(async (tx) => {
      await this.outboxService.writeEvent(tx, {
        eventType: 'marketplace.payment.succeeded',
        aggregateType: 'payment',
        aggregateId: paymentIntent.id,
        payload: {
          paymentIntentId: paymentIntent.id,
          userId,
          profileId,
          amount: totalAmount,
          platformFee,
          professionalAmount,
          currency: paymentIntent.currency,
          idempotencyKey,
        },
      });
    });

    await this.auditService.record({
      userId,
      action: 'payment.succeeded',
      entityType: 'payment_intent',
      entityId: paymentIntent.id,
      newValue: {
        amount: totalAmount,
        platformFee,
        professionalAmount,
        profileId,
      },
      metadata: { idempotencyKey },
    });

    this.logger.log({
      message: 'Payment succeeded processed',
      paymentIntentId: paymentIntent.id,
      userId,
      profileId,
      totalAmount,
      professionalAmount,
      platformFee,
    });
  }

  async createPayout(
    userId: string,
    amount: number,
    idempotencyKey: string,
  ): Promise<{ payoutId: string; status: string }> {
    const stripeAccount =
      await this.stripeService.getStripeAccountByUserId(userId);

    if (!stripeAccount) {
      throw new NotFoundException(
        'No Stripe Connect account found. Create one first.',
      );
    }

    if (stripeAccount.payoutsEnabled !== 'true') {
      throw new BadRequestException(
        'Payouts are not enabled for this account. Complete onboarding first.',
      );
    }

    const debitIdempotencyKey = `payout_debit_${idempotencyKey}`;

    await this.walletService.debit(
      userId,
      amount,
      debitIdempotencyKey,
      'Withdrawal payout',
      'payout',
      undefined,
    );

    const payout = await this.stripe.payouts.create(
      {
        amount,
        currency: 'brl',
        metadata: { userId, idempotencyKey },
      },
      {
        stripeAccount: stripeAccount.stripeAccountId,
        idempotencyKey,
      },
    );

    await this.db.transaction(async (tx) => {
      await this.outboxService.writeEvent(tx, {
        eventType: 'marketplace.payout.created',
        aggregateType: 'payout',
        aggregateId: payout.id,
        payload: {
          payoutId: payout.id,
          userId,
          amount,
          currency: 'brl',
          idempotencyKey,
        },
      });
    });

    await this.auditService.record({
      userId,
      action: 'payout.created',
      entityType: 'payout',
      entityId: payout.id,
      newValue: { amount, status: payout.status },
      metadata: { idempotencyKey },
    });

    this.logger.log({
      message: 'Payout created',
      payoutId: payout.id,
      userId,
      amount,
      idempotencyKey,
    });

    return { payoutId: payout.id, status: payout.status };
  }
}
