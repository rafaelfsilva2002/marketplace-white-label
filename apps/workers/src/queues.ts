import type { ConnectionOptions, DefaultJobOptions } from 'bullmq';

export const QUEUE_NAMES = {
  EMBEDDING: 'embedding',
  MODERATION: 'moderation',
  FRAUD_DETECTION: 'fraud-detection',
  SENTIMENT_ANALYSIS: 'sentiment-analysis',
  NOTIFICATION: 'notification',
  REPORT_GENERATION: 'report-generation',
  AML_SCREENING: 'aml-screening',
  WEBHOOK_RETRY: 'webhook-retry',
  AUDIT_ARCHIVAL: 'audit-archival',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export function createRedisConnection(): ConnectionOptions {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  const url = new URL(redisUrl);

  return {
    host: url.hostname,
    port: Number(url.port) || 6379,
    password: url.password || undefined,
    maxRetriesPerRequest: null,
  };
}

export const DEFAULT_JOB_OPTIONS: DefaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000,
  },
  removeOnComplete: 100,
  removeOnFail: 500,
};
