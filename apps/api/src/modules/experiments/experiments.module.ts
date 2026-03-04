import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseProvider, DATABASE_TOKEN } from '@/config/database.config';
import { AIGatewayProvider } from '@/config/ai-gateway.config';
import { AuditService } from '@/modules/audit/audit.service';
import type { Database } from '@marketplace/database';
import { ExperimentService } from './services/experiment.service';
import { ABRouterService } from './services/ab-router.service';
import { ExperimentController } from './controllers/experiment.controller';

@Module({
  imports: [ConfigModule],
  controllers: [ExperimentController],
  providers: [
    DatabaseProvider,
    AIGatewayProvider,
    {
      provide: AuditService,
      useFactory: (db: Database) => new AuditService(db),
      inject: [DATABASE_TOKEN],
    },
    ExperimentService,
    ABRouterService,
  ],
  exports: [ExperimentService, ABRouterService],
})
export class ExperimentsModule {}
