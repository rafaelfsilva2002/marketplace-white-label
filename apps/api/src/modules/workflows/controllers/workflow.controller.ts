import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Inject,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  NotFoundException,
  BadRequestException,
  Headers,
  Logger,
} from '@nestjs/common';
import { eq, desc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { workflows, workflowSteps, type Database } from '@marketplace/database';
import { DATABASE_TOKEN } from '@/config/database.config';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { UserRole, ApiResponse } from '@marketplace/shared';
import { WorkflowEngineService } from '../services/workflow-engine.service';
import type {
  WorkflowStartResult,
  WorkflowStatusResult,
  WorkflowStepResult,
} from '../interfaces/workflow.interface';

class StartWorkflowDto {
  input: Record<string, unknown>;
}

@Controller('workflows')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.Admin)
export class WorkflowController {
  private readonly logger = new Logger(WorkflowController.name);

  constructor(
    private readonly workflowEngine: WorkflowEngineService,
    @Inject(DATABASE_TOKEN) private readonly db: Database,
  ) {}

  @Post(':name/start')
  @HttpCode(HttpStatus.CREATED)
  async startWorkflow(
    @Param('name') name: string,
    @Body() dto: StartWorkflowDto,
    @Headers('x-correlation-id') headerCorrelationId?: string,
  ): Promise<ApiResponse<WorkflowStartResult>> {
    const correlationId = headerCorrelationId ?? uuidv4();

    if (!this.workflowEngine.isWorkflowRegistered(name)) {
      throw new BadRequestException(
        `Workflow "${name}" is not registered. Available: ${this.workflowEngine.getRegisteredWorkflows().join(', ')}`,
      );
    }

    this.logger.log({
      message: 'Starting workflow',
      name,
      correlationId,
    });

    const result = await this.workflowEngine.startWorkflow(
      name,
      dto.input ?? {},
      correlationId,
    );

    return {
      success: true,
      data: result,
    };
  }

  @Get(':id')
  async getWorkflow(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ApiResponse<WorkflowStatusResult>> {
    const [workflow] = await this.db
      .select()
      .from(workflows)
      .where(eq(workflows.id, id))
      .limit(1);

    if (!workflow) {
      throw new NotFoundException(`Workflow "${id}" not found`);
    }

    return {
      success: true,
      data: {
        id: workflow.id,
        name: workflow.name,
        status: workflow.status,
        input: workflow.input,
        output: workflow.output,
        error: workflow.error,
        startedAt: workflow.startedAt,
        completedAt: workflow.completedAt,
        correlationId: workflow.correlationId,
        metadata: workflow.metadata,
        createdAt: workflow.createdAt,
        updatedAt: workflow.updatedAt,
      },
    };
  }

  @Get(':id/steps')
  async getWorkflowSteps(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ApiResponse<WorkflowStepResult[]>> {
    // Verify workflow exists
    const [workflow] = await this.db
      .select()
      .from(workflows)
      .where(eq(workflows.id, id))
      .limit(1);

    if (!workflow) {
      throw new NotFoundException(`Workflow "${id}" not found`);
    }

    const steps = await this.db
      .select()
      .from(workflowSteps)
      .where(eq(workflowSteps.workflowId, id))
      .orderBy(desc(workflowSteps.createdAt));

    const data: WorkflowStepResult[] = steps.map((step) => ({
      id: step.id,
      stepName: step.stepName,
      status: step.status,
      input: step.input,
      output: step.output,
      error: step.error,
      attempt: step.attempt,
      startedAt: step.startedAt,
      completedAt: step.completedAt,
      createdAt: step.createdAt,
    }));

    return {
      success: true,
      data,
    };
  }
}
