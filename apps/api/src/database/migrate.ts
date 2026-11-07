import type { Sql } from './connect';

/**
 * SQL text in its capability's directory. One that has run in production is never edited:
 * a change is a new migration at the end of the list (ADR-0007).
 */
export interface Migration {
  name: string;
  sql: string;
}

interface MigrationRecord {
  name: string;
  checksum: string;
}

async function checksum(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

function checkRecords(
  records: readonly MigrationRecord[],
  migrations: readonly Migration[],
  checksums: readonly string[],
): void {
  records.forEach((record, index) => {
    const migration = migrations[index];
    if (!migration) {
      throw new Error(
        `The database has run migration "${record.name}", which this list does not have`,
      );
    }
    if (record.name !== migration.name) {
      throw new Error(
        `The database ran migration "${record.name}" at position ${index + 1}, where this list has "${migration.name}"`,
      );
    }
    if (record.checksum !== checksums[index]) {
      throw new Error(
        `Migration "${record.name}" has changed since it ran. A change is a new migration at the end of the list`,
      );
    }
  });
}

/**
 * Runs the migrations the database has not recorded yet, in the list's order, each with
 * its record. It is all one transaction: when the records do not match the start of the
 * list, or a migration fails, the database stays as it was.
 */
export async function runMigrations(
  sql: Sql,
  migrations: readonly Migration[],
): Promise<void> {
  const checksums = await Promise.all(
    migrations.map((migration) => checksum(migration.sql)),
  );
  await sql.begin(async (transaction) => {
    // Runners take turns, so the second finds what the first recorded. This lock lasts
    // until the transaction ends; Hyperdrive does not support the session-level kind.
    await transaction`SELECT pg_advisory_xact_lock(8675309)`;
    await transaction`CREATE TABLE IF NOT EXISTS _migrations (
      position integer PRIMARY KEY,
      name text NOT NULL UNIQUE,
      checksum text NOT NULL,
      ran_at timestamptz NOT NULL DEFAULT now()
    )`;
    const records = await transaction<MigrationRecord[]>`
      SELECT name, checksum FROM _migrations ORDER BY position`;
    checkRecords(records, migrations, checksums);
    for (let index = records.length; index < migrations.length; index += 1) {
      const { name, sql: text } = migrations[index];
      await transaction.unsafe(text);
      await transaction`INSERT INTO _migrations (position, name, checksum)
        VALUES (${index + 1}, ${name}, ${checksums[index]})`;
    }
  });
}
