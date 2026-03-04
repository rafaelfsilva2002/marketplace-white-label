import { Worker, Job } from 'bullmq';
import { eq, and, gte, sql } from 'drizzle-orm';
import {
  amlScreenings,
  amlBlacklists,
  amlRateLimits,
  cryptoTransactions,
  users,
  fraudScores,
  suspiciousActivityReports,
  amlReviewQueue,
} from '@marketplace/database';
import type { Database } from '@marketplace/database';
import { QUEUE_NAMES, createRedisConnection } from '../queues';

interface AmlScreeningJobData {
  transactionId: string;
  userId: string;
  fromAddress: string;
  toAddress: string;
  amount: string;
  amountUsd: number;
  token: string;
  chain: string;
  correlationId: string;
}

interface RiskFactor {
  type: string;
  description: string;
  weight: number;
}

const LARGE_TX_THRESHOLD_USD = 10_000;
const TRAVEL_RULE_THRESHOLD_USD = 1_000;
const VELOCITY_THRESHOLD_USER = 5;
const VELOCITY_THRESHOLD_WALLET = 10;
const VELOCITY_WINDOW_HOURS = 24;
const NEW_ACCOUNT_DAYS = 7;
const NEW_ACCOUNT_THRESHOLD_USD = 1_000;

async function isBlacklisted(
  db: Database,
  address: string,
  chain?: string,
): Promise<boolean> {
  const result = await db
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

function mapRiskLevel(
  score: number,
): 'low' | 'medium' | 'high' | 'critical' {
  if (score >= 0.7) return 'critical';
  if (score >= 0.5) return 'high';
  if (score >= 0.3) return 'medium';
  return 'low';
}

async function screenTransaction(
  db: Database,
  data: AmlScreeningJobData,
): Promise<{
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  score: number;
  approved: boolean;
  requiresManualReview: boolean;
  factors: RiskFactor[];
  travelRuleRequired: boolean;
}> {
  const factors: RiskFactor[] = [];
  let score = 0;

  // Blacklist check
  if (
    (await isBlacklisted(db, data.fromAddress, data.chain)) ||
    (await isBlacklisted(db, data.toAddress, data.chain))
  ) {
    return {
      riskLevel: 'critical',
      score: 1.0,
      approved: false,
      requiresManualReview: false,
      factors: [
        { type: 'blacklist', description: 'Address is blacklisted', weight: 1.0 },
      ],
      travelRuleRequired: false,
    };
  }

  // User velocity
  const windowStart = new Date(
    Date.now() - VELOCITY_WINDOW_HOURS * 60 * 60 * 1000,
  );
  const [velocityResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(cryptoTransactions)
    .innerJoin(
      sql`crypto_wallets`,
      sql`crypto_wallets.id = ${cryptoTransactions.walletId}`,
    )
    .where(
      and(
        sql`crypto_wallets.user_id = ${data.userId}`,
        gte(cryptoTransactions.createdAt, windowStart),
      ),
    );
  if ((velocityResult?.count ?? 0) > VELOCITY_THRESHOLD_USER) {
    score += 0.25;
    factors.push({
      type: 'velocity_user',
      description: `${velocityResult.count} txs in ${VELOCITY_WINDOW_HOURS}h`,
      weight: 0.25,
    });
  }

  // Wallet velocity
  const rateLimit = await db.query.amlRateLimits.findFirst({
    where: and(
      eq(amlRateLimits.walletAddress, data.fromAddress.toLowerCase()),
      eq(amlRateLimits.chain, data.chain),
    ),
  });
  if (rateLimit) {
    const windowExpired =
      new Date(
        rateLimit.windowStart.getTime() +
          rateLimit.windowHours * 60 * 60 * 1000,
      ) < new Date();
    if (!windowExpired && rateLimit.txCount > VELOCITY_THRESHOLD_WALLET) {
      score += 0.2;
      factors.push({
        type: 'velocity_wallet',
        description: `${rateLimit.txCount} txs from wallet`,
        weight: 0.2,
      });
    }
  }

  // Large tx
  if (data.amountUsd > LARGE_TX_THRESHOLD_USD) {
    score += 0.2;
    factors.push({
      type: 'large_tx',
      description: `$${data.amountUsd} exceeds threshold`,
      weight: 0.2,
    });
  }

  // New account
  const user = await db.query.users.findFirst({
    where: eq(users.id, data.userId),
    columns: { createdAt: true },
  });
  const isNew = user
    ? (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24) <
      NEW_ACCOUNT_DAYS
    : true;
  if (isNew && data.amountUsd > NEW_ACCOUNT_THRESHOLD_USD) {
    score += 0.2;
    factors.push({
      type: 'new_account',
      description: `New account with large tx`,
      weight: 0.2,
    });
  }

  // Fraud cross-check
  const latestFraud = await db.query.fraudScores.findFirst({
    where: and(
      eq(fraudScores.userId, data.userId),
      gte(fraudScores.expiresAt, new Date()),
    ),
    orderBy: (fs, { desc }) => [desc(fs.evaluatedAt)],
  });
  if ((latestFraud?.score ?? 0) > 0.5) {
    score += 0.15;
    factors.push({
      type: 'fraud_crosscheck',
      description: `Profile fraud score: ${latestFraud!.score.toFixed(2)}`,
      weight: 0.15,
    });
  }

  score = Math.min(score, 1.0);
  const riskLevel = mapRiskLevel(score);

  return {
    riskLevel,
    score,
    approved: riskLevel !== 'critical',
    requiresManualReview: riskLevel === 'high',
    factors,
    travelRuleRequired: data.amountUsd > TRAVEL_RULE_THRESHOLD_USD,
  };
}

async function processAmlScreening(
  job: Job<AmlScreeningJobData>,
  db: Database,
): Promise<void> {
  const data = job.data;
  const result = await screenTransaction(db, data);

  // Persist screening
  const [screening] = await db
    .insert(amlScreenings)
    .values({
      transactionId: data.transactionId,
      userId: data.userId,
      riskLevel: result.riskLevel,
      score: result.score,
      approved: result.approved,
      requiresManualReview: result.requiresManualReview,
      factors: result.factors,
      provider: 'internal',
      correlationId: data.correlationId,
    })
    .returning();

  // Update transaction
  const newAmlStatus = result.approved
    ? result.requiresManualReview
      ? 'manual_review'
      : 'approved'
    : 'rejected';

  await db
    .update(cryptoTransactions)
    .set({
      riskLevel: result.riskLevel,
      amlScreeningId: screening.id,
      amlStatus: newAmlStatus,
    })
    .where(eq(cryptoTransactions.id, data.transactionId));

  // Generate SAR for high/critical
  if (result.riskLevel === 'high' || result.riskLevel === 'critical') {
    await db.insert(suspiciousActivityReports).values({
      screeningId: screening.id,
      userId: data.userId,
      transactionId: data.transactionId,
      reportType: 'auto',
      severity: result.riskLevel,
      summary: `Auto-generated: ${result.factors.map((f) => f.type).join(', ')}`,
      details: {
        score: result.score,
        factors: result.factors,
        travelRuleRequired: result.travelRuleRequired,
      },
    });
  }

  // Add to review queue for manual review
  if (result.requiresManualReview) {
    await db.insert(amlReviewQueue).values({
      screeningId: screening.id,
      userId: data.userId,
      transactionId: data.transactionId,
      reason: result.factors.map((f) => f.description).join('; '),
      priority: result.riskLevel === 'critical' ? 'urgent' : 'high',
    });
  }

  // Update wallet rate limit
  const existing = await db.query.amlRateLimits.findFirst({
    where: and(
      eq(amlRateLimits.walletAddress, data.fromAddress.toLowerCase()),
      eq(amlRateLimits.chain, data.chain),
    ),
  });
  if (!existing) {
    await db.insert(amlRateLimits).values({
      walletAddress: data.fromAddress.toLowerCase(),
      chain: data.chain,
      txCount: 1,
      totalAmountUsd: data.amountUsd,
    });
  } else {
    const windowExpired =
      new Date(
        existing.windowStart.getTime() +
          existing.windowHours * 60 * 60 * 1000,
      ) < new Date();
    await db
      .update(amlRateLimits)
      .set(
        windowExpired
          ? { txCount: 1, totalAmountUsd: data.amountUsd, windowStart: new Date() }
          : {
              txCount: existing.txCount + 1,
              totalAmountUsd: existing.totalAmountUsd + data.amountUsd,
            },
      )
      .where(eq(amlRateLimits.id, existing.id));
  }
}

export function createAmlScreeningWorker(
  db: Database,
): Worker<AmlScreeningJobData> {
  return new Worker<AmlScreeningJobData>(
    QUEUE_NAMES.AML_SCREENING,
    async (job) => processAmlScreening(job, db),
    {
      connection: createRedisConnection(),
      concurrency: 5,
      limiter: { max: 50, duration: 60_000 },
    },
  );
}
