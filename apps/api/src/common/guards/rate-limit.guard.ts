import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

@Injectable()
export class RateLimitGuard implements CanActivate, OnModuleDestroy {
  private readonly logger = new Logger(RateLimitGuard.name);
  private readonly redis: Redis;
  private readonly config: RateLimitConfig;

  constructor(private readonly configService: ConfigService) {
    const redisUrl = this.configService.get<string>(
      'REDIS_URL',
      'redis://localhost:6379',
    );
    this.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      enableOfflineQueue: true,
    });

    this.redis.on('error', (err) => {
      this.logger.error({
        message: 'Redis connection error in RateLimitGuard',
        error: err.message,
      });
    });

    this.config = {
      windowMs: this.configService.get<number>(
        'RATE_LIMIT_WINDOW_MS',
        60_000,
      ),
      maxRequests: this.configService.get<number>(
        'RATE_LIMIT_MAX_REQUESTS',
        60,
      ),
    };
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const correlationId =
      request.headers['x-correlation-id'] ?? 'unknown';

    const identifier = this.resolveIdentifier(request);
    const key = `rate_limit:${identifier}`;

    try {
      const result = await this.slidingWindowCheck(key);

      const response = context.switchToHttp().getResponse();
      response.header('X-RateLimit-Limit', String(this.config.maxRequests));
      response.header('X-RateLimit-Remaining', String(result.remaining));
      response.header('X-RateLimit-Reset', String(result.resetAt));

      if (!result.allowed) {
        this.logger.warn({
          message: 'Rate limit exceeded',
          identifier,
          currentCount: result.count,
          maxRequests: this.config.maxRequests,
          correlationId,
        });
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: 'Too many requests. Please try again later.',
            retryAfter: Math.ceil(
              (result.resetAt - Date.now()) / 1000,
            ),
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      return true;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error({
        message: 'Rate limiter error — allowing request through',
        error: (error as Error).message,
        identifier,
        correlationId,
      });
      return true;
    }
  }

  private async slidingWindowCheck(key: string): Promise<{
    allowed: boolean;
    count: number;
    remaining: number;
    resetAt: number;
  }> {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    const pipeline = this.redis.pipeline();

    // Remove entries outside the current sliding window
    pipeline.zremrangebyscore(key, '-inf', String(windowStart));

    // Add current request as a new entry scored by timestamp
    pipeline.zadd(key, String(now), `${now}:${Math.random()}`);

    // Count entries within the window
    pipeline.zcard(key);

    // Set TTL with 2x safety margin so keys auto-expire even if the
    // client disappears and zremrangebyscore never runs again.
    pipeline.pexpire(key, this.config.windowMs * 2);

    const results = await pipeline.exec();

    if (!results) {
      return {
        allowed: true,
        count: 0,
        remaining: this.config.maxRequests,
        resetAt: now + this.config.windowMs,
      };
    }

    const count = (results[2]?.[1] as number) ?? 0;
    const remaining = Math.max(0, this.config.maxRequests - count);
    const resetAt = now + this.config.windowMs;

    return {
      allowed: count <= this.config.maxRequests,
      count,
      remaining,
      resetAt,
    };
  }

  private resolveIdentifier(request: {
    user?: { id: string };
    ip?: string;
    headers?: Record<string, string | undefined>;
  }): string {
    if (request.user?.id) {
      return `user:${request.user.id}`;
    }

    const forwarded = request.headers?.['x-forwarded-for'];
    if (forwarded) {
      return `ip:${forwarded.split(',')[0].trim()}`;
    }

    return `ip:${request.ip ?? 'unknown'}`;
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}
