import { toLocalDate } from '@shared-expense/domain';
import type { Database } from '../storage';
import {
  createTemporaryDirectory,
  openDatabaseFile,
  removePath,
  removeTemporaryFiles,
  shareFile,
} from '../storage/expo-files';

/** The table only an export file has: one row, the moment it was made (ADR-0020). */
export const EXPORT_TABLE = '_export';
/** As SQLite keeps it in the file's schema, so an import can compare the two. */
export const CREATE_EXPORT_TABLE = `CREATE TABLE ${EXPORT_TABLE} (exportedAt INTEGER NOT NULL)`;

/** The name of an export file made at `instant`, in the time zone the device is in (BACKUP-2.1). */
function fileName(instant: Date): string {
  const { timeZone } = Intl.DateTimeFormat().resolvedOptions();
  const time = Object.fromEntries(
    new Intl.DateTimeFormat('en', {
      timeZone,
      numberingSystem: 'latn',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(instant)
      .map(({ type, value }) => [type, value]),
  );
  // Midnight is 24 where a platform does not know the hour cycle.
  const hour = String(Number(time.hour) % 24).padStart(2, '0');
  return `Expenses Backup ${toLocalDate(instant, timeZone)} ${hour}${time.minute.padStart(2, '0')}.sqlite`;
}

/**
 * Writes all the local data to an export file and hands it to the share sheet.
 * Resolves once the sheet has closed, and leaves the file for the app that took it
 * (BACKUP-6.1). When it fails, nothing of this export is left on the phone.
 */
export async function exportData(database: Database): Promise<void> {
  await removeTemporaryFiles().catch(() => undefined);
  const directory = await createTemporaryDirectory();
  try {
    const now = new Date();
    const path = `${directory}/${fileName(now)}`;
    // One statement reads one snapshot, so a change saved meanwhile is in the copy
    // whole or not at all.
    await database.run('VACUUM INTO ?', [path]);
    const file = await openDatabaseFile(path);
    try {
      await file.exec(
        `${CREATE_EXPORT_TABLE}; INSERT INTO ${EXPORT_TABLE} VALUES (${now.getTime()})`,
      );
    } finally {
      await file.close();
    }
    await shareFile(path);
  } catch (error) {
    await removePath(directory).catch(() => undefined);
    throw error;
  }
}
