import * as fs from 'node:fs';
import { Alert } from 'react-native';
import { readDeviceIdentity, sendApiRequest } from '../../src/sharing';
import { openNodeDatabase } from '../../src/storage/node';
import {
  close,
  dataIn,
  goOffline,
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
  emptySecureStore,
  mistakes,
  removeWorld,
  resetWorld,
  secureStoreEntries,
  settled,
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
