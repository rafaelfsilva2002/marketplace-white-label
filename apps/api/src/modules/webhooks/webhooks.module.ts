import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseProvider, DATABASE_TOKEN } from '@/config/database.config';
import { AuditService } from '@/modules/audit/audit.service';
import { PaymentsModule } from '@/modules/payments/payments.module';
import { SubscriptionsModule } from '@/modules/subscriptions/subscriptions.module';
import { StripeWebhookController } from './controllers/stripe-webhook.controller';
import type { Database } from '@marketplace/database';

@Module({
  imports: [ConfigModule, PaymentsModule, SubscriptionsModule],
  controllers: [StripeWebhookController],
  providers: [
    DatabaseProvider,
    {
      provide: AuditService,
      useFactory: (db: Database) => new AuditService(db),
      inject: [DATABASE_TOKEN],
    },
  ],
})
export class WebhooksModule {}
