import { LoggerService, Injectable, Scope } from '@nestjs/common';
import {
  correlationStorage,
  getCorrelationId,
} from '../interceptors/correlation-id.interceptor';

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  correlationId: string;
  requestId?: string;
  context?: string;
  duration?: number;
  data?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

@Injectable()
export class StructuredLogger implements LoggerService {
  private readonly serviceName: string;

  constructor(serviceName = 'marketplace-api') {
    this.serviceName = serviceName;
  }

  log(message: string, context?: string): void {
    this.writeLog('info', message, context);
  }

  error(message: string, trace?: string, context?: string): void {
    const entry = this.buildLogEntry('error', message, context);
    if (trace) {
      entry.error = {
        name: 'Error',
        message,
        stack: trace,
      };
    }
    this.writeEntry(entry);
  }

  warn(message: string, context?: string): void {
    this.writeLog('warn', message, context);
  }

  debug(message: string, context?: string): void {
    this.writeLog('debug', message, context);
  }

  verbose(message: string, context?: string): void {
    this.writeLog('verbose', message, context);
  }

  logWithData(
    level: 'info' | 'warn' | 'error' | 'debug',
    message: string,
    data: Record<string, unknown>,
    context?: string,
  ): void {
    const entry = this.buildLogEntry(level, message, context);
    entry.data = data;
    this.writeEntry(entry);
  }

  logError(
    message: string,
    error: Error,
    data?: Record<string, unknown>,
    context?: string,
  ): void {
    const entry = this.buildLogEntry('error', message, context);
    entry.error = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
    if (data) {
      entry.data = data;
    }
    this.writeEntry(entry);
  }

  private writeLog(level: string, message: string, context?: string): void {
    const entry = this.buildLogEntry(level, message, context);
    this.writeEntry(entry);
  }

  private buildLogEntry(
    level: string,
    message: string,
    context?: string,
  ): LogEntry {
    const store = correlationStorage.getStore();
    const correlationId = store?.correlationId ?? 'no-correlation';
    const requestId = store?.requestId;
    const startTime = store?.startTime;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      correlationId,
    };

    if (requestId) {
      entry.requestId = requestId;
    }

    if (context) {
      entry.context = context;
    }

    if (startTime) {
      entry.duration = Date.now() - startTime;
    }

    return entry;
  }

  private writeEntry(entry: LogEntry): void {
    const output = JSON.stringify({
      ...entry,
      service: this.serviceName,
    });

    switch (entry.level) {
      case 'error':
        process.stderr.write(output + '\n');
        break;
      case 'warn':
        process.stderr.write(output + '\n');
        break;
      default:
        process.stdout.write(output + '\n');
        break;
    }
  }
}
