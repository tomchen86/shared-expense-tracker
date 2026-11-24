import {
  compareSyncStamps,
  currencyDecimals,
  isLocalDate,
} from '@shared-expense/domain';
import { appMigrations } from '../shell';
import {
  compareMigrations,
  runMigrations,
  type Database,
  type SqlExecutor,
} from '../storage';
import { readDeviceIdentity } from '../sharing/device-identity';
import { openDatabaseFile } from '../storage/expo-files';
import { deleteGroupKeys } from '../sync/read-only-copy';
import { UNSENT_EVENTS, latestStamp, saveLatestStamp } from '../sync/records';
import { readGroupKey } from '../sync/transport';
import { CREATE_EXPORT_TABLE, EXPORT_TABLE } from './export';

/** What the confirmation says about an export file (BACKUP-11.2). */
export interface ExportFileSummary {
  exportedAt: Date;
  /** Archived groups too. */
  groups: number;
  /** Without those in the Trash. */
  expenses: number;
  /**
   * The names of the shared ledgers this phone is in that the file would take from it, in
   * the order they were created: such a file is not imported (BACKUP-28.1).
   */
  memberOf: string[];
  /** How many unsent events of the shared ledgers this phone is in the file does not hold. */
  unsentLost: number;
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

/** One row for each thing in the file that breaks a bookkeeping rule the schema cannot express (BACKUP-16.2). */
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
    CROSS JOIN local_identity
    WHERE CASE WHEN expenses.spaceId = local_identity.personalSpaceId
      THEN allocation.participant <> local_identity.personalParticipantId
      ELSE expenses.spaceId NOT IN (SELECT groupId FROM sync_groups)
        AND allocation.participant NOT IN (SELECT id FROM group_members WHERE groupId = expenses.spaceId)
    END
  UNION ALL
  SELECT 1 FROM expenses
    WHERE amountMinor <> (
        SELECT COALESCE(SUM(amountMinor), 0) FROM expense_payments WHERE expenseId = expenses.id)
      OR amountMinor <> (
        SELECT COALESCE(SUM(amountMinor), 0) FROM expense_shares WHERE expenseId = expenses.id)`;

/**
 * Whether the phone holds the group key of its own key epoch for the ledger and lacks the
 * one of the epoch the file records: the file is from an earlier time in the group, whose
 * keys went when the ledger became a copy (BACKUP-28.1). A secure store that cannot be
 * read says nothing.
 */
async function lacksTheFilesKey(
  groupId: string,
  epoch: number,
  filedEpoch: number,
): Promise<boolean> {
  const held = (of: number) =>
    readGroupKey(groupId, of, (cause) => {
      throw cause;
    });
  try {
    return !!(await held(epoch)) && !(await held(filedEpoch));
  } catch {
    return false;
  }
}

/**
 * What an import of `file` would do to the shared ledgers this phone is in (ADR-0042):
 * which of them the file does not hold as this phone's shared ledger, and how many of
 * their unsent events it does not hold either. A read-only copy is not one the phone is in.
 */
async function sharedLedgersAtStake(database: Database, file: SqlExecutor) {
  const mine = await database.all<{
    groupId: string;
    name: string;
    device: string;
    epoch: number;
  }>(
    `SELECT s.groupId, g.name, s.device, s.epoch FROM sync_groups s
     JOIN groups g ON g.id = s.groupId WHERE s.readOnly IS NULL ORDER BY g.position`,
  );
  const filed = new Map(
    (
      await file.all<{ groupId: string; device: string; epoch: number }>(
        'SELECT groupId, device, epoch FROM sync_groups WHERE readOnly IS NULL',
      )
    ).map((ledger) => [ledger.groupId, ledger]),
  );
  const memberOf: string[] = [];
  for (const { groupId, name, device, epoch } of mine) {
    const theirs = filed.get(groupId);
    if (
      theirs?.device !== device ||
      (await lacksTheFilesKey(groupId, epoch, theirs.epoch))
    )
      memberOf.push(name);
  }
  const kept = new Set(
    (await file.all<{ id: string }>(`SELECT id FROM ${UNSENT_EVENTS}`)).map(
      ({ id }) => id,
    ),
  );
  const unsent = await database.all<{ id: string }>(
    `SELECT o.id FROM ${UNSENT_EVENTS} o JOIN sync_groups s ON s.groupId = o.groupId
     WHERE s.readOnly IS NULL`,
  );
  return {
    memberOf,
    unsentLost: unsent.filter(({ id }) => !kept.has(id)).length,
  };
}

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
    return {
      exportedAt: new Date(exportedAt),
      groups,
      expenses,
      ...(await sharedLedgersAtStake(database, file)),
    };
  } finally {
    await file.close().catch(() => undefined);
  }
}

const ATTACHED = 'export_file';

/**
 * Replaces the local data with the rows of the accepted export file at `path`,
 * keeping the later of the phone's and the file's latest sync stamps.
 * `replaceLocalData` runs the writes in one transaction on the phone's connection,
 * so a failure leaves the local data as it was.
 *
 * On a phone that holds no seed for the file's device identity, the file's shared ledgers
 * become read-only copies in that transaction (BACKUP-29.1): the phone could never sync
 * them, and what it wrote meanwhile would never be sent.
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
  let lapsed: { groupId: string; epoch: number }[] = [];
  try {
    const tables = (
      await database.all<{ name: string }>(
        "SELECT name FROM main.sqlite_master WHERE type = 'table' AND substr(name, 1, 7) <> 'sqlite_'",
      )
    ).map(({ name }) => `"${name.replaceAll('"', '""')}"`);
    await replaceLocalData(async (transaction) => {
      const previousStamp = await latestStamp(transaction);
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
      if (previousStamp) {
        const importedStamp = await latestStamp(transaction);
        if (
          !importedStamp ||
          compareSyncStamps(previousStamp, importedStamp) > 0
        )
          await saveLatestStamp(transaction, previousStamp);
      }
      // A secure store that cannot be read is not a lost seed: the next sync finds out.
      const identity = await readDeviceIdentity(transaction).catch(
        () => undefined,
      );
      if (identity?.status === 'lost') {
        lapsed = await transaction.all(
          'SELECT groupId, epoch FROM sync_groups WHERE readOnly IS NULL',
        );
        await transaction.run(
          "UPDATE sync_groups SET readOnly = 'lapsed' WHERE readOnly IS NULL",
        );
      }
    });
  } finally {
    await database.exec(`DETACH DATABASE ${ATTACHED}`).catch(() => undefined);
  }
  // A copy holds no group key (SYNC-302.1).
  for (const { groupId, epoch } of lapsed)
    await deleteGroupKeys(groupId, epoch);
}
