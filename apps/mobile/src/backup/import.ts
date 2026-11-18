import { currencyDecimals, isLocalDate } from '@shared-expense/domain';
import { appMigrations } from '../shell';
import {
  compareMigrations,
  runMigrations,
  type Database,
  type SqlExecutor,
} from '../storage';
import { openDatabaseFile } from '../storage/expo-files';
import { CREATE_EXPORT_TABLE, EXPORT_TABLE } from './export';

/** What the confirmation says about an export file (BACKUP-11.1). */
export interface ExportFileSummary {
  exportedAt: Date;
  /** Archived groups too. */
  groups: number;
  /** Without those in the Trash. */
  expenses: number;
}

/** The file is a sound export from a later version of the app than this one (BACKUP-17.1). */
export class NewerExportFile extends Error {}

function check(holds: boolean): asserts holds {
  if (!holds) throw new Error('The file cannot be used');
}

/** What a database's schema holds, apart from SQLite's own tables and an export file's table. */
const schemaOf = async (executor: SqlExecutor) =>
  JSON.stringify(
    await executor.all(
      `SELECT type, name, tbl_name, sql FROM sqlite_master
       WHERE substr(name, 1, 7) <> 'sqlite_' AND name <> '${EXPORT_TABLE}'
       ORDER BY type, name`,
    ),
  );

/** One row for each thing in the file that breaks a bookkeeping rule the schema cannot express (BACKUP-16.1). */
const BROKEN_RULES = `
  SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM local_identity)
  UNION ALL
  SELECT 1 FROM (SELECT spaceId FROM categories UNION ALL SELECT spaceId FROM expenses)
    WHERE spaceId NOT IN (
      SELECT personalSpaceId FROM local_identity UNION ALL SELECT id FROM groups)
  UNION ALL
  SELECT 1 FROM (
      SELECT expenseId, participant FROM expense_payments
      UNION ALL
      SELECT expenseId, participant FROM expense_shares) AS allocation
    JOIN expenses ON expenses.id = allocation.expenseId
    WHERE allocation.participant NOT IN (
      SELECT personalParticipantId FROM local_identity WHERE personalSpaceId = expenses.spaceId
      UNION ALL
      SELECT id FROM group_members WHERE groupId = expenses.spaceId)
  UNION ALL
  SELECT 1 FROM expenses
    WHERE amountMinor <> (
        SELECT COALESCE(SUM(amountMinor), 0) FROM expense_payments WHERE expenseId = expenses.id)
      OR amountMinor <> (
        SELECT COALESCE(SUM(amountMinor), 0) FROM expense_shares WHERE expenseId = expenses.id)`;

/**
 * Checks the file at `path`, which comes from outside the app, in the order ADR-0020
 * gives, and brings an older one up to date. Resolves with what the confirmation shows,
 * and rejects with `NewerExportFile` for a file from a later version, or with another
 * error for a file that cannot be used (BACKUP-15.1). `database` is the phone's.
 */
export async function readExportFile(
  database: Database,
  path: string,
): Promise<ExportFileSummary> {
  const file = await openDatabaseFile(path);
  try {
    // Nothing a schema can name runs with more rights than a query has, and a damaged
    // page is found before it is used.
    await file.exec('PRAGMA trusted_schema = OFF; PRAGMA cell_size_check = ON');
    check(
      JSON.stringify(await file.all('PRAGMA integrity_check')) ===
        '[{"integrity_check":"ok"}]',
    );

    const version = await compareMigrations(file, appMigrations);
    if (version === 'newer') throw new NewerExportFile();
    check(version !== 'different');

    // Before a migration runs on it, so that nothing the file brought is executed.
    const [{ programs }] = await file.all<{ programs: number }>(
      "SELECT count(*) AS programs FROM sqlite_master WHERE type IN ('view', 'trigger')",
    );
    check(programs === 0);
    if (version === 'older') await runMigrations(file, appMigrations);

    // The phone's own schema is what the app's migrations make.
    check((await schemaOf(file)) === (await schemaOf(database)));
    check(
      JSON.stringify(
        await file.all(
          `SELECT type, sql FROM sqlite_master WHERE name = '${EXPORT_TABLE}'`,
        ),
      ) === JSON.stringify([{ type: 'table', sql: CREATE_EXPORT_TABLE }]),
    );

    const times = await file.all<{ exportedAt: unknown }>(
      `SELECT exportedAt FROM ${EXPORT_TABLE}`,
    );
    const exportedAt = times.length === 1 ? times[0].exportedAt : undefined;
    check(typeof exportedAt === 'number' && Number.isInteger(exportedAt));
    check(!Number.isNaN(new Date(exportedAt).getTime()));

    check((await file.all('PRAGMA foreign_key_check')).length === 0);
    check((await file.all(BROKEN_RULES)).length === 0);
    const used = await file.all<{ currency: string; date: string }>(
      'SELECT DISTINCT currency, date FROM expenses',
    );
    check(
      used.every(
        ({ currency, date }) =>
          currencyDecimals(currency) !== undefined && isLocalDate(date),
      ),
    );

    const [{ groups, expenses }] = await file.all<{
      groups: number;
      expenses: number;
    }>(
      `SELECT (SELECT count(*) FROM groups) AS groups,
        (SELECT count(*) FROM expenses WHERE trashOrder IS NULL) AS expenses`,
    );
    return { exportedAt: new Date(exportedAt), groups, expenses };
  } finally {
    await file.close().catch(() => undefined);
  }
}

const ATTACHED = 'export_file';

/**
 * Replaces every row of the local data with the rows of the export file at `path`,
 * which `readExportFile` has accepted. `replaceLocalData` runs the writes in one
 * transaction on the phone's connection, so a failure leaves the local data as it was.
 */
export async function importData(
  database: Database,
  path: string,
  replaceLocalData: (
    replace: (transaction: SqlExecutor) => Promise<void>,
  ) => Promise<void>,
): Promise<void> {
  // A transaction cannot attach a database, so the file is attached around it.
  await database.run(`ATTACH DATABASE ? AS ${ATTACHED}`, [path]);
  try {
    const tables = (
      await database.all<{ name: string }>(
        "SELECT name FROM main.sqlite_master WHERE type = 'table' AND substr(name, 1, 7) <> 'sqlite_'",
      )
    ).map(({ name }) => `"${name.replaceAll('"', '""')}"`);
    await replaceLocalData(async (transaction) => {
      // ponytail: deferring covers every foreign key the schema has; one declared
      // ON DELETE RESTRICT fails at once, and then its children are deleted first.
      await transaction.exec('PRAGMA defer_foreign_keys = ON');
      for (const table of tables)
        await transaction.exec(`DELETE FROM main.${table}`);
      // In the file's row order, which the order of expenses on one date follows.
      for (const table of tables)
        await transaction.exec(
          `INSERT INTO main.${table} SELECT * FROM ${ATTACHED}.${table} ORDER BY rowid`,
        );
    });
  } finally {
    await database.exec(`DETACH DATABASE ${ATTACHED}`).catch(() => undefined);
  }
}
