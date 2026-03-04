import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'crypto';

interface ErrorLogEntry {
  level: 'error';
  timestamp: string;
  correlationId: string;
  statusCode: number;
  path: string;
  method: string;
  message: string;
  stack?: string;
}

interface ErrorResponse {
  success: false;
  error: {
    statusCode: number;
    message: string;
    correlationId: string;
  };
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<FastifyRequest>();
    const reply = ctx.getResponse<FastifyReply>();

    const correlationId =
      (request.headers['x-correlation-id'] as string) || randomUUID();

    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? this.extractMessage(exception)
        : 'Internal Server Error';

    const logEntry: ErrorLogEntry = {
      level: 'error',
      timestamp: new Date().toISOString(),
      correlationId,
      statusCode,
      path: request.url,
      method: request.method,
      message,
    };

    if (!(exception instanceof HttpException) && exception instanceof Error) {
      logEntry.stack = exception.stack;
    }

    console.log(JSON.stringify(logEntry));

    const errorResponse: ErrorResponse = {
      success: false,
      error: {
        statusCode,
        message,
        correlationId,
      },
    };

    reply.status(statusCode).send(errorResponse);
  }

  private extractMessage(exception: HttpException): string {
    const response = exception.getResponse();

    if (typeof response === 'string') {
      return response;
    }

    if (typeof response === 'object' && response !== null) {
      const resp = response as Record<string, unknown>;

      if (Array.isArray(resp.message)) {
        return resp.message.join('; ');
      }

      if (typeof resp.message === 'string') {
        return resp.message;
      }
    }

    return exception.message;
  }
}
