import { Alert } from 'react-native';
import { waitFor } from '@testing-library/react-native';
import { listGroups, renameGroup } from '../../src/groups';
import { readDeviceIdentity, sendApiRequest } from '../../src/sharing';
import type { Database } from '../../src/storage';
import { openNodeDatabase } from '../../src/storage/node';
import {
  listUnsentSyncEvents,
  makeReadOnlyCopy,
  readOnlyCopyOf,
  saveGroupKey,
  shareGroup,
} from '../../src/sync';
import {
  alertsShown,
  chooseFile,
  close,
  exportFrom,
  goOffline,
  importFile,
  newPhone,
  nextAlert,
  removePhones,
  resetPhones,
  startOn,
  writeData,
  type Phone,
} from './backup-app';
import { openGroup, textsOn } from './group-details-app';
import { resetPhone } from './ledger-expense-app';
import {
  API,
  T,
  emptySecureStore,
  failSecureStoreReads,
  mistakes,
  removeSecureStoreEntry,
  removeWorld,
  resetWorld,
  secureStoreWorks,
  settled,
} from './sharing-app';
import {
  fakePhoneAppearance,
  fakeReduceTransparency,
} from './shell-appearance-app';
import { tapTab } from './shell-tabs-app';

// Runs on iOS. An export file that holds shared ledgers, imported on a phone that has
// the seed of the file's device identity and on one that has not (BACKUP-29.1,
// ADR-0042). The whole app starts on a phone of its own (backup-app), with the secure
// store and the random source of sharing-app, as in sharing-device-app.test.tsx. A phone
// gets its device identity as a feature of the app would give it one, by sending a
// request while the app is closed; the tests then make a group a shared ledger of that
// device through the sync capability's own function. Every phone in a test shares the one
// secure store, so "another phone" starts by emptying it.

jest.mock('../../src/storage/expo', () => ({
  openPhoneDatabase: () =>
    jest
      .requireActual<typeof import('./backup-app')>('./backup-app')
      .openPhoneDatabase(),
}));

jest.mock(
  '../../src/storage/expo-files',
  () =>
    jest.requireActual<typeof import('./backup-app')>('./backup-app')
      .phoneFiles,
);

// Not virtual, as in the expense form tests.
jest.mock('expo-localization', () => {
  const phone = () =>
    jest.requireActual<typeof import('./ledger-expense-app')>(
      './ledger-expense-app',
    );
  return {
    ...jest.requireActual<object>('expo-localization'),
    getLocales: () => phone().phoneLocales(),
    getCalendars: () => phone().phoneCalendars(),
    useLocales: () => phone().phoneLocales(),
    useCalendars: () => phone().phoneCalendars(),
  };
});

jest.mock(
  'expo-secure-store',
  () =>
    jest.requireActual<typeof import('./sharing-app')>('./sharing-app')
      .secureStore,
  { virtual: true },
);

jest.mock(
  'expo-crypto',
  () =>
    jest.requireActual<typeof import('./sharing-app')>('./sharing-app')
      .randomSource,
  { virtual: true },
);

const LAPSED_BANNER =
  "This phone can't sync this group anymore. This copy is read-only and won't update.";
const ONE_NEVER_SENT =
  '1 change made on this phone was never sent to the group.';

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: T });
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  resetPhones();
  resetPhone();
  resetWorld();
  fakePhoneAppearance('light');
  fakeReduceTransparency(false);
});

afterEach(async () => {
  const wrong = mistakes();
  jest.restoreAllMocks();
  await removePhones();
  await removeWorld();
  expect(wrong).toEqual([]);
});

/** Does `work` on the data of a phone whose app is closed. */
async function onPhone<R>(
  phone: Phone,
  work: (database: Database) => Promise<R>,
  readOnly = false,
): Promise<R> {
  const database = openNodeDatabase(phone.database, { readOnly });
  try {
    return await settled(work(database));
  } finally {
    await database.close();
  }
}

/** The device ID of the phone, which has its seed. */
async function deviceOf(database: Database) {
  const identity = await readDeviceIdentity(database);
  if (identity.status !== 'ready') {
    throw new Error('The phone has no device identity it can sign with');
  }
  return identity.deviceId;
}

/**
 * Taylor's phone: a registered device identity, Brisbane a shared ledger of that device,
 * renamed to Brissie since, which it has not uploaded, and Tokyo, which is no shared
 * ledger.
 */
async function taylorsPhone() {
  const phone = newPhone();
  const ids = { brisbane: '', tokyo: '' };
  await writeData(
    phone,
    {
      name: 'Taylor',
      groups: [
        { name: 'Brisbane', members: ['Casey', 'Blake'] },
        { name: 'Tokyo' },
      ],
    },
    async (database) => {
      const sent = await settled(
        sendApiRequest(database, {
          apiUrl: API,
          method: 'GET',
          path: '/example/items',
        }),
      );
      expect(sent.outcome).toBe('answered');
      const groups = await listGroups(database);
      ids.brisbane = groups.find(({ name }) => name === 'Brisbane')!.id;
      ids.tokyo = groups.find(({ name }) => name === 'Tokyo')!.id;
      await shareGroup(database, {
        groupId: ids.brisbane,
        device: await settled(deviceOf(database)),
      });
      await renameGroup(database, ids.brisbane, 'Brissie');
    },
  );
  return { phone, ...ids };
}

/** What makes the group a read-only copy on the phone, if it is one. */
const copyOn = (phone: Phone, groupId: string) =>
  onPhone(phone, (database) => readOnlyCopyOf(database, groupId), true);

const unsentOn = (phone: Phone) => onPhone(phone, listUnsentSyncEvents, true);

test("[BACKUP-29.1] [SYNC-301.1] makes the shared ledgers of another phone's export file read-only copies as the import completes, with their unsent changes kept and no request sent", async () => {
  const taylors = await taylorsPhone();
  const { file } = await exportFrom(taylors.phone);
  // Another phone: a secure store of its own.
  emptySecureStore();
  const phone = newPhone();
  const requests = goOffline();
  const app = await startOn(phone);

  await importFile(file);

  expect(await copyOn(phone, taylors.brisbane)).toEqual({
    reason: 'lapsed',
    unsent: 1,
  });
  expect(await unsentOn(phone)).toHaveLength(1);
  await tapTab('Groups');
  await openGroup('Brissie');
  await waitFor(() =>
    expect(textsOn('Brissie')).toEqual(
      expect.arrayContaining([LAPSED_BANNER, ONE_NEVER_SENT]),
    ),
  );
  expect(requests()).toBe(0);
  await close(app);
});

test('[BACKUP-29.1] leaves the shared ledgers of its own export file as they are on a phone that still has its seed', async () => {
  const taylors = await taylorsPhone();
  const { file } = await exportFrom(taylors.phone);
  // The app was installed again: the local data is new, the secure store is as it was.
  const phone = newPhone();
  const app = await startOn(phone);

  await importFile(file);

  expect(await copyOn(phone, taylors.brisbane)).toBeUndefined();
  await close(app);
});

test('[BACKUP-29.1] keeps the reason of a ledger the file holds as a read-only copy, and makes its other shared ledgers copies for the lapsed authorization', async () => {
  const taylors = await taylorsPhone();
  await onPhone(taylors.phone, async (database) => {
    await shareGroup(database, {
      groupId: taylors.tokyo,
      device: await deviceOf(database),
    });
    await makeReadOnlyCopy(database, taylors.brisbane, 'not-a-member');
  });
  const { file } = await exportFrom(taylors.phone);
  emptySecureStore();
  const phone = newPhone();
  const app = await startOn(phone);

  await importFile(file);
  await close(app);

  expect(await copyOn(phone, taylors.brisbane)).toMatchObject({
    reason: 'not-a-member',
  });
  expect(await copyOn(phone, taylors.tokyo)).toMatchObject({
    reason: 'lapsed',
  });
});

test('[BACKUP-29.1] imports, and makes no ledger a copy, while the secure store cannot be read', async () => {
  const taylors = await taylorsPhone();
  const { file } = await exportFrom(taylors.phone);
  emptySecureStore();
  const phone = newPhone();
  const app = await startOn(phone);
  failSecureStoreReads();

  await importFile(file);
  secureStoreWorks();

  expect(await copyOn(phone, taylors.brisbane)).toBeUndefined();
  await close(app);
});

/** Saves Brissie's group key of a key epoch on Taylor's phone, as the app saves one (SYNC-94.1). */
const saveKey = (
  taylors: Awaited<ReturnType<typeof taylorsPhone>>,
  epoch: number,
) =>
  onPhone(taylors.phone, (database) =>
    saveGroupKey(database, {
      groupId: taylors.brisbane,
      epoch,
      key: new Uint8Array(32).fill(epoch),
    }),
  );

test("[BACKUP-28.1] does not import a file from the phone's earlier time in a group once the key of that time is gone", async () => {
  const taylors = await taylorsPhone();
  await saveKey(taylors, 1);
  const { file } = await exportFrom(taylors.phone);
  // The phone left the group and was approved again: the key of its first time went when
  // the ledger became a copy, and the ledger is at key epoch 2 now.
  await saveKey(taylors, 2);
  removeSecureStoreEntry(`group-key.${taylors.brisbane}.1`);
  const app = await startOn(taylors.phone);
  const before = alertsShown().length;

  await chooseFile(file);

  expect(await nextAlert(before + 1)).toEqual([
    'Leave Shared Groups First',
    'This phone is still a member of Brissie, and this file would remove that group from it. Leave the group first, then import the file again.',
  ]);
  await close(app);
  expect(await copyOn(taylors.phone, taylors.brisbane)).toBeUndefined();
});

test('[BACKUP-28.1] asks to replace the data for a file from before a rotation while the phone still holds the key of that time', async () => {
  const taylors = await taylorsPhone();
  await saveKey(taylors, 1);
  const { file } = await exportFrom(taylors.phone);
  await saveKey(taylors, 2);
  const app = await startOn(taylors.phone);
  const before = alertsShown().length;

  await chooseFile(file);

  expect((await nextAlert(before + 1))[0]).toBe('Replace All Data?');
  await close(app);
});
