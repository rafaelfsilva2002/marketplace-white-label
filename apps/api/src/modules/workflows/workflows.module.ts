import { Module, OnModuleInit } from '@nestjs/common';
import { DatabaseProvider } from '@/config/database.config';
import { WorkflowEngineService } from './services/workflow-engine.service';
import { WorkflowController } from './controllers/workflow.controller';
import { onboardingWorkflow } from './workflows/onboarding.workflow';
import { moderationWorkflow } from './workflows/moderation.workflow';

@Module({
  controllers: [WorkflowController],
  providers: [
    DatabaseProvider,
    WorkflowEngineService,
  ],
  exports: [WorkflowEngineService],
})
export class WorkflowsModule implements OnModuleInit {
  constructor(private readonly workflowEngine: WorkflowEngineService) {}

  onModuleInit(): void {
    this.workflowEngine.registerWorkflow(onboardingWorkflow);
    this.workflowEngine.registerWorkflow(moderationWorkflow);
  }
}
