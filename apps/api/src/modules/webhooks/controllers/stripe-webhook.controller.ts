import {
  BadRequestException,
  Controller,
  Headers,
  Logger,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FastifyRequest } from 'fastify';
import Stripe from 'stripe';
import { PaymentService } from '@/modules/payments/services/payment.service';
import { StripeService } from '@/modules/payments/services/stripe.service';
import { SubscriptionService } from '@/modules/subscriptions/services/subscription.service';
import { AuditService } from '@/modules/audit/audit.service';
import { WebhookRetryService } from '../services/webhook-retry.service';

@Controller('webhooks')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly paymentService: PaymentService,
    private readonly stripeService: StripeService,
    private readonly subscriptionService: SubscriptionService,
    private readonly auditService: AuditService,
    private readonly webhookRetryService: WebhookRetryService,
  ) {
    this.stripe = this.stripeService.getStripeInstance();
    this.webhookSecret = this.configService.getOrThrow<string>(
      'STRIPE_WEBHOOK_SECRET',
    );
  }

  @Post('stripe')
  async handleStripeWebhook(
    @Req() req: RawBodyRequest<FastifyRequest>,
    @Headers('stripe-signature') signature: string,
  ): Promise<{ received: boolean }> {
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    let event: Stripe.Event;

    try {
      const rawBody = req.rawBody;
      if (!rawBody) {
        throw new BadRequestException('Missing raw body');
      }
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.webhookSecret,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error({
        message: 'Webhook signature verification failed',
        error: message,
      });
      throw new BadRequestException(
        `Webhook signature verification failed: ${message}`,
      );
    }

    this.logger.log({
      message: 'Stripe webhook received',
      eventId: event.id,
      eventType: event.type,
    });

    try {
      await this.routeEvent(event);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error({
        message: 'Error processing webhook event, scheduling retry',
        eventId: event.id,
        eventType: event.type,
        error: errorMessage,
      });

      await this.webhookRetryService.scheduleRetry(
        event.type,
        event,
        0,
        event.id,
        errorMessage,
      );
    }

    return { received: true };
  }

  private async routeEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await this.handlePaymentIntentSucceeded(
          event.data.object as Stripe.PaymentIntent,
          event.id,
        );
        break;

      case 'payment_intent.payment_failed':
        await this.handlePaymentIntentFailed(
          event.data.object as Stripe.PaymentIntent,
          event.id,
        );
        break;

      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(
          event.data.object as Stripe.Subscription,
          event.id,
        );
        break;

      case 'customer.subscription.deleted':
        await this.handleSubscriptionUpdated(
          event.data.object as Stripe.Subscription,
          event.id,
        );
        break;

      case 'invoice.paid':
        await this.handleInvoicePaid(
          event.data.object as Stripe.Invoice,
          event.id,
        );
        break;

      case 'invoice.payment_failed':
        await this.handleInvoicePaymentFailed(
          event.data.object as Stripe.Invoice,
          event.id,
        );
        break;

      case 'account.updated':
        await this.handleAccountUpdated(
          event.data.object as Stripe.Account,
          event.id,
        );
        break;

      case 'payout.paid':
        await this.handlePayoutCompleted(
          event.data.object as Stripe.Payout,
          event.id,
          'paid',
        );
        break;

      case 'payout.failed':
        await this.handlePayoutCompleted(
          event.data.object as Stripe.Payout,
          event.id,
          'failed',
        );
        break;

      case 'charge.refunded':
        await this.handleChargeRefunded(
          event.data.object as Stripe.Charge,
          event.id,
        );
        break;

      default:
        this.logger.log({
          message: 'Unhandled webhook event type',
          eventType: event.type,
          eventId: event.id,
        });
        break;
    }
  }

  private async handlePaymentIntentSucceeded(
    paymentIntent: Stripe.PaymentIntent,
    eventId: string,
  ): Promise<void> {
    this.logger.log({
      message: 'Processing payment_intent.succeeded',
      paymentIntentId: paymentIntent.id,
      eventId,
    });

    await this.paymentService.processPaymentSucceeded(paymentIntent);

    await this.auditService.record({
      action: 'webhook.payment_intent.succeeded',
      entityType: 'payment_intent',
      entityId: paymentIntent.id,
      newValue: {
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        status: paymentIntent.status,
      },
      metadata: { stripeEventId: eventId },
    });
  }

  private async handlePaymentIntentFailed(
    paymentIntent: Stripe.PaymentIntent,
    eventId: string,
  ): Promise<void> {
    this.logger.log({
      message: 'Processing payment_intent.payment_failed',
      paymentIntentId: paymentIntent.id,
      eventId,
    });

    const failureMessage =
      paymentIntent.last_payment_error?.message ?? 'Unknown failure';
    const failureCode = paymentIntent.last_payment_error?.code ?? 'unknown';

    await this.auditService.record({
      userId: paymentIntent.metadata.userId,
      action: 'webhook.payment_intent.failed',
      entityType: 'payment_intent',
      entityId: paymentIntent.id,
      newValue: {
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        status: paymentIntent.status,
        failureCode,
        failureMessage,
      },
      metadata: { stripeEventId: eventId },
    });
  }

  private async handleSubscriptionUpdated(
    subscription: Stripe.Subscription,
    eventId: string,
  ): Promise<void> {
    this.logger.log({
      message: 'Processing subscription update',
      subscriptionId: subscription.id,
      status: subscription.status,
      eventId,
    });

    await this.subscriptionService.updateSubscriptionFromWebhook(
      subscription.id,
      subscription,
    );

    await this.auditService.record({
      action: 'webhook.subscription.updated',
      entityType: 'subscription',
      entityId: subscription.id,
      newValue: {
        status: subscription.status,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      },
      metadata: { stripeEventId: eventId },
    });
  }

  private async handleInvoicePaid(
    invoice: Stripe.Invoice,
    eventId: string,
  ): Promise<void> {
    this.logger.log({
      message: 'Processing invoice.paid',
      invoiceId: invoice.id,
      subscriptionId: invoice.subscription,
      eventId,
    });

    await this.auditService.record({
      action: 'webhook.invoice.paid',
      entityType: 'invoice',
      entityId: invoice.id,
      newValue: {
        amountPaid: invoice.amount_paid,
        currency: invoice.currency,
        subscriptionId:
          typeof invoice.subscription === 'string'
            ? invoice.subscription
            : invoice.subscription?.id,
        status: invoice.status,
      },
      metadata: { stripeEventId: eventId },
    });
  }

  private async handleInvoicePaymentFailed(
    invoice: Stripe.Invoice,
    eventId: string,
  ): Promise<void> {
    this.logger.log({
      message: 'Processing invoice.payment_failed',
      invoiceId: invoice.id,
      subscriptionId: invoice.subscription,
      eventId,
    });

    const subscriptionId =
      typeof invoice.subscription === 'string'
        ? invoice.subscription
        : invoice.subscription?.id;

    if (subscriptionId) {
      await this.subscriptionService.updateSubscriptionFromWebhook(
        subscriptionId,
        { status: 'past_due' } as Stripe.Subscription,
      );
    }

    await this.auditService.record({
      action: 'webhook.invoice.payment_failed',
      entityType: 'invoice',
      entityId: invoice.id,
      newValue: {
        amountDue: invoice.amount_due,
        currency: invoice.currency,
        subscriptionId,
        attemptCount: invoice.attempt_count,
        nextPaymentAttempt: invoice.next_payment_attempt,
      },
      metadata: { stripeEventId: eventId },
    });
  }

  private async handleAccountUpdated(
    account: Stripe.Account,
    eventId: string,
  ): Promise<void> {
    this.logger.log({
      message: 'Processing account.updated',
      accountId: account.id,
      eventId,
    });

    await this.stripeService.updateAccountFromWebhook(account.id, account);

    await this.auditService.record({
      action: 'webhook.account.updated',
      entityType: 'stripe_account',
      entityId: account.id,
      newValue: {
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        detailsSubmitted: account.details_submitted,
      },
      metadata: { stripeEventId: eventId },
    });
  }

  private async handlePayoutCompleted(
    payout: Stripe.Payout,
    eventId: string,
    outcome: 'paid' | 'failed',
  ): Promise<void> {
    this.logger.log({
      message: `Processing payout.${outcome}`,
      payoutId: payout.id,
      amount: payout.amount,
      eventId,
    });

    await this.auditService.record({
      action: `webhook.payout.${outcome}`,
      entityType: 'payout',
      entityId: payout.id,
      newValue: {
        amount: payout.amount,
        currency: payout.currency,
        status: payout.status,
        arrivalDate: payout.arrival_date,
        failureCode: payout.failure_code,
        failureMessage: payout.failure_message,
      },
      metadata: {
        stripeEventId: eventId,
        userId: payout.metadata?.userId,
      },
    });
  }

  private async handleChargeRefunded(
    charge: Stripe.Charge,
    eventId: string,
  ): Promise<void> {
    this.logger.log({
      message: 'Processing charge.refunded',
      chargeId: charge.id,
      amountRefunded: charge.amount_refunded,
      eventId,
    });

    await this.auditService.record({
      action: 'webhook.charge.refunded',
      entityType: 'charge',
      entityId: charge.id,
      newValue: {
        amount: charge.amount,
        amountRefunded: charge.amount_refunded,
        currency: charge.currency,
        paymentIntentId:
          typeof charge.payment_intent === 'string'
            ? charge.payment_intent
            : charge.payment_intent?.id,
        refunded: charge.refunded,
      },
      metadata: { stripeEventId: eventId },
    });
  }
}
