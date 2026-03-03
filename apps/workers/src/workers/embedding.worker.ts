import { Worker, Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import type { Database } from '@marketplace/database';
import { profiles, embeddingCache } from '@marketplace/database';
import type { AIGateway } from '@marketplace/ai-gateway';
import { QUEUE_NAMES, createRedisConnection } from '../queues';

export interface EmbeddingJobData {
  profileId: string;
  correlationId: string;
}

function buildProfileText(profile: {
  displayName: string;
  bio: string | null;
  description: string | null;
  services: string[];
  city: string | null;
  state: string | null;
}): string {
  const parts: string[] = [profile.displayName];

  if (profile.bio) {
    parts.push(profile.bio);
  }

  if (profile.description) {
    parts.push(profile.description);
  }

  if (profile.services.length > 0) {
    parts.push(profile.services.join(', '));
  }

  const location = [profile.city, profile.state].filter(Boolean).join(', ');
  if (location) {
    parts.push(location);
  }

  return parts.join(' | ');
}

function computeContentHash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

async function processEmbeddingJob(
  job: Job<EmbeddingJobData>,
  db: Database,
  aiGateway: AIGateway,
): Promise<void> {
  const { profileId, correlationId } = job.data;

  console.log(
    JSON.stringify({
      level: 'info',
      message: 'Processing embedding job',
      correlationId,
      profileId,
      jobId: job.id,
    }),
  );

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);

  if (!profile) {
    console.log(
      JSON.stringify({
        level: 'warn',
        message: 'Profile not found, skipping embedding',
        correlationId,
        profileId,
      }),
    );
    return;
  }

  const text = buildProfileText(profile);
  const contentHash = computeContentHash(text);

  const response = await aiGateway.createEmbedding({
    input: text,
    correlationId,
  });

  const embeddingVector = response.embeddings[0];
  if (!embeddingVector) {
    throw new Error(`No embedding returned for profile ${profileId}`);
  }

  await db
    .update(profiles)
    .set({
      embedding: embeddingVector,
      updatedAt: new Date(),
    })
    .where(eq(profiles.id, profileId));

  await db
    .insert(embeddingCache)
    .values({
      sourceType: 'profile_bio',
      sourceId: profileId,
      contentHash,
      embedding: embeddingVector,
      model: response.model,
      metadata: {
        provider: response.provider,
        costUsd: response.costUsd,
        textLength: text.length,
      },
    });

  console.log(
    JSON.stringify({
      level: 'info',
      message: 'Embedding updated successfully',
      correlationId,
      profileId,
      model: response.model,
      costUsd: response.costUsd,
    }),
  );
}

export function createEmbeddingWorker(
  db: Database,
  aiGateway: AIGateway,
): Worker<EmbeddingJobData> {
  const connection = createRedisConnection();

  const worker = new Worker<EmbeddingJobData>(
    QUEUE_NAMES.EMBEDDING,
    async (job) => processEmbeddingJob(job, db, aiGateway),
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
    console.log(
      JSON.stringify({
        level: 'info',
        message: 'Embedding job completed',
        jobId: job.id,
        correlationId: job.data.correlationId,
        profileId: job.data.profileId,
      }),
    );
  });

  worker.on('failed', (job, error) => {
    console.log(
      JSON.stringify({
        level: 'error',
        message: 'Embedding job failed',
        jobId: job?.id,
        correlationId: job?.data.correlationId,
        profileId: job?.data.profileId,
        error: error.message,
        stack: error.stack,
      }),
    );
  });

  return worker;
}
