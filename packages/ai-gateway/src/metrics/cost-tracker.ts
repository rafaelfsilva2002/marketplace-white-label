export interface CostRecord {
  provider: string;
  model: string;
  operation: 'complete' | 'embedding' | 'vision' | 'moderation';
  costUsd: number;
  tokens: number;
  userId?: string;
  correlationId: string;
  timestamp: Date;
}

export interface CostSummary {
  totalCost: number;
  byProvider: Record<string, number>;
  byOperation: Record<string, number>;
  requestCount: number;
}

export interface CostPersistenceStore {
  flush(records: CostRecord[]): Promise<void>;
}

export class CostTracker {
  private buffer: CostRecord[] = [];
  private readonly flushThreshold: number;
  private readonly flushIntervalMs: number;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private readonly persistenceStore: CostPersistenceStore | null;
  private readonly allRecords: CostRecord[] = [];

  constructor(options?: {
    flushThreshold?: number;
    flushIntervalMs?: number;
    persistenceStore?: CostPersistenceStore;
  }) {
    this.flushThreshold = options?.flushThreshold ?? 100;
    this.flushIntervalMs = options?.flushIntervalMs ?? 30_000;
    this.persistenceStore = options?.persistenceStore ?? null;

    this.startFlushTimer();
  }

  record(entry: Omit<CostRecord, 'timestamp'>): void {
    const record: CostRecord = {
      ...entry,
      timestamp: new Date(),
    };

    this.buffer.push(record);
    this.allRecords.push(record);

    if (this.buffer.length >= this.flushThreshold) {
      void this.flush();
    }
  }

  getCostSummary(userId?: string, period?: { from: Date; to: Date }): CostSummary {
    let records = this.allRecords;

    if (userId) {
      records = records.filter((r) => r.userId === userId);
    }

    if (period) {
      records = records.filter(
        (r) => r.timestamp >= period.from && r.timestamp <= period.to,
      );
    }

    const byProvider: Record<string, number> = {};
    const byOperation: Record<string, number> = {};
    let totalCost = 0;

    for (const record of records) {
      totalCost += record.costUsd;

      byProvider[record.provider] =
        (byProvider[record.provider] ?? 0) + record.costUsd;

      byOperation[record.operation] =
        (byOperation[record.operation] ?? 0) + record.costUsd;
    }

    return {
      totalCost,
      byProvider,
      byOperation,
      requestCount: records.length,
    };
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }

    const toFlush = [...this.buffer];
    this.buffer = [];

    if (this.persistenceStore) {
      try {
        await this.persistenceStore.flush(toFlush);
      } catch (error) {
        this.buffer.unshift(...toFlush);
        throw error;
      }
    }
  }

  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  getBufferSize(): number {
    return this.buffer.length;
  }

  getTotalRecordCount(): number {
    return this.allRecords.length;
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, this.flushIntervalMs);

    if (this.flushTimer && typeof this.flushTimer === 'object' && 'unref' in this.flushTimer) {
      this.flushTimer.unref();
    }
  }
}
