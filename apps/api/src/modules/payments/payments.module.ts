import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseProvider, DATABASE_TOKEN } from '@/config/database.config';
import { OutboxService } from '@/common/events/outbox.service';
import { AuditService } from '@/modules/audit/audit.service';
import { StripeService } from './services/stripe.service';
import { WalletService } from './services/wallet.service';
import { PaymentService } from './services/payment.service';
import { PaymentsController } from './controllers/payments.controller';
import type { Database } from '@marketplace/database';

@Module({
  imports: [ConfigModule],
  controllers: [PaymentsController],
  providers: [
    DatabaseProvider,
    {
      provide: AuditService,
      useFactory: (db: Database) => new AuditService(db),
      inject: [DATABASE_TOKEN],
    },
    OutboxService,
    StripeService,
    WalletService,
    PaymentService,
  ],
  exports: [StripeService, WalletService, PaymentService],
})
export class PaymentsModule {}
