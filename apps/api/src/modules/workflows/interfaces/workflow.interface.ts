import type { Database } from '@marketplace/database';

export interface WorkflowContext {
  workflowId: string;
  correlationId: string;
  db: Database;
  attempt: number;
  metadata: Record<string, unknown>;
}

export interface WorkflowStepDefinition {
  name: string;
  handler: (
    input: Record<string, unknown>,
    context: WorkflowContext,
  ) => Promise<Record<string, unknown>>;
  retries?: number;
  timeout?: number;
}

export interface WorkflowDefinition {
  name: string;
  steps: WorkflowStepDefinition[];
}

export interface WorkflowStartResult {
  workflowId: string;
  correlationId: string;
}

export interface WorkflowStatusResult {
  id: string;
  name: string;
  status: string;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  correlationId: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowStepResult {
  id: string;
  stepName: string;
  status: string;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error: string | null;
  attempt: number;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}
