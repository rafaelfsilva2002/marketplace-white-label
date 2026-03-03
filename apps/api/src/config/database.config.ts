import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createDb, Database } from '@marketplace/database';

export const DATABASE_TOKEN = Symbol('DATABASE');

export const DatabaseProvider: Provider<Database> = {
  provide: DATABASE_TOKEN,
  useFactory: (configService: ConfigService): Database => {
    const connectionString = configService.getOrThrow<string>('DATABASE_URL');
    return createDb(connectionString);
  },
  inject: [ConfigService],
};
