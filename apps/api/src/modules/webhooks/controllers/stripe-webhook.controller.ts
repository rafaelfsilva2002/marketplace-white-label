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
      this.logger.error({
        message: 'Error processing webhook event',
        eventId: event.id,
        eventType: event.type,
        error: error instanceof Error ? error.message : String(error),
      });
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

      case 'account.updated':
        await this.handleAccountUpdated(
          event.data.object as Stripe.Account,
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
}
