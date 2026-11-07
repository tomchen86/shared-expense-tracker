import { runMigrations } from '../../src/database/migrate';
import type { Sql } from '../../src/database/connect';
import { migrations } from '../../src/migrations';
import { startServer, type NodeServer } from '../../src/node';
import { createTestDatabase, type TestDatabase } from './database';

export interface TestApi {
  /** The test's own database, for what a test cannot see through the API. */
  sql: Sql;
  fetch(path: string, init?: RequestInit): Promise<Response>;
}

/**
 * Before each test in the calling scope: a new database with the real migrations, served
 * through the Node entry file on a port of its own (ADR-0007).
 */
export function useApi(): TestApi {
  let database: TestDatabase | undefined;
  let server: NodeServer | undefined;
  beforeEach(async () => {
    database = await createTestDatabase();
    await runMigrations(database.sql, migrations);
    server = await startServer({ databaseUrl: database.url });
  });
  afterEach(async () => {
    await server?.close();
    await database?.drop();
  });
  return {
    get sql() {
      return database!.sql;
    },
    fetch: (path, init) => fetch(`${server!.url}${path}`, init),
  };
}
