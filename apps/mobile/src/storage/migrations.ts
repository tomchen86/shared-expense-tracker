import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import type { Database, SqlExecutor } from './database';

interface MigrationRecord {
  position: number;
  checksum: string;
}

async function applyMigrations(
  transaction: SqlExecutor,
  migrations: readonly string[],
  development: boolean,
): Promise<void> {
  const checksums = migrations.map((sql) =>
    bytesToHex(sha256(utf8ToBytes(sql))),
  );
  const tables = await transaction.all(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_migrations'",
  );
  let records = tables.length
    ? await transaction.all<MigrationRecord>(
        'SELECT position, checksum FROM _migrations ORDER BY position',
      )
    : [];

  if (
    records.some(
      (record, index) =>
        record.position !== index + 1 || record.checksum !== checksums[index],
    )
  ) {
    if (!development)
      throw new Error('Migration history does not match this app');
    // Clearing and rebuilding the schema belong to the startup transaction too:
    // a failed reset must leave the previous data available to the previous app.
    await transaction.exec('PRAGMA defer_foreign_keys = ON');
    const objects = await transaction.all<{ type: string; name: string }>(
      `SELECT type, name FROM sqlite_master
       WHERE type IN ('view', 'trigger', 'table') AND substr(name, 1, 7) <> 'sqlite_'
       ORDER BY CASE type WHEN 'view' THEN 0 WHEN 'trigger' THEN 1 ELSE 2 END`,
    );
    for (const object of objects) {
      await transaction.exec(
        `DROP ${object.type} "${object.name.replaceAll('"', '""')}"`,
      );
    }
    records = [];
  }

  if (records.length === migrations.length) return;
  await transaction.exec(
    'CREATE TABLE IF NOT EXISTS _migrations (position INTEGER PRIMARY KEY, checksum TEXT NOT NULL)',
  );
  for (let index = records.length; index < migrations.length; index += 1) {
    await transaction.exec(migrations[index]);
    await transaction.run(
      'INSERT INTO _migrations (position, checksum) VALUES (?, ?)',
      [index + 1, checksums[index]],
    );
  }
}

/** All startup writes become visible together, only after the transaction commits. */
export function initializeDatabase<T>(
  database: Database,
  migrations: readonly string[],
  development: boolean,
  initialize: (transaction: SqlExecutor) => Promise<T>,
): Promise<T> {
  return database.transaction(async (transaction) => {
    await applyMigrations(transaction, migrations, development);
    return initialize(transaction);
  });
}

export function runMigrations(
  database: Database,
  migrations: readonly string[],
): Promise<void> {
  return initializeDatabase(database, migrations, false, async () => undefined);
}
