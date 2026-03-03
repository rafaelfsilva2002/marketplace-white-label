import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface CorrelationContext {
  correlationId: string;
  requestId: string;
  startTime: number;
}

const CORRELATION_HEADER = 'x-correlation-id';

export const correlationStorage = new AsyncLocalStorage<CorrelationContext>();

export function getCorrelationId(): string {
  const ctx = correlationStorage.getStore();
  return ctx?.correlationId ?? 'no-correlation';
}

export function getCorrelationContext(): CorrelationContext | undefined {
  return correlationStorage.getStore();
}

@Injectable()
export class CorrelationIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    const incomingCorrelationId =
      request.headers?.[CORRELATION_HEADER] as string | undefined;
    const correlationId = incomingCorrelationId || randomUUID();
    const requestId = randomUUID();

    const correlationContext: CorrelationContext = {
      correlationId,
      requestId,
      startTime: Date.now(),
    };

    if (response.header) {
      response.header(CORRELATION_HEADER, correlationId);
      response.header('x-request-id', requestId);
    }

    request.correlationId = correlationId;
    request.requestId = requestId;

    return new Observable((subscriber) => {
      correlationStorage.run(correlationContext, () => {
        next.handle().subscribe({
          next: (value) => subscriber.next(value),
          error: (err) => subscriber.error(err),
          complete: () => subscriber.complete(),
        });
      });
    });
  }
}
