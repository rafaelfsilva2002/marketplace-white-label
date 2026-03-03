import { Module, type DynamicModule } from '@nestjs/common';
import { AuditService } from './audit.service';
import type { Database } from '@marketplace/database';

const AUDIT_DB_TOKEN = 'AUDIT_DATABASE';

@Module({})
export class AuditModule {
  static forRoot(db: Database): DynamicModule {
    return {
      module: AuditModule,
      providers: [
        {
          provide: AUDIT_DB_TOKEN,
          useValue: db,
        },
        {
          provide: AuditService,
          useFactory: (database: Database) => new AuditService(database),
          inject: [AUDIT_DB_TOKEN],
        },
      ],
      exports: [AuditService],
      global: true,
    };
  }

  static forFeature(): DynamicModule {
    return {
      module: AuditModule,
      providers: [
        {
          provide: AuditService,
          useFactory: (database: Database) => new AuditService(database),
          inject: [AUDIT_DB_TOKEN],
        },
      ],
      exports: [AuditService],
    };
  }
}
