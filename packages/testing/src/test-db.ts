import { createDb, type Database } from '@marketplace/database';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgresql://marketplace:marketplace@localhost:5432/marketplace_test';

let testDb: Database | null = null;

export async function getTestDb(): Promise<Database> {
  if (!testDb) {
    testDb = createDb(TEST_DATABASE_URL);
  }
  return testDb;
}

export async function closeTestDb(): Promise<void> {
  testDb = null;
}
