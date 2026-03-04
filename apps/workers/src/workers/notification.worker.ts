import { Worker, Job } from 'bullmq';
import { QUEUE_NAMES, createRedisConnection } from '../queues';

export type NotificationType =
  | 'payment.succeeded'
  | 'profile.approved'
  | 'profile.deactivated'
  | 'review.created'
  | 'subscription.expiring';

export interface NotificationJobData {
  type: NotificationType;
  userId: string;
  correlationId: string;
  metadata?: Record<string, unknown>;
}

interface NotificationPayload {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
}

function buildNotificationPayload(data: NotificationJobData): NotificationPayload {
  const { type, userId, metadata = {} } = data;

  switch (type) {
    case 'payment.succeeded':
      return {
        userId,
        type,
        title: 'Payment Received',
        body: `Your payment of ${metadata.amount ?? 'N/A'} ${metadata.currency ?? 'BRL'} has been processed successfully.`,
        metadata,
      };

    case 'profile.approved':
      return {
        userId,
        type,
        title: 'Profile Approved',
        body: 'Your profile has been reviewed and approved by our moderation team. It is now visible to users.',
        metadata,
      };

    case 'profile.deactivated':
      return {
        userId,
        type,
        title: 'Profile Deactivated',
        body: `Your profile has been deactivated. Reason: ${metadata.reason ?? 'policy violation'}. Please contact support for more information.`,
        metadata,
      };

    case 'review.created':
      return {
        userId,
        type,
        title: 'New Review Received',
        body: `You received a new ${metadata.rating ?? ''}${metadata.rating ? '-star' : ''} review${metadata.reviewerName ? ` from ${metadata.reviewerName}` : ''}.`,
        metadata,
      };

    case 'subscription.expiring':
      return {
        userId,
        type,
        title: 'Subscription Expiring Soon',
        body: `Your ${metadata.planName ?? 'subscription'} plan expires on ${metadata.expiresAt ?? 'soon'}. Renew now to keep your benefits.`,
        metadata,
      };

    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown notification type: ${_exhaustive}`);
    }
  }
}

async function processNotificationJob(
  job: Job<NotificationJobData>,
): Promise<void> {
  const { type, userId, correlationId } = job.data;

  console.log(
    JSON.stringify({
      level: 'info',
      message: 'Processing notification job',
      correlationId,
      userId,
      type,
      jobId: job.id,
    }),
  );

  const payload = buildNotificationPayload(job.data);

  // TODO: Replace with actual email/push notification delivery
  // For now, log the notification as structured output
  console.log(
    JSON.stringify({
      level: 'info',
      message: 'Notification dispatched',
      correlationId,
      notification: {
        userId: payload.userId,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        metadata: payload.metadata,
      },
      channel: 'log', // Will be 'email' | 'push' | 'sms' when delivery is implemented
      timestamp: new Date().toISOString(),
    }),
  );
}

export function createNotificationWorker(): Worker<NotificationJobData> {
  const connection = createRedisConnection();

  const worker = new Worker<NotificationJobData>(
    QUEUE_NAMES.NOTIFICATION,
    async (job) => processNotificationJob(job),
    {
      connection,
      concurrency: 10,
      limiter: {
        max: 100,
        duration: 60_000,
      },
    },
  );

  worker.on('completed', (job) => {
    console.log(
      JSON.stringify({
        level: 'info',
        message: 'Notification job completed',
        jobId: job.id,
        correlationId: job.data.correlationId,
        userId: job.data.userId,
        type: job.data.type,
      }),
    );
  });

  worker.on('failed', (job, error) => {
    console.log(
      JSON.stringify({
        level: 'error',
        message: 'Notification job failed',
        jobId: job?.id,
        correlationId: job?.data.correlationId,
        userId: job?.data.userId,
        type: job?.data.type,
        error: error.message,
        stack: error.stack,
      }),
    );
  });

  return worker;
}
