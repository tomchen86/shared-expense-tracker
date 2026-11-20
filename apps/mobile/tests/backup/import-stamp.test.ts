import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CREATE_EXPORT_TABLE, EXPORT_TABLE } from '../../src/backup/export';
import { importData } from '../../src/backup/import';
import { ensureLocalIdentity } from '../../src/shell/identity';
import { appMigrations } from '../../src/shell/migrations';
import { initializeDatabase, type Database } from '../../src/storage';
import { openNodeDatabase } from '../../src/storage/node';
import { latestStamp, saveLatestStamp } from '../../src/sync/records';

const exportedStamp = { ms: 1_000, counter: 7, device: 'phone-b' };
let directory: string;
let path: string;
let phone: Database;

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), 'import-stamp-'));
  path = join(directory, 'export.sqlite');
  phone = openNodeDatabase(':memory:');
  await initializeDatabase(phone, appMigrations, false, ensureLocalIdentity);
  const file = openNodeDatabase(path);
  try {
    await initializeDatabase(file, appMigrations, false, ensureLocalIdentity);
    await saveLatestStamp(file, exportedStamp);
    await file.exec(
      `${CREATE_EXPORT_TABLE}; INSERT INTO ${EXPORT_TABLE} VALUES (0)`,
    );
  } finally {
    await file.close();
  }
});

afterEach(async () => {
  await phone.close();
  rmSync(directory, { recursive: true, force: true });
});

test.each([
  { counter: 8, device: 'phone-a', keepPhone: true },
  { counter: 6, device: 'phone-c', keepPhone: false },
  { counter: 7, device: 'phone-c', keepPhone: true },
  { counter: 7, device: 'phone-a', keepPhone: false },
])(
  'breaks a millisecond tie with phone stamp $counter/$device',
  async ({ counter, device, keepPhone }) => {
    const previousStamp = { ms: exportedStamp.ms, counter, device };
    await saveLatestStamp(phone, previousStamp);
    await importData(phone, path, phone.transaction);
    expect(await latestStamp(phone)).toEqual(
      keepPhone ? previousStamp : exportedStamp,
    );
  },
);

test('rolls back the replacement if saving the later phone stamp fails', async () => {
  const originalIdentity = await ensureLocalIdentity(phone);
  const previousStamp = { ...exportedStamp, device: 'phone-c' };
  await saveLatestStamp(phone, previousStamp);
  await phone.exec(`CREATE TEMP TRIGGER reject_stamp BEFORE INSERT ON main.sync_clock
    WHEN NEW.device = 'phone-c' BEGIN SELECT RAISE(ABORT, 'stamp write failed'); END`);

  await expect(importData(phone, path, phone.transaction)).rejects.toThrow(
    'stamp write failed',
  );
  expect(await ensureLocalIdentity(phone)).toEqual(originalIdentity);
  expect(await latestStamp(phone)).toEqual(previousStamp);
});
