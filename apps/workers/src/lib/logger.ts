export interface WorkerLogger {
  info: (message: string, data?: Record<string, unknown>) => void;
  warn: (message: string, data?: Record<string, unknown>) => void;
  error: (message: string, data?: Record<string, unknown>) => void;
  fatal: (message: string, data?: Record<string, unknown>) => void;
}

function writeLog(level: string, context: string, message: string, data?: Record<string, unknown>): void {
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    context,
    message,
    ...data,
  });

  if (level === 'error' || level === 'fatal' || level === 'warn') {
    process.stderr.write(entry + '\n');
  } else {
    process.stdout.write(entry + '\n');
  }
}

export function createLogger(context: string): WorkerLogger {
  return {
    info: (message: string, data?: Record<string, unknown>) =>
      writeLog('info', context, message, data),
    warn: (message: string, data?: Record<string, unknown>) =>
      writeLog('warn', context, message, data),
    error: (message: string, data?: Record<string, unknown>) =>
      writeLog('error', context, message, data),
    fatal: (message: string, data?: Record<string, unknown>) =>
      writeLog('fatal', context, message, data),
  };
}
