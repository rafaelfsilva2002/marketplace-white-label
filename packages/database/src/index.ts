import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export interface DbPoolOptions {
  /** Max number of connections in pool (default: 20) */
  max?: number;
  /** Close idle connections after N seconds (default: 30) */
  idleTimeout?: number;
  /** Fail if can't connect within N seconds (default: 5) */
  connectTimeout?: number;
}

const DEFAULT_POOL_OPTIONS: Required<DbPoolOptions> = {
  max: 20,
  idleTimeout: 30,
  connectTimeout: 5,
};

export function createDb(connectionString: string, poolOptions?: DbPoolOptions) {
  const opts = { ...DEFAULT_POOL_OPTIONS, ...poolOptions };

  const client = postgres(connectionString, {
    max: opts.max,
    idle_timeout: opts.idleTimeout,
    connect_timeout: opts.connectTimeout,
  });

  return drizzle(client, { schema });
}

export type Database = ReturnType<typeof createDb>;

export * from './schema';
