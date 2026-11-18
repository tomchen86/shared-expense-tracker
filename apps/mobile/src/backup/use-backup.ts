import { useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useLocalDatabase, useReplaceLocalData } from '../shell';
import { pickFile, removePath } from '../storage/expo-files';
import { useDisplayLocale } from '../ui/use-display-locale';
import { exportData } from './export';
import {
  importData,
  NewerExportFile,
  readExportFile,
  type ExportFileSummary,
} from './import';

const CANNOT_IMPORT = 'Unable to Import Data';

const counted = (count: number, one: string) =>
  `${count} ${one}${count === 1 ? '' : 's'}`;

/** What the confirmation says about the file, in the time zone the device is in (BACKUP-11.1). */
function describe(
  { exportedAt, groups, expenses }: ExportFileSummary,
  locale: string,
) {
  const { timeZone } = Intl.DateTimeFormat().resolvedOptions();
  const format = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(
      exportedAt,
    );
  return `This file was exported on ${format({ dateStyle: 'medium' })} at ${format({ timeStyle: 'short' })} and has ${counted(groups, 'group')} and ${counted(expenses, 'expense')}. Importing it replaces all the data on this phone. This cannot be undone.`;
}

const confirmReplace = (message: string) =>
  new Promise<boolean>((resolve) =>
    Alert.alert('Replace All Data?', message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Replace', style: 'destructive', onPress: () => resolve(true) },
    ]),
  );

/** Export Data and Import Data of the Settings root; `busy` while either is in progress. */
export function useBackup() {
  const database = useLocalDatabase();
  const replaceLocalData = useReplaceLocalData();
  const locale = useDisplayLocale();
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  /** One export or import at a time, however fast the rows are pressed (BACKUP-8.1, BACKUP-22.1). */
  async function run(work: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      await work();
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  /** Checks the picked file, asks, and replaces the local data; rejects when the writes fail. */
  async function importPicked(file: string) {
    let summary: ExportFileSummary;
    try {
      summary = await readExportFile(database, file);
    } catch (error) {
      Alert.alert(
        CANNOT_IMPORT,
        error instanceof NewerExportFile
          ? 'This file was exported by a newer version of the app. Update the app, then try again. Your data was not changed.'
          : 'This file is damaged or was not exported by this app. Your data was not changed.',
      );
      return;
    }
    if (await confirmReplace(describe(summary, locale)))
      await importData(database, file, replaceLocalData);
  }

  return {
    busy,
    exportData: () =>
      run(() =>
        exportData(database).catch(() =>
          Alert.alert(
            'Unable to Export Data',
            'Your data could not be exported. Please try again.',
          ),
        ),
      ),
    importData: () =>
      run(async () => {
        try {
          const file = await pickFile();
          if (file === undefined) return;
          try {
            await importPicked(file);
          } finally {
            await removePath(file).catch(() => undefined);
          }
        } catch {
          Alert.alert(
            CANNOT_IMPORT,
            'Your data could not be imported. Your data was not changed.',
          );
        }
      }),
  };
}
