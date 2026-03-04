import {
  Controller,
  Get,
  Inject,
  HttpStatus,
  HttpException,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DATABASE_TOKEN } from '@/config/database.config';
import type { Database } from '@marketplace/database';
import { sql } from 'drizzle-orm';
import Redis from 'ioredis';

interface HealthCheckResult {
  status: 'ok' | 'error';
  checks: {
    database: 'up' | 'down';
    redis: 'up' | 'down';
  };
  uptime: number;
}

@Controller('health')
export class HealthController implements OnModuleDestroy {
  private readonly logger = new Logger(HealthController.name);
  private readonly redis: Redis;

  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Database,
    private readonly configService: ConfigService,
  ) {
    const redisUrl = this.configService.get<string>(
      'REDIS_URL',
      'redis://localhost:6379',
    );
    this.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      connectTimeout: 5000,
    });

    this.redis.on('error', (err) => {
      this.logger.error({
        message: 'Redis connection error in HealthController',
        error: err.message,
      });
    });
  }

  @Get()
  async check(): Promise<HealthCheckResult> {
    const [database, redis] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    const result: HealthCheckResult = {
      status: database === 'up' && redis === 'up' ? 'ok' : 'error',
      checks: {
        database,
        redis,
      },
      uptime: process.uptime(),
    };

    if (result.status === 'error') {
      throw new HttpException(result, HttpStatus.SERVICE_UNAVAILABLE);
    }

    return result;
  }

  private async checkDatabase(): Promise<'up' | 'down'> {
    try {
      await this.db.execute(sql`SELECT 1`);
      return 'up';
    } catch (error) {
      this.logger.error({
        message: 'Database health check failed',
        error: (error as Error).message,
      });
      return 'down';
    }
  }

  private async checkRedis(): Promise<'up' | 'down'> {
    try {
      const pong = await this.redis.ping();
      return pong === 'PONG' ? 'up' : 'down';
    } catch (error) {
      this.logger.error({
        message: 'Redis health check failed',
        error: (error as Error).message,
      });
      return 'down';
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}
