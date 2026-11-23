import { waitFor } from '@testing-library/react-native';
import { leaveAndComeBack } from './ledger-list-period-app';
import { detailLinesOn } from './ledger-group-expense-app';
import {
  goOffline,
  goOnline,
  mistakes,
  removeWorld,
  resetWorld,
} from './sharing-app';
import { eachTestGetsAPhone, expenseTitled, groupId, unsent } from './sync-app';
import {
  apiEventIds,
  eventRequests,
  mark,
  otherPhoneUploads,
  otherStamp,
  startEventApi,
  startSynced,
} from './sync-screens-app';
import { addDinner, openFromGroup, pressInBlockOn } from './sync-conflict-app';
import {
  DUPLICATE,
  NOT_A_DUPLICATE,
  alikeCreated,
  distinctCreated,
  expectDuplicateBlockOn,
  expectDuplicates,
} from './sync-duplicate-app';

// Runs on iOS. Each test starts the whole app on a phone with a device identity and makes
// Brisbane a shared ledger as its first Invite will, as the screen tests of the sync loop
// do (sync-screens-app): the app then syncs by itself with an event API the tests keep in
// memory. The other phone's events are put in that API, and reach the app when it syncs.

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

eachTestGetsAPhone('sync-duplicate-loop-');

beforeEach(() => {
  resetWorld();
  startEventApi();
});

afterEach(async () => {
  const wrong = mistakes();
  await removeWorld();
  expect(wrong).toEqual([]);
});

/** Waits until the phone has no unsent event left. */
const expectAllUploaded = () =>
  waitFor(async () => expect(await unsent()).toEqual([]));

/**
 * Brisbane is a shared ledger whose Dinner this phone added and uploaded, and the other
 * phone's alike Supper, added half a minute from now, has reached this phone in a sync:
 * Supper is a possible duplicate.
 */
async function supperBySync() {
  const app = await startSynced();
  const brisbane = await groupId('Brisbane');
  goOffline();
  await addDinner();
  goOnline();
  await leaveAndComeBack();
  await expectAllUploaded();
  const dinner = await expenseTitled('Dinner');
  otherPhoneUploads(
    brisbane,
    await alikeCreated({ stamp: otherStamp(Date.now() + 30_000) }),
  );
  await leaveAndComeBack();
  await waitFor(async () =>
    expect((await expenseTitled('Supper')).title).toBe('Supper'),
  );
  const supper = await expenseTitled('Supper');
  return { app, brisbane, dinner, supper };
}

test('[SYNC-202.1] marks an alike expense that a sync downloaded', async () => {
  await supperBySync();

  await expectDuplicates('Brisbane', ['Supper']);
});

test('[SYNC-203.1] [SYNC-88.1] syncs the ledger once Not a Duplicate is saved: a download, then the upload of its event', async () => {
  const { brisbane } = await supperBySync();
  await expectDuplicates('Brisbane', ['Supper']);
  await openFromGroup('Brisbane', 'Supper');
  await expectDuplicateBlockOn('Groups');
  const events = apiEventIds(brisbane).length;
  const from = mark();

  await pressInBlockOn('Groups', NOT_A_DUPLICATE);

  // The first two requests: what a sync sends after a confirmed upload is not this rule's.
  await waitFor(() =>
    expect(
      eventRequests(from)
        .map((request) => request.split(' ')[0])
        .slice(0, 2),
    ).toEqual(['GET', 'POST']),
  );
  await expectAllUploaded();
  expect(apiEventIds(brisbane)).toHaveLength(events + 1);
  expect(detailLinesOn('Groups')).not.toContain(DUPLICATE);
});

test('[SYNC-204.1] takes the mark off once a sync downloads the "not a duplicate" the other phone wrote', async () => {
  const { brisbane, dinner, supper } = await supperBySync();
  await expectDuplicates('Brisbane', ['Supper']);

  otherPhoneUploads(
    brisbane,
    distinctCreated(dinner.id, supper.id, otherStamp(Date.now() + 60_000)),
  );
  await leaveAndComeBack();

  await expectDuplicates('Brisbane', []);
});
