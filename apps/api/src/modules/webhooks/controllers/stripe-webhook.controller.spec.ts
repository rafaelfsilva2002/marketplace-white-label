import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { StripeWebhookController } from './stripe-webhook.controller';
import type { FastifyRequest } from 'fastify';
import type Stripe from 'stripe';

function createMockStripeEvent(
  type: string,
  dataObject: Record<string, unknown>,
  id = 'evt_test_123',
): Stripe.Event {
  return {
    id,
    type,
    data: { object: dataObject },
  } as unknown as Stripe.Event;
}

function createMockRequest(
  rawBody: Buffer | undefined = Buffer.from('{}'),
): { rawBody: Buffer | undefined } {
  return { rawBody };
}

describe('StripeWebhookController', () => {
  let controller: StripeWebhookController;
  let mockPaymentService: Record<string, ReturnType<typeof vi.fn>>;
  let mockStripeService: Record<string, ReturnType<typeof vi.fn>>;
  let mockSubscriptionService: Record<string, ReturnType<typeof vi.fn>>;
  let mockAuditService: Record<string, ReturnType<typeof vi.fn>>;
  let mockConfigService: Record<string, ReturnType<typeof vi.fn>>;
  let mockWebhookRetryService: Record<string, ReturnType<typeof vi.fn>>;
  let mockStripeInstance: {
    webhooks: { constructEvent: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    mockStripeInstance = {
      webhooks: {
        constructEvent: vi.fn(),
      },
    };

    mockPaymentService = {
      processPaymentSucceeded: vi.fn().mockResolvedValue(undefined),
    };

    mockStripeService = {
      getStripeInstance: vi.fn().mockReturnValue(mockStripeInstance),
      updateAccountFromWebhook: vi.fn().mockResolvedValue(undefined),
    };

    mockSubscriptionService = {
      updateSubscriptionFromWebhook: vi.fn().mockResolvedValue(undefined),
    };

    mockAuditService = {
      record: vi.fn().mockResolvedValue(undefined),
    };

    mockConfigService = {
      getOrThrow: vi.fn().mockReturnValue('whsec_test_secret'),
    };

    mockWebhookRetryService = {
      scheduleRetry: vi.fn().mockResolvedValue(undefined),
    };

    controller = new StripeWebhookController(
      mockConfigService as any,
      mockPaymentService as any,
      mockStripeService as any,
      mockSubscriptionService as any,
      mockAuditService as any,
      mockWebhookRetryService as any,
    );
  });

  describe('signature verification', () => {
    it('should throw BadRequestException when stripe-signature header is missing', async () => {
      const req = createMockRequest();
      await expect(
        controller.handleStripeWebhook(req as any, ''),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when rawBody is missing', async () => {
      mockStripeInstance.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('No raw body');
      });

      const req = createMockRequest(undefined);
      await expect(
        controller.handleStripeWebhook(req as any, 'sig_test'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when signature verification fails', async () => {
      mockStripeInstance.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      const req = createMockRequest();
      await expect(
        controller.handleStripeWebhook(req as any, 'sig_invalid'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('event routing', () => {
    it('should return { received: true } for all valid events', async () => {
      const event = createMockStripeEvent('unknown.event', {});
      mockStripeInstance.webhooks.constructEvent.mockReturnValue(event);

      const req = createMockRequest();
      const result = await controller.handleStripeWebhook(
        req as any,
        'sig_valid',
      );

      expect(result).toEqual({ received: true });
    });

    it('should return { received: true } even when handler throws and schedule retry', async () => {
      const event = createMockStripeEvent('payment_intent.succeeded', {
        id: 'pi_123',
        amount: 1000,
        currency: 'brl',
        status: 'succeeded',
        metadata: { userId: 'u1', profileId: 'p1', idempotencyKey: 'ik1' },
      });
      mockStripeInstance.webhooks.constructEvent.mockReturnValue(event);
      mockPaymentService.processPaymentSucceeded.mockRejectedValue(
        new Error('DB error'),
      );

      const req = createMockRequest();
      const result = await controller.handleStripeWebhook(
        req as any,
        'sig_valid',
      );

      expect(result).toEqual({ received: true });
      expect(mockWebhookRetryService.scheduleRetry).toHaveBeenCalledWith(
        'payment_intent.succeeded',
        event,
        0,
        'evt_test_123',
        'DB error',
      );
    });
  });

  describe('payment_intent.succeeded', () => {
    it('should call paymentService.processPaymentSucceeded and audit', async () => {
      const paymentIntent = {
        id: 'pi_123',
        amount: 5000,
        currency: 'brl',
        status: 'succeeded',
        metadata: { userId: 'u1', profileId: 'p1', idempotencyKey: 'ik1' },
      };
      const event = createMockStripeEvent(
        'payment_intent.succeeded',
        paymentIntent,
      );
      mockStripeInstance.webhooks.constructEvent.mockReturnValue(event);

      const req = createMockRequest();
      await controller.handleStripeWebhook(req as any, 'sig_valid');

      expect(mockPaymentService.processPaymentSucceeded).toHaveBeenCalledWith(
        paymentIntent,
      );
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'webhook.payment_intent.succeeded',
          entityType: 'payment_intent',
          entityId: 'pi_123',
        }),
      );
    });
  });

  describe('payment_intent.payment_failed', () => {
    it('should audit the failure with error details', async () => {
      const paymentIntent = {
        id: 'pi_fail_123',
        amount: 3000,
        currency: 'brl',
        status: 'requires_payment_method',
        metadata: { userId: 'u1' },
        last_payment_error: {
          message: 'Card declined',
          code: 'card_declined',
        },
      };
      const event = createMockStripeEvent(
        'payment_intent.payment_failed',
        paymentIntent,
      );
      mockStripeInstance.webhooks.constructEvent.mockReturnValue(event);

      const req = createMockRequest();
      await controller.handleStripeWebhook(req as any, 'sig_valid');

      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'webhook.payment_intent.failed',
          entityType: 'payment_intent',
          entityId: 'pi_fail_123',
          newValue: expect.objectContaining({
            failureCode: 'card_declined',
            failureMessage: 'Card declined',
          }),
        }),
      );
    });

    it('should handle missing last_payment_error gracefully', async () => {
      const paymentIntent = {
        id: 'pi_fail_456',
        amount: 2000,
        currency: 'brl',
        status: 'requires_payment_method',
        metadata: {},
        last_payment_error: null,
      };
      const event = createMockStripeEvent(
        'payment_intent.payment_failed',
        paymentIntent,
      );
      mockStripeInstance.webhooks.constructEvent.mockReturnValue(event);

      const req = createMockRequest();
      await controller.handleStripeWebhook(req as any, 'sig_valid');

      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          newValue: expect.objectContaining({
            failureCode: 'unknown',
            failureMessage: 'Unknown failure',
          }),
        }),
      );
    });
  });

  describe('customer.subscription.updated', () => {
    it('should call subscriptionService and audit', async () => {
      const subscription = {
        id: 'sub_123',
        status: 'active',
        cancel_at_period_end: false,
      };
      const event = createMockStripeEvent(
        'customer.subscription.updated',
        subscription,
      );
      mockStripeInstance.webhooks.constructEvent.mockReturnValue(event);

      const req = createMockRequest();
      await controller.handleStripeWebhook(req as any, 'sig_valid');

      expect(
        mockSubscriptionService.updateSubscriptionFromWebhook,
      ).toHaveBeenCalledWith('sub_123', subscription);
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'webhook.subscription.updated',
          entityType: 'subscription',
          entityId: 'sub_123',
        }),
      );
    });
  });

  describe('customer.subscription.deleted', () => {
    it('should call subscriptionService with deleted subscription', async () => {
      const subscription = {
        id: 'sub_del_123',
        status: 'canceled',
        cancel_at_period_end: false,
      };
      const event = createMockStripeEvent(
        'customer.subscription.deleted',
        subscription,
      );
      mockStripeInstance.webhooks.constructEvent.mockReturnValue(event);

      const req = createMockRequest();
      await controller.handleStripeWebhook(req as any, 'sig_valid');

      expect(
        mockSubscriptionService.updateSubscriptionFromWebhook,
      ).toHaveBeenCalledWith('sub_del_123', subscription);
    });
  });

  describe('invoice.paid', () => {
    it('should audit invoice payment', async () => {
      const invoice = {
        id: 'inv_123',
        amount_paid: 9900,
        currency: 'brl',
        subscription: 'sub_123',
        status: 'paid',
      };
      const event = createMockStripeEvent('invoice.paid', invoice);
      mockStripeInstance.webhooks.constructEvent.mockReturnValue(event);

      const req = createMockRequest();
      await controller.handleStripeWebhook(req as any, 'sig_valid');

      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'webhook.invoice.paid',
          entityType: 'invoice',
          entityId: 'inv_123',
          newValue: expect.objectContaining({
            amountPaid: 9900,
            subscriptionId: 'sub_123',
          }),
        }),
      );
    });
  });

  describe('invoice.payment_failed', () => {
    it('should update subscription to past_due and audit', async () => {
      const invoice = {
        id: 'inv_fail_123',
        amount_due: 9900,
        currency: 'brl',
        subscription: 'sub_123',
        attempt_count: 2,
        next_payment_attempt: 1700000000,
      };
      const event = createMockStripeEvent(
        'invoice.payment_failed',
        invoice,
      );
      mockStripeInstance.webhooks.constructEvent.mockReturnValue(event);

      const req = createMockRequest();
      await controller.handleStripeWebhook(req as any, 'sig_valid');

      expect(
        mockSubscriptionService.updateSubscriptionFromWebhook,
      ).toHaveBeenCalledWith(
        'sub_123',
        expect.objectContaining({ status: 'past_due' }),
      );
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'webhook.invoice.payment_failed',
          entityType: 'invoice',
          entityId: 'inv_fail_123',
        }),
      );
    });

    it('should skip subscription update when no subscription id', async () => {
      const invoice = {
        id: 'inv_fail_456',
        amount_due: 5000,
        currency: 'brl',
        subscription: null,
        attempt_count: 1,
        next_payment_attempt: null,
      };
      const event = createMockStripeEvent(
        'invoice.payment_failed',
        invoice,
      );
      mockStripeInstance.webhooks.constructEvent.mockReturnValue(event);

      const req = createMockRequest();
      await controller.handleStripeWebhook(req as any, 'sig_valid');

      expect(
        mockSubscriptionService.updateSubscriptionFromWebhook,
      ).not.toHaveBeenCalled();
      expect(mockAuditService.record).toHaveBeenCalled();
    });
  });

  describe('account.updated', () => {
    it('should call stripeService.updateAccountFromWebhook and audit', async () => {
      const account = {
        id: 'acct_123',
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
      };
      const event = createMockStripeEvent('account.updated', account);
      mockStripeInstance.webhooks.constructEvent.mockReturnValue(event);

      const req = createMockRequest();
      await controller.handleStripeWebhook(req as any, 'sig_valid');

      expect(mockStripeService.updateAccountFromWebhook).toHaveBeenCalledWith(
        'acct_123',
        account,
      );
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'webhook.account.updated',
          entityType: 'stripe_account',
          entityId: 'acct_123',
        }),
      );
    });
  });

  describe('payout.paid', () => {
    it('should audit successful payout', async () => {
      const payout = {
        id: 'po_123',
        amount: 10000,
        currency: 'brl',
        status: 'paid',
        arrival_date: 1700000000,
        failure_code: null,
        failure_message: null,
        metadata: { userId: 'u1' },
      };
      const event = createMockStripeEvent('payout.paid', payout);
      mockStripeInstance.webhooks.constructEvent.mockReturnValue(event);

      const req = createMockRequest();
      await controller.handleStripeWebhook(req as any, 'sig_valid');

      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'webhook.payout.paid',
          entityType: 'payout',
          entityId: 'po_123',
          newValue: expect.objectContaining({
            amount: 10000,
            status: 'paid',
          }),
        }),
      );
    });
  });

  describe('payout.failed', () => {
    it('should audit failed payout with failure details', async () => {
      const payout = {
        id: 'po_fail_123',
        amount: 5000,
        currency: 'brl',
        status: 'failed',
        arrival_date: null,
        failure_code: 'account_closed',
        failure_message: 'Bank account has been closed',
        metadata: { userId: 'u1' },
      };
      const event = createMockStripeEvent('payout.failed', payout);
      mockStripeInstance.webhooks.constructEvent.mockReturnValue(event);

      const req = createMockRequest();
      await controller.handleStripeWebhook(req as any, 'sig_valid');

      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'webhook.payout.failed',
          entityType: 'payout',
          entityId: 'po_fail_123',
          newValue: expect.objectContaining({
            failureCode: 'account_closed',
            failureMessage: 'Bank account has been closed',
          }),
        }),
      );
    });
  });

  describe('charge.refunded', () => {
    it('should audit refund with charge details', async () => {
      const charge = {
        id: 'ch_123',
        amount: 5000,
        amount_refunded: 5000,
        currency: 'brl',
        payment_intent: 'pi_123',
        refunded: true,
      };
      const event = createMockStripeEvent('charge.refunded', charge);
      mockStripeInstance.webhooks.constructEvent.mockReturnValue(event);

      const req = createMockRequest();
      await controller.handleStripeWebhook(req as any, 'sig_valid');

      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'webhook.charge.refunded',
          entityType: 'charge',
          entityId: 'ch_123',
          newValue: expect.objectContaining({
            amount: 5000,
            amountRefunded: 5000,
            refunded: true,
            paymentIntentId: 'pi_123',
          }),
        }),
      );
    });
  });
});
