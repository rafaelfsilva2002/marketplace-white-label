import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface HttpMetricEntry {
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  timestamp: Date;
}

export interface AiMetricEntry {
  provider: string;
  operation: string;
  cost: number;
  durationMs: number;
  tokens: number;
  timestamp: Date;
}

export interface QueueMetricEntry {
  queue: string;
  jobType: string;
  status: 'completed' | 'failed';
  durationMs: number;
  timestamp: Date;
}

export interface HttpAggregated {
  requestCount: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  statusCodes: Record<number, number>;
}

export interface AiAggregated {
  totalCost: number;
  totalTokens: number;
  requestCount: number;
  avgDurationMs: number;
  costByProvider: Record<string, number>;
  costByOperation: Record<string, number>;
  dailyTotals: Record<string, number>;
}

export interface QueueAggregated {
  totalProcessed: number;
  totalFailed: number;
  avgDurationMs: number;
  byQueue: Record<string, { processed: number; failed: number }>;
}

export interface AggregatedMetrics {
  http: HttpAggregated;
  ai: AiAggregated;
  queue: QueueAggregated;
  collectedAt: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class MetricsService implements OnModuleDestroy {
  private readonly logger = new Logger(MetricsService.name);

  private readonly httpBuffer: HttpMetricEntry[] = [];
  private readonly aiBuffer: AiMetricEntry[] = [];
  private readonly queueBuffer: QueueMetricEntry[] = [];

  /** Flush timer reference so we can clear it on destroy. */
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  /** Default auto-flush interval: 60 seconds. */
  private static readonly FLUSH_INTERVAL_MS = 60_000;

  constructor() {
    this.startFlushTimer();
  }

  // -----------------------------------------------------------------------
  // Recording methods
  // -----------------------------------------------------------------------

  recordHttpMetric(
    method: string,
    path: string,
    statusCode: number,
    durationMs: number,
  ): void {
    this.httpBuffer.push({
      method,
      path,
      statusCode,
      durationMs,
      timestamp: new Date(),
    });
  }

  recordAiMetric(
    provider: string,
    operation: string,
    cost: number,
    durationMs: number,
    tokens: number,
  ): void {
    this.aiBuffer.push({
      provider,
      operation,
      cost,
      durationMs,
      tokens,
      timestamp: new Date(),
    });
  }

  recordQueueMetric(
    queue: string,
    jobType: string,
    status: 'completed' | 'failed',
    durationMs: number,
  ): void {
    this.queueBuffer.push({
      queue,
      jobType,
      status,
      durationMs,
      timestamp: new Date(),
    });
  }

  // -----------------------------------------------------------------------
  // Aggregation
  // -----------------------------------------------------------------------

  getMetrics(): AggregatedMetrics {
    return {
      http: this.aggregateHttp(),
      ai: this.aggregateAi(),
      queue: this.aggregateQueue(),
      collectedAt: new Date().toISOString(),
    };
  }

  // -----------------------------------------------------------------------
  // Flush — persists buffered metrics via structured logger then clears
  // -----------------------------------------------------------------------

  flush(): void {
    const metrics = this.getMetrics();

    if (
      this.httpBuffer.length === 0 &&
      this.aiBuffer.length === 0 &&
      this.queueBuffer.length === 0
    ) {
      return;
    }

    this.logger.log(
      JSON.stringify({
        event: 'metrics.flush',
        httpEntries: this.httpBuffer.length,
        aiEntries: this.aiBuffer.length,
        queueEntries: this.queueBuffer.length,
        metrics,
      }),
    );

    this.httpBuffer.length = 0;
    this.aiBuffer.length = 0;
    this.queueBuffer.length = 0;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  onModuleDestroy(): void {
    this.flush();
    this.stopFlushTimer();
  }

  // -----------------------------------------------------------------------
  // Private — aggregation helpers
  // -----------------------------------------------------------------------

  private aggregateHttp(): HttpAggregated {
    const entries = this.httpBuffer;

    if (entries.length === 0) {
      return {
        requestCount: 0,
        avgLatencyMs: 0,
        p95LatencyMs: 0,
        p99LatencyMs: 0,
        statusCodes: {},
      };
    }

    const durations = entries.map((e) => e.durationMs).sort((a, b) => a - b);
    const statusCodes: Record<number, number> = {};

    for (const entry of entries) {
      statusCodes[entry.statusCode] =
        (statusCodes[entry.statusCode] ?? 0) + 1;
    }

    return {
      requestCount: entries.length,
      avgLatencyMs: this.average(durations),
      p95LatencyMs: this.percentile(durations, 95),
      p99LatencyMs: this.percentile(durations, 99),
      statusCodes,
    };
  }

  private aggregateAi(): AiAggregated {
    const entries = this.aiBuffer;

    if (entries.length === 0) {
      return {
        totalCost: 0,
        totalTokens: 0,
        requestCount: 0,
        avgDurationMs: 0,
        costByProvider: {},
        costByOperation: {},
        dailyTotals: {},
      };
    }

    let totalCost = 0;
    let totalTokens = 0;
    const costByProvider: Record<string, number> = {};
    const costByOperation: Record<string, number> = {};
    const dailyTotals: Record<string, number> = {};
    const durations: number[] = [];

    for (const entry of entries) {
      totalCost += entry.cost;
      totalTokens += entry.tokens;
      durations.push(entry.durationMs);

      costByProvider[entry.provider] =
        (costByProvider[entry.provider] ?? 0) + entry.cost;

      costByOperation[entry.operation] =
        (costByOperation[entry.operation] ?? 0) + entry.cost;

      const dayKey = entry.timestamp.toISOString().slice(0, 10);
      dailyTotals[dayKey] = (dailyTotals[dayKey] ?? 0) + entry.cost;
    }

    return {
      totalCost,
      totalTokens,
      requestCount: entries.length,
      avgDurationMs: this.average(durations),
      costByProvider,
      costByOperation,
      dailyTotals,
    };
  }

  private aggregateQueue(): QueueAggregated {
    const entries = this.queueBuffer;

    if (entries.length === 0) {
      return {
        totalProcessed: 0,
        totalFailed: 0,
        avgDurationMs: 0,
        byQueue: {},
      };
    }

    let totalProcessed = 0;
    let totalFailed = 0;
    const durations: number[] = [];
    const byQueue: Record<string, { processed: number; failed: number }> = {};

    for (const entry of entries) {
      durations.push(entry.durationMs);

      if (entry.status === 'completed') {
        totalProcessed++;
      } else {
        totalFailed++;
      }

      if (!byQueue[entry.queue]) {
        byQueue[entry.queue] = { processed: 0, failed: 0 };
      }

      if (entry.status === 'completed') {
        byQueue[entry.queue].processed++;
      } else {
        byQueue[entry.queue].failed++;
      }
    }

    return {
      totalProcessed,
      totalFailed,
      avgDurationMs: this.average(durations),
      byQueue,
    };
  }

  // -----------------------------------------------------------------------
  // Private — math helpers
  // -----------------------------------------------------------------------

  /**
   * Compute the arithmetic mean of a pre-sorted numeric array.
   * Returns 0 for empty arrays.
   */
  private average(sorted: number[]): number {
    if (sorted.length === 0) return 0;
    const sum = sorted.reduce((acc, v) => acc + v, 0);
    return Math.round((sum / sorted.length) * 100) / 100;
  }

  /**
   * Compute the given percentile from a **pre-sorted** numeric array using
   * the nearest-rank method. Returns 0 for empty arrays.
   */
  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  // -----------------------------------------------------------------------
  // Private — flush timer management
  // -----------------------------------------------------------------------

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush();
    }, MetricsService.FLUSH_INTERVAL_MS);

    // Allow Node.js to exit even if the timer is still active
    if (
      this.flushTimer &&
      typeof this.flushTimer === 'object' &&
      'unref' in this.flushTimer
    ) {
      this.flushTimer.unref();
    }
  }

  private stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }
}
