import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseProvider, DATABASE_TOKEN } from '@/config/database.config';
import { OutboxService } from '@/common/events/outbox.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AML_PROVIDER } from './aml-provider.interface';
import { InternalAmlAdapter } from './adapters/internal.adapter';
import { SarService } from './services/sar.service';
import { ReviewQueueService } from './services/review-queue.service';
import { BlacklistService } from './services/blacklist.service';
import { AmlController } from './controllers/aml.controller';
import type { Database } from '@marketplace/database';

@Module({
  imports: [ConfigModule],
  controllers: [AmlController],
  providers: [
    DatabaseProvider,
    {
      provide: AuditService,
      useFactory: (db: Database) => new AuditService(db),
      inject: [DATABASE_TOKEN],
    },
    OutboxService,
    {
      provide: AML_PROVIDER,
      useClass: InternalAmlAdapter,
    },
    SarService,
    ReviewQueueService,
    BlacklistService,
  ],
  exports: [AML_PROVIDER, SarService, ReviewQueueService, BlacklistService],
})
export class AmlModule {}
