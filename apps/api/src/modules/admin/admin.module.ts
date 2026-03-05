import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseProvider, DATABASE_TOKEN } from '@/config/database.config';
import { AuditService } from '@/modules/audit/audit.service';
import { AdminService } from './services/admin.service';
import { AnalyticsService } from './services/analytics.service';
import { AdminController } from './controllers/admin.controller';
import { AnalyticsController } from './controllers/analytics.controller';
import type { Database } from '@marketplace/database';

@Module({
  imports: [ConfigModule],
  controllers: [AdminController, AnalyticsController],
  providers: [
    DatabaseProvider,
    {
      provide: AuditService,
      useFactory: (db: Database) => new AuditService(db),
      inject: [DATABASE_TOKEN],
    },
    AdminService,
    AnalyticsService,
  ],
  exports: [AdminService, AnalyticsService],
})
export class AdminModule {}
