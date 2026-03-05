import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'crypto';

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
  private readonly logger = new Logger(HttpExceptionFilter.name);

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

    const logContext = {
      correlationId,
      statusCode,
      path: request.url,
      method: request.method,
      message,
      ...(!(exception instanceof HttpException) && exception instanceof Error
        ? { stack: exception.stack }
        : {}),
    };

    if (statusCode >= 500) {
      this.logger.error(logContext, exception instanceof Error ? exception.stack : undefined);
    } else {
      this.logger.warn(logContext);
    }

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
