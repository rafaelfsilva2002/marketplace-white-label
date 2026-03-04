import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  HttpException,
  HttpStatus,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
  ArgumentsHost,
} from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

// ---------------------------------------------------------------------------
// Mock crypto.randomUUID for predictable fallback correlationIds
// ---------------------------------------------------------------------------

vi.mock('crypto', () => ({
  randomUUID: vi.fn(() => 'mock-uuid-fallback'),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockHost(
  headers: Record<string, string> = {},
  url = '/test/path',
  method = 'GET',
): {
  host: ArgumentsHost;
  reply: { status: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn> };
  request: { url: string; method: string; headers: Record<string, string> };
} {
  const send = vi.fn();
  const status = vi.fn().mockReturnValue({ send });
  const request = { url, method, headers };
  const reply = { status, send };

  const host = {
    switchToHttp: vi.fn().mockReturnValue({
      getRequest: vi.fn().mockReturnValue(request),
      getResponse: vi.fn().mockReturnValue(reply),
    }),
    getArgs: vi.fn(),
    getArgByIndex: vi.fn(),
    switchToRpc: vi.fn(),
    switchToWs: vi.fn(),
    getType: vi.fn(),
  } as unknown as ArgumentsHost;

  return { host, reply, request };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    filter = new HttpExceptionFilter();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  // -------------------------------------------------------------------------
  // HttpException handling
  // -------------------------------------------------------------------------

  describe('HttpException handling', () => {
    it('should format a standard HttpException with correct status code', () => {
      const exception = new HttpException('Not Found', HttpStatus.NOT_FOUND);
      const { host, reply } = createMockHost();

      filter.catch(exception, host);

      expect(reply.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    });

    it('should include success=false in the response body', () => {
      const exception = new BadRequestException('Invalid input');
      const { host, reply } = createMockHost();

      filter.catch(exception, host);

      const sentBody = reply.status.mock.results[0].value.send.mock.calls[0][0];
      expect(sentBody.success).toBe(false);
    });

    it('should extract string message from HttpException', () => {
      const exception = new HttpException(
        'Custom error message',
        HttpStatus.BAD_REQUEST,
      );
      const { host, reply } = createMockHost();

      filter.catch(exception, host);

      const sentBody = reply.status.mock.results[0].value.send.mock.calls[0][0];
      expect(sentBody.error.message).toBe('Custom error message');
    });

    it('should extract message from object response (NestJS default format)', () => {
      const exception = new BadRequestException('Validation failed');
      const { host, reply } = createMockHost();

      filter.catch(exception, host);

      const sentBody = reply.status.mock.results[0].value.send.mock.calls[0][0];
      expect(sentBody.error.message).toBe('Validation failed');
    });

    it('should join array messages from validation errors', () => {
      const exception = new BadRequestException({
        message: ['field1 is required', 'field2 must be a string'],
        error: 'Bad Request',
      });
      const { host, reply } = createMockHost();

      filter.catch(exception, host);

      const sentBody = reply.status.mock.results[0].value.send.mock.calls[0][0];
      expect(sentBody.error.message).toBe(
        'field1 is required; field2 must be a string',
      );
    });

    it('should use NotFoundException status code (404)', () => {
      const exception = new NotFoundException('Resource not found');
      const { host, reply } = createMockHost();

      filter.catch(exception, host);

      expect(reply.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      const sentBody = reply.status.mock.results[0].value.send.mock.calls[0][0];
      expect(sentBody.error.statusCode).toBe(HttpStatus.NOT_FOUND);
    });
  });

  // -------------------------------------------------------------------------
  // Non-HttpException handling
  // -------------------------------------------------------------------------

  describe('non-HttpException handling', () => {
    it('should return 500 Internal Server Error for generic errors', () => {
      const exception = new Error('Something broke');
      const { host, reply } = createMockHost();

      filter.catch(exception, host);

      expect(reply.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    });

    it('should use generic "Internal Server Error" message for non-Http exceptions', () => {
      const exception = new Error('Database connection failed');
      const { host, reply } = createMockHost();

      filter.catch(exception, host);

      const sentBody = reply.status.mock.results[0].value.send.mock.calls[0][0];
      expect(sentBody.error.message).toBe('Internal Server Error');
    });

    it('should include stack trace in log entry for non-HttpException errors', () => {
      const exception = new TypeError('Cannot read property of undefined');
      const { host } = createMockHost();

      filter.catch(exception, host);

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const loggedEntry = JSON.parse(consoleSpy.mock.calls[0][0] as string);
      expect(loggedEntry.stack).toBeDefined();
      expect(loggedEntry.stack).toContain('TypeError');
    });

    it('should handle non-Error exceptions (plain strings thrown)', () => {
      const exception = 'unexpected string error';
      const { host, reply } = createMockHost();

      filter.catch(exception, host);

      expect(reply.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
      const sentBody = reply.status.mock.results[0].value.send.mock.calls[0][0];
      expect(sentBody.error.message).toBe('Internal Server Error');
    });

    it('should not include stack trace in log for non-Error, non-HttpException throws', () => {
      const exception = { code: 'CUSTOM_ERROR' };
      const { host } = createMockHost();

      filter.catch(exception, host);

      const loggedEntry = JSON.parse(consoleSpy.mock.calls[0][0] as string);
      expect(loggedEntry.stack).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // correlationId handling
  // -------------------------------------------------------------------------

  describe('correlationId handling', () => {
    it('should use x-correlation-id from request headers when present', () => {
      const exception = new BadRequestException('Test');
      const { host, reply } = createMockHost({
        'x-correlation-id': 'existing-corr-123',
      });

      filter.catch(exception, host);

      const sentBody = reply.status.mock.results[0].value.send.mock.calls[0][0];
      expect(sentBody.error.correlationId).toBe('existing-corr-123');
    });

    it('should generate a UUID as fallback when no correlation header is present', () => {
      const exception = new BadRequestException('Test');
      const { host, reply } = createMockHost({});

      filter.catch(exception, host);

      const sentBody = reply.status.mock.results[0].value.send.mock.calls[0][0];
      expect(sentBody.error.correlationId).toBe('mock-uuid-fallback');
    });

    it('should include correlationId in the JSON log entry', () => {
      const exception = new HttpException('err', 400);
      const { host } = createMockHost({
        'x-correlation-id': 'log-corr-456',
      });

      filter.catch(exception, host);

      const loggedEntry = JSON.parse(consoleSpy.mock.calls[0][0] as string);
      expect(loggedEntry.correlationId).toBe('log-corr-456');
    });
  });

  // -------------------------------------------------------------------------
  // Structured log entry
  // -------------------------------------------------------------------------

  describe('structured log entry', () => {
    it('should log a JSON entry with all required fields', () => {
      const exception = new NotFoundException('Item not found');
      const { host } = createMockHost(
        { 'x-correlation-id': 'corr-log-test' },
        '/api/items/123',
        'DELETE',
      );

      filter.catch(exception, host);

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const loggedEntry = JSON.parse(consoleSpy.mock.calls[0][0] as string);

      expect(loggedEntry.level).toBe('error');
      expect(loggedEntry.timestamp).toBeDefined();
      expect(loggedEntry.correlationId).toBe('corr-log-test');
      expect(loggedEntry.statusCode).toBe(404);
      expect(loggedEntry.path).toBe('/api/items/123');
      expect(loggedEntry.method).toBe('DELETE');
      expect(loggedEntry.message).toBe('Item not found');
    });

    it('should not include stack for HttpExceptions', () => {
      const exception = new BadRequestException('Bad request');
      const { host } = createMockHost();

      filter.catch(exception, host);

      const loggedEntry = JSON.parse(consoleSpy.mock.calls[0][0] as string);
      expect(loggedEntry.stack).toBeUndefined();
    });
  });
});
