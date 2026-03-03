import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, and, gte, sql } from 'drizzle-orm';
import {
  Database,
  cryptoTransactions,
  users,
} from '@marketplace/database';
import { DATABASE_TOKEN } from '@/config/database.config';
import { StructuredLogger } from '@/common/logger/structured.logger';
import { getCorrelationId } from '@/common/interceptors/correlation-id.interceptor';
import { AuditService } from '@/modules/audit/audit.service';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface ScreeningParams {
  userId: string;
  amount: string;
  chain: string;
  toAddress: string;
  token: string;
}

export interface ScreeningResult {
  approved: boolean;
  riskLevel: RiskLevel;
  reasons: string[];
  requiresManualReview: boolean;
}

export interface SuspiciousActivityReport {
  reportId: string;
  transactionId: string;
  userId: string;
  riskLevel: RiskLevel;
  reasons: string[];
  transactionDetails: Record<string, unknown>;
  generatedAt: string;
}

const BLACKLISTED_ADDRESSES: Set<string> = new Set([
  '0x0000000000000000000000000000000000000000',
  '0x00000000000000000000000000000000deadbeef',
]);

const USD_PRICE_FALLBACKS: Record<string, number> = {
  ETH: 3500,
  MATIC: 0.85,
  SOL: 150,
  USDC: 1,
  USDT: 1,
};

const LARGE_TX_THRESHOLD_USD = 10_000;
const VELOCITY_THRESHOLD = 5;
const VELOCITY_WINDOW_HOURS = 24;
const NEW_ACCOUNT_DAYS = 7;
const NEW_ACCOUNT_THRESHOLD_USD = 1_000;

@Injectable()
export class AmlComplianceService {
  private readonly logger: StructuredLogger;
  private readonly blacklistedAddresses: Set<string>;

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {
    this.logger = new StructuredLogger('AmlComplianceService');
    this.blacklistedAddresses = new Set(BLACKLISTED_ADDRESSES);

    const additionalBlacklist = this.configService.get<string>(
      'AML_BLACKLISTED_ADDRESSES',
      '',
    );
    if (additionalBlacklist) {
      additionalBlacklist
        .split(',')
        .map((addr) => addr.trim().toLowerCase())
        .filter(Boolean)
        .forEach((addr) => this.blacklistedAddresses.add(addr));
    }
  }

  async screenTransaction(
    params: ScreeningParams,
  ): Promise<ScreeningResult> {
    const correlationId = getCorrelationId();
    const reasons: string[] = [];
    let riskLevel: RiskLevel = 'low';
    let blocked = false;

    const usdEquivalent = this.calculateUsdEquivalent(
      params.amount,
      params.token,
    );

    if (this.isBlacklisted(params.toAddress)) {
      reasons.push(
        `Destination address ${params.toAddress} is blacklisted`,
      );
      riskLevel = 'critical';
      blocked = true;
    }

    if (usdEquivalent >= LARGE_TX_THRESHOLD_USD) {
      reasons.push(
        `Transaction value $${usdEquivalent.toFixed(2)} exceeds $${LARGE_TX_THRESHOLD_USD} threshold — flagged for manual review`,
      );
      riskLevel = this.elevateRisk(riskLevel, 'high');
    }

    const velocityExceeded = await this.checkVelocity(params.userId);
    if (velocityExceeded) {
      reasons.push(
        `User has exceeded ${VELOCITY_THRESHOLD} transactions in the last ${VELOCITY_WINDOW_HOURS} hours — velocity check flagged`,
      );
      riskLevel = this.elevateRisk(riskLevel, 'medium');
    }

    const isNewAccount = await this.isNewAccount(params.userId);
    if (isNewAccount && usdEquivalent >= NEW_ACCOUNT_THRESHOLD_USD) {
      reasons.push(
        `New account (< ${NEW_ACCOUNT_DAYS} days) attempting large transaction ($${usdEquivalent.toFixed(2)}) — flagged`,
      );
      riskLevel = this.elevateRisk(riskLevel, 'high');
    }

    const approved = !blocked;
    const requiresManualReview =
      riskLevel === 'high' || riskLevel === 'critical';

    const result: ScreeningResult = {
      approved,
      riskLevel,
      reasons,
      requiresManualReview,
    };

    this.logger.logWithData(
      reasons.length > 0 ? 'warn' : 'info',
      'AML screening completed',
      {
        userId: params.userId,
        chain: params.chain,
        toAddress: params.toAddress,
        amount: params.amount,
        token: params.token,
        usdEquivalent,
        approved,
        riskLevel,
        reasonCount: reasons.length,
        correlationId,
      },
      'AmlComplianceService',
    );

    return result;
  }

  async recordComplianceCheck(
    txId: string,
    userId: string,
    result: ScreeningResult,
  ): Promise<void> {
    const correlationId = getCorrelationId();

    await this.auditService.record({
      userId,
      action: 'crypto.aml.screening',
      entityType: 'crypto_transaction',
      entityId: txId,
      newValue: {
        approved: result.approved,
        riskLevel: result.riskLevel,
        reasons: result.reasons,
        requiresManualReview: result.requiresManualReview,
      },
      correlationId,
    });

    this.logger.logWithData(
      'info',
      'AML compliance check recorded',
      {
        transactionId: txId,
        userId,
        approved: result.approved,
        riskLevel: result.riskLevel,
        correlationId,
      },
      'AmlComplianceService',
    );
  }

  async generateSAR(
    txId: string,
    userId: string,
    screeningResult: ScreeningResult,
    transactionDetails: Record<string, unknown>,
  ): Promise<SuspiciousActivityReport> {
    const correlationId = getCorrelationId();

    const report: SuspiciousActivityReport = {
      reportId: `SAR-${Date.now()}-${txId.slice(0, 8)}`,
      transactionId: txId,
      userId,
      riskLevel: screeningResult.riskLevel,
      reasons: screeningResult.reasons,
      transactionDetails,
      generatedAt: new Date().toISOString(),
    };

    await this.auditService.record({
      userId,
      action: 'crypto.aml.sar.generated',
      entityType: 'crypto_transaction',
      entityId: txId,
      newValue: report as unknown as Record<string, unknown>,
      metadata: {
        reportId: report.reportId,
        riskLevel: report.riskLevel,
      },
      correlationId,
    });

    this.logger.logWithData(
      'warn',
      'SAR generated',
      {
        reportId: report.reportId,
        transactionId: txId,
        userId,
        riskLevel: report.riskLevel,
        reasonCount: report.reasons.length,
        correlationId,
      },
      'AmlComplianceService',
    );

    return report;
  }

  addBlacklistedAddress(address: string): void {
    this.blacklistedAddresses.add(address.toLowerCase());

    this.logger.logWithData(
      'warn',
      'Address added to blacklist',
      { address: address.toLowerCase() },
      'AmlComplianceService',
    );
  }

  removeBlacklistedAddress(address: string): void {
    this.blacklistedAddresses.delete(address.toLowerCase());

    this.logger.logWithData(
      'info',
      'Address removed from blacklist',
      { address: address.toLowerCase() },
      'AmlComplianceService',
    );
  }

  isBlacklisted(address: string): boolean {
    return this.blacklistedAddresses.has(address.toLowerCase());
  }

  private calculateUsdEquivalent(amount: string, token: string): number {
    const price = this.getTokenPriceUsd(token);
    return parseFloat(amount) * price;
  }

  private getTokenPriceUsd(token: string): number {
    const configKey = `PRICE_${token.toUpperCase()}_USD`;
    const configPrice = this.configService.get<string>(configKey);

    if (configPrice) {
      return parseFloat(configPrice);
    }

    return USD_PRICE_FALLBACKS[token.toUpperCase()] ?? 0;
  }

  private async checkVelocity(userId: string): Promise<boolean> {
    const windowStart = new Date();
    windowStart.setHours(
      windowStart.getHours() - VELOCITY_WINDOW_HOURS,
    );

    const [result] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(cryptoTransactions)
      .innerJoin(
        // We need to join through crypto_wallets to filter by userId
        // since crypto_transactions references walletId, not userId directly
        sql`crypto_wallets`,
        sql`crypto_wallets.id = ${cryptoTransactions.walletId}`,
      )
      .where(
        and(
          sql`crypto_wallets.user_id = ${userId}`,
          gte(cryptoTransactions.createdAt, windowStart),
        ),
      );

    return result.count >= VELOCITY_THRESHOLD;
  }

  private async isNewAccount(userId: string): Promise<boolean> {
    const [user] = await this.db
      .select({ createdAt: users.createdAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return true;
    }

    const accountAgeDays =
      (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24);

    return accountAgeDays < NEW_ACCOUNT_DAYS;
  }

  private elevateRisk(current: RiskLevel, proposed: RiskLevel): RiskLevel {
    const levels: Record<RiskLevel, number> = {
      low: 0,
      medium: 1,
      high: 2,
      critical: 3,
    };

    return levels[proposed] > levels[current] ? proposed : current;
  }
}
