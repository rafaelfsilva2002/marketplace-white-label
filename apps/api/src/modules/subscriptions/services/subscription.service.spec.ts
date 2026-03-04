import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { PlanType } from '../dto/create-subscription.dto';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function chainedSelect(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

function chainedInsert(rows: unknown[]) {
  return {
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(rows),
    }),
  };
}

function chainedUpdate(rows: unknown[]) {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

const NOW = new Date('2025-06-01T00:00:00Z');
const PERIOD_END = new Date('2025-07-01T00:00:00Z');

const FAKE_FREE_SUB = {
  id: 'sub-uuid-free',
  userId: 'user-uuid-1',
  plan: 'free' as const,
  status: 'active' as const,
  stripeSubscriptionId: null,
  stripePriceId: null,
  features: { basicSearch: true },
  currentPeriodStart: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: null,
  canceledAt: null,
  createdAt: NOW,
  updatedAt: NOW,
};

const FAKE_PAID_SUB = {
  id: 'sub-uuid-paid',
  userId: 'user-uuid-1',
  plan: 'professional' as const,
  status: 'active' as const,
  stripeSubscriptionId: 'sub_stripe_123',
  stripePriceId: 'price_professional',
  features: {
    basicSearch: true,
    advancedFilters: true,
    messaging: true,
    analytics: true,
    prioritySupport: true,
    aiRecommendations: true,
  },
  currentPeriodStart: NOW,
  currentPeriodEnd: PERIOD_END,
  cancelAtPeriodEnd: null,
  canceledAt: null,
  createdAt: NOW,
  updatedAt: NOW,
};

// Mock Stripe
const mockStripeCustomersList = vi.fn();
const mockStripeCustomersCreate = vi.fn();
const mockStripeSubscriptionsCreate = vi.fn();
const mockStripeSubscriptionsUpdate = vi.fn();
const mockStripeSubscriptionsRetrieve = vi.fn();

vi.mock('stripe', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      customers: {
        list: mockStripeCustomersList,
        create: mockStripeCustomersCreate,
      },
      subscriptions: {
        create: mockStripeSubscriptionsCreate,
        update: mockStripeSubscriptionsUpdate,
        retrieve: mockStripeSubscriptionsRetrieve,
      },
    })),
  };
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SubscriptionService', () => {
  let service: SubscriptionService;
  let mockDb: Record<string, any>;
  let mockConfigService: Record<string, ReturnType<typeof vi.fn>>;
  let mockOutboxService: Record<string, ReturnType<typeof vi.fn>>;
  let mockAuditService: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDb = {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      transaction: vi.fn().mockImplementation(async (cb: Function) => cb({})),
    };

    mockConfigService = {
      getOrThrow: vi.fn().mockReturnValue('sk_test_fake_key'),
      get: vi.fn().mockImplementation((key: string) => {
        const map: Record<string, string> = {
          STRIPE_PRICE_BASIC: 'price_basic',
          STRIPE_PRICE_PROFESSIONAL: 'price_professional',
          STRIPE_PRICE_PREMIUM: 'price_premium',
        };
        return map[key];
      }),
    };

    mockOutboxService = {
      writeEvent: vi.fn().mockResolvedValue(undefined),
    };

    mockAuditService = {
      record: vi.fn().mockResolvedValue(undefined),
    };

    service = new SubscriptionService(
      mockDb as any,
      mockConfigService as any,
      mockOutboxService as any,
      mockAuditService as any,
    );
  });

  // -------------------------------------------------------------------------
  // createSubscription
  // -------------------------------------------------------------------------

  describe('createSubscription', () => {
    it('should create a free subscription without calling Stripe', async () => {
      // No existing active subscription
      mockDb.select.mockReturnValue(chainedSelect([]));
      mockDb.insert.mockReturnValue(chainedInsert([FAKE_FREE_SUB]));

      const result = await service.createSubscription(
        'user-uuid-1',
        'user@test.com',
        PlanType.Free,
      );

      expect(result).toEqual(FAKE_FREE_SUB);
      expect(result.plan).toBe('free');
      expect(result.status).toBe('active');
      expect(mockStripeCustomersList).not.toHaveBeenCalled();
      expect(mockStripeSubscriptionsCreate).not.toHaveBeenCalled();
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-uuid-1',
          action: 'subscription.created',
          entityType: 'subscription',
          entityId: FAKE_FREE_SUB.id,
        }),
      );
    });

    it('should create a paid subscription with Stripe', async () => {
      // No existing active subscription
      mockDb.select.mockReturnValue(chainedSelect([]));

      // Stripe customer exists
      mockStripeCustomersList.mockResolvedValue({
        data: [{ id: 'cus_existing_123' }],
      });

      // Stripe creates subscription
      const stripeSubResponse = {
        id: 'sub_stripe_123',
        status: 'active',
        current_period_start: Math.floor(NOW.getTime() / 1000),
        current_period_end: Math.floor(PERIOD_END.getTime() / 1000),
      };
      mockStripeSubscriptionsCreate.mockResolvedValue(stripeSubResponse);

      mockDb.insert.mockReturnValue(chainedInsert([FAKE_PAID_SUB]));

      const result = await service.createSubscription(
        'user-uuid-1',
        'user@test.com',
        PlanType.Professional,
      );

      expect(result.plan).toBe('professional');
      expect(result.stripeSubscriptionId).toBe('sub_stripe_123');
      expect(mockStripeCustomersList).toHaveBeenCalledWith({
        email: 'user@test.com',
        limit: 1,
      });
      expect(mockStripeSubscriptionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_existing_123',
          items: [{ price: 'price_professional' }],
        }),
      );
    });

    it('should create a new Stripe customer if none exists', async () => {
      mockDb.select.mockReturnValue(chainedSelect([]));

      mockStripeCustomersList.mockResolvedValue({ data: [] });
      mockStripeCustomersCreate.mockResolvedValue({
        id: 'cus_new_456',
      });

      const stripeSubResponse = {
        id: 'sub_stripe_new',
        status: 'active',
        current_period_start: Math.floor(NOW.getTime() / 1000),
        current_period_end: Math.floor(PERIOD_END.getTime() / 1000),
      };
      mockStripeSubscriptionsCreate.mockResolvedValue(stripeSubResponse);

      mockDb.insert.mockReturnValue(
        chainedInsert([
          { ...FAKE_PAID_SUB, stripeSubscriptionId: 'sub_stripe_new' },
        ]),
      );

      await service.createSubscription(
        'user-uuid-1',
        'newuser@test.com',
        PlanType.Professional,
      );

      expect(mockStripeCustomersCreate).toHaveBeenCalledWith({
        email: 'newuser@test.com',
        metadata: { userId: 'user-uuid-1' },
      });
      expect(mockStripeSubscriptionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ customer: 'cus_new_456' }),
      );
    });

    it('should throw BadRequestException when active paid subscription exists', async () => {
      // Existing active paid subscription
      mockDb.select.mockReturnValue(chainedSelect([FAKE_PAID_SUB]));

      await expect(
        service.createSubscription(
          'user-uuid-1',
          'user@test.com',
          PlanType.Basic,
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.createSubscription(
          'user-uuid-1',
          'user@test.com',
          PlanType.Basic,
        ),
      ).rejects.toThrow('Active subscription already exists');
    });

    it('should allow creating a paid subscription when only a free subscription exists', async () => {
      // Existing free subscription
      mockDb.select.mockReturnValue(chainedSelect([FAKE_FREE_SUB]));

      mockStripeCustomersList.mockResolvedValue({
        data: [{ id: 'cus_123' }],
      });

      const stripeSubResponse = {
        id: 'sub_stripe_upgrade',
        status: 'active',
        current_period_start: Math.floor(NOW.getTime() / 1000),
        current_period_end: Math.floor(PERIOD_END.getTime() / 1000),
      };
      mockStripeSubscriptionsCreate.mockResolvedValue(stripeSubResponse);

      const basicSub = {
        ...FAKE_PAID_SUB,
        plan: 'basic' as const,
        stripeSubscriptionId: 'sub_stripe_upgrade',
      };
      mockDb.insert.mockReturnValue(chainedInsert([basicSub]));

      const result = await service.createSubscription(
        'user-uuid-1',
        'user@test.com',
        PlanType.Basic,
      );

      expect(result.plan).toBe('basic');
    });

    it('should publish outbox event after creating paid subscription', async () => {
      mockDb.select.mockReturnValue(chainedSelect([]));

      mockStripeCustomersList.mockResolvedValue({
        data: [{ id: 'cus_123' }],
      });
      mockStripeSubscriptionsCreate.mockResolvedValue({
        id: 'sub_stripe_evt',
        status: 'active',
        current_period_start: Math.floor(NOW.getTime() / 1000),
        current_period_end: Math.floor(PERIOD_END.getTime() / 1000),
      });

      mockDb.insert.mockReturnValue(chainedInsert([FAKE_PAID_SUB]));

      await service.createSubscription(
        'user-uuid-1',
        'user@test.com',
        PlanType.Professional,
      );

      expect(mockDb.transaction).toHaveBeenCalled();
      expect(mockOutboxService.writeEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          eventType: 'marketplace.subscription.created',
          aggregateType: 'subscription',
          aggregateId: FAKE_PAID_SUB.id,
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // cancelSubscription
  // -------------------------------------------------------------------------

  describe('cancelSubscription', () => {
    it('should cancel a Stripe subscription and mark cancelAtPeriodEnd', async () => {
      mockDb.select.mockReturnValue(chainedSelect([FAKE_PAID_SUB]));

      const canceledSub = {
        ...FAKE_PAID_SUB,
        cancelAtPeriodEnd: 'true',
        canceledAt: NOW,
      };
      mockDb.update.mockReturnValue(chainedUpdate([canceledSub]));

      mockStripeSubscriptionsUpdate.mockResolvedValue({});

      const result = await service.cancelSubscription(
        'sub-uuid-paid',
        'user-uuid-1',
      );

      expect(result.cancelAtPeriodEnd).toBe('true');
      expect(result.canceledAt).toEqual(NOW);
      expect(mockStripeSubscriptionsUpdate).toHaveBeenCalledWith(
        'sub_stripe_123',
        { cancel_at_period_end: true },
      );
    });

    it('should throw NotFoundException when subscription does not exist', async () => {
      mockDb.select.mockReturnValue(chainedSelect([]));

      await expect(
        service.cancelSubscription('nonexistent-id', 'user-uuid-1'),
      ).rejects.toThrow(NotFoundException);

      await expect(
        service.cancelSubscription('nonexistent-id', 'user-uuid-1'),
      ).rejects.toThrow('Subscription not found');
    });

    it('should throw BadRequestException when subscription is already canceled', async () => {
      const alreadyCanceled = {
        ...FAKE_PAID_SUB,
        status: 'canceled' as const,
      };
      mockDb.select.mockReturnValue(chainedSelect([alreadyCanceled]));

      await expect(
        service.cancelSubscription('sub-uuid-paid', 'user-uuid-1'),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.cancelSubscription('sub-uuid-paid', 'user-uuid-1'),
      ).rejects.toThrow('Subscription is already canceled');
    });

    it('should cancel without calling Stripe for subscriptions without stripeSubscriptionId', async () => {
      const noStripeSub = {
        ...FAKE_PAID_SUB,
        stripeSubscriptionId: null,
      };
      mockDb.select.mockReturnValue(chainedSelect([noStripeSub]));

      const canceledSub = {
        ...noStripeSub,
        cancelAtPeriodEnd: 'true',
        canceledAt: NOW,
      };
      mockDb.update.mockReturnValue(chainedUpdate([canceledSub]));

      await service.cancelSubscription('sub-uuid-paid', 'user-uuid-1');

      expect(mockStripeSubscriptionsUpdate).not.toHaveBeenCalled();
    });

    it('should publish outbox event after canceling', async () => {
      mockDb.select.mockReturnValue(chainedSelect([FAKE_PAID_SUB]));

      const canceledSub = {
        ...FAKE_PAID_SUB,
        cancelAtPeriodEnd: 'true',
        canceledAt: NOW,
      };
      mockDb.update.mockReturnValue(chainedUpdate([canceledSub]));
      mockStripeSubscriptionsUpdate.mockResolvedValue({});

      await service.cancelSubscription('sub-uuid-paid', 'user-uuid-1');

      expect(mockOutboxService.writeEvent).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          eventType: 'marketplace.subscription.canceled',
          aggregateType: 'subscription',
          aggregateId: 'sub-uuid-paid',
        }),
      );
    });

    it('should record an audit entry after canceling', async () => {
      mockDb.select.mockReturnValue(chainedSelect([FAKE_PAID_SUB]));

      const canceledSub = {
        ...FAKE_PAID_SUB,
        cancelAtPeriodEnd: 'true',
        canceledAt: NOW,
      };
      mockDb.update.mockReturnValue(chainedUpdate([canceledSub]));
      mockStripeSubscriptionsUpdate.mockResolvedValue({});

      await service.cancelSubscription('sub-uuid-paid', 'user-uuid-1');

      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-uuid-1',
          action: 'subscription.canceled',
          entityType: 'subscription',
          entityId: 'sub-uuid-paid',
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // getSubscription
  // -------------------------------------------------------------------------

  describe('getSubscription', () => {
    it('should return the subscription for user', async () => {
      mockDb.select.mockReturnValue(chainedSelect([FAKE_PAID_SUB]));

      const result = await service.getSubscription(
        'sub-uuid-paid',
        'user-uuid-1',
      );

      expect(result).toEqual(FAKE_PAID_SUB);
      expect(result.plan).toBe('professional');
    });

    it('should throw NotFoundException when subscription does not exist', async () => {
      mockDb.select.mockReturnValue(chainedSelect([]));

      await expect(
        service.getSubscription('nonexistent', 'user-uuid-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // getActiveSubscription
  // -------------------------------------------------------------------------

  describe('getActiveSubscription', () => {
    it('should return the active subscription', async () => {
      mockDb.select.mockReturnValue(chainedSelect([FAKE_PAID_SUB]));

      const result = await service.getActiveSubscription('user-uuid-1');

      expect(result).toEqual(FAKE_PAID_SUB);
      expect(result!.status).toBe('active');
    });

    it('should return null when no active subscription exists', async () => {
      mockDb.select.mockReturnValue(chainedSelect([]));

      const result = await service.getActiveSubscription('user-uuid-1');

      expect(result).toBeNull();
    });
  });
});
