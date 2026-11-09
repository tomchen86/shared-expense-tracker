import { createHash } from 'node:crypto';
import { runMigrations, type Migration } from '../src/database/migrate';
import { useTestDatabase } from './support/database';

const createAccounts: Migration = {
  name: 'accounts/0001-create-accounts',
  sql: 'CREATE TABLE accounts (id integer PRIMARY KEY)',
};
const createDevices: Migration = {
  name: 'devices/0001-create-devices',
  sql: `CREATE TABLE devices (id integer PRIMARY KEY);
        CREATE INDEX devices_id ON devices (id);`,
};
const createEvents: Migration = {
  name: 'events/0001-create-events',
  sql: 'CREATE TABLE events (id integer PRIMARY KEY)',
};
const sha256Of = (text: string) =>
  createHash('sha256').update(text).digest('hex');

const database = useTestDatabase();

async function tables(): Promise<string[]> {
  const rows = await database.sql<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
  return rows.map((row) => row.tablename).sort();
}

const records = () =>
  database.sql`SELECT position, name, checksum FROM _migrations ORDER BY position`;

test('runs each migration in the list’s order and records it with its checksum', async () => {
  await runMigrations(database.sql, [createAccounts, createDevices]);

  expect(await tables()).toEqual(['_migrations', 'accounts', 'devices']);
  expect(await records()).toEqual([
    {
      position: 1,
      name: createAccounts.name,
      checksum: sha256Of(createAccounts.sql),
    },
    {
      position: 2,
      name: createDevices.name,
      checksum: sha256Of(createDevices.sql),
    },
  ]);
});

test('runs only the migrations it has not recorded yet', async () => {
  await runMigrations(database.sql, [createAccounts]);
  await database.sql`INSERT INTO accounts (id) VALUES (1)`;

  await runMigrations(database.sql, [createAccounts, createDevices]);

  expect(await tables()).toEqual(['_migrations', 'accounts', 'devices']);
  expect(await database.sql`SELECT id FROM accounts`).toEqual([{ id: 1 }]);
  expect(await records()).toHaveLength(2);
});

test('fails when a migration that ran has been edited, and changes nothing', async () => {
  await runMigrations(database.sql, [createAccounts]);
  const edited = { ...createAccounts, sql: `${createAccounts.sql} -- edited` };

  await expect(
    runMigrations(database.sql, [edited, createDevices]),
  ).rejects.toThrow(
    `Migration "${createAccounts.name}" has changed since it ran`,
  );

  expect(await tables()).toEqual(['_migrations', 'accounts']);
  expect(await records()).toHaveLength(1);
});

test('fails when the list has changed order', async () => {
  await runMigrations(database.sql, [createAccounts, createDevices]);

  await expect(
    runMigrations(database.sql, [createDevices, createAccounts]),
  ).rejects.toThrow(`where this list has "${createDevices.name}"`);
});

test('fails when the database has run a migration the list does not have', async () => {
  await runMigrations(database.sql, [createAccounts, createDevices]);

  await expect(runMigrations(database.sql, [createAccounts])).rejects.toThrow(
    `The database has run migration "${createDevices.name}"`,
  );
});

test('a migration that fails leaves the database as it was', async () => {
  await runMigrations(database.sql, [createAccounts]);
  const broken = {
    name: 'events/0002-broken',
    sql: 'CREATE TABLE accounts ()',
  };

  await expect(
    runMigrations(database.sql, [createAccounts, createEvents, broken]),
  ).rejects.toThrow('already exists');

  expect(await tables()).toEqual(['_migrations', 'accounts']);
  expect(await records()).toHaveLength(1);
});

test('runners at the same time run each migration once', async () => {
  const list = [createAccounts, createDevices, createEvents];

  await Promise.all([
    runMigrations(database.sql, list),
    runMigrations(database.sql, list),
    runMigrations(database.sql, list),
  ]);

  expect(await records()).toHaveLength(list.length);
});
