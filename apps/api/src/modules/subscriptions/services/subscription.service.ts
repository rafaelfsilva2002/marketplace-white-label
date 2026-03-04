import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, and } from 'drizzle-orm';
import Stripe from 'stripe';
import {
  Database,
  subscriptions,
  stripeAccounts,
  users,
  type Subscription,
} from '@marketplace/database';
import { DATABASE_TOKEN } from '@/config/database.config';
import { OutboxService } from '@/common/events/outbox.service';
import { AuditService } from '@/modules/audit/audit.service';
import { PlanType } from '../dto/create-subscription.dto';

const PLAN_PRICE_MAP: Record<string, string> = {
  free: '',
  basic: 'price_basic',
  professional: 'price_professional',
  premium: 'price_premium',
};

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);
  private readonly stripe: Stripe;

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
    private readonly configService: ConfigService,
    private readonly outboxService: OutboxService,
    private readonly auditService: AuditService,
  ) {
    this.stripe = new Stripe(
      this.configService.getOrThrow<string>('STRIPE_SECRET_KEY'),
      { apiVersion: '2025-02-24.acacia' },
    );
  }

  private getPriceId(planType: string): string {
    const envKey = `STRIPE_PRICE_${planType.toUpperCase()}`;
    return this.configService.get<string>(envKey) ?? PLAN_PRICE_MAP[planType] ?? '';
  }

  async createSubscription(
    userId: string,
    email: string,
    planType: PlanType,
  ): Promise<Subscription> {
    const [existing] = await this.db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.userId, userId),
          eq(subscriptions.status, 'active'),
        ),
      )
      .limit(1);

    if (existing && existing.plan !== 'free') {
      throw new BadRequestException(
        'Active subscription already exists. Use upgrade/downgrade instead.',
      );
    }

    if (planType === PlanType.Free) {
      const [freeSub] = await this.db
        .insert(subscriptions)
        .values({
          userId,
          plan: 'free',
          status: 'active',
          features: { basicSearch: true },
        })
        .returning();

      await this.auditService.record({
        userId,
        action: 'subscription.created',
        entityType: 'subscription',
        entityId: freeSub.id,
        newValue: { plan: 'free', status: 'active' },
      });

      return freeSub;
    }

    const priceId = this.getPriceId(planType);
    if (!priceId) {
      throw new BadRequestException(`Invalid plan type: ${planType}`);
    }

    const customers = await this.stripe.customers.list({
      email,
      limit: 1,
    });

    let customerId: string;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    } else {
      const customer = await this.stripe.customers.create({
        email,
        metadata: { userId },
      });
      customerId = customer.id;
    }

    const stripeSubscription = await this.stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      metadata: { userId, planType },
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
    });

    const [subscription] = await this.db
      .insert(subscriptions)
      .values({
        userId,
        stripeSubscriptionId: stripeSubscription.id,
        stripePriceId: priceId,
        plan: planType as 'free' | 'basic' | 'professional' | 'premium',
        status: this.mapStripeStatus(stripeSubscription.status),
        currentPeriodStart: new Date(
          stripeSubscription.current_period_start * 1000,
        ),
        currentPeriodEnd: new Date(
          stripeSubscription.current_period_end * 1000,
        ),
        features: this.getFeaturesForPlan(planType),
      })
      .returning();

    await this.db.transaction(async (tx) => {
      await this.outboxService.writeEvent(tx, {
        eventType: 'marketplace.subscription.created',
        aggregateType: 'subscription',
        aggregateId: subscription.id,
        payload: {
          subscriptionId: subscription.id,
          userId,
          plan: planType,
          stripeSubscriptionId: stripeSubscription.id,
        },
      });
    });

    await this.auditService.record({
      userId,
      action: 'subscription.created',
      entityType: 'subscription',
      entityId: subscription.id,
      newValue: {
        plan: planType,
        status: subscription.status,
        stripeSubscriptionId: stripeSubscription.id,
      },
    });

    this.logger.log({
      message: 'Subscription created',
      userId,
      subscriptionId: subscription.id,
      plan: planType,
      stripeSubscriptionId: stripeSubscription.id,
    });

    return subscription;
  }

  async upgradeOrDowngrade(
    subscriptionId: string,
    userId: string,
    newPlanType: PlanType,
  ): Promise<Subscription> {
    const [subscription] = await this.db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.id, subscriptionId),
          eq(subscriptions.userId, userId),
        ),
      )
      .limit(1);

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    if (subscription.status !== 'active' && subscription.status !== 'trialing') {
      throw new BadRequestException(
        `Cannot modify subscription in status: ${subscription.status}`,
      );
    }

    if (subscription.plan === newPlanType) {
      throw new BadRequestException('Already on this plan');
    }

    const oldPlan = subscription.plan;

    if (newPlanType === PlanType.Free) {
      return this.cancelSubscription(subscriptionId, userId);
    }

    const priceId = this.getPriceId(newPlanType);
    if (!priceId) {
      throw new BadRequestException(`Invalid plan type: ${newPlanType}`);
    }

    if (subscription.stripeSubscriptionId) {
      const stripeSub = await this.stripe.subscriptions.retrieve(
        subscription.stripeSubscriptionId,
      );

      await this.stripe.subscriptions.update(
        subscription.stripeSubscriptionId,
        {
          items: [
            {
              id: stripeSub.items.data[0].id,
              price: priceId,
            },
          ],
          proration_behavior: 'always_invoice',
          metadata: { userId, planType: newPlanType },
        },
      );
    }

    const [updated] = await this.db
      .update(subscriptions)
      .set({
        plan: newPlanType as 'free' | 'basic' | 'professional' | 'premium',
        stripePriceId: priceId,
        features: this.getFeaturesForPlan(newPlanType),
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, subscriptionId))
      .returning();

    await this.db.transaction(async (tx) => {
      await this.outboxService.writeEvent(tx, {
        eventType: 'marketplace.subscription.updated',
        aggregateType: 'subscription',
        aggregateId: subscriptionId,
        payload: {
          subscriptionId,
          userId,
          oldPlan,
          newPlan: newPlanType,
        },
      });
    });

    await this.auditService.record({
      userId,
      action: 'subscription.plan_changed',
      entityType: 'subscription',
      entityId: subscriptionId,
      oldValue: { plan: oldPlan },
      newValue: { plan: newPlanType },
    });

    this.logger.log({
      message: 'Subscription plan changed',
      subscriptionId,
      userId,
      oldPlan,
      newPlan: newPlanType,
    });

    return updated;
  }

  async cancelSubscription(
    subscriptionId: string,
    userId: string,
  ): Promise<Subscription> {
    const [subscription] = await this.db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.id, subscriptionId),
          eq(subscriptions.userId, userId),
        ),
      )
      .limit(1);

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    if (subscription.status === 'canceled') {
      throw new BadRequestException('Subscription is already canceled');
    }

    if (subscription.stripeSubscriptionId) {
      await this.stripe.subscriptions.update(
        subscription.stripeSubscriptionId,
        { cancel_at_period_end: true },
      );
    }

    const [updated] = await this.db
      .update(subscriptions)
      .set({
        cancelAtPeriodEnd: 'true',
        canceledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, subscriptionId))
      .returning();

    await this.db.transaction(async (tx) => {
      await this.outboxService.writeEvent(tx, {
        eventType: 'marketplace.subscription.canceled',
        aggregateType: 'subscription',
        aggregateId: subscriptionId,
        payload: {
          subscriptionId,
          userId,
          plan: subscription.plan,
          cancelAtPeriodEnd: true,
        },
      });
    });

    await this.auditService.record({
      userId,
      action: 'subscription.canceled',
      entityType: 'subscription',
      entityId: subscriptionId,
      oldValue: { status: subscription.status },
      newValue: { cancelAtPeriodEnd: true, canceledAt: updated.canceledAt },
    });

    this.logger.log({
      message: 'Subscription canceled',
      subscriptionId,
      userId,
      plan: subscription.plan,
    });

    return updated;
  }

  async getSubscription(
    subscriptionId: string,
    userId: string,
  ): Promise<Subscription> {
    const [subscription] = await this.db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.id, subscriptionId),
          eq(subscriptions.userId, userId),
        ),
      )
      .limit(1);

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    return subscription;
  }

  async getActiveSubscription(userId: string): Promise<Subscription | null> {
    const [subscription] = await this.db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.userId, userId),
          eq(subscriptions.status, 'active'),
        ),
      )
      .limit(1);

    return subscription ?? null;
  }

  async updateSubscriptionFromWebhook(
    stripeSubscriptionId: string,
    data: Stripe.Subscription,
  ): Promise<void> {
    const status = this.mapStripeStatus(data.status);

    await this.db
      .update(subscriptions)
      .set({
        status,
        currentPeriodStart: new Date(data.current_period_start * 1000),
        currentPeriodEnd: new Date(data.current_period_end * 1000),
        cancelAtPeriodEnd: String(data.cancel_at_period_end),
        canceledAt: data.canceled_at
          ? new Date(data.canceled_at * 1000)
          : null,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId));

    this.logger.log({
      message: 'Subscription updated from webhook',
      stripeSubscriptionId,
      status,
    });
  }

  private mapStripeStatus(
    stripeStatus: Stripe.Subscription.Status,
  ): 'active' | 'past_due' | 'canceled' | 'trialing' | 'paused' | 'unpaid' {
    const statusMap: Record<string, 'active' | 'past_due' | 'canceled' | 'trialing' | 'paused' | 'unpaid'> = {
      active: 'active',
      past_due: 'past_due',
      canceled: 'canceled',
      trialing: 'trialing',
      paused: 'paused',
      unpaid: 'unpaid',
      incomplete: 'unpaid',
      incomplete_expired: 'canceled',
    };

    return statusMap[stripeStatus] ?? 'unpaid';
  }

  private getFeaturesForPlan(planType: PlanType): Record<string, boolean> {
    const featureMap: Record<PlanType, Record<string, boolean>> = {
      [PlanType.Free]: {
        basicSearch: true,
      },
      [PlanType.Basic]: {
        basicSearch: true,
        advancedFilters: true,
        messaging: true,
      },
      [PlanType.Professional]: {
        basicSearch: true,
        advancedFilters: true,
        messaging: true,
        analytics: true,
        prioritySupport: true,
        aiRecommendations: true,
      },
      [PlanType.Premium]: {
        basicSearch: true,
        advancedFilters: true,
        messaging: true,
        analytics: true,
        prioritySupport: true,
        aiRecommendations: true,
        customBranding: true,
        apiAccess: true,
        dedicatedSupport: true,
      },
    };

    return featureMap[planType] ?? featureMap[PlanType.Free];
  }
}
