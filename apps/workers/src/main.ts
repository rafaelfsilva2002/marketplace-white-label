import { Worker } from 'bullmq';
import IORedis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

console.log('Workers starting...');
console.log(`Connected to Redis: ${REDIS_URL}`);

// Workers will be registered here as they are implemented
// Example:
// import { embeddingProcessor } from './processors/embedding.processor';
// new Worker('embedding', embeddingProcessor, { connection });

process.on('SIGTERM', async () => {
  console.log('Shutting down workers...');
  await connection.quit();
  process.exit(0);
});
