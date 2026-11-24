import { waitFor } from '@testing-library/react-native';
import { leaveAndComeBack } from './ledger-list-period-app';
import { expectCards } from './ledger-trash-app';
import {
  goOffline,
  goOnline,
  mistakes,
  removeWorld,
  resetWorld,
} from './sharing-app';
import { settle } from './shell-appearance-app';
import { tapTab } from './shell-tabs-app';
import { eachTestGetsAPhone, groupId, unsent } from './sync-app';
import {
  apiEventIds,
  apiReceivedAt,
  eventRequests,
  holdAnswers,
  mark,
  releaseAnswers,
  startEventApi,
  startSynced,
} from './sync-screens-app';
import { addDinner } from './sync-conflict-app';
import { HOUR, expectNotApplied, unapplied } from './sync-unapplied-app';

// Runs on iOS. Each test starts the whole app on a phone with a device identity and makes
// Brisbane a shared ledger as its first Invite will, as the screen tests of the sync loop
// do (sync-screens-app): the app then syncs by itself with an event API the tests keep in
// memory. The tests change when that API says it received the phone's own event, which
// the real API never does, so that the event comes back as one every phone refuses. They
// do so before the API's answer to the upload reaches the phone, because the download
// that follows a confirmed upload brings the event back in the same sync (SYNC-160.2).

jest.mock('../../src/storage/expo', () => ({
  openPhoneDatabase: async () =>
    jest.requireActual<typeof import('./sync-app')>('./sync-app').openPhone(),
}));

// Not virtual, as in ledger-expense-form.test.tsx.
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

jest.mock('../../src/sharing/api-address', () => ({
  apiUrl: () =>
    jest
      .requireActual<typeof import('./sync-screens-app')>('./sync-screens-app')
      .builtApiUrl(),
}));

eachTestGetsAPhone('sync-unapplied-loop-');

beforeEach(() => {
  resetWorld();
  startEventApi();
});

afterEach(async () => {
  const wrong = mistakes();
  await removeWorld();
  expect(wrong).toEqual([]);
});

const methods = (from: number) =>
  eventRequests(from).map((request) => request.split(' ')[0]);

test("[SYNC-350.1] [SYNC-351.1] [GROUPS-170.2] takes an expense back when a sync downloads the phone's own event and it does not apply, counts it on the group's screen, and never uploads it again", async () => {
  await startSynced();
  const brisbane = await groupId('Brisbane');
  // Offline, so that the event can be read before it is uploaded.
  goOffline();
  await addDinner();
  const [added] = await unsent();
  holdAnswers('POST');
  goOnline();
  await leaveAndComeBack();
  await waitFor(() => expect(apiEventIds(brisbane)).toEqual([added.id]));
  apiReceivedAt(brisbane, added.id, added.content.stamp.ms - HOUR);
  const from = mark();

  await releaseAnswers();

  await waitFor(async () =>
    expect((await unapplied()).map(({ id, reason }) => [id, reason])).toEqual([
      [added.id, 'clock'],
    ]),
  );
  expect(await unsent()).toEqual([]);
  await expectCards([]);
  await settle();
  expect(methods(from)).toContain('GET');
  expect(methods(from)).not.toContain('POST');
  await expectNotApplied('Brisbane', 1);

  await tapTab('Expenses');
  await leaveAndComeBack();
  await settle();

  expect(methods(from)).not.toContain('POST');
  expect(apiEventIds(brisbane)).toEqual([added.id]);
  expect(await unapplied()).toHaveLength(1);
});
