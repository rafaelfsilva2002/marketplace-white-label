import type { Worker } from 'bullmq';
import { createDb } from '@marketplace/database';
import type { AIGateway } from '@marketplace/ai-gateway';
import { createLogger } from './lib/logger';
import { createEmbeddingWorker } from './workers/embedding.worker';
import { createModerationWorker } from './workers/moderation.worker';
import { createFraudDetectionWorker } from './workers/fraud-detection.worker';
import { createSentimentAnalysisWorker } from './workers/sentiment-analysis.worker';
import { createNotificationWorker } from './workers/notification.worker';
import { createAmlScreeningWorker } from './workers/aml-screening.worker';
import { createWebhookRetryWorker } from './workers/webhook-retry.worker';
import { createAuditArchivalWorker } from './workers/audit-archival.worker';

const logger = createLogger('WorkerMain');

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/marketplace';

function createAIGateway(): AIGateway {
  // The AI Gateway module exports a concrete implementation.
  // In production this is wired via NestJS DI or direct instantiation from @marketplace/ai-gateway.
  // For now we dynamically import the default export to keep the workers package loosely coupled.
  // If no concrete gateway is available yet, we throw with a clear message.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@marketplace/ai-gateway');
    if (typeof mod.createAIGateway === 'function') {
      return mod.createAIGateway();
    }
    if (typeof mod.default === 'function') {
      return mod.default();
    }
    throw new Error('No createAIGateway or default export found in @marketplace/ai-gateway');
  } catch (error) {
    logger.error(
      'Failed to create AI Gateway — ensure @marketplace/ai-gateway exports a factory',
      { error: error instanceof Error ? error.message : String(error) },
    );
    throw error;
  }
}

async function main(): Promise<void> {
  logger.info('Marketplace workers starting');

  const db = createDb(DATABASE_URL);
  const aiGateway = createAIGateway();

  const workers: Worker[] = [];

  const embeddingWorker = createEmbeddingWorker(db, aiGateway);
  workers.push(embeddingWorker);
  logger.info('Embedding worker registered');

  const moderationWorker = createModerationWorker(db, aiGateway);
  workers.push(moderationWorker);
  logger.info('Moderation worker registered');

  const fraudDetectionWorker = createFraudDetectionWorker(db, aiGateway);
  workers.push(fraudDetectionWorker);
  logger.info('Fraud detection worker registered');

  const sentimentAnalysisWorker = createSentimentAnalysisWorker(db, aiGateway);
  workers.push(sentimentAnalysisWorker);
  logger.info('Sentiment analysis worker registered');

  const notificationWorker = createNotificationWorker(db);
  workers.push(notificationWorker);
  logger.info('Notification worker registered');

  const amlScreeningWorker = createAmlScreeningWorker(db);
  workers.push(amlScreeningWorker);
  logger.info('AML screening worker registered');

  const webhookRetryWorker = createWebhookRetryWorker();
  workers.push(webhookRetryWorker);
  logger.info('Webhook retry worker registered');

  const auditArchivalWorker = createAuditArchivalWorker(db);
  workers.push(auditArchivalWorker);
  logger.info('Audit archival worker registered');

  logger.info(`All ${workers.length} workers registered and listening`);

  async function shutdown(signal: string): Promise<void> {
    logger.info(`Received ${signal}, shutting down workers gracefully`);

    const closePromises = workers.map(async (worker) => {
      try {
        await worker.close();
        logger.info(`Worker ${worker.name} closed`);
      } catch (error) {
        logger.error(
          `Error closing worker ${worker.name}`,
          { error: error instanceof Error ? error.message : String(error) },
        );
      }
    });

    await Promise.allSettled(closePromises);

    logger.info('All workers shut down, exiting');

    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  logger.fatal(
    'Failed to start workers',
    {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    },
  );
  process.exit(1);
});
