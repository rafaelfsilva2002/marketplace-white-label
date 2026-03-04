import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DatabaseProvider, DATABASE_TOKEN } from '@/config/database.config';
import { OutboxService } from '@/common/events/outbox.service';
import { AuditService } from '@/modules/audit/audit.service';
import {
  CRYPTO_GATEWAY,
  MockCryptoAdapter,
  DfnsCryptoAdapter,
} from '@marketplace/crypto-gateway';
import { CryptoWalletService } from './services/crypto-wallet.service';
import { CryptoBalanceService } from './services/crypto-balance.service';
import { CryptoPaymentService } from './services/crypto-payment.service';
import { CryptoController } from './controllers/crypto.controller';
import type { Database } from '@marketplace/database';

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
    {
      provide: CRYPTO_GATEWAY,
      useFactory: (config: ConfigService) => {
        const provider = config.get('CRYPTO_PROVIDER', 'mock');
        if (provider === 'dfns') {
          return new DfnsCryptoAdapter({
            appId: config.getOrThrow('DFNS_APP_ID'),
            authToken: config.getOrThrow('DFNS_AUTH_TOKEN'),
            baseUrl: config.getOrThrow('DFNS_BASE_URL'),
          });
        }
        return new MockCryptoAdapter();
      },
      inject: [ConfigService],
    },
    CryptoWalletService,
    CryptoBalanceService,
    CryptoPaymentService,
  ],
  exports: [CryptoWalletService, CryptoBalanceService, CryptoPaymentService],
})
export class CryptoModule {}
