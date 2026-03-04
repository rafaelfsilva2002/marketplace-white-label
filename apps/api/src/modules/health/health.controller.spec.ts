import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpException, HttpStatus } from '@nestjs/common';
import { HealthController } from './health.controller';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockDb(shouldSucceed: boolean) {
  return {
    execute: shouldSucceed
      ? vi.fn().mockResolvedValue([{ '?column?': 1 }])
      : vi.fn().mockRejectedValue(new Error('DB connection failed')),
  };
}

function createMockConfigService() {
  return {
    get: vi.fn().mockImplementation((key: string, defaultValue: unknown) => {
      if (key === 'REDIS_URL') return 'redis://localhost:6379';
      return defaultValue;
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HealthController', () => {
  let controller: HealthController;
  let mockDb: ReturnType<typeof createMockDb>;
  let mockConfigService: ReturnType<typeof createMockConfigService>;

  // We need to mock ioredis before importing HealthController
  // Since HealthController creates a Redis instance in its constructor,
  // we test by directly constructing with mocks and overriding the private redis.

  describe('when both database and Redis are healthy', () => {
    beforeEach(() => {
      mockDb = createMockDb(true);
      mockConfigService = createMockConfigService();

      controller = new HealthController(
        mockDb as any,
        mockConfigService as any,
      );

      // Override the private redis instance with a mock
      (controller as any).redis = {
        ping: vi.fn().mockResolvedValue('PONG'),
        quit: vi.fn().mockResolvedValue(undefined),
        on: vi.fn(),
      };
    });

    it('should return status ok with all checks up', async () => {
      const result = await controller.check();

      expect(result.status).toBe('ok');
      expect(result.checks.database).toBe('up');
      expect(result.checks.redis).toBe('up');
      expect(typeof result.uptime).toBe('number');
      expect(result.uptime).toBeGreaterThan(0);
    });

    it('should execute a SELECT 1 query to check database health', async () => {
      await controller.check();

      expect(mockDb.execute).toHaveBeenCalled();
    });

    it('should ping Redis to check its health', async () => {
      await controller.check();

      expect((controller as any).redis.ping).toHaveBeenCalled();
    });
  });

  describe('when database is down', () => {
    beforeEach(() => {
      mockDb = createMockDb(false);
      mockConfigService = createMockConfigService();

      controller = new HealthController(
        mockDb as any,
        mockConfigService as any,
      );

      (controller as any).redis = {
        ping: vi.fn().mockResolvedValue('PONG'),
        quit: vi.fn().mockResolvedValue(undefined),
        on: vi.fn(),
      };
    });

    it('should throw HttpException with SERVICE_UNAVAILABLE status', async () => {
      await expect(controller.check()).rejects.toThrow(HttpException);

      try {
        await controller.check();
      } catch (error) {
        const httpError = error as HttpException;
        expect(httpError.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);

        const response = httpError.getResponse() as any;
        expect(response.status).toBe('error');
        expect(response.checks.database).toBe('down');
        expect(response.checks.redis).toBe('up');
      }
    });
  });

  describe('when Redis is down', () => {
    beforeEach(() => {
      mockDb = createMockDb(true);
      mockConfigService = createMockConfigService();

      controller = new HealthController(
        mockDb as any,
        mockConfigService as any,
      );

      (controller as any).redis = {
        ping: vi.fn().mockRejectedValue(new Error('Redis connection refused')),
        quit: vi.fn().mockResolvedValue(undefined),
        on: vi.fn(),
      };
    });

    it('should throw HttpException with SERVICE_UNAVAILABLE status', async () => {
      await expect(controller.check()).rejects.toThrow(HttpException);

      try {
        await controller.check();
      } catch (error) {
        const httpError = error as HttpException;
        expect(httpError.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);

        const response = httpError.getResponse() as any;
        expect(response.status).toBe('error');
        expect(response.checks.database).toBe('up');
        expect(response.checks.redis).toBe('down');
      }
    });
  });

  describe('when both database and Redis are down', () => {
    beforeEach(() => {
      mockDb = createMockDb(false);
      mockConfigService = createMockConfigService();

      controller = new HealthController(
        mockDb as any,
        mockConfigService as any,
      );

      (controller as any).redis = {
        ping: vi.fn().mockRejectedValue(new Error('Redis timeout')),
        quit: vi.fn().mockResolvedValue(undefined),
        on: vi.fn(),
      };
    });

    it('should throw HttpException with both checks down', async () => {
      await expect(controller.check()).rejects.toThrow(HttpException);

      try {
        await controller.check();
      } catch (error) {
        const httpError = error as HttpException;
        expect(httpError.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);

        const response = httpError.getResponse() as any;
        expect(response.status).toBe('error');
        expect(response.checks.database).toBe('down');
        expect(response.checks.redis).toBe('down');
      }
    });
  });

  describe('when Redis returns unexpected response', () => {
    beforeEach(() => {
      mockDb = createMockDb(true);
      mockConfigService = createMockConfigService();

      controller = new HealthController(
        mockDb as any,
        mockConfigService as any,
      );

      (controller as any).redis = {
        ping: vi.fn().mockResolvedValue('NOT_PONG'),
        quit: vi.fn().mockResolvedValue(undefined),
        on: vi.fn(),
      };
    });

    it('should report Redis as down when ping returns unexpected value', async () => {
      await expect(controller.check()).rejects.toThrow(HttpException);

      try {
        await controller.check();
      } catch (error) {
        const httpError = error as HttpException;
        const response = httpError.getResponse() as any;
        expect(response.checks.redis).toBe('down');
      }
    });
  });

  describe('onModuleDestroy', () => {
    beforeEach(() => {
      mockDb = createMockDb(true);
      mockConfigService = createMockConfigService();

      controller = new HealthController(
        mockDb as any,
        mockConfigService as any,
      );

      (controller as any).redis = {
        ping: vi.fn(),
        quit: vi.fn().mockResolvedValue(undefined),
        on: vi.fn(),
      };
    });

    it('should call redis.quit to clean up the connection', async () => {
      await controller.onModuleDestroy();

      expect((controller as any).redis.quit).toHaveBeenCalled();
    });
  });
});
