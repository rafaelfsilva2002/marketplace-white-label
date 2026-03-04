import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseProvider } from '@/config/database.config';
import { AIGatewayProvider } from '@/config/ai-gateway.config';
import { AuditService } from '@/modules/audit/audit.service';
import { OutboxService } from '@/common/events/outbox.service';
import { DATABASE_TOKEN } from '@/config/database.config';
import type { Database } from '@marketplace/database';
import { AgentService } from './services/agent.service';
import { AgentToolsService } from './services/agent-tools.service';
import { DecisionDelegationService } from './services/decision-delegation.service';
import { AgentController } from './controllers/agent.controller';

@Module({
  imports: [ConfigModule],
  controllers: [AgentController],
  providers: [
    DatabaseProvider,
    AIGatewayProvider,
    {
      provide: AuditService,
      useFactory: (db: Database) => new AuditService(db),
      inject: [DATABASE_TOKEN],
    },
    {
      provide: OutboxService,
      useFactory: (db: Database) => new OutboxService(db),
      inject: [DATABASE_TOKEN],
    },
    AgentToolsService,
    AgentService,
    DecisionDelegationService,
  ],
  exports: [AgentService, DecisionDelegationService],
})
export class AgentsModule {}
