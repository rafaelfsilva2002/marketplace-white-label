import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_TOKEN = Symbol('REDIS');

export const RedisProvider: Provider<Redis> = {
  provide: REDIS_TOKEN,
  useFactory: (configService: ConfigService): Redis => {
    const redisUrl = configService.get<string>(
      'REDIS_URL',
      'redis://localhost:6379',
    );
    return new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      enableOfflineQueue: true,
    });
  },
  inject: [ConfigService],
};
