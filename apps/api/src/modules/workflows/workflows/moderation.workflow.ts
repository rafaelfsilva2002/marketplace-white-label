import { eq } from 'drizzle-orm';
import { moderationQueue } from '@marketplace/database';
import type {
  WorkflowDefinition,
  WorkflowContext,
} from '../interfaces/workflow.interface';

const AUTO_APPROVE_THRESHOLD = 0.85;
const MANUAL_REVIEW_THRESHOLD = 0.4;

async function analyzeContent(
  input: Record<string, unknown>,
  context: WorkflowContext,
): Promise<Record<string, unknown>> {
  const { entityType, entityId, contentType } = input;

  if (!entityType || typeof entityType !== 'string') {
    throw new Error('entityType is required');
  }
  if (!entityId || typeof entityId !== 'string') {
    throw new Error('entityId is required');
  }

  // In a real implementation, this would call the AI Gateway for content analysis.
  // For photos: vision API analysis
  // For text: moderation API + sentiment analysis
  // Here we simulate the analysis result structure.
  const analysisResult = {
    entityType,
    entityId,
    contentType: contentType ?? 'text',
    score: 0.9, // Placeholder: in production, comes from AI Gateway
    labels: [] as string[],
    flagged: false,
    reason: null as string | null,
    analyzedAt: new Date().toISOString(),
  };

  return {
    ...input,
    analysis: analysisResult,
    autoScore: analysisResult.score,
    flagged: analysisResult.flagged,
    labels: analysisResult.labels,
  };
}

async function handleFlaggedContent(
  input: Record<string, unknown>,
  context: WorkflowContext,
): Promise<Record<string, unknown>> {
  const { flagged, entityType, entityId, userId, autoScore, labels } =
    input;

  if (!flagged) {
    return {
      ...input,
      moderationQueueEntryCreated: false,
      reason: 'Content not flagged',
    };
  }

  if (!entityId || typeof entityId !== 'string') {
    throw new Error('entityId is required');
  }
  if (!userId || typeof userId !== 'string') {
    throw new Error('userId is required for moderation queue');
  }

  const contentType = (input.contentType as string) ?? 'text';
  const moderationType =
    contentType === 'photo' ? 'photo' : 'text';

  const [entry] = await context.db
    .insert(moderationQueue)
    .values({
      type: moderationType as 'photo' | 'text' | 'profile' | 'review',
      entityType: entityType as string,
      entityId,
      userId,
      status: 'pending',
      autoScore: typeof autoScore === 'number' ? autoScore : null,
      autoReason: 'Flagged by AI content analysis',
      autoLabels: Array.isArray(labels) ? labels : [],
      contentSnapshot: input.analysis as Record<string, unknown>,
      metadata: {
        workflowId: context.workflowId,
        correlationId: context.correlationId,
      },
    })
    .returning();

  return {
    ...input,
    moderationQueueEntryCreated: true,
    moderationQueueEntryId: entry.id,
  };
}

async function autoApproveOrEscalate(
  input: Record<string, unknown>,
  context: WorkflowContext,
): Promise<Record<string, unknown>> {
  const {
    flagged,
    autoScore,
    moderationQueueEntryId,
  } = input;

  // If content was not flagged and score is high, auto-approve
  if (!flagged && typeof autoScore === 'number' && autoScore >= AUTO_APPROVE_THRESHOLD) {
    return {
      ...input,
      decision: 'auto_approved',
      requiresManualReview: false,
    };
  }

  // If flagged but score is borderline, escalate to manual review
  if (
    typeof autoScore === 'number' &&
    autoScore >= MANUAL_REVIEW_THRESHOLD &&
    autoScore < AUTO_APPROVE_THRESHOLD
  ) {
    if (moderationQueueEntryId && typeof moderationQueueEntryId === 'string') {
      await context.db
        .update(moderationQueue)
        .set({
          status: 'escalated',
          updatedAt: new Date(),
        })
        .where(eq(moderationQueue.id, moderationQueueEntryId));
    }

    return {
      ...input,
      decision: 'escalated',
      requiresManualReview: true,
    };
  }

  // If score is too low, keep in queue for manual review
  return {
    ...input,
    decision: flagged ? 'pending_manual_review' : 'auto_approved',
    requiresManualReview: flagged,
  };
}

async function notifyModerator(
  input: Record<string, unknown>,
  _context: WorkflowContext,
): Promise<Record<string, unknown>> {
  const { requiresManualReview, decision, entityType, entityId } = input;

  if (!requiresManualReview) {
    return {
      ...input,
      moderatorNotified: false,
      reason: 'No manual review required',
    };
  }

  // In a real implementation this would send a notification to moderators
  // via email, push notification, or in-app notification queue.
  return {
    ...input,
    moderatorNotified: true,
    notificationType: 'moderation_review_needed',
    notificationPayload: {
      decision,
      entityType,
      entityId,
      message: `Content requires manual review: ${entityType} ${entityId}`,
    },
  };
}

export const moderationWorkflow: WorkflowDefinition = {
  name: 'content-moderation',
  steps: [
    {
      name: 'analyze-content',
      handler: analyzeContent,
      retries: 3,
      timeout: 60_000,
    },
    {
      name: 'handle-flagged-content',
      handler: handleFlaggedContent,
      retries: 2,
      timeout: 10_000,
    },
    {
      name: 'auto-approve-or-escalate',
      handler: autoApproveOrEscalate,
      retries: 2,
      timeout: 10_000,
    },
    {
      name: 'notify-moderator',
      handler: notifyModerator,
      retries: 3,
      timeout: 15_000,
    },
  ],
};
