import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportData } from '../../src/backup/export';
import { importData, readExportFile } from '../../src/backup/import';
import { listJoinRequests } from '../../src/sharing/join-requests';
import { ensureLocalIdentity } from '../../src/shell/identity';
import { appMigrations } from '../../src/shell/migrations';
import { initializeDatabase } from '../../src/storage';
import {
  createTemporaryDirectory,
  shareFile,
} from '../../src/storage/expo-files';
import { openNodeDatabase } from '../../src/storage/node';
import { startExpenses } from '../acceptance/ledger-expense-app';
import { goOffline, goOnline, T } from '../acceptance/sharing-app';
import { keepAnswersBack, until } from '../acceptance/sharing-invite-app';
import { receiveLink } from '../acceptance/sharing-invite-link-app';
import {
  BRISBANE_LINK,
  TOKYO_LINK,
  CASEY_ID,
  CODE_A,
  brisbaneInvites,
  tokyoInvites,
  canSend,
  chosen,
  joinLines,
  joinSettles,
  reads,
  eachTestGetsAJoiningPhone,
  nameField,
  openLink,
  pressInJoin,
  send,
  typeName,
  requested,
  startAs,
} from '../acceptance/sharing-join-app';
import { allowWrites, holdWrites } from '../acceptance/shell-appearance-app';
import { appDatabase, setClock } from '../acceptance/sync-app';

jest.mock('../../src/storage/expo', () => ({
  openPhoneDatabase: () =>
    jest
      .requireActual<typeof import('../acceptance/sync-app')>(
        '../acceptance/sync-app',
      )
      .openPhone(),
}));
jest.mock(
  'expo-crypto',
  () =>
    jest.requireActual<typeof import('../acceptance/sharing-app')>(
      '../acceptance/sharing-app',
    ).randomSource,
);
jest.mock(
  'expo-secure-store',
  () =>
    jest.requireActual<typeof import('../acceptance/sharing-app')>(
      '../acceptance/sharing-app',
    ).secureStore,
);
jest.mock('../../src/storage/expo-files', () => ({
  openDatabaseFile: jest.requireActual<typeof import('../../src/storage/node')>(
    '../../src/storage/node',
  ).openNodeDatabase,
  createTemporaryDirectory: jest.fn(),
  shareFile: jest.fn(),
  removeTemporaryFiles: async () => undefined,
}));

eachTestGetsAJoiningPhone('join-requests-');

test('a fresh phone starts with an empty name and enables sending only after nonblank input', async () => {
  brisbaneInvites();
  await startExpenses();
  setClock(T);
  await openLink(BRISBANE_LINK);

  expect(nameField()).toHaveProp('value', '');
  expect(nameField()).toHaveProp('placeholder', 'Enter your name');
  expect(canSend()).toBe(false);
  await typeName('   ');
  expect(canSend()).toBe(false);
  await typeName('Dana');
  expect(canSend()).toBe(true);
});

test('an unfinished local write shows progress and restores the exact form if it fails', async () => {
  brisbaneInvites();
  await startAs();
  await openLink(BRISBANE_LINK);
  await typeName(' Dana K. ');
  await pressInJoin('Casey');
  const writes = holdWrites();
  try {
    await pressInJoin('Send Request');
    expect(joinLines()).toEqual(['Sending request…']);
  } finally {
    await writes.fail();
    allowWrites();
  }
  await joinSettles();
  expect(nameField()).toHaveProp('value', ' Dana K. ');
  expect(chosen()).toEqual(['Casey']);
  expect(await listJoinRequests(appDatabase())).toEqual([]);
});

test('a late invite card leaves the next form and its edits alone', async () => {
  brisbaneInvites();
  tokyoInvites();
  await startAs();
  const release = keepAnswersBack(({ path }) => path === `/invites/${CODE_A}`);
  try {
    await receiveLink(BRISBANE_LINK);
    await until(() => reads().length === 1, 'the first invite read');
    await openLink(TOKYO_LINK);
    await typeName('Dana K.');
  } finally {
    await release();
  }
  expect(joinLines()[0]).toBe('Tokyo');
  expect(nameField()).toHaveProp('value', 'Dana K.');
});

test('an export restores confirmed and unsent requests in order, including the details needed to retry', async () => {
  brisbaneInvites();
  tokyoInvites();
  await startAs();
  await openLink(BRISBANE_LINK);
  await pressInJoin('Casey');
  goOffline();
  await send();
  goOnline();
  await requested(TOKYO_LINK);

  const directory = mkdtempSync(join(tmpdir(), 'join-export-'));
  const receiver = openNodeDatabase(':memory:');
  try {
    const original = await listJoinRequests(appDatabase());
    expect(original).toMatchObject([
      { groupName: 'Brisbane', memberId: CASEY_ID, sent: 0 },
      { groupName: 'Tokyo', memberId: null, sent: 1 },
    ]);
    jest.mocked(createTemporaryDirectory).mockResolvedValue(directory);
    await exportData(appDatabase());
    const [[path]] = jest.mocked(shareFile).mock.calls;
    await initializeDatabase(
      receiver,
      appMigrations,
      false,
      ensureLocalIdentity,
    );
    await readExportFile(receiver, path);
    await importData(receiver, path, receiver.transaction);
    expect(await listJoinRequests(receiver)).toEqual(original);
  } finally {
    await receiver.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
