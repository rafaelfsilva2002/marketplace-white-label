import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseProvider, DATABASE_TOKEN } from '@/config/database.config';
import { OutboxService } from '@/common/events/outbox.service';
import { AuditService } from '@/modules/audit/audit.service';
import { SubscriptionService } from './services/subscription.service';
import { SubscriptionController } from './controllers/subscription.controller';
import type { Database } from '@marketplace/database';

@Module({
  imports: [ConfigModule],
  controllers: [SubscriptionController],
  providers: [
    DatabaseProvider,
    {
      provide: AuditService,
      useFactory: (db: Database) => new AuditService(db),
      inject: [DATABASE_TOKEN],
    },
    OutboxService,
    SubscriptionService,
  ],
  exports: [SubscriptionService],
})
export class SubscriptionsModule {}
