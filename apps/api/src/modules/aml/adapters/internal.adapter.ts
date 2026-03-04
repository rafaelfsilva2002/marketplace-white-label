import { Injectable, Inject } from '@nestjs/common';
import { eq, and, gte, sql } from 'drizzle-orm';
import { DATABASE_TOKEN } from '@/config/database.config';
import {
  amlBlacklists,
  amlRateLimits,
  cryptoTransactions,
  users,
  fraudScores,
} from '@marketplace/database';
import type { Database } from '@marketplace/database';
import type { AmlProvider } from '../aml-provider.interface';
import type {
  ScreeningParams,
  ScreeningResult,
  WalletRiskResult,
  RiskFactor,
  Chain,
} from '../types';

const LARGE_TX_THRESHOLD_USD = 10_000;
const TRAVEL_RULE_THRESHOLD_USD = 1_000;
const VELOCITY_THRESHOLD_USER = 5;
const VELOCITY_THRESHOLD_WALLET = 10;
const VELOCITY_WINDOW_HOURS = 24;
const NEW_ACCOUNT_DAYS = 7;
const NEW_ACCOUNT_THRESHOLD_USD = 1_000;

@Injectable()
export class InternalAmlAdapter implements AmlProvider {
  constructor(@Inject(DATABASE_TOKEN) private readonly db: Database) {}

  async screenTransaction(params: ScreeningParams): Promise<ScreeningResult> {
    const factors: RiskFactor[] = [];
    let score = 0;

    // 1. Blacklist check
    if (
      (await this.isBlacklisted(params.fromAddress, params.chain)) ||
      (await this.isBlacklisted(params.toAddress, params.chain))
    ) {
      return {
        riskLevel: 'critical',
        score: 1.0,
        approved: false,
        requiresManualReview: false,
        factors: [
          {
            type: 'blacklist',
            description: 'Address is blacklisted',
            weight: 1.0,
          },
        ],
        travelRuleRequired: false,
      };
    }

    // 2. Velocity per user
    const userVelocity = await this.checkUserVelocity(params.userId);
    if (userVelocity > VELOCITY_THRESHOLD_USER) {
      score += 0.25;
      factors.push({
        type: 'velocity_user',
        description: `${userVelocity} txs in ${VELOCITY_WINDOW_HOURS}h (limit: ${VELOCITY_THRESHOLD_USER})`,
        weight: 0.25,
      });
    }

    // 3. Velocity per wallet
    const walletVelocity = await this.checkWalletVelocity(
      params.fromAddress,
      params.chain,
    );
    if (walletVelocity > VELOCITY_THRESHOLD_WALLET) {
      score += 0.2;
      factors.push({
        type: 'velocity_wallet',
        description: `${walletVelocity} txs from wallet in ${VELOCITY_WINDOW_HOURS}h`,
        weight: 0.2,
      });
    }

    // 4. Large transaction
    if (params.amountUsd > LARGE_TX_THRESHOLD_USD) {
      score += 0.2;
      factors.push({
        type: 'large_tx',
        description: `$${params.amountUsd} exceeds $${LARGE_TX_THRESHOLD_USD} threshold`,
        weight: 0.2,
      });
    }

    // 5. New account
    if (
      (await this.isNewAccount(params.userId)) &&
      params.amountUsd > NEW_ACCOUNT_THRESHOLD_USD
    ) {
      score += 0.2;
      factors.push({
        type: 'new_account',
        description: `Account < ${NEW_ACCOUNT_DAYS} days with tx > $${NEW_ACCOUNT_THRESHOLD_USD}`,
        weight: 0.2,
      });
    }

    // 6. Cross-check fraud score
    const profileRisk = await this.getProfileFraudScore(params.userId);
    if (profileRisk > 0.5) {
      score += 0.15;
      factors.push({
        type: 'fraud_crosscheck',
        description: `Profile fraud score: ${profileRisk.toFixed(2)}`,
        weight: 0.15,
      });
    }

    score = Math.min(score, 1.0);

    const riskLevel = this.mapRiskLevel(score);
    const approved = riskLevel !== 'critical';
    const requiresManualReview = riskLevel === 'high';
    const travelRuleRequired = params.amountUsd > TRAVEL_RULE_THRESHOLD_USD;

    await this.incrementWalletRate(
      params.fromAddress,
      params.chain,
      params.amountUsd,
    );

    return {
      riskLevel,
      score,
      approved,
      requiresManualReview,
      factors,
      travelRuleRequired,
    };
  }

  async screenWallet(address: string, chain: Chain): Promise<WalletRiskResult> {
    const blacklisted = await this.isBlacklisted(address, chain);
    return {
      address,
      riskLevel: blacklisted ? 'critical' : 'low',
      isBlacklisted: blacklisted,
      factors: blacklisted
        ? [
            {
              type: 'blacklist',
              description: 'Address is blacklisted',
              weight: 1.0,
            },
          ]
        : [],
    };
  }

  async isBlacklisted(address: string, chain?: Chain): Promise<boolean> {
    const result = await this.db
      .select({ id: amlBlacklists.id })
      .from(amlBlacklists)
      .where(
        and(
          eq(amlBlacklists.address, address.toLowerCase()),
          eq(amlBlacklists.isActive, true),
          chain
            ? sql`(${amlBlacklists.chain} = ${chain} OR ${amlBlacklists.chain} IS NULL)`
            : undefined,
        ),
      )
      .limit(1);
    return result.length > 0;
  }

  private async checkUserVelocity(userId: string): Promise<number> {
    const windowStart = new Date(
      Date.now() - VELOCITY_WINDOW_HOURS * 60 * 60 * 1000,
    );
    const result = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(cryptoTransactions)
      .innerJoin(
        sql`crypto_wallets`,
        sql`crypto_wallets.id = ${cryptoTransactions.walletId}`,
      )
      .where(
        and(
          sql`crypto_wallets.user_id = ${userId}`,
          gte(cryptoTransactions.createdAt, windowStart),
        ),
      );
    return result[0]?.count ?? 0;
  }

  private async checkWalletVelocity(
    address: string,
    chain: string,
  ): Promise<number> {
    const rateLimit = await this.db.query.amlRateLimits.findFirst({
      where: and(
        eq(amlRateLimits.walletAddress, address.toLowerCase()),
        eq(amlRateLimits.chain, chain),
      ),
    });

    if (!rateLimit) return 0;

    const windowExpired =
      new Date(
        rateLimit.windowStart.getTime() +
          rateLimit.windowHours * 60 * 60 * 1000,
      ) < new Date();
    if (windowExpired) return 0;

    return rateLimit.txCount;
  }

  private async incrementWalletRate(
    address: string,
    chain: string,
    amountUsd: number,
  ): Promise<void> {
    const existing = await this.db.query.amlRateLimits.findFirst({
      where: and(
        eq(amlRateLimits.walletAddress, address.toLowerCase()),
        eq(amlRateLimits.chain, chain),
      ),
    });

    if (!existing) {
      await this.db.insert(amlRateLimits).values({
        walletAddress: address.toLowerCase(),
        chain,
        txCount: 1,
        totalAmountUsd: amountUsd,
      });
      return;
    }

    const windowExpired =
      new Date(
        existing.windowStart.getTime() +
          existing.windowHours * 60 * 60 * 1000,
      ) < new Date();
    if (windowExpired) {
      await this.db
        .update(amlRateLimits)
        .set({
          txCount: 1,
          totalAmountUsd: amountUsd,
          windowStart: new Date(),
        })
        .where(eq(amlRateLimits.id, existing.id));
    } else {
      await this.db
        .update(amlRateLimits)
        .set({
          txCount: existing.txCount + 1,
          totalAmountUsd: existing.totalAmountUsd + amountUsd,
        })
        .where(eq(amlRateLimits.id, existing.id));
    }
  }

  private async isNewAccount(userId: string): Promise<boolean> {
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { createdAt: true },
    });
    if (!user) return true;
    const daysSinceCreation =
      (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceCreation < NEW_ACCOUNT_DAYS;
  }

  private async getProfileFraudScore(userId: string): Promise<number> {
    const latest = await this.db.query.fraudScores.findFirst({
      where: and(
        eq(fraudScores.userId, userId),
        gte(fraudScores.expiresAt, new Date()),
      ),
      orderBy: (fs, { desc }) => [desc(fs.evaluatedAt)],
    });
    return latest?.score ?? 0;
  }

  private mapRiskLevel(
    score: number,
  ): 'low' | 'medium' | 'high' | 'critical' {
    if (score >= 0.7) return 'critical';
    if (score >= 0.5) return 'high';
    if (score >= 0.3) return 'medium';
    return 'low';
  }
}
