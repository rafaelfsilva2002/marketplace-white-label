import { Worker, Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import type { Database } from '@marketplace/database';
import { profiles, moderationQueue } from '@marketplace/database';
import type { AIGateway } from '@marketplace/ai-gateway';
import { QUEUE_NAMES, createRedisConnection } from '../queues';

interface PhotoModerationJobData {
  profileId: string;
  photoUrl: string;
  correlationId: string;
}

interface TextModerationJobData {
  reviewId: string;
  text: string;
  correlationId: string;
}

export type ModerationJobData = PhotoModerationJobData | TextModerationJobData;

function isPhotoModeration(data: ModerationJobData): data is PhotoModerationJobData {
  return 'photoUrl' in data;
}

function isTextModeration(data: ModerationJobData): data is TextModerationJobData {
  return 'reviewId' in data && 'text' in data;
}

const PHOTO_THRESHOLDS = {
  explicit: 0.7,
  violent: 0.5,
} as const;

async function processPhotoModeration(
  job: Job<PhotoModerationJobData>,
  db: Database,
  aiGateway: AIGateway,
): Promise<void> {
  const { profileId, photoUrl, correlationId } = job.data;

  console.log(
    JSON.stringify({
      level: 'info',
      message: 'Processing photo moderation',
      correlationId,
      profileId,
      photoUrl,
      jobId: job.id,
    }),
  );

  const [profile] = await db
    .select({ id: profiles.id, userId: profiles.userId })
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);

  if (!profile) {
    console.log(
      JSON.stringify({
        level: 'warn',
        message: 'Profile not found, skipping photo moderation',
        correlationId,
        profileId,
      }),
    );
    return;
  }

  const result = await aiGateway.analyzeImage({
    imageUrl: photoUrl,
    categories: ['explicit', 'violent', 'suggestive'],
    correlationId,
  });

  const explicitScore = result.scores['explicit'] ?? 0;
  const violentScore = result.scores['violent'] ?? 0;

  const isFlagged =
    explicitScore > PHOTO_THRESHOLDS.explicit ||
    violentScore > PHOTO_THRESHOLDS.violent;

  if (isFlagged) {
    const maxScore = Math.max(...Object.values(result.scores));

    await db.insert(moderationQueue).values({
      type: 'photo',
      entityType: 'profile',
      entityId: profileId,
      userId: profile.userId,
      status: 'pending',
      autoScore: maxScore,
      autoLabels: result.labels,
      autoReason: `Flagged by AI: explicit=${explicitScore.toFixed(3)}, violent=${violentScore.toFixed(3)}`,
      contentSnapshot: {
        photoUrl,
        scores: result.scores,
        model: result.model,
        provider: result.provider,
      },
      metadata: {
        costUsd: result.costUsd,
      },
    });

    console.log(
      JSON.stringify({
        level: 'warn',
        message: 'Photo flagged for moderation',
        correlationId,
        profileId,
        photoUrl,
        scores: result.scores,
        labels: result.labels,
      }),
    );
  } else {
    console.log(
      JSON.stringify({
        level: 'info',
        message: 'Photo auto-approved',
        correlationId,
        profileId,
        photoUrl,
        scores: result.scores,
      }),
    );
  }
}

async function processTextModeration(
  job: Job<TextModerationJobData>,
  db: Database,
  aiGateway: AIGateway,
): Promise<void> {
  const { reviewId, text, correlationId } = job.data;

  console.log(
    JSON.stringify({
      level: 'info',
      message: 'Processing text moderation',
      correlationId,
      reviewId,
      jobId: job.id,
    }),
  );

  const result = await aiGateway.moderateContent({
    text,
    correlationId,
  });

  if (result.flagged) {
    const maxScore = Math.max(...Object.values(result.scores));
    const flaggedCategories = Object.entries(result.categories)
      .filter(([, flagged]) => flagged)
      .map(([category]) => category);

    await db.insert(moderationQueue).values({
      type: 'review',
      entityType: 'review',
      entityId: reviewId,
      userId: reviewId, // Will be resolved by caller or set appropriately
      status: 'pending',
      autoScore: maxScore,
      autoLabels: flaggedCategories,
      autoReason: `Text flagged by AI moderation: ${flaggedCategories.join(', ')}`,
      contentSnapshot: {
        text,
        categories: result.categories,
        scores: result.scores,
      },
    });

    console.log(
      JSON.stringify({
        level: 'warn',
        message: 'Review text flagged for moderation',
        correlationId,
        reviewId,
        flaggedCategories,
      }),
    );
  } else {
    console.log(
      JSON.stringify({
        level: 'info',
        message: 'Review text auto-approved',
        correlationId,
        reviewId,
      }),
    );
  }
}

async function processModerationJob(
  job: Job<ModerationJobData>,
  db: Database,
  aiGateway: AIGateway,
): Promise<void> {
  if (isPhotoModeration(job.data)) {
    await processPhotoModeration(job as Job<PhotoModerationJobData>, db, aiGateway);
    return;
  }

  if (isTextModeration(job.data)) {
    await processTextModeration(job as Job<TextModerationJobData>, db, aiGateway);
    return;
  }

  console.log(
    JSON.stringify({
      level: 'error',
      message: 'Unknown moderation job type',
      jobId: job.id,
      data: job.data,
    }),
  );
}

export function createModerationWorker(
  db: Database,
  aiGateway: AIGateway,
): Worker<ModerationJobData> {
  const connection = createRedisConnection();

  const worker = new Worker<ModerationJobData>(
    QUEUE_NAMES.MODERATION,
    async (job) => processModerationJob(job, db, aiGateway),
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
        message: 'Moderation job completed',
        jobId: job.id,
        correlationId: job.data.correlationId,
      }),
    );
  });

  worker.on('failed', (job, error) => {
    console.log(
      JSON.stringify({
        level: 'error',
        message: 'Moderation job failed',
        jobId: job?.id,
        correlationId: job?.data.correlationId,
        error: error.message,
        stack: error.stack,
      }),
    );
  });

  return worker;
}
