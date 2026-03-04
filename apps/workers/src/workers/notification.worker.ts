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
  email?: string;
  correlationId: string;
  metadata?: Record<string, unknown>;
}

interface NotificationPayload {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  html: string;
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Standalone email helper — runs outside NestJS DI
// Mirrors the API-side EmailService logic so the worker can send emails
// directly from its own process.
// ---------------------------------------------------------------------------
let sgMail: any = null;
let sgMailInitialized = false;

async function initSendGrid(): Promise<void> {
  if (sgMailInitialized) return;
  sgMailInitialized = true;

  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    console.log(
      JSON.stringify({
        level: 'warn',
        message: 'SENDGRID_API_KEY not set, emails will be logged only',
      }),
    );
    return;
  }

  try {
    const sg = await import('@sendgrid/mail');
    sg.default.setApiKey(apiKey);
    sgMail = sg.default;
    console.log(
      JSON.stringify({ level: 'info', message: 'SendGrid configured for notification worker' }),
    );
  } catch {
    console.log(
      JSON.stringify({
        level: 'warn',
        message: 'SendGrid module not available, emails will be logged only',
      }),
    );
  }
}

async function sendEmail(params: {
  to: string;
  subject: string;
  text: string;
  html: string;
  correlationId: string;
}): Promise<boolean> {
  const from = process.env.EMAIL_FROM || 'noreply@marketplace.com';

  if (!sgMail) {
    console.log(
      JSON.stringify({
        level: 'info',
        message: '[DEV EMAIL] Email logged (SendGrid not configured)',
        correlationId: params.correlationId,
        to: params.to,
        subject: params.subject,
        body: params.text,
      }),
    );
    return true;
  }

  try {
    await sgMail.send({
      to: params.to,
      from,
      subject: params.subject,
      text: params.text,
      html: params.html,
    });
    console.log(
      JSON.stringify({
        level: 'info',
        message: 'Email sent via SendGrid',
        correlationId: params.correlationId,
        to: params.to,
        subject: params.subject,
      }),
    );
    return true;
  } catch (error) {
    console.log(
      JSON.stringify({
        level: 'error',
        message: 'Failed to send email via SendGrid',
        correlationId: params.correlationId,
        to: params.to,
        subject: params.subject,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return false;
  }
}

// ---------------------------------------------------------------------------
// Notification payload builder
// ---------------------------------------------------------------------------
function buildNotificationPayload(data: NotificationJobData): NotificationPayload {
  const { type, userId, metadata = {} } = data;

  switch (type) {
    case 'payment.succeeded': {
      const amount = metadata.amount as number | undefined;
      const currency = (metadata.currency as string) || 'BRL';
      const formatted = amount != null ? `${currency} ${(amount / 100).toFixed(2)}` : `N/A ${currency}`;
      return {
        userId,
        type,
        title: 'Pagamento confirmado',
        body: `Seu pagamento de ${formatted} foi confirmado com sucesso.`,
        html: `<h2>Pagamento Confirmado</h2><p>Seu pagamento de <strong>${formatted}</strong> foi confirmado com sucesso.</p>`,
        metadata,
      };
    }

    case 'profile.approved': {
      const profileName = (metadata.profileName as string) || 'seu perfil';
      return {
        userId,
        type,
        title: 'Perfil aprovado',
        body: `Seu perfil "${profileName}" foi aprovado e ja esta visivel na plataforma.`,
        html: `<h2>Perfil Aprovado</h2><p>Seu perfil <strong>"${profileName}"</strong> foi aprovado e ja esta visivel na plataforma.</p>`,
        metadata,
      };
    }

    case 'profile.deactivated': {
      const reason = (metadata.reason as string) || 'policy violation';
      return {
        userId,
        type,
        title: 'Perfil desativado',
        body: `Seu perfil foi desativado. Motivo: ${reason}`,
        html: `<h2>Perfil Desativado</h2><p>Seu perfil foi desativado. Motivo: <strong>${reason}</strong></p>`,
        metadata,
      };
    }

    case 'review.created': {
      const rating = metadata.rating as number | undefined;
      const profileName = (metadata.profileName as string) || 'seu perfil';
      const stars = rating != null ? `${rating} estrelas` : 'nova avaliacao';
      return {
        userId,
        type,
        title: `Nova avaliacao: ${stars}`,
        body: `Seu perfil "${profileName}" recebeu uma nova avaliacao de ${stars}.`,
        html: `<h2>Nova Avaliacao</h2><p>Seu perfil <strong>"${profileName}"</strong> recebeu uma nova avaliacao de <strong>${stars}</strong>.</p>`,
        metadata,
      };
    }

    case 'subscription.expiring': {
      const planType = (metadata.planType as string) || 'sua assinatura';
      const daysLeft = metadata.daysLeft as number | undefined;
      const daysText = daysLeft != null ? `${daysLeft} dias` : 'em breve';
      return {
        userId,
        type,
        title: 'Assinatura expirando em breve',
        body: `Sua assinatura ${planType} expira em ${daysText}. Renove para manter seus beneficios.`,
        html: `<h2>Assinatura Expirando</h2><p>Sua assinatura <strong>${planType}</strong> expira em <strong>${daysText}</strong>. Renove para manter seus beneficios.</p>`,
        metadata,
      };
    }

    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown notification type: ${_exhaustive}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Job processor
// ---------------------------------------------------------------------------
async function processNotificationJob(
  job: Job<NotificationJobData>,
): Promise<void> {
  const { type, userId, email, correlationId } = job.data;

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

  // Ensure SendGrid is initialized on first job
  await initSendGrid();

  const payload = buildNotificationPayload(job.data);

  // --- Channel 1: Structured log (always) ---
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
      channel: 'log',
      timestamp: new Date().toISOString(),
    }),
  );

  // --- Channel 2: Email delivery ---
  if (email) {
    const sent = await sendEmail({
      to: email,
      subject: payload.title,
      text: payload.body,
      html: payload.html,
      correlationId,
    });

    console.log(
      JSON.stringify({
        level: sent ? 'info' : 'warn',
        message: sent ? 'Email notification delivered' : 'Email notification failed (non-fatal)',
        correlationId,
        userId,
        email,
        channel: 'email',
        timestamp: new Date().toISOString(),
      }),
    );
  } else {
    console.log(
      JSON.stringify({
        level: 'info',
        message: 'No email address provided, skipping email channel',
        correlationId,
        userId,
        channel: 'email',
        timestamp: new Date().toISOString(),
      }),
    );
  }

  // Channel 3 — WebSocket push via NestJS API
  const apiUrl = process.env.API_INTERNAL_URL || 'http://localhost:3001';
  if (userId) {
    try {
      await fetch(`${apiUrl}/api/v1/notifications/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          event: type,
          data: { title: payload.title, body: payload.body },
        }),
      });
    } catch (err) {
      // Non-critical: log and continue
      console.log(JSON.stringify({ level: 'warn', message: 'WebSocket push failed', error: String(err) }));
    }
  }
}

// ---------------------------------------------------------------------------
// Worker factory
// ---------------------------------------------------------------------------
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
