import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createDatabase,
  type Database,
  type SqlExecutor,
} from '../../src/storage/database';
import { openNodeDatabase } from '../../src/storage/node';

let directory: string;
let database: Database;
beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), 'database-queue-'));
  database = openNodeDatabase(join(directory, 'app.db'));
  await database.exec('CREATE TABLE entries (value TEXT)');
});
afterEach(async () => {
  await database.close();
  rmSync(directory, { recursive: true, force: true });
});

function barrier() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

test('other callers cannot read or write inside an awaiting transaction, even if it fails', async () => {
  const entered = barrier();
  const proceed = barrier();
  const first = database.transaction(async (transaction) => {
    await transaction.run('INSERT INTO entries VALUES (?)', ['rolled back']);
    entered.release();
    await proceed.promise;
    throw new Error('rollback');
  });
  const failure = expect(first).rejects.toThrow('rollback');
  await entered.promise;
  const read = database.all('SELECT * FROM entries');
  const write = database.run('INSERT INTO entries VALUES (?)', ['kept']);
  let finished = false;
  void write.then(() => {
    finished = true;
  });
  await Promise.resolve();
  expect(finished).toBe(false);
  proceed.release();
  await failure;
  expect(await read).toEqual([]);
  await write;
  expect(await database.all('SELECT * FROM entries')).toEqual([
    { value: 'kept' },
  ]);
});

test('serializes concurrent transactions and rejects an executor used after its transaction', async () => {
  let escaped!: SqlExecutor;
  await Promise.all(
    [1, 2].map((number) =>
      database.transaction(async (transaction) => {
        escaped = transaction;
        const rows = await transaction.all('SELECT * FROM entries');
        expect(rows).toHaveLength(number - 1);
        await transaction.run('INSERT INTO entries VALUES (?)', [
          String(number),
        ]);
      }),
    ),
  );
  await expect(
    escaped.run('INSERT INTO entries VALUES (?)', ['late']),
  ).rejects.toThrow('Transaction has ended');
  expect(await database.all('SELECT * FROM entries')).toHaveLength(2);
});

test('a caught SQL failure still rolls back the transaction and the next operation can run', async () => {
  await expect(
    database.transaction(async (transaction) => {
      await transaction.run("INSERT INTO entries VALUES ('rollback')");
      await transaction
        .exec('INSERT INTO missing VALUES (1)')
        .catch(() => undefined);
    }),
  ).rejects.toThrow('no such table');
  await database.run("INSERT INTO entries VALUES ('kept')");
  expect(await database.all('SELECT * FROM entries')).toEqual([
    { value: 'kept' },
  ]);
});

test('close drains queued transactions, is idempotent, and rejects new operations', async () => {
  const transaction = database.transaction(async (connection) => {
    await connection.run("INSERT INTO entries VALUES ('kept')");
  });
  const closing = database.close();
  expect(database.close()).toBe(closing);
  await expect(database.all('SELECT * FROM entries')).rejects.toThrow(
    'Database is closed',
  );
  await transaction;
  await closing;
  const reopened = openNodeDatabase(join(directory, 'app.db'));
  try {
    expect(await reopened.all('SELECT * FROM entries')).toEqual([
      { value: 'kept' },
    ]);
  } finally {
    await reopened.close();
  }
});

test('a failed COMMIT is rolled back before the next operation', async () => {
  const raw = database;
  database = createDatabase({
    ...raw,
    exec: async (sql) => {
      if (sql === 'COMMIT') throw new Error('commit failed');
      await raw.exec(sql);
    },
  });
  await expect(
    database.transaction(async (transaction) => {
      await transaction.run("INSERT INTO entries VALUES ('rollback')");
    }),
  ).rejects.toThrow('commit failed');
  expect(await database.all('SELECT * FROM entries')).toEqual([]);
});

test('a failed rollback poisons the connection so no later caller can commit its writes', async () => {
  const raw = database;
  database = createDatabase({
    ...raw,
    exec: async (sql) => {
      if (sql === 'ROLLBACK') throw new Error('rollback failed');
      await raw.exec(sql);
    },
  });
  await expect(
    database.transaction(async (transaction) => {
      await transaction.run("INSERT INTO entries VALUES ('must not commit')");
      throw new Error('initial failure');
    }),
  ).rejects.toThrow('Transaction rollback failed');
  await expect(
    database.run("INSERT INTO entries VALUES ('later')"),
  ).rejects.toThrow('Database rollback failed');
  await database.close();
  const reopened = openNodeDatabase(join(directory, 'app.db'));
  try {
    expect(await reopened.all('SELECT * FROM entries')).toEqual([]);
  } finally {
    await reopened.close();
  }
});

test('SQLite automatic rollback cannot let already queued statements commit outside the transaction', async () => {
  await database.exec(
    "CREATE UNIQUE INDEX unique_value ON entries(value); INSERT INTO entries VALUES ('existing')",
  );
  await expect(
    database.transaction(async (transaction) => {
      await Promise.all([
        transaction.run("INSERT OR ROLLBACK INTO entries VALUES ('existing')"),
        transaction.run("INSERT INTO entries VALUES ('must not commit')"),
      ]);
    }),
  ).rejects.toThrow();
  await database.close();
  const reopened = openNodeDatabase(join(directory, 'app.db'));
  try {
    expect(await reopened.all('SELECT * FROM entries')).toEqual([
      { value: 'existing' },
    ]);
  } finally {
    await reopened.close();
  }
});
