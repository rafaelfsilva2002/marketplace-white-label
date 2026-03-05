import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import Stripe from 'stripe';
import {
  Database,
  stripeAccounts,
  type StripeAccount,
} from '@marketplace/database';
import { DATABASE_TOKEN } from '@/config/database.config';

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly stripe: Stripe;

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
    private readonly configService: ConfigService,
  ) {
    this.stripe = new Stripe(
      this.configService.getOrThrow<string>('STRIPE_SECRET_KEY'),
      { apiVersion: '2025-02-24.acacia' },
    );
  }

  async createConnectAccount(
    userId: string,
    email: string,
  ): Promise<StripeAccount> {
    const [existing] = await this.db
      .select()
      .from(stripeAccounts)
      .where(eq(stripeAccounts.userId, userId))
      .limit(1);

    if (existing) {
      this.logger.log({
        message: 'Stripe Connect account already exists',
        userId,
        stripeAccountId: existing.stripeAccountId,
      });
      return existing;
    }

    const account = await this.withRetry(() =>
      this.stripe.accounts.create({
        type: 'express',
        country: 'BR',
        email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: { userId },
      }),
    );

    const [created] = await this.db
      .insert(stripeAccounts)
      .values({
        userId,
        stripeAccountId: account.id,
        status: 'pending',
        chargesEnabled: String(account.charges_enabled),
        payoutsEnabled: String(account.payouts_enabled),
        detailsSubmitted: String(account.details_submitted),
        metadata: { stripeAccountType: account.type },
      })
      .returning();

    this.logger.log({
      message: 'Stripe Connect account created',
      userId,
      stripeAccountId: account.id,
    });

    return created;
  }

  async createAccountLink(
    userId: string,
    refreshUrl: string,
    returnUrl: string,
  ): Promise<string> {
    const [account] = await this.db
      .select()
      .from(stripeAccounts)
      .where(eq(stripeAccounts.userId, userId))
      .limit(1);

    if (!account) {
      throw new Error(
        'No Stripe Connect account found. Create one first.',
      );
    }

    const accountLink = await this.withRetry(() =>
      this.stripe.accountLinks.create({
        account: account.stripeAccountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: 'account_onboarding',
      }),
    );

    return accountLink.url;
  }

  async getAccountStatus(
    userId: string,
  ): Promise<{
    status: string;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
  }> {
    const [account] = await this.db
      .select()
      .from(stripeAccounts)
      .where(eq(stripeAccounts.userId, userId))
      .limit(1);

    if (!account) {
      return {
        status: 'not_created',
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
      };
    }

    const stripeAccount = await this.withRetry(() =>
      this.stripe.accounts.retrieve(account.stripeAccountId),
    );

    const updatedStatus = stripeAccount.charges_enabled
      ? 'active'
      : stripeAccount.details_submitted
        ? 'restricted'
        : 'pending';

    await this.db
      .update(stripeAccounts)
      .set({
        status: updatedStatus as 'pending' | 'active' | 'restricted' | 'disabled',
        chargesEnabled: String(stripeAccount.charges_enabled),
        payoutsEnabled: String(stripeAccount.payouts_enabled),
        detailsSubmitted: String(stripeAccount.details_submitted),
        updatedAt: new Date(),
      })
      .where(eq(stripeAccounts.id, account.id));

    return {
      status: updatedStatus,
      chargesEnabled: stripeAccount.charges_enabled ?? false,
      payoutsEnabled: stripeAccount.payouts_enabled ?? false,
      detailsSubmitted: stripeAccount.details_submitted ?? false,
    };
  }

  async getStripeAccountByUserId(
    userId: string,
  ): Promise<StripeAccount | null> {
    const [account] = await this.db
      .select()
      .from(stripeAccounts)
      .where(eq(stripeAccounts.userId, userId))
      .limit(1);

    return account ?? null;
  }

  async updateAccountFromWebhook(
    stripeAccountId: string,
    data: Stripe.Account,
  ): Promise<void> {
    const updatedStatus = data.charges_enabled
      ? 'active'
      : data.details_submitted
        ? 'restricted'
        : 'pending';

    await this.db
      .update(stripeAccounts)
      .set({
        status: updatedStatus as 'pending' | 'active' | 'restricted' | 'disabled',
        chargesEnabled: String(data.charges_enabled),
        payoutsEnabled: String(data.payouts_enabled),
        detailsSubmitted: String(data.details_submitted),
        updatedAt: new Date(),
      })
      .where(eq(stripeAccounts.stripeAccountId, stripeAccountId));

    this.logger.log({
      message: 'Stripe account updated from webhook',
      stripeAccountId,
      status: updatedStatus,
    });
  }

  getStripeInstance(): Stripe {
    return this.stripe;
  }

  /**
   * Retries a function with exponential backoff for transient Stripe errors.
   * Backoff schedule: 500ms, 1000ms, 2000ms.
   * Only retries on network errors, 429 rate limit, and 5xx server errors.
   * Does NOT retry on 4xx client errors (invalid card, auth failures, etc.).
   */
  private async withRetry<T>(
    fn: () => Promise<T>,
    maxRetries = 3,
  ): Promise<T> {
    const baseDelay = 500;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: unknown) {
        const isLastAttempt = attempt === maxRetries;

        if (isLastAttempt || !this.isTransientError(error)) {
          throw error;
        }

        const delay = baseDelay * Math.pow(2, attempt - 1);

        this.logger.warn({
          message: `Stripe API call failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms`,
          error: error instanceof Error ? error.message : String(error),
          statusCode:
            error instanceof Stripe.errors.StripeAPIError
              ? error.statusCode
              : undefined,
        });

        await this.sleep(delay);
      }
    }

    // Unreachable, but TypeScript needs it
    throw new Error('withRetry: exhausted all retries');
  }

  private isTransientError(error: unknown): boolean {
    // Network / connection errors (no HTTP status)
    if (error instanceof Stripe.errors.StripeConnectionError) {
      return true;
    }

    // Rate limit (429)
    if (error instanceof Stripe.errors.StripeRateLimitError) {
      return true;
    }

    // Generic Stripe API error — retry only on 5xx
    if (error instanceof Stripe.errors.StripeAPIError) {
      const status = error.statusCode;
      return status !== undefined && status >= 500;
    }

    // Non-Stripe errors (e.g. fetch/network layer) — treat as transient
    if (
      error instanceof Error &&
      ('code' in error || error.message.includes('ECONNRESET') || error.message.includes('ETIMEDOUT'))
    ) {
      return true;
    }

    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
