import { Worker, Job } from 'bullmq';
import { eq, sql } from 'drizzle-orm';
import type { Database } from '@marketplace/database';
import { users, profiles, fraudScores } from '@marketplace/database';
import type { AIGateway } from '@marketplace/ai-gateway';
import { QUEUE_NAMES, createRedisConnection } from '../queues';

export interface FraudDetectionJobData {
  userId: string;
  profileId: string;
  correlationId: string;
}

interface FraudSignal {
  name: string;
  score: number;
  detail: string;
}

const MODEL_NAME = 'rule-based-fraud-v1';
const MODEL_VERSION = '1.0.0';
const FRAUD_SCORE_TTL_HOURS = 24;

const SPAM_PATTERNS = [
  /(.)\1{4,}/i,             // repeated characters (5+)
  /\b(buy|free|click|winner|prize|cash|urgent)\b/i,
  /https?:\/\/[^\s]+/i,     // URLs in bio
  /[A-Z\s]{20,}/,           // long stretches of all-caps (20+ chars)
  /(.{3,})\1{2,}/i,         // repeated phrase patterns
];

function detectSpamPatterns(bio: string | null): boolean {
  if (!bio) return false;

  return SPAM_PATTERNS.some((pattern) => pattern.test(bio));
}

function calculateRiskScore(signals: FraudSignal[]): number {
  const rawScore = signals.reduce((sum, signal) => sum + signal.score, 0);
  return Math.min(Math.max(rawScore, 0), 1);
}

function mapRiskLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
  if (score >= 0.8) return 'critical';
  if (score >= 0.6) return 'high';
  if (score >= 0.3) return 'medium';
  return 'low';
}

async function processFraudDetectionJob(
  job: Job<FraudDetectionJobData>,
  db: Database,
  _aiGateway: AIGateway,
): Promise<void> {
  const { userId, profileId, correlationId } = job.data;

  console.log(
    JSON.stringify({
      level: 'info',
      message: 'Processing fraud detection job',
      correlationId,
      userId,
      profileId,
      jobId: job.id,
    }),
  );

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    console.log(
      JSON.stringify({
        level: 'warn',
        message: 'User not found, skipping fraud detection',
        correlationId,
        userId,
      }),
    );
    return;
  }

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);

  if (!profile) {
    console.log(
      JSON.stringify({
        level: 'warn',
        message: 'Profile not found, skipping fraud detection',
        correlationId,
        profileId,
      }),
    );
    return;
  }

  const [profileCountResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(profiles)
    .where(eq(profiles.userId, userId));

  const profileCount = profileCountResult?.count ?? 0;

  const accountAgeDays = Math.floor(
    (Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24),
  );

  const signals: FraudSignal[] = [];

  if (accountAgeDays < 1) {
    signals.push({
      name: 'new_account',
      score: 0.3,
      detail: `Account age: ${accountAgeDays} days`,
    });
  }

  if (!user.isVerified) {
    signals.push({
      name: 'unverified_email',
      score: 0.2,
      detail: 'Email not verified',
    });
  }

  if (!user.phone) {
    signals.push({
      name: 'no_phone',
      score: 0.15,
      detail: 'No phone number provided',
    });
  }

  if (profileCount > 2) {
    signals.push({
      name: 'multiple_profiles',
      score: 0.15,
      detail: `User has ${profileCount} profiles`,
    });
  }

  if (detectSpamPatterns(profile.bio)) {
    signals.push({
      name: 'suspicious_bio',
      score: 0.2,
      detail: 'Bio contains suspicious patterns',
    });
  }

  const score = calculateRiskScore(signals);
  const riskLevel = mapRiskLevel(score);

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + FRAUD_SCORE_TTL_HOURS);

  await db.insert(fraudScores).values({
    userId,
    profileId,
    riskLevel,
    score,
    signals: Object.fromEntries(
      signals.map((s) => [s.name, { score: s.score, detail: s.detail }]),
    ),
    model: MODEL_NAME,
    modelVersion: MODEL_VERSION,
    expiresAt,
    metadata: {
      accountAgeDays,
      profileCount,
      correlationId,
    },
  });

  if (riskLevel === 'critical') {
    await db
      .update(profiles)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, profileId));

    console.log(
      JSON.stringify({
        level: 'warn',
        message: 'Profile deactivated due to critical fraud risk',
        correlationId,
        userId,
        profileId,
        score,
        riskLevel,
        signals: signals.map((s) => s.name),
      }),
    );
  } else {
    console.log(
      JSON.stringify({
        level: 'info',
        message: 'Fraud detection completed',
        correlationId,
        userId,
        profileId,
        score,
        riskLevel,
        signalCount: signals.length,
      }),
    );
  }
}

export function createFraudDetectionWorker(
  db: Database,
  aiGateway: AIGateway,
): Worker<FraudDetectionJobData> {
  const connection = createRedisConnection();

  const worker = new Worker<FraudDetectionJobData>(
    QUEUE_NAMES.FRAUD_DETECTION,
    async (job) => processFraudDetectionJob(job, db, aiGateway),
    {
      connection,
      concurrency: 3,
      limiter: {
        max: 30,
        duration: 60_000,
      },
    },
  );

  worker.on('completed', (job) => {
    console.log(
      JSON.stringify({
        level: 'info',
        message: 'Fraud detection job completed',
        jobId: job.id,
        correlationId: job.data.correlationId,
        userId: job.data.userId,
        profileId: job.data.profileId,
      }),
    );
  });

  worker.on('failed', (job, error) => {
    console.log(
      JSON.stringify({
        level: 'error',
        message: 'Fraud detection job failed',
        jobId: job?.id,
        correlationId: job?.data.correlationId,
        userId: job?.data.userId,
        error: error.message,
        stack: error.stack,
      }),
    );
  });

  return worker;
}
