import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  Registry,
  collectDefaultMetrics,
  Counter,
  Histogram,
} from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly registry: Registry;

  private readonly httpRequestsTotal: Counter<string>;
  private readonly httpRequestDuration: Histogram<string>;
  private readonly aiGatewayRequestsTotal: Counter<string>;
  private readonly aiGatewayCostTotal: Counter<string>;
  private readonly queueJobsTotal: Counter<string>;

  constructor() {
    this.registry = new Registry();

    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'path', 'status_code'],
      registers: [this.registry],
    });

    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'path'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });

    this.aiGatewayRequestsTotal = new Counter({
      name: 'ai_gateway_requests_total',
      help: 'Total number of AI Gateway requests',
      labelNames: ['provider', 'operation', 'status'],
      registers: [this.registry],
    });

    this.aiGatewayCostTotal = new Counter({
      name: 'ai_gateway_cost_total',
      help: 'Total cost of AI Gateway requests',
      labelNames: ['provider', 'operation'],
      registers: [this.registry],
    });

    this.queueJobsTotal = new Counter({
      name: 'queue_jobs_total',
      help: 'Total number of queue jobs processed',
      labelNames: ['queue', 'status'],
      registers: [this.registry],
    });
  }

  onModuleInit(): void {
    collectDefaultMetrics({ register: this.registry });
  }

  incrementHttpRequests(
    method: string,
    path: string,
    statusCode: number,
  ): void {
    this.httpRequestsTotal
      .labels(method, path, String(statusCode))
      .inc();
  }

  observeHttpDuration(
    method: string,
    path: string,
    durationSeconds: number,
  ): void {
    this.httpRequestDuration
      .labels(method, path)
      .observe(durationSeconds);
  }

  incrementAiRequests(
    provider: string,
    operation: string,
    status: string,
  ): void {
    this.aiGatewayRequestsTotal
      .labels(provider, operation, status)
      .inc();
  }

  addAiCost(
    provider: string,
    operation: string,
    cost: number,
  ): void {
    this.aiGatewayCostTotal
      .labels(provider, operation)
      .inc(cost);
  }

  incrementQueueJobs(queue: string, status: string): void {
    this.queueJobsTotal.labels(queue, status).inc();
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }
}
