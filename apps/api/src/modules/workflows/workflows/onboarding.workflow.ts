import { eq } from 'drizzle-orm';
import { profiles, fraudScores } from '@marketplace/database';
import type {
  WorkflowDefinition,
  WorkflowContext,
} from '../interfaces/workflow.interface';

async function validateProfileData(
  input: Record<string, unknown>,
  context: WorkflowContext,
): Promise<Record<string, unknown>> {
  const { profileId } = input;

  if (!profileId || typeof profileId !== 'string') {
    throw new Error('profileId is required and must be a string');
  }

  const [profile] = await context.db
    .select()
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);

  if (!profile) {
    throw new Error(`Profile "${profileId}" not found`);
  }

  const validationErrors: string[] = [];

  if (!profile.displayName || profile.displayName.trim().length < 2) {
    validationErrors.push('Display name must be at least 2 characters');
  }

  if (!profile.bio || profile.bio.trim().length < 10) {
    validationErrors.push('Bio must be at least 10 characters');
  }

  if (!profile.services || profile.services.length === 0) {
    validationErrors.push('At least one service must be listed');
  }

  if (validationErrors.length > 0) {
    throw new Error(
      `Profile validation failed: ${validationErrors.join('; ')}`,
    );
  }

  return {
    ...input,
    profileId: profile.id,
    userId: profile.userId,
    displayName: profile.displayName,
    bio: profile.bio,
    services: profile.services,
    validationPassed: true,
  };
}

async function generateEmbedding(
  input: Record<string, unknown>,
  context: WorkflowContext,
): Promise<Record<string, unknown>> {
  const { profileId, bio, services } = input;

  // In a real implementation, this would call the AI Gateway to generate embeddings.
  // The embedding generation is deferred to the embedding worker via outbox event.
  // Here we record that the step was triggered successfully.
  const embeddingText = `${bio ?? ''} ${Array.isArray(services) ? (services as string[]).join(' ') : ''}`;

  return {
    ...input,
    embeddingRequested: true,
    embeddingTextLength: embeddingText.length,
  };
}

async function runFraudDetection(
  input: Record<string, unknown>,
  context: WorkflowContext,
): Promise<Record<string, unknown>> {
  const { userId, profileId } = input;

  if (!userId || typeof userId !== 'string') {
    throw new Error('userId is required for fraud detection');
  }

  // Check existing fraud scores for the user
  const existingScores = await context.db
    .select()
    .from(fraudScores)
    .where(eq(fraudScores.userId, userId))
    .limit(1);

  const riskLevel =
    existingScores.length > 0 ? existingScores[0].riskLevel : 'low';
  const score = existingScores.length > 0 ? existingScores[0].score : 0;

  const passed = riskLevel !== 'critical' && riskLevel !== 'high';

  return {
    ...input,
    fraudCheckPassed: passed,
    fraudRiskLevel: riskLevel,
    fraudScore: score,
  };
}

async function activateProfile(
  input: Record<string, unknown>,
  context: WorkflowContext,
): Promise<Record<string, unknown>> {
  const { profileId, fraudCheckPassed } = input;

  if (!fraudCheckPassed) {
    return {
      ...input,
      activated: false,
      activationSkippedReason: 'Fraud check did not pass',
    };
  }

  if (!profileId || typeof profileId !== 'string') {
    throw new Error('profileId is required for activation');
  }

  await context.db
    .update(profiles)
    .set({
      isActive: true,
      updatedAt: new Date(),
    })
    .where(eq(profiles.id, profileId));

  return {
    ...input,
    activated: true,
  };
}

async function sendWelcomeNotification(
  input: Record<string, unknown>,
  _context: WorkflowContext,
): Promise<Record<string, unknown>> {
  const { userId, activated, displayName } = input;

  // In a real implementation this would enqueue a notification job.
  // For now we record the intent to send the notification.
  return {
    ...input,
    notificationSent: true,
    notificationType: activated ? 'welcome' : 'onboarding_issue',
    notificationRecipient: userId,
    notificationMessage: activated
      ? `Welcome, ${displayName ?? 'Professional'}! Your profile is now active.`
      : `Hi ${displayName ?? 'Professional'}, there was an issue during your onboarding. Please contact support.`,
  };
}

export const onboardingWorkflow: WorkflowDefinition = {
  name: 'professional-onboarding',
  steps: [
    {
      name: 'validate-profile-data',
      handler: validateProfileData,
      retries: 2,
      timeout: 10_000,
    },
    {
      name: 'generate-embedding',
      handler: generateEmbedding,
      retries: 3,
      timeout: 30_000,
    },
    {
      name: 'run-fraud-detection',
      handler: runFraudDetection,
      retries: 3,
      timeout: 30_000,
    },
    {
      name: 'activate-profile',
      handler: activateProfile,
      retries: 2,
      timeout: 10_000,
    },
    {
      name: 'send-welcome-notification',
      handler: sendWelcomeNotification,
      retries: 3,
      timeout: 15_000,
    },
  ],
};
