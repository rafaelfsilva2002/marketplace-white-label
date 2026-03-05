import type { Worker } from 'bullmq';
import { createDb } from '@marketplace/database';
import type { AIGateway } from '@marketplace/ai-gateway';
import { createEmbeddingWorker } from './workers/embedding.worker';
import { createModerationWorker } from './workers/moderation.worker';
import { createFraudDetectionWorker } from './workers/fraud-detection.worker';
import { createSentimentAnalysisWorker } from './workers/sentiment-analysis.worker';
import { createNotificationWorker } from './workers/notification.worker';

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
    console.log(
      JSON.stringify({
        level: 'error',
        message: 'Failed to create AI Gateway — ensure @marketplace/ai-gateway exports a factory',
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    throw error;
  }
}

async function main(): Promise<void> {
  console.log(
    JSON.stringify({
      level: 'info',
      message: 'Marketplace workers starting',
      timestamp: new Date().toISOString(),
    }),
  );

  const db = createDb(DATABASE_URL);
  const aiGateway = createAIGateway();

  const workers: Worker[] = [];

  const embeddingWorker = createEmbeddingWorker(db, aiGateway);
  workers.push(embeddingWorker);
  console.log(JSON.stringify({ level: 'info', message: 'Embedding worker registered' }));

  const moderationWorker = createModerationWorker(db, aiGateway);
  workers.push(moderationWorker);
  console.log(JSON.stringify({ level: 'info', message: 'Moderation worker registered' }));

  const fraudDetectionWorker = createFraudDetectionWorker(db, aiGateway);
  workers.push(fraudDetectionWorker);
  console.log(JSON.stringify({ level: 'info', message: 'Fraud detection worker registered' }));

  const sentimentAnalysisWorker = createSentimentAnalysisWorker(db, aiGateway);
  workers.push(sentimentAnalysisWorker);
  console.log(JSON.stringify({ level: 'info', message: 'Sentiment analysis worker registered' }));

  const notificationWorker = createNotificationWorker(db);
  workers.push(notificationWorker);
  console.log(JSON.stringify({ level: 'info', message: 'Notification worker registered' }));

  console.log(
    JSON.stringify({
      level: 'info',
      message: `All ${workers.length} workers registered and listening`,
      timestamp: new Date().toISOString(),
    }),
  );

  async function shutdown(signal: string): Promise<void> {
    console.log(
      JSON.stringify({
        level: 'info',
        message: `Received ${signal}, shutting down workers gracefully`,
        timestamp: new Date().toISOString(),
      }),
    );

    const closePromises = workers.map(async (worker) => {
      try {
        await worker.close();
        console.log(
          JSON.stringify({
            level: 'info',
            message: `Worker ${worker.name} closed`,
          }),
        );
      } catch (error) {
        console.log(
          JSON.stringify({
            level: 'error',
            message: `Error closing worker ${worker.name}`,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    });

    await Promise.allSettled(closePromises);

    console.log(
      JSON.stringify({
        level: 'info',
        message: 'All workers shut down, exiting',
        timestamp: new Date().toISOString(),
      }),
    );

    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      level: 'fatal',
      message: 'Failed to start workers',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }),
  );
  process.exit(1);
});
