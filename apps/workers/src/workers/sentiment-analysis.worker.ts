import { Worker, Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import type { Database } from '@marketplace/database';
import { reviews } from '@marketplace/database';
import type { AIGateway } from '@marketplace/ai-gateway';
import { QUEUE_NAMES, createRedisConnection } from '../queues';

export interface SentimentAnalysisJobData {
  reviewId: string;
  correlationId: string;
}

interface SentimentResult {
  label: 'positive' | 'neutral' | 'negative';
  score: number;
  summary: string;
}

const SENTIMENT_SYSTEM_PROMPT = `You are a sentiment analysis engine. Analyze the sentiment of the review provided by the user.

Respond ONLY with a valid JSON object in this exact format:
{"label": "positive", "score": 0.85, "summary": "brief summary of the sentiment"}

Rules:
- "label" must be one of: "positive", "neutral", "negative"
- "score" must be a number between 0.0 and 1.0 representing confidence
- "summary" must be a brief (max 50 words) summary explaining the sentiment
- Do NOT include any text outside the JSON object
- Do NOT wrap the JSON in markdown code blocks`;

function parseSentimentResponse(content: string): SentimentResult {
  const cleaned = content
    .replace(/```json\s*/g, '')
    .replace(/```\s*/g, '')
    .trim();

  const parsed = JSON.parse(cleaned);

  const validLabels = ['positive', 'neutral', 'negative'] as const;
  if (!validLabels.includes(parsed.label)) {
    throw new Error(`Invalid sentiment label: ${parsed.label}`);
  }

  const score = Number(parsed.score);
  if (isNaN(score) || score < 0 || score > 1) {
    throw new Error(`Invalid sentiment score: ${parsed.score}`);
  }

  return {
    label: parsed.label as SentimentResult['label'],
    score: Math.round(score * 100) / 100,
    summary: String(parsed.summary || '').slice(0, 200),
  };
}

async function processSentimentAnalysisJob(
  job: Job<SentimentAnalysisJobData>,
  db: Database,
  aiGateway: AIGateway,
): Promise<void> {
  const { reviewId, correlationId } = job.data;

  console.log(
    JSON.stringify({
      level: 'info',
      message: 'Processing sentiment analysis job',
      correlationId,
      reviewId,
      jobId: job.id,
    }),
  );

  const [review] = await db
    .select()
    .from(reviews)
    .where(eq(reviews.id, reviewId))
    .limit(1);

  if (!review) {
    console.log(
      JSON.stringify({
        level: 'warn',
        message: 'Review not found, skipping sentiment analysis',
        correlationId,
        reviewId,
      }),
    );
    return;
  }

  if (!review.comment || review.comment.trim().length === 0) {
    console.log(
      JSON.stringify({
        level: 'info',
        message: 'Review has no comment, skipping sentiment analysis',
        correlationId,
        reviewId,
      }),
    );
    return;
  }

  const response = await aiGateway.complete({
    messages: [
      { role: 'system', content: SENTIMENT_SYSTEM_PROMPT },
      { role: 'user', content: review.comment },
    ],
    temperature: 0,
    maxTokens: 200,
    correlationId,
  });

  let sentiment: SentimentResult;
  try {
    sentiment = parseSentimentResponse(response.content);
  } catch (parseError) {
    console.log(
      JSON.stringify({
        level: 'error',
        message: 'Failed to parse sentiment response',
        correlationId,
        reviewId,
        rawContent: response.content,
        error: parseError instanceof Error ? parseError.message : String(parseError),
      }),
    );

    sentiment = inferFallbackSentiment(review.rating);

    console.log(
      JSON.stringify({
        level: 'info',
        message: 'Using rating-based fallback sentiment',
        correlationId,
        reviewId,
        fallbackSentiment: sentiment.label,
      }),
    );
  }

  await db
    .update(reviews)
    .set({
      sentiment: sentiment.label,
      sentimentScore: sentiment.score,
      updatedAt: new Date(),
    })
    .where(eq(reviews.id, reviewId));

  console.log(
    JSON.stringify({
      level: 'info',
      message: 'Sentiment analysis completed',
      correlationId,
      reviewId,
      label: sentiment.label,
      score: sentiment.score,
      summary: sentiment.summary,
      model: response.model,
      costUsd: response.costUsd,
    }),
  );
}

function inferFallbackSentiment(rating: number): SentimentResult {
  if (rating >= 4) {
    return { label: 'positive', score: 0.7, summary: 'Inferred from high rating' };
  }
  if (rating <= 2) {
    return { label: 'negative', score: 0.7, summary: 'Inferred from low rating' };
  }
  return { label: 'neutral', score: 0.5, summary: 'Inferred from mid-range rating' };
}

export function createSentimentAnalysisWorker(
  db: Database,
  aiGateway: AIGateway,
): Worker<SentimentAnalysisJobData> {
  const connection = createRedisConnection();

  const worker = new Worker<SentimentAnalysisJobData>(
    QUEUE_NAMES.SENTIMENT_ANALYSIS,
    async (job) => processSentimentAnalysisJob(job, db, aiGateway),
    {
      connection,
      concurrency: 5,
      limiter: {
        max: 40,
        duration: 60_000,
      },
    },
  );

  worker.on('completed', (job) => {
    console.log(
      JSON.stringify({
        level: 'info',
        message: 'Sentiment analysis job completed',
        jobId: job.id,
        correlationId: job.data.correlationId,
        reviewId: job.data.reviewId,
      }),
    );
  });

  worker.on('failed', (job, error) => {
    console.log(
      JSON.stringify({
        level: 'error',
        message: 'Sentiment analysis job failed',
        jobId: job?.id,
        correlationId: job?.data.correlationId,
        reviewId: job?.data.reviewId,
        error: error.message,
        stack: error.stack,
      }),
    );
  });

  return worker;
}
