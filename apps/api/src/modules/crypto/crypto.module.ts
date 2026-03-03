import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseProvider, DATABASE_TOKEN } from '@/config/database.config';
import { OutboxService } from '@/common/events/outbox.service';
import { AuditService } from '@/modules/audit/audit.service';
import type { Database } from '@marketplace/database';
import { EthereumAdapter } from './adapters/ethereum.adapter';
import { PolygonAdapter } from './adapters/polygon.adapter';
import { SolanaAdapter } from './adapters/solana.adapter';
import { CryptoService } from './services/crypto.service';
import { AmlComplianceService } from './services/aml-compliance.service';
import { AmlCheckGuard } from './middleware/aml-check.guard';
import { CryptoController } from './controllers/crypto.controller';

@Module({
  imports: [ConfigModule],
  controllers: [CryptoController],
  providers: [
    DatabaseProvider,
    {
      provide: AuditService,
      useFactory: (db: Database) => new AuditService(db),
      inject: [DATABASE_TOKEN],
    },
    OutboxService,
    EthereumAdapter,
    PolygonAdapter,
    SolanaAdapter,
    CryptoService,
    AmlComplianceService,
    AmlCheckGuard,
  ],
  exports: [CryptoService, AmlComplianceService],
})
export class CryptoModule {}
