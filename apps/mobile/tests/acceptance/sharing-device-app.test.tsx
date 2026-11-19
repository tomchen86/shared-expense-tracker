import * as fs from 'node:fs';
import { Alert } from 'react-native';
import {
  readClockOffsetMs,
  readDeviceIdentity,
  sendApiRequest,
} from '../../src/sharing';
import { openNodeDatabase } from '../../src/storage/node';
import {
  close,
  dataIn,
  exportFrom,
  goOffline,
  importFile,
  newPhone,
  removePhones,
  resetPhones,
  startOn,
  writeData,
  type Phone,
} from './backup-app';
import { addExpense, resetPhone } from './ledger-expense-app';
import { cardTitles } from './ledger-expense-list-app';
import {
  API,
  T,
  apiIsAhead,
  emptySecureStore,
  fetchCalls,
  fileHolds,
  fromHex,
  isRegistration,
  mistakes,
  publicKeyIn,
  received,
  registeredKeyOf,
  removeWorld,
  resetWorld,
  secureStoreEntries,
  seedBehind,
  settled,
  signingKeyOf,
  utf8,
} from './sharing-app';
import {
  fakePhoneAppearance,
  fakeReduceTransparency,
} from './shell-appearance-app';
import { selectedTab } from './shell-tabs-app';

// Runs on iOS. The whole app starts on a phone of its own (backup-app), in a region whose
// currency is USD, with the secure store and the random source of sharing-app in place of
// `expo-secure-store` and `expo-crypto`. Once the app has started the phone is offline,
// and the tests count what it tries to send.

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

/** The device identity of the phone whose app is closed, read without writing to its local data. */
async function identityOn(phone: Phone) {
  const database = openNodeDatabase(phone.database, { readOnly: true });
  try {
    return await settled(readDeviceIdentity(database));
  } finally {
    await database.close();
  }
}

const expenseTitlesIn = (phone: Phone) =>
  dataIn(phone.database).expenses.map(
    (row) => (JSON.parse(row) as { title: string }).title,
  );

test('[SHARING-19.1] a new phone on which the app records a personal expense has no device identity and has made no request', async () => {
  const phone = newPhone();
  const requests = goOffline();

  const app = await startOn(phone, { url: '/' });
  await addExpense();
  await close(app);
  const again = await startOn(phone, { url: '/' });

  expect(selectedTab()).toBe('Expenses');
  expect(cardTitles()).toEqual(['Coffee run']);
  await close(again);
  expect(requests()).toBe(0);
  expect(secureStoreEntries()).toEqual([]);
  expect(await identityOn(phone)).toEqual({ status: 'none' });
});

test('[SHARING-29.1] a phone that lost its authorization opens as usual and records a personal expense, with no request', async () => {
  // A phone with a registered device identity, whose local data is then restored to
  // another phone: the secure store there is empty.
  const original = newPhone();
  await writeData(original, {}, async (database) => {
    const result = await settled(
      sendApiRequest(database, {
        apiUrl: API,
        method: 'GET',
        path: '/example/items',
      }),
    );
    expect(result.outcome).toBe('answered');
  });
  const before = await identityOn(original);
  expect(before.status).toBe('ready');
  const phone = newPhone();
  fs.copyFileSync(original.database, phone.database);
  emptySecureStore();
  const lost = {
    status: 'lost',
    deviceId: 'deviceId' in before ? before.deviceId : undefined,
  };
  expect(await identityOn(phone)).toEqual(lost);
  const requests = goOffline();

  const app = await startOn(phone, { url: '/' });
  const opened = selectedTab();
  await addExpense();

  expect(opened).toBe('Expenses');
  expect(cardTitles()).toEqual(['Coffee run']);
  await close(app);
  expect(expenseTitlesIn(phone)).toEqual(['Coffee run']);
  expect(requests()).toBe(0);
  expect(secureStoreEntries()).toEqual([]);
  expect(await identityOn(phone)).toEqual(lost);
});

// Importing and exporting (SHARING-46.1). A phone here gets its device identity as a
// feature of the app would give it one, by sending a request while the app is closed, and
// exports and imports through the Settings screen. Every phone in a test shares the one
// secure store, so "another phone" starts by emptying it.

const HOUR = 3_600_000;

/** Sends one request from `phone`, whose app is closed, as a feature of the app would. */
async function sendFrom(phone: Phone) {
  const database = openNodeDatabase(phone.database);
  try {
    return await settled(
      sendApiRequest(database, {
        apiUrl: API,
        method: 'GET',
        path: '/example/items',
      }),
    );
  } finally {
    await database.close();
  }
}

/** A phone the app has set up, which has then registered its device identity. */
async function registeredPhone() {
  const phone = newPhone();
  await writeData(phone, {});
  expect((await sendFrom(phone)).outcome).toBe('answered');
  const identity = await identityOn(phone);
  if (identity.status !== 'ready')
    throw new Error('The phone did not register');
  return { phone, deviceId: identity.deviceId };
}

async function clockOffsetOn(phone: Phone) {
  const database = openNodeDatabase(phone.database, { readOnly: true });
  try {
    return await settled(readClockOffsetMs(database));
  } finally {
    await database.close();
  }
}

/** Imports `file` on `phone` through Settings, then closes the app. */
async function importOn(phone: Phone, file: string) {
  const app = await startOn(phone);
  await importFile(file);
  await close(app);
}

test('[SHARING-46.1] the export file of a registered phone carries its device ID, and neither its seed nor its signing key', async () => {
  const { phone, deviceId } = await registeredPhone();
  const seed = seedBehind(registeredKeyOf(deviceId)!)!;

  const { file } = await exportFrom(phone);

  expect(seed).toHaveLength(32);
  expect(
    fileHolds(file, utf8(deviceId)) ||
      fileHolds(file, fromHex(deviceId.replaceAll('-', ''))),
  ).toBe(true);
  expect(fileHolds(file, seed)).toBe(false);
  expect(fileHolds(file, signingKeyOf(seed))).toBe(false);
});

test("[SHARING-46.1] a phone that imports another phone's export file has lost its authorization, and its own seed stays where it was", async () => {
  const taylor = await registeredPhone();
  const { file } = await exportFrom(taylor.phone);
  // Casey's phone: a secure store of its own, and its own device identity.
  emptySecureStore();
  const casey = await registeredPhone();
  const own = secureStoreEntries();
  const calls = fetchCalls();

  await importOn(casey.phone, file);

  expect(casey.deviceId).not.toBe(taylor.deviceId);
  expect(own).toHaveLength(1);
  expect(await identityOn(casey.phone)).toEqual({
    status: 'lost',
    deviceId: taylor.deviceId,
  });
  expect(secureStoreEntries()).toEqual(own);
  expect(fetchCalls()).toBe(calls);
  expect(await sendFrom(casey.phone)).toEqual({
    outcome: 'authorization-lost',
  });
  expect(fetchCalls()).toBe(calls);
  expect(secureStoreEntries()).toEqual(own);
});

test('[SHARING-46.1] a phone that imports a file exported with no device identity has none, and makes a new one for its next request', async () => {
  const without = newPhone();
  await writeData(without, {});
  const { file } = await exportFrom(without);
  const { phone, deviceId } = await registeredPhone();
  const own = secureStoreEntries();
  const calls = fetchCalls();

  await importOn(phone, file);

  expect(await identityOn(phone)).toEqual({ status: 'none' });
  expect(secureStoreEntries()).toEqual(own);
  expect(fetchCalls()).toBe(calls);

  const before = received().length;
  const result = await sendFrom(phone);

  expect(result.outcome).toBe('answered');
  const identity = await identityOn(phone);
  expect(identity.status).toBe('ready');
  expect(identity).not.toEqual({ status: 'ready', deviceId });
  const [registration, request, ...others] = received().slice(before);
  expect(others).toEqual([]);
  expect(isRegistration(registration)).toBe(true);
  expect(isRegistration(request)).toBe(false);
  expect(publicKeyIn(registration)).toBeDefined();
  expect(publicKeyIn(registration)).not.toBe(registeredKeyOf(deviceId));
  expect(secureStoreEntries()).toHaveLength(2);
  expect(secureStoreEntries()).toContainEqual(own[0]);
});

test('[SHARING-46.1] a phone that imports its own earlier export file keeps its identity, with the clock offset and the registration as they were exported', async () => {
  apiIsAhead(HOUR);
  const { phone, deviceId } = await registeredPhone();
  expect(await clockOffsetOn(phone)).toBe(HOUR);
  const { file } = await exportFrom(phone);
  // Afterwards the API's time and the phone's agree again, and the phone corrects itself.
  apiIsAhead(0);
  expect((await sendFrom(phone)).outcome).toBe('answered');
  expect(await clockOffsetOn(phone)).toBe(0);

  await importOn(phone, file);

  expect(await identityOn(phone)).toEqual({ status: 'ready', deviceId });
  expect(await clockOffsetOn(phone)).toBe(HOUR);
  // With the API an hour ahead again, the exported offset is right: the next request
  // goes out once, with no registration before it.
  apiIsAhead(HOUR);
  const before = received().length;
  expect((await sendFrom(phone)).outcome).toBe('answered');
  expect(
    received()
      .slice(before)
      .map((request) => request.path),
  ).toEqual(['/example/items']);
});
