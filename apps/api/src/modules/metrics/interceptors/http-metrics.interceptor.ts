import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MetricsService } from '../services/metrics.service';

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const method: string = request.method;
    const path: string = request.routeOptions?.url ?? request.url;
    const startTime = process.hrtime.bigint();

    return next.handle().pipe(
      tap({
        next: () => {
          const response = context.switchToHttp().getResponse();
          const statusCode: number = response.statusCode;
          const durationNs = Number(process.hrtime.bigint() - startTime);
          const durationSeconds = durationNs / 1e9;

          this.metricsService.incrementHttpRequests(method, path, statusCode);
          this.metricsService.observeHttpDuration(method, path, durationSeconds);
        },
        error: (err: { status?: number }) => {
          const statusCode = err?.status ?? 500;
          const durationNs = Number(process.hrtime.bigint() - startTime);
          const durationSeconds = durationNs / 1e9;

          this.metricsService.incrementHttpRequests(method, path, statusCode);
          this.metricsService.observeHttpDuration(method, path, durationSeconds);
        },
      }),
    );
  }
}
