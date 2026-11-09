import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { connect, type Sql } from '../../src/database/connect';

const LOCAL_SERVER_URL =
  'postgres://postgres:postgres@127.0.0.1:55432/postgres';

function explain(serverUrl: string, cause: unknown): string {
  const { host } = new URL(serverUrl);
  const { code, message } = cause as NodeJS.ErrnoException;
  return [
    `Cannot reach the PostgreSQL the API's tests need at ${host}: ${message || code}`,
    'Start it with:',
    '  docker compose -f apps/api/compose.yaml up -d --wait',
    'or set TEST_DATABASE_URL to a server where you can create databases.',
    "To run every test except the API's, without Docker:",
    '  pnpm test:mobile',
  ].join('\n');
}

async function onServer(
  serverUrl: string,
  use: (server: postgres.Sql) => PromiseLike<unknown>,
): Promise<void> {
  const server = postgres(serverUrl, {
    max: 1,
    connect_timeout: 5,
    onnotice: () => {},
  });
  try {
    await server`SELECT 1`.catch((cause: unknown) => {
      throw new Error(explain(serverUrl, cause), { cause });
    });
    await use(server);
  } finally {
    await server.end();
  }
}

export interface TestDatabase {
  url: string;
  sql: Sql;
  drop(): Promise<void>;
}

/**
 * A new, empty database on the shared server. The name is unique across test workers,
 * worktrees, and sessions, so tests running at the same time never see each other's data.
 */
export async function createTestDatabase(
  serverUrl = process.env.TEST_DATABASE_URL ?? LOCAL_SERVER_URL,
): Promise<TestDatabase> {
  const name = `api_test_${randomUUID().replaceAll('-', '')}`;
  await onServer(
    serverUrl,
    (server) => server`CREATE DATABASE ${server(name)}`,
  );
  const url = new URL(serverUrl);
  url.pathname = `/${name}`;
  const sql = connect(url.href);
  return {
    url: url.href,
    sql,
    drop: async () => {
      await sql.end();
      await onServer(
        serverUrl,
        (server) => server`DROP DATABASE ${server(name)} WITH (FORCE)`,
      );
    },
  };
}

/** Before each test in the calling scope: a new, empty database. It is dropped afterwards. */
export function useTestDatabase(): Pick<TestDatabase, 'url' | 'sql'> {
  let database: TestDatabase | undefined;
  beforeEach(async () => {
    database = await createTestDatabase();
  });
  afterEach(async () => {
    await database?.drop();
  });
  return {
    get url() {
      return database!.url;
    },
    get sql() {
      return database!.sql;
    },
  };
}
