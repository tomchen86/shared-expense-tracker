import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  initializeDatabase,
  runMigrations,
  type Database,
} from '../../src/storage';
import { openNodeDatabase } from '../../src/storage/node';
import { ensureLocalIdentity } from '../../src/shell/identity';
import { appMigrations } from '../../src/shell/migrations';
import { groupMigrations } from '../../src/groups/migrations';
import { listGroups } from '../../src/groups';

const original =
  "CREATE TABLE original (value TEXT); INSERT INTO original VALUES ('keep me')";
let directory: string;
let file: string;
let database: Database;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'startup-transactions-'));
  file = join(directory, 'app.db');
  database = openNodeDatabase(file);
});
afterEach(async () => {
  await database.close();
  rmSync(directory, { recursive: true, force: true });
});

test('appends migrations in order, retains rows, and records the SHA-256 of exact SQL', async () => {
  await runMigrations(database, [original]);
  const append =
    "ALTER TABLE original ADD COLUMN label TEXT; UPDATE original SET label = '你好'";
  await runMigrations(database, [original, append]);
  await runMigrations(database, [original, append]);
  expect(await database.all('SELECT * FROM original')).toEqual([
    { value: 'keep me', label: '你好' },
  ]);
  expect(
    await database.all('SELECT * FROM _migrations ORDER BY position'),
  ).toEqual(
    [original, append].map((sql, index) => ({
      position: index + 1,
      checksum: createHash('sha256').update(sql).digest('hex'),
    })),
  );
});

test('a later migration failure rolls back earlier migrations, their records, and partial SQL', async () => {
  await runMigrations(database, [original]);
  const before = readFileSync(file);
  await expect(
    runMigrations(database, [
      original,
      'CREATE TABLE added (id INTEGER)',
      "UPDATE original SET value = 'changed'; INSERT INTO missing_table VALUES (1)",
    ]),
  ).rejects.toThrow('no such table');
  await database.close();
  expect(readFileSync(file)).toEqual(before);
});

test('a migration record write failure rolls back its schema changes', async () => {
  await runMigrations(database, [original]);
  await database.exec(
    "CREATE TRIGGER fail_record BEFORE INSERT ON _migrations BEGIN SELECT RAISE(FAIL, 'record rejected'); END",
  );
  const before = readFileSync(file);
  await expect(
    runMigrations(database, [original, 'CREATE TABLE added (id INTEGER)']),
  ).rejects.toThrow('record rejected');
  await database.close();
  expect(readFileSync(file)).toEqual(before);
});

test('an identity failure rolls back successful pending migrations and partially written identity data', async () => {
  await runMigrations(database, [original]);
  const before = readFileSync(file);
  const identityFailure = `CREATE TABLE audit (value TEXT);
    CREATE TRIGGER reject_identity AFTER INSERT ON local_identity BEGIN
      INSERT INTO audit VALUES ('partial write');
      SELECT RAISE(FAIL, 'identity rejected');
    END`;
  await expect(
    initializeDatabase(
      database,
      [original, ...appMigrations, identityFailure],
      true,
      ensureLocalIdentity,
    ),
  ).rejects.toThrow('identity rejected');
  await database.close();
  expect(readFileSync(file)).toEqual(before);
});

test('a read-only database that needs an identity remains byte-for-byte unchanged', async () => {
  await runMigrations(database, appMigrations);
  await database.close();
  const before = readFileSync(file);
  database = openNodeDatabase(file, { readOnly: true });
  await expect(
    initializeDatabase(database, appMigrations, true, ensureLocalIdentity),
  ).rejects.toThrow('readonly');
  await database.close();
  expect(readFileSync(file)).toEqual(before);
});

test('a read-only database that needs no writes can restore an existing name and identity', async () => {
  const identity = await initializeDatabase(
    database,
    appMigrations,
    false,
    ensureLocalIdentity,
  );
  await database.run('UPDATE local_identity SET name = ?', ['Alice']);
  await database.close();
  const before = readFileSync(file);
  database = openNodeDatabase(file, { readOnly: true });
  await expect(
    initializeDatabase(database, appMigrations, false, ensureLocalIdentity),
  ).resolves.toEqual({ ...identity, name: 'Alice' });
  await database.close();
  expect(readFileSync(file)).toEqual(before);
});

test.each(['migration', 'identity'])(
  'a failed development reset restores the previous database after %s failure',
  async (failure) => {
    await runMigrations(database, [original]);
    const before = readFileSync(file);
    await expect(
      initializeDatabase(
        database,
        failure === 'migration'
          ? [...appMigrations, 'INSERT INTO missing VALUES (1)']
          : appMigrations,
        true,
        async (transaction) => {
          await ensureLocalIdentity(transaction);
          throw new Error('identity initialization failed');
        },
      ),
    ).rejects.toThrow();
    await database.close();
    expect(readFileSync(file)).toEqual(before);
  },
);

test('development reset clears views, triggers, quoted names, and foreign-key cycles', async () => {
  await runMigrations(database, [
    `
    CREATE TABLE parent (id INTEGER PRIMARY KEY, child INTEGER REFERENCES child(id));
    CREATE TABLE child (id INTEGER PRIMARY KEY, parent INTEGER REFERENCES parent(id));
    CREATE TABLE "quoted""table" (value TEXT);
    CREATE VIEW previous_view AS SELECT * FROM parent;
    CREATE TRIGGER previous_trigger AFTER INSERT ON parent BEGIN INSERT INTO "quoted""table" VALUES ('old'); END;
    INSERT INTO parent VALUES (1, NULL);
    INSERT INTO child VALUES (1, 1);
    UPDATE parent SET child = 1;
  `,
  ]);
  await initializeDatabase(database, appMigrations, true, ensureLocalIdentity);
  expect(
    await database.all(
      "SELECT name FROM sqlite_master WHERE type IN ('table', 'view', 'trigger') ORDER BY name",
    ),
  ).toEqual([
    { name: '_migrations' },
    { name: 'categories' },
    { name: 'group_members' },
    { name: 'groups' },
    { name: 'local_identity' },
  ]);
  expect(await database.all('PRAGMA foreign_keys')).toEqual([
    { foreign_keys: 1 },
  ]);
});

test('development mode does not treat an unreadable migration record as a reset signal', async () => {
  await database.exec(
    "CREATE TABLE _migrations (invalid TEXT); INSERT INTO _migrations VALUES ('keep me')",
  );
  const before = readFileSync(file);
  await expect(
    initializeDatabase(database, appMigrations, true, ensureLocalIdentity),
  ).rejects.toThrow('no such column');
  await database.close();
  expect(readFileSync(file)).toEqual(before);
});

test('development mode cannot reset a read-only database and leaves its old data intact', async () => {
  await runMigrations(database, [original]);
  await database.close();
  const before = readFileSync(file);
  database = openNodeDatabase(file, { readOnly: true });
  await expect(
    initializeDatabase(database, appMigrations, true, ensureLocalIdentity),
  ).rejects.toThrow('readonly');
  await database.close();
  expect(readFileSync(file)).toEqual(before);
});

test('adding group storage preserves existing identity, appearance, categories and migration records', async () => {
  const previous = appMigrations.slice(0, -groupMigrations.length);
  await initializeDatabase(database, previous, false, ensureLocalIdentity);
  await database.run(
    "UPDATE local_identity SET name = 'Taylor', appearance = 'dark'",
  );
  await database.run(
    "INSERT INTO categories (id, name, color, isDefault, position) VALUES ('category', 'Travel', '#123456', 0, 1)",
  );
  const identity = await database.all('SELECT * FROM local_identity');
  const categories = await database.all('SELECT * FROM categories');
  const records = await database.all(
    'SELECT * FROM _migrations ORDER BY position',
  );

  await initializeDatabase(database, appMigrations, false, ensureLocalIdentity);

  expect(await database.all('SELECT * FROM local_identity')).toEqual(identity);
  expect(await database.all('SELECT * FROM categories')).toEqual(categories);
  expect(
    await database.all('SELECT * FROM _migrations ORDER BY position LIMIT ?', [
      previous.length,
    ]),
  ).toEqual(records);
  expect(await listGroups(database)).toEqual([]);
});
