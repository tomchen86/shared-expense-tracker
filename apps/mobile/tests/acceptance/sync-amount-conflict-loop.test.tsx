import { waitFor } from '@testing-library/react-native';
import { editExpense } from './ledger-expense-app';
import { leaveAndComeBack } from './ledger-list-period-app';
import { showGroup } from './group-balances-app';
import { textsOn } from './group-details-app';
import {
  apiIsAhead,
  goOffline,
  goOnline,
  mistakes,
  removeWorld,
  resetWorld,
} from './sharing-app';
import {
  MINUTE,
  changed,
  eachTestGetsAPhone,
  expenseTitled,
  groupId,
  setClock,
  unsent,
} from './sync-app';
import {
  FULL_NOTICE,
  UPDATE_NOTICE,
  apiEventIds,
  eventRequests,
  groupIsFull,
  mark,
  newerEvent,
  otherPhoneUploads,
  otherStamp,
  startEventApi,
  startSynced,
} from './sync-screens-app';
import {
  SHARERS,
  USE_MINE,
  addDinner,
  expectToReview,
  moneyOf,
  needsReview,
  openFromGroup,
  pressInBlockOn,
  sideOf,
  sidesOf,
} from './sync-conflict-app';

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

eachTestGetsAPhone('sync-conflict-loop-');

beforeEach(() => {
  resetWorld();
  startEventApi();
});

afterEach(async () => {
  const wrong = mistakes();
  await removeWorld();
  expect(wrong).toEqual([]);
});

const HOUR = 60 * MINUTE;

/** Waits until the phone has no unsent event left. */
const expectAllUploaded = () =>
  waitFor(async () => expect(await unsent()).toEqual([]));

/**
 * Brisbane is a shared ledger whose Dinner this phone added and uploaded. Returns Dinner
 * and the other phone's change of its amount to 90.00, written half a minute from now by
 * a phone that had seen Dinner as it was added, and nothing since.
 */
async function withUploadedDinner() {
  const app = await startSynced();
  const brisbane = await groupId('Brisbane');
  // Offline, so that the stamp of the event can be read before it is uploaded.
  goOffline();
  await addDinner();
  const [added] = await unsent();
  goOnline();
  await leaveAndComeBack();
  await expectAllUploaded();
  const dinner = await expenseTitled('Dinner');
  const theirs = changed(
    'expense',
    dinner.id,
    otherStamp(Date.now() + 30_000),
    { money: await moneyOf(9000) },
    { money: added.content.stamp },
  );
  return { app, brisbane, dinner, theirs };
}

/** As withUploadedDinner; you changed the amount to 120.00 offline, the other phone's 90.00 is in the API, and the app has synced: Dinner needs review. */
async function overriddenBySync() {
  const setup = await withUploadedDinner();
  goOffline();
  await editExpense(setup.dinner.id, { amount: '120.00' });
  otherPhoneUploads(setup.brisbane, setup.theirs);
  goOnline();
  await leaveAndComeBack();
  await expectAllUploaded();
  return setup;
}

const CURRENT_90 = sideOf('$90.00', 'Casey', SHARERS);
const YOURS_120 = sideOf('$120.00', 'Casey', SHARERS);

test("[SYNC-133.1] compares a downloaded event with the stamp a check gave this phone's change of the amount, not with the one it was written under", async () => {
  const { brisbane, dinner, theirs } = await withUploadedDinner();
  otherPhoneUploads(brisbane, theirs);
  // The phone's clock runs an hour ahead of the API's when you change the amount, so the
  // event is stamped an hour ahead: later than the other phone's until the check replaces it.
  setClock(Date.now() + HOUR);
  apiIsAhead(-HOUR);

  await editExpense(dinner.id, { amount: '120.00' });
  await expectAllUploaded();

  expect((await expenseTitled('Dinner')).amountMinor).toBe(9000);
  await expectToReview('Brisbane', ['Dinner']);
  expect(await sidesOf('Brisbane', 'Dinner')).toEqual({
    current: CURRENT_90,
    yours: YOURS_120,
  });
});

test('[SYNC-132.1] [SYNC-88.1] syncs the ledger once Use Mine is saved: a download, then the upload of its event', async () => {
  const { brisbane } = await overriddenBySync();
  await expectToReview('Brisbane', ['Dinner']);
  await openFromGroup('Brisbane', 'Dinner');
  const events = apiEventIds(brisbane).length;
  const from = mark();

  await pressInBlockOn('Groups', USE_MINE);

  await waitFor(() =>
    expect(eventRequests(from).map((request) => request.split(' ')[0])).toEqual(
      ['GET', 'POST'],
    ),
  );
  await expectAllUploaded();
  expect(apiEventIds(brisbane)).toHaveLength(events + 1);
});

test('[GROUPS-107.2] counts the expenses to review under the two lines about the sync', async () => {
  const { brisbane, dinner } = await overriddenBySync();
  await expectToReview('Brisbane', ['Dinner']);
  otherPhoneUploads(brisbane, newerEvent(otherStamp(Date.now() + MINUTE)));
  groupIsFull(brisbane, true);

  // The sync after this save stops at the event it does not know, and its upload is refused.
  await editExpense(dinner.id, { title: 'Supper' });

  await showGroup('Brisbane');
  await waitFor(() =>
    expect(textsOn('Brisbane').slice(0, 3)).toEqual([
      UPDATE_NOTICE,
      FULL_NOTICE,
      needsReview(1),
    ]),
  );
});
