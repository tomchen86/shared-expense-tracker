import { readFileSync } from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import { createTestDatabase, useTestDatabase } from './support/database';

describe('with the server running', () => {
  const database = useTestDatabase();

  test('it is the major version of compose.yaml', async () => {
    const compose = readFileSync(
      path.join(__dirname, '../compose.yaml'),
      'utf8',
    );
    const major = Number(/image: postgres:(\d+)/.exec(compose)?.[1]);
    const [{ server_version_num: version }] =
      await database.sql`SHOW server_version_num`;
    expect(Math.floor(Number(version) / 10000)).toBe(major);
  });

  test('each test database is new, empty, and its own', async () => {
    await database.sql`CREATE TABLE mine (id integer)`;

    const other = await createTestDatabase();
    try {
      expect(other.url).not.toBe(database.url);
      await expect(
        other.sql`SELECT * FROM pg_tables WHERE schemaname = 'public'`,
      ).resolves.toEqual([]);
    } finally {
      await other.drop();
    }
    await expect(database.sql`SELECT * FROM mine`).resolves.toEqual([]);
  });

  test('dropping a test database removes it, even with connections open', async () => {
    const other = await createTestDatabase();
    const stillOpen = postgres(other.url, { max: 1, onnotice: () => {} });
    await stillOpen`SELECT 1`;
    const { pathname } = new URL(other.url);

    await other.drop();

    const rows = await database.sql`
      SELECT datname FROM pg_database WHERE datname = ${pathname.slice(1)}`;
    expect(rows).toEqual([]);
    await stillOpen.end({ timeout: 0 });
  });
});

test('fails and says how to start the server when it cannot be reached', async () => {
  await expect(
    createTestDatabase('postgres://postgres:postgres@127.0.0.1:1/postgres'),
  ).rejects.toThrow(
    /127\.0\.0\.1:1[^]*docker compose -f apps\/api\/compose\.yaml up -d --wait[^]*pnpm test:mobile/,
  );
});
