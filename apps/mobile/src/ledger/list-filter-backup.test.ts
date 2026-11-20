import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportData } from '../backup/export';
import { importData, readExportFile } from '../backup/import';
import { ensureDefaultCategories } from '../categories/repository';
import { ensureLocalIdentity } from '../shell/identity';
import { appMigrations } from '../shell/migrations';
import { initializeDatabase } from '../storage';
import { createTemporaryDirectory, shareFile } from '../storage/expo-files';
import { openNodeDatabase } from '../storage/node';
import { NO_FILTER } from './list-filter';
import { readListFilter, writeListFilter } from './list-filter-storage';
import { expenseListFilterMigration } from './migrations';

jest.mock('../storage/expo-files', () => ({
  openDatabaseFile:
    jest.requireActual<typeof import('../storage/node')>('../storage/node')
      .openNodeDatabase,
  createTemporaryDirectory: jest.fn(),
  removeTemporaryFiles: async () => undefined,
  shareFile: jest.fn(),
}));

test.each(['current', 'before filters'] as const)(
  'imports the current list conditions from a %s export without a named filter',
  async (version) => {
    const directory = mkdtempSync(join(tmpdir(), 'list-filter-backup-'));
    const source = openNodeDatabase(':memory:');
    const phone = openNodeDatabase(':memory:');
    jest.mocked(createTemporaryDirectory).mockResolvedValue(directory);
    jest.mocked(shareFile).mockClear();
    try {
      const migrations =
        version === 'current'
          ? appMigrations
          : appMigrations.slice(
              0,
              appMigrations.indexOf(expenseListFilterMigration),
            );
      const { personalSpaceId } = await initializeDatabase(
        source,
        migrations,
        false,
        async (tx) => {
          const identity = await ensureLocalIdentity(tx);
          await ensureDefaultCategories(tx, identity.personalSpaceId);
          return identity;
        },
      );
      const conditions = {
        ...NO_FILTER,
        categories: ['Shopping'],
        min: '5.00',
        currency: 'USD',
      };
      if (version === 'current')
        await source.transaction((tx) =>
          writeListFilter(tx, personalSpaceId, conditions),
        );
      await exportData(source);
      const [[file]] = jest.mocked(shareFile).mock.calls;

      const receiver = await initializeDatabase(
        phone,
        appMigrations,
        false,
        ensureLocalIdentity,
      );
      await phone.transaction((tx) =>
        writeListFilter(tx, receiver.personalSpaceId, {
          ...NO_FILTER,
          max: '9',
        }),
      );
      await readExportFile(phone, file);
      await importData(phone, file, (replace) => phone.transaction(replace));
      const read = (id: string) =>
        phone.transaction((tx) => readListFilter(tx, id));
      expect(await read(personalSpaceId)).toEqual(
        version === 'current' ? conditions : NO_FILTER,
      );
      expect(await read(receiver.personalSpaceId)).toEqual(NO_FILTER);
      await phone.transaction((tx) =>
        writeListFilter(tx, personalSpaceId, conditions),
      );
      expect(await read(personalSpaceId)).toEqual(conditions);
    } finally {
      await Promise.all([source.close(), phone.close()]);
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
