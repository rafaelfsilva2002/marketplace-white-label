import { Worker, Job } from 'bullmq';
import { eq, and, gte, sql, lte } from 'drizzle-orm';
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
import { createLogger } from '../lib/logger';

const logger = createLogger('aml-screening');

// ---------------------------------------------------------------------------
// Job data types
// ---------------------------------------------------------------------------

interface ScreenUserJobData {
  type: 'screen-user';
  userId: string;
  correlationId: string;
}

interface ScreenTransactionJobData {
  type: 'screen-transaction';
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

interface PeriodicRescreenJobData {
  type: 'periodic-rescreen';
  correlationId: string;
  batchSize?: number;
}

export type AmlScreeningJobData =
  | ScreenUserJobData
  | ScreenTransactionJobData
  | PeriodicRescreenJobData;

// ---------------------------------------------------------------------------
// Risk factor interface
// ---------------------------------------------------------------------------

interface RiskFactor {
  type: string;
  description: string;
  weight: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LARGE_TX_THRESHOLD_USD = 10_000;
const TRAVEL_RULE_THRESHOLD_USD = 1_000;
const VELOCITY_THRESHOLD_USER = 5;
const VELOCITY_THRESHOLD_WALLET = 10;
const VELOCITY_WINDOW_HOURS = 24;
const NEW_ACCOUNT_DAYS = 7;
const NEW_ACCOUNT_THRESHOLD_USD = 1_000;
const DEFAULT_RESCREEN_BATCH_SIZE = 100;
const RESCREEN_WINDOW_DAYS = 30;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// screen-user: Run user against blacklists, check risk score, create record
// ---------------------------------------------------------------------------

async function processScreenUser(
  db: Database,
  data: ScreenUserJobData,
): Promise<void> {
  const { userId, correlationId } = data;

  logger.info('Processing screen-user job', { userId, correlationId });

  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, createdAt: true, isVerified: true, phone: true },
  });

  if (!user) {
    logger.warn('User not found, skipping screening', { userId, correlationId });
    return;
  }

  const factors: RiskFactor[] = [];
  let score = 0;

  // Check user's wallet addresses against blacklist
  const wallets = await db
    .select({ address: sql<string>`address`, chain: sql<string>`chain` })
    .from(sql`crypto_wallets`)
    .where(sql`user_id = ${userId}`);

  for (const wallet of wallets) {
    if (await isBlacklisted(db, wallet.address, wallet.chain)) {
      score = 1.0;
      factors.push({
        type: 'blacklisted_wallet',
        description: `Wallet ${wallet.address.slice(0, 10)}... is blacklisted`,
        weight: 1.0,
      });
      break;
    }
  }

  // Account age check
  if (score < 1.0) {
    const accountAgeDays = Math.floor(
      (Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24),
    );

    if (accountAgeDays < NEW_ACCOUNT_DAYS) {
      score += 0.15;
      factors.push({
        type: 'new_account',
        description: `Account age: ${accountAgeDays} days`,
        weight: 0.15,
      });
    }

    // Verification check
    if (!user.isVerified) {
      score += 0.1;
      factors.push({
        type: 'unverified',
        description: 'Email not verified',
        weight: 0.1,
      });
    }

    if (!user.phone) {
      score += 0.1;
      factors.push({
        type: 'no_phone',
        description: 'No phone number provided',
        weight: 0.1,
      });
    }

    // Fraud score cross-check
    const latestFraud = await db.query.fraudScores.findFirst({
      where: and(
        eq(fraudScores.userId, userId),
        gte(fraudScores.expiresAt, new Date()),
      ),
      orderBy: (fs, { desc }) => [desc(fs.evaluatedAt)],
    });

    if ((latestFraud?.score ?? 0) > 0.5) {
      score += 0.2;
      factors.push({
        type: 'fraud_crosscheck',
        description: `Profile fraud score: ${latestFraud!.score.toFixed(2)}`,
        weight: 0.2,
      });
    }

    score = Math.min(score, 1.0);
  }

  const riskLevel = mapRiskLevel(score);
  const approved = riskLevel !== 'critical';
  const requiresManualReview = riskLevel === 'high';

  // Persist screening record (no transaction — user-level screening)
  const [screening] = await db
    .insert(amlScreenings)
    .values({
      userId,
      riskLevel,
      score,
      approved,
      requiresManualReview,
      factors,
      provider: 'internal',
      correlationId,
    })
    .returning();

  // Generate SAR for high/critical
  if (riskLevel === 'high' || riskLevel === 'critical') {
    await db.insert(suspiciousActivityReports).values({
      screeningId: screening.id,
      userId,
      reportType: 'auto',
      severity: riskLevel,
      summary: `User screening: ${factors.map((f) => f.type).join(', ')}`,
      details: {
        score,
        factors,
        screeningType: 'user',
      },
    });

    logger.warn('SAR created for user screening', {
      userId,
      correlationId,
      riskLevel,
      score,
      screeningId: screening.id,
    });
  }

  // Queue for manual review
  if (requiresManualReview) {
    await db.insert(amlReviewQueue).values({
      screeningId: screening.id,
      userId,
      reason: factors.map((f) => f.description).join('; '),
      priority: score >= 0.7 ? 'urgent' : 'high',
    });
  }

  logger.info('User screening completed', {
    userId,
    correlationId,
    riskLevel,
    score,
    approved,
    requiresManualReview,
    factorCount: factors.length,
    screeningId: screening.id,
  });
}

// ---------------------------------------------------------------------------
// screen-transaction: Full transaction risk assessment
// ---------------------------------------------------------------------------

async function processScreenTransaction(
  db: Database,
  data: ScreenTransactionJobData,
): Promise<void> {
  const { transactionId, userId, correlationId } = data;

  logger.info('Processing screen-transaction job', {
    transactionId,
    userId,
    correlationId,
    amountUsd: data.amountUsd,
    chain: data.chain,
  });

  const factors: RiskFactor[] = [];
  let score = 0;

  // Blacklist check
  if (
    (await isBlacklisted(db, data.fromAddress, data.chain)) ||
    (await isBlacklisted(db, data.toAddress, data.chain))
  ) {
    const [screening] = await db
      .insert(amlScreenings)
      .values({
        transactionId,
        userId,
        riskLevel: 'critical',
        score: 1.0,
        approved: false,
        requiresManualReview: false,
        factors: [{ type: 'blacklist', description: 'Address is blacklisted', weight: 1.0 }],
        provider: 'internal',
        correlationId,
      })
      .returning();

    await db
      .update(cryptoTransactions)
      .set({ riskLevel: 'critical', amlScreeningId: screening.id, amlStatus: 'rejected' })
      .where(eq(cryptoTransactions.id, transactionId));

    await db.insert(suspiciousActivityReports).values({
      screeningId: screening.id,
      userId,
      transactionId,
      reportType: 'auto',
      severity: 'critical',
      summary: 'Blacklisted address detected',
      details: { fromAddress: data.fromAddress, toAddress: data.toAddress, chain: data.chain },
    });

    logger.warn('Transaction blocked: blacklisted address', {
      transactionId,
      userId,
      correlationId,
      screeningId: screening.id,
    });
    return;
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
        sql`crypto_wallets.user_id = ${userId}`,
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

  // Large transaction
  if (data.amountUsd > LARGE_TX_THRESHOLD_USD) {
    score += 0.2;
    factors.push({
      type: 'large_tx',
      description: `$${data.amountUsd} exceeds threshold`,
      weight: 0.2,
    });
  }

  // New account with large tx
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { createdAt: true },
  });
  const isNew = user
    ? (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24) < NEW_ACCOUNT_DAYS
    : true;
  if (isNew && data.amountUsd > NEW_ACCOUNT_THRESHOLD_USD) {
    score += 0.2;
    factors.push({
      type: 'new_account',
      description: 'New account with large tx',
      weight: 0.2,
    });
  }

  // Fraud cross-check
  const latestFraud = await db.query.fraudScores.findFirst({
    where: and(
      eq(fraudScores.userId, userId),
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
  const approved = riskLevel !== 'critical';
  const requiresManualReview = riskLevel === 'high';
  const travelRuleRequired = data.amountUsd > TRAVEL_RULE_THRESHOLD_USD;

  // Persist screening
  const [screening] = await db
    .insert(amlScreenings)
    .values({
      transactionId,
      userId,
      riskLevel,
      score,
      approved,
      requiresManualReview,
      factors,
      provider: 'internal',
      correlationId,
    })
    .returning();

  // Update transaction
  const newAmlStatus = approved
    ? requiresManualReview
      ? 'manual_review'
      : 'approved'
    : 'rejected';

  await db
    .update(cryptoTransactions)
    .set({
      riskLevel,
      amlScreeningId: screening.id,
      amlStatus: newAmlStatus,
    })
    .where(eq(cryptoTransactions.id, transactionId));

  // Generate SAR for high/critical
  if (riskLevel === 'high' || riskLevel === 'critical') {
    await db.insert(suspiciousActivityReports).values({
      screeningId: screening.id,
      userId,
      transactionId,
      reportType: 'auto',
      severity: riskLevel,
      summary: `Auto-generated: ${factors.map((f) => f.type).join(', ')}`,
      details: {
        score,
        factors,
        travelRuleRequired,
      },
    });

    logger.warn('SAR created for transaction', {
      transactionId,
      userId,
      correlationId,
      riskLevel,
      screeningId: screening.id,
    });
  }

  // Add to review queue for manual review
  if (requiresManualReview) {
    await db.insert(amlReviewQueue).values({
      screeningId: screening.id,
      userId,
      transactionId,
      reason: factors.map((f) => f.description).join('; '),
      priority: score >= 0.7 ? 'urgent' : 'high',
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

  logger.info('Transaction screening completed', {
    transactionId,
    userId,
    correlationId,
    riskLevel,
    score,
    approved,
    requiresManualReview,
    travelRuleRequired,
    factorCount: factors.length,
    screeningId: screening.id,
  });
}

// ---------------------------------------------------------------------------
// periodic-rescreen: Re-run existing users against updated blacklists
// ---------------------------------------------------------------------------

async function processPeriodicRescreen(
  db: Database,
  data: PeriodicRescreenJobData,
): Promise<void> {
  const { correlationId, batchSize = DEFAULT_RESCREEN_BATCH_SIZE } = data;

  logger.info('Processing periodic-rescreen job', { correlationId, batchSize });

  // Find users whose last screening is older than the rescreen window
  const rescreenCutoff = new Date(
    Date.now() - RESCREEN_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );

  // Get distinct user IDs that have old screenings or no screening at all
  const usersToRescreen = await db
    .select({ userId: users.id })
    .from(users)
    .where(
      sql`${users.id} NOT IN (
        SELECT DISTINCT ${amlScreenings.userId}
        FROM ${amlScreenings}
        WHERE ${amlScreenings.createdAt} > ${rescreenCutoff}
          AND ${amlScreenings.transactionId} IS NULL
      )`,
    )
    .limit(batchSize);

  logger.info('Users found for rescreening', {
    correlationId,
    count: usersToRescreen.length,
    batchSize,
    rescreenCutoffDays: RESCREEN_WINDOW_DAYS,
  });

  let screened = 0;
  let flagged = 0;
  let errors = 0;

  for (const { userId } of usersToRescreen) {
    try {
      await processScreenUser(db, {
        type: 'screen-user',
        userId,
        correlationId,
      });
      screened++;

      // Check if the screening we just created was flagged
      const latest = await db.query.amlScreenings.findFirst({
        where: and(
          eq(amlScreenings.userId, userId),
          sql`${amlScreenings.transactionId} IS NULL`,
        ),
        orderBy: (s, { desc }) => [desc(s.createdAt)],
      });
      if (latest && (latest.riskLevel === 'high' || latest.riskLevel === 'critical')) {
        flagged++;
      }
    } catch (error) {
      errors++;
      logger.error('Error rescreening user', {
        userId,
        correlationId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logger.info('Periodic rescreen completed', {
    correlationId,
    totalUsers: usersToRescreen.length,
    screened,
    flagged,
    errors,
  });
}

// ---------------------------------------------------------------------------
// Job router
// ---------------------------------------------------------------------------

async function processAmlScreeningJob(
  job: Job<AmlScreeningJobData>,
  db: Database,
): Promise<void> {
  const data = job.data;

  switch (data.type) {
    case 'screen-user':
      await processScreenUser(db, data);
      break;

    case 'screen-transaction':
      await processScreenTransaction(db, data);
      break;

    case 'periodic-rescreen':
      await processPeriodicRescreen(db, data);
      break;

    default: {
      // Backwards compatibility: if no type field, treat as screen-transaction
      // (old jobs may not have the type field)
      if ('transactionId' in data) {
        await processScreenTransaction(db, data as unknown as ScreenTransactionJobData);
        return;
      }
      logger.error('Unknown AML screening job type', {
        jobId: job.id,
        data: data as Record<string, unknown>,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Worker factory
// ---------------------------------------------------------------------------

export function createAmlScreeningWorker(
  db: Database,
): Worker<AmlScreeningJobData> {
  const connection = createRedisConnection();

  const worker = new Worker<AmlScreeningJobData>(
    QUEUE_NAMES.AML_SCREENING,
    async (job) => processAmlScreeningJob(job, db),
    {
      connection,
      concurrency: 5,
      limiter: {
        max: 50,
        duration: 60_000,
      },
    },
  );

  worker.on('completed', (job) => {
    logger.info('AML screening job completed', {
      jobId: job.id,
      type: job.data.type,
      correlationId: job.data.correlationId,
    });
  });

  worker.on('failed', (job, error) => {
    logger.error('AML screening job failed', {
      jobId: job?.id,
      type: job?.data.type,
      correlationId: job?.data.correlationId,
      error: error.message,
      stack: error.stack,
    });
  });

  return worker;
}
