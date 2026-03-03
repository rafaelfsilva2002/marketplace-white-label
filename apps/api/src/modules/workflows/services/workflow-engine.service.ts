import { Injectable, Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
  workflows,
  workflowSteps,
  outboxEvents,
  type Database,
} from '@marketplace/database';
import { DATABASE_TOKEN } from '@/config/database.config';
import { StructuredLogger } from '@/common/logger/structured.logger';
import type {
  WorkflowDefinition,
  WorkflowContext,
  WorkflowStartResult,
} from '../interfaces/workflow.interface';

const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30_000;
const DEFAULT_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 60_000;

@Injectable()
export class WorkflowEngineService {
  private readonly logger = new StructuredLogger('WorkflowEngineService');
  private readonly registry = new Map<string, WorkflowDefinition>();

  constructor(@Inject(DATABASE_TOKEN) private readonly db: Database) {}

  registerWorkflow(definition: WorkflowDefinition): void {
    if (this.registry.has(definition.name)) {
      this.logger.logWithData(
        'warn',
        'Workflow already registered, overwriting',
        { name: definition.name },
        'WorkflowEngineService',
      );
    }

    this.registry.set(definition.name, definition);

    this.logger.logWithData(
      'info',
      'Workflow registered',
      {
        name: definition.name,
        stepCount: definition.steps.length,
        steps: definition.steps.map((s) => s.name),
      },
      'WorkflowEngineService',
    );
  }

  async startWorkflow(
    name: string,
    input: Record<string, unknown>,
    correlationId?: string,
  ): Promise<WorkflowStartResult> {
    const definition = this.registry.get(name);
    if (!definition) {
      throw new Error(`Workflow "${name}" is not registered`);
    }

    const corrId = correlationId ?? randomUUID();

    const [workflow] = await this.db
      .insert(workflows)
      .values({
        name,
        status: 'pending',
        input,
        correlationId: corrId,
        metadata: {},
      })
      .returning();

    this.logger.logWithData(
      'info',
      'Workflow created, starting execution',
      {
        workflowId: workflow.id,
        name,
        correlationId: corrId,
      },
      'WorkflowEngineService',
    );

    // Fire and forget: run in background
    this.executeWorkflow(definition, workflow.id, input, corrId).catch(
      (error) => {
        this.logger.logError(
          'Workflow execution failed unexpectedly',
          error instanceof Error ? error : new Error(String(error)),
          { workflowId: workflow.id, correlationId: corrId },
          'WorkflowEngineService',
        );
      },
    );

    return {
      workflowId: workflow.id,
      correlationId: corrId,
    };
  }

  private async executeWorkflow(
    definition: WorkflowDefinition,
    workflowId: string,
    input: Record<string, unknown>,
    correlationId: string,
  ): Promise<void> {
    // Mark workflow as running
    await this.db
      .update(workflows)
      .set({
        status: 'running',
        startedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(workflows.id, workflowId));

    await this.insertOutboxEvent(
      'marketplace.workflow.started',
      workflowId,
      correlationId,
      { name: definition.name, input },
    );

    let stepOutput: Record<string, unknown> = { ...input };

    for (const stepDef of definition.steps) {
      try {
        stepOutput = await this.executeStep(
          stepDef,
          workflowId,
          stepOutput,
          correlationId,
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        await this.db
          .update(workflows)
          .set({
            status: 'failed',
            error: `Step "${stepDef.name}" failed: ${errorMessage}`,
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(workflows.id, workflowId));

        await this.insertOutboxEvent(
          'marketplace.workflow.failed',
          workflowId,
          correlationId,
          {
            name: definition.name,
            failedStep: stepDef.name,
            error: errorMessage,
          },
        );

        this.logger.logWithData(
          'error',
          'Workflow failed',
          {
            workflowId,
            step: stepDef.name,
            error: errorMessage,
            correlationId,
          },
          'WorkflowEngineService',
        );

        return;
      }
    }

    // Mark workflow as completed
    await this.db
      .update(workflows)
      .set({
        status: 'completed',
        output: stepOutput,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(workflows.id, workflowId));

    await this.insertOutboxEvent(
      'marketplace.workflow.completed',
      workflowId,
      correlationId,
      { name: definition.name, output: stepOutput },
    );

    this.logger.logWithData(
      'info',
      'Workflow completed',
      { workflowId, name: definition.name, correlationId },
      'WorkflowEngineService',
    );
  }

  private async executeStep(
    stepDef: {
      name: string;
      handler: (
        input: Record<string, unknown>,
        context: WorkflowContext,
      ) => Promise<Record<string, unknown>>;
      retries?: number;
      timeout?: number;
    },
    workflowId: string,
    input: Record<string, unknown>,
    correlationId: string,
  ): Promise<Record<string, unknown>> {
    const maxRetries = stepDef.retries ?? DEFAULT_RETRIES;
    const timeoutMs = stepDef.timeout ?? DEFAULT_TIMEOUT_MS;

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const [stepRecord] = await this.db
        .insert(workflowSteps)
        .values({
          workflowId,
          stepName: stepDef.name,
          status: 'running',
          input,
          attempt,
          startedAt: new Date(),
        })
        .returning();

      const context: WorkflowContext = {
        workflowId,
        correlationId,
        db: this.db,
        attempt,
        metadata: {},
      };

      try {
        const output = await this.executeWithTimeout(
          () => stepDef.handler(input, context),
          timeoutMs,
          stepDef.name,
        );

        // Mark step as completed
        await this.db
          .update(workflowSteps)
          .set({
            status: 'completed',
            output,
            completedAt: new Date(),
          })
          .where(eq(workflowSteps.id, stepRecord.id));

        this.logger.logWithData(
          'info',
          'Workflow step completed',
          {
            workflowId,
            step: stepDef.name,
            attempt,
            correlationId,
          },
          'WorkflowEngineService',
        );

        return output;
      } catch (error) {
        lastError =
          error instanceof Error ? error : new Error(String(error));

        await this.db
          .update(workflowSteps)
          .set({
            status: 'failed',
            error: lastError.message,
            completedAt: new Date(),
          })
          .where(eq(workflowSteps.id, stepRecord.id));

        this.logger.logWithData(
          'warn',
          'Workflow step failed',
          {
            workflowId,
            step: stepDef.name,
            attempt,
            maxRetries,
            error: lastError.message,
            correlationId,
          },
          'WorkflowEngineService',
        );

        if (attempt < maxRetries) {
          const backoff = Math.min(
            BASE_BACKOFF_MS * Math.pow(2, attempt - 1),
            MAX_BACKOFF_MS,
          );
          await this.sleep(backoff);
        }
      }
    }

    throw lastError ?? new Error(`Step "${stepDef.name}" failed after retries`);
  }

  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    stepName: string,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(
            `Step "${stepName}" timed out after ${timeoutMs}ms`,
          ),
        );
      }, timeoutMs);

      fn()
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private async insertOutboxEvent(
    eventType: string,
    workflowId: string,
    correlationId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.db.insert(outboxEvents).values({
        eventType,
        aggregateType: 'workflow',
        aggregateId: workflowId,
        correlationId,
        payload,
        status: 'pending',
      });
    } catch (error) {
      this.logger.logError(
        'Failed to insert outbox event',
        error instanceof Error ? error : new Error(String(error)),
        { eventType, workflowId, correlationId },
        'WorkflowEngineService',
      );
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getRegisteredWorkflows(): string[] {
    return Array.from(this.registry.keys());
  }

  isWorkflowRegistered(name: string): boolean {
    return this.registry.has(name);
  }
}
