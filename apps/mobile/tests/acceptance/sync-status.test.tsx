import { act, waitFor } from '@testing-library/react-native';
import { readOnlyCopyOf } from '../../src/sync';
import { startExpenses } from './ledger-expense-app';
import { linesIn } from './ledger-expense-list-app';
import { leaveAndComeBack } from './ledger-list-period-app';
import {
  addGroupExpense,
  archiveGroup,
  groupCard,
} from './ledger-group-expense-app';
import {
  READ_ONLY,
  openArchivedGroup,
  openArchivedGroups,
} from './group-archive-app';
import { showGroup } from './group-balances-app';
import { alertsShown, goBackFrom, textsOn } from './group-details-app';
import {
  apiAnswersNext,
  apiLosesNextAnswer,
  fetchCalls,
  goOffline,
  goOnline,
  mistakes,
  removeWorld,
  resetWorld,
} from './sharing-app';
import { tapTab } from './shell-tabs-app';
import {
  LATER,
  YOU,
  appDatabase,
  eachTestGetsAPhone,
  groupId,
  setClock,
  unsent,
} from './sync-app';
import { needsReview } from './sync-conflict-app';
import {
  FULL_NOTICE,
  UPDATE_NOTICE,
  apiDropsThisPhone,
  deviceId,
  download,
  eventRequests,
  groupIsFull,
  groupNeedsRotation,
  holdAnswers,
  lunchCreated,
  mark,
  mostAtOnce,
  newerEvent,
  otherPhoneUploads,
  otherStamp,
  releaseAnswers,
  setBuiltApiUrl,
  startEventApi,
  startSynced,
  upload,
} from './sync-screens-app';
import {
  DAY,
  OFFLINE_NOTICE,
  THIRD_DEVICE,
  WAITING_NOTICE,
  apiNeedsASnapshotOnce,
  canPull,
  holdAnswersTo,
  isDownloadOf,
  isRefreshing,
  isUploadOf,
  lastSynced,
  lastSyncedNotice,
  pullDown,
  releaseHeldAnswers,
  startHolding,
  startsWaiting,
  statusLines,
} from './sync-status-app';

// Runs on iOS. Each test starts the whole app as the sync screen tests do (sync-screens-app):
// Taylor is your name, Brisbane's members are Taylor, Casey and Blake, the phone is in Taipei
// on 2026-10-30 and has a device identity, and Brisbane is a shared ledger. The tests take
// the network away, keep the API's answers back or make it answer otherwise, let days pass,
// and read what the group's screen says about its sync: nothing while all is well.

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

// Where the build says the API is, which a test can take away (SYNC-93.1).
jest.mock('../../src/sharing/api-address', () => ({
  apiUrl: () =>
    jest
      .requireActual<typeof import('./sync-screens-app')>('./sync-screens-app')
      .builtApiUrl(),
}));

eachTestGetsAPhone('sync-status-');

beforeEach(() => {
  resetWorld();
  startEventApi();
  startHolding();
});

afterEach(async () => {
  const wrong = mistakes();
  await removeWorld();
  expect(wrong).toEqual([]);
});

const BRISBANE = { Brisbane: ['Casey', 'Blake'] };
const WITH_TOKYO = { ...BRISBANE, Tokyo: ['Dana'] };
const BOTH = ['Brisbane', 'Tokyo'];

/** The banner of a read-only copy this phone was removed from (GROUPS-155.1). */
const REMOVED_BANNER =
  "You're no longer a member of this group. This copy is read-only and won't update.";

/** Adds Brisbane's Dinner for 100.01: Casey pays, split between Blake, Taylor and Casey. */
const addDinner = (title = 'Dinner') =>
  addGroupExpense({
    group: 'Brisbane',
    title,
    payer: 'Casey',
    sharers: ['Blake', YOU, 'Casey'],
  });

/** Lets this many seconds pass with the app open. */
const secondsPass = (seconds: number) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(seconds * 1000);
  });

/** Waits until the phone has called `fetch` more often than `calls` times, and what follows has settled. */
async function expectFetchedSince(calls: number) {
  await waitFor(() => expect(fetchCalls()).toBeGreaterThan(calls));
  await secondsPass(0);
}

/**
 * Starts the app with Brisbane a shared ledger whose last download got a page at LATER,
 * 2026-10-30T04:01:00Z: the app has come back from the background once.
 */
async function synced(
  groups: Record<string, readonly string[]> = BRISBANE,
  shared: readonly string[] = ['Brisbane'],
) {
  const app = await startSynced(groups, shared);
  const brisbane = await groupId('Brisbane');
  const from = mark();
  await leaveAndComeBack();
  await waitFor(() =>
    expect(eventRequests(from)).toContain(download(brisbane)),
  );
  await secondsPass(0);
  return { app, brisbane };
}

/** The app comes back from the background with the clock at `ms`, and its sync has been sent. */
async function comeBackAt(ms: number) {
  const calls = fetchCalls();
  await leaveAndComeBack(() => setClock(ms));
  await expectFetchedSince(calls);
}

/** The app comes back from the background, and its sync has been sent. */
const comeBack = () => comeBackAt(Date.now());

describe('SYNC-313.1', () => {
  test('[SYNC-313.1] records the time of the phone when a download gets a page, an empty one too', async () => {
    const { brisbane } = await synced();

    await waitFor(async () => expect(await lastSynced(brisbane)).toBe(LATER));
    expect(LATER).toBe(1793332860000);
  });

  test('[SYNC-313.1] replaces the time when a later download gets a page with events', async () => {
    const { brisbane } = await synced();
    otherPhoneUploads(brisbane, await lunchCreated(otherStamp(LATER + DAY)));

    await comeBackAt(LATER + DAY);

    await waitFor(async () =>
      expect(await lastSynced(brisbane)).toBe(LATER + DAY),
    );
    expect(LATER + DAY).toBe(1793419260000);
  });

  test.each<[string, (brisbane: string) => void]>([
    ['gets no answer', () => goOffline()],
    [
      'is answered with status 500',
      (brisbane) => apiAnswersNext(isDownloadOf(brisbane), 500, ''),
    ],
    [
      'is answered with what is no page',
      (brisbane) => apiAnswersNext(isDownloadOf(brisbane), 200, '{}'),
    ],
    [
      'is told the ledger needs a snapshot',
      (brisbane) => apiNeedsASnapshotOnce(brisbane),
    ],
  ])(
    '[SYNC-313.1] keeps the time when a download a day later %s',
    async (_case, arrange) => {
      const { brisbane } = await synced();
      await waitFor(async () => expect(await lastSynced(brisbane)).toBe(LATER));
      arrange(brisbane);

      await comeBackAt(LATER + DAY);

      expect(await lastSynced(brisbane)).toBe(LATER);
    },
  );

  test('[SYNC-313.1] keeps the time over a restart with no network', async () => {
    const { app, brisbane } = await synced();
    await waitFor(async () => expect(await lastSynced(brisbane)).toBe(LATER));
    goOffline();

    await app.unmount();
    const calls = fetchCalls();
    await startExpenses('Asia/Taipei', '2026-10-31T04:01:00Z');
    await expectFetchedSince(calls);

    expect(await lastSynced(brisbane)).toBe(LATER);
  });

  test('[SYNC-313.1] records each shared ledger by itself, and nothing for one that has got no page or a group that is not shared', async () => {
    await startSynced({ ...WITH_TOKYO, Osaka: ['Evan'] }, BOTH);
    const brisbane = await groupId('Brisbane');
    const tokyo = await groupId('Tokyo');
    const osaka = await groupId('Osaka');
    expect(await lastSynced(brisbane)).toBeNull();
    apiAnswersNext(isDownloadOf(tokyo), 500, '');

    await comeBack();

    await waitFor(async () => expect(await lastSynced(brisbane)).toBe(LATER));
    expect(await lastSynced(tokyo)).toBeNull();
    expect(await lastSynced(osaka)).toBeNull();
  });
});

describe('SYNC-314.1', () => {
  test('[SYNC-314.1] says that the ledger is out of date from the moment it starts to wait for a snapshot, on the screen that is open, before the sync has ended', async () => {
    const { brisbane } = await synced();
    await showGroup('Brisbane');
    expect(statusLines('Brisbane')).toEqual([]);
    apiNeedsASnapshotOnce(brisbane);
    // The request that asks for the snapshot gets no answer yet: the sync has not ended.
    holdAnswersTo('snapshot');
    const from = mark();

    await leaveAndComeBack();

    await waitFor(() =>
      expect(statusLines('Brisbane')).toEqual([WAITING_NOTICE]),
    );
    expect(eventRequests(from)).toEqual([
      download(brisbane),
      `GET /groups/${brisbane}/snapshot`,
    ]);
    await releaseHeldAnswers();
    expect(statusLines('Brisbane')).toEqual([WAITING_NOTICE]);
  });

  test('[SYNC-314.1] still says so after a restart with no network, and not that the phone is offline', async () => {
    const { app, brisbane } = await synced();
    await startsWaiting(brisbane);
    goOffline();

    await app.unmount();
    const calls = fetchCalls();
    await startExpenses();
    await expectFetchedSince(calls);
    await showGroup('Brisbane');

    await waitFor(() =>
      expect(statusLines('Brisbane')).toEqual([WAITING_NOTICE]),
    );
  });

  test('[SYNC-314.1] stops saying so once a download gets a page, on the screen that is open', async () => {
    const { brisbane } = await synced();
    await startsWaiting(brisbane);
    await showGroup('Brisbane');
    await waitFor(() =>
      expect(statusLines('Brisbane')).toEqual([WAITING_NOTICE]),
    );
    otherPhoneUploads(brisbane, await lunchCreated());

    // The API answers this download with a page again.
    await comeBack();

    await waitFor(() => expect(textsOn('Brisbane')).toContain('Lunch'));
    expect(statusLines('Brisbane')).toEqual([]);
  });

  test('[SYNC-314.1] says the same after four days of waiting, and nothing about when it last synced', async () => {
    const { brisbane } = await synced();
    await startsWaiting(brisbane);
    await showGroup('Brisbane');
    apiNeedsASnapshotOnce(brisbane);

    await comeBackAt(LATER + 4 * DAY);

    await waitFor(() =>
      expect(statusLines('Brisbane')).toEqual([WAITING_NOTICE]),
    );
  });

  test('[SYNC-314.1] says so only on the screen of the ledger that waits', async () => {
    const { brisbane } = await synced(WITH_TOKYO, BOTH);
    await startsWaiting(brisbane);

    await showGroup('Tokyo');

    expect(statusLines('Tokyo')).toEqual([]);
    await goBackFrom('Tokyo');
    await showGroup('Brisbane');
    await waitFor(() =>
      expect(statusLines('Brisbane')).toEqual([WAITING_NOTICE]),
    );
  });
});

describe('SYNC-315.1', () => {
  test('[SYNC-315.1] says when the ledger last synced once a sync ends three days after, on the screen that is open, and not that the phone is offline', async () => {
    await synced();
    await showGroup('Brisbane');
    goOffline();

    await comeBackAt(LATER + 3 * DAY);

    await waitFor(() =>
      expect(statusLines('Brisbane')).toEqual([
        lastSyncedNotice('Oct 30, 2026'),
      ]),
    );
    expect(lastSyncedNotice('Oct 30, 2026')).toBe(
      'Last synced Oct 30, 2026. Pull down to sync.',
    );
  });

  test('[SYNC-315.1] does not say so a millisecond before three days: the phone is offline', async () => {
    await synced();
    await showGroup('Brisbane');
    goOffline();

    await comeBackAt(LATER + 3 * DAY - 1);

    await waitFor(() =>
      expect(statusLines('Brisbane')).toEqual([OFFLINE_NOTICE]),
    );
  });

  test('[SYNC-315.1] says so when the API has given no page for four days, though it answers', async () => {
    const { brisbane } = await synced();
    await showGroup('Brisbane');
    apiAnswersNext(isDownloadOf(brisbane), 500, '');

    await comeBackAt(LATER + 4 * DAY);

    await waitFor(() =>
      expect(statusLines('Brisbane')).toEqual([
        lastSyncedNotice('Oct 30, 2026'),
      ]),
    );
  });

  test('[SYNC-315.1] says nothing after a day and says so after four days on a phone that cannot rotate the key', async () => {
    const { brisbane } = await synced();
    await showGroup('Brisbane');
    // The group needs a rotation, and one of its member devices is not in this phone's roster.
    groupNeedsRotation(brisbane, [await deviceId(), THIRD_DEVICE]);

    await comeBackAt(LATER + DAY);

    expect(statusLines('Brisbane')).toEqual([]);

    await comeBackAt(LATER + 4 * DAY);

    await waitFor(() =>
      expect(statusLines('Brisbane')).toEqual([
        lastSyncedNotice('Oct 30, 2026'),
      ]),
    );
    expect(alertsShown()).toEqual([]);
  });

  test('[SYNC-315.1] stops saying so once a sync has got a page, on the screen that is open', async () => {
    await synced();
    await showGroup('Brisbane');
    goOffline();
    await comeBackAt(LATER + 4 * DAY);
    await waitFor(() =>
      expect(statusLines('Brisbane')).toEqual([
        lastSyncedNotice('Oct 30, 2026'),
      ]),
    );
    goOnline();

    await comeBack();

    await waitFor(() => expect(statusLines('Brisbane')).toEqual([]));
  });

  test("[SYNC-315.1] writes the date of the last sync in the phone's time zone", async () => {
    const { brisbane } = await synced();
    // 00:30 on October 31 in Taipei.
    const lateOnThe30th = Date.parse('2026-10-30T16:30:00Z');
    const from = mark();
    await comeBackAt(lateOnThe30th);
    await waitFor(() =>
      expect(eventRequests(from)).toEqual([download(brisbane)]),
    );
    await showGroup('Brisbane');
    goOffline();

    await comeBackAt(lateOnThe30th + 5 * DAY);

    await waitFor(() =>
      expect(statusLines('Brisbane')).toEqual([
        lastSyncedNotice('Oct 31, 2026'),
      ]),
    );
  });

  test('[SYNC-315.1] says so again after a restart, once the sync that opens the app has ended', async () => {
    const { app } = await synced();
    goOffline();

    await app.unmount();
    const calls = fetchCalls();
    await startExpenses('Asia/Taipei', '2026-11-03T04:01:00Z');
    await expectFetchedSince(calls);
    await showGroup('Brisbane');

    await waitFor(() =>
      expect(statusLines('Brisbane')).toEqual([
        lastSyncedNotice('Oct 30, 2026'),
      ]),
    );
  });

  test('[SYNC-315.1] does not say so for a ledger that has no time of a last sync yet', async () => {
    await startSynced();
    await showGroup('Brisbane');
    goOffline();

    await comeBackAt(LATER + 5 * DAY);

    await waitFor(() =>
      expect(statusLines('Brisbane')).toEqual([OFFLINE_NOTICE]),
    );
  });
});

describe('SYNC-316.1', () => {
  test('[SYNC-316.1] says to connect once a sync after a save got no answer, on the screen that is open, with no alert', async () => {
    await synced();
    await showGroup('Brisbane');
    goOffline();

    await addDinner();
    await tapTab('Groups');

    await waitFor(() =>
      expect(statusLines('Brisbane')).toEqual([OFFLINE_NOTICE]),
    );
    expect(linesIn(groupCard('Brisbane', 'Dinner'))[0]).toBe('Dinner');
    expect(alertsShown()).toEqual([]);
    expect(OFFLINE_NOTICE).toBe(
      'Connect to the internet to sync this group. New changes stay on this phone until then.',
    );
  });

  test('[SYNC-316.1] stops saying so once a sync is answered, on the screen that is open', async () => {
    await synced();
    await showGroup('Brisbane');
    goOffline();
    await comeBack();
    await waitFor(() =>
      expect(statusLines('Brisbane')).toEqual([OFFLINE_NOTICE]),
    );
    goOnline();

    await comeBack();

    await waitFor(() => expect(statusLines('Brisbane')).toEqual([]));
  });

  test('[SYNC-316.1] says so when the download is answered and the answer to the upload is lost', async () => {
    const { brisbane } = await synced();
    await showGroup('Brisbane');
    apiLosesNextAnswer(isUploadOf(brisbane));
    const from = mark();

    await addDinner();
    await tapTab('Groups');

    await waitFor(() =>
      expect(eventRequests(from)).toEqual([
        download(brisbane),
        upload(brisbane),
      ]),
    );
    await waitFor(() =>
      expect(statusLines('Brisbane')).toEqual([OFFLINE_NOTICE]),
    );
  });

  test('[SYNC-316.1] says so once a request is given up after 60 seconds, and not before', async () => {
    await synced();
    await showGroup('Brisbane');
    holdAnswers('GET');

    await leaveAndComeBack();
    await secondsPass(59);

    expect(statusLines('Brisbane')).toEqual([]);

    await secondsPass(2);

    await waitFor(() =>
      expect(statusLines('Brisbane')).toEqual([OFFLINE_NOTICE]),
    );
    await releaseAnswers();
  });

  test.each<[string, number, string]>([
    ['status 500', 500, ''],
    ['status 403 and no refusal the event API knows', 403, '{"error":"no"}'],
    ['status 200 and what is no page', 200, '{}'],
  ])(
    '[SYNC-316.1] does not say so when the download is answered with %s',
    async (_case, status, body) => {
      const { brisbane } = await synced();
      await showGroup('Brisbane');
      apiAnswersNext(isDownloadOf(brisbane), status, body);
      const from = mark();

      await comeBack();

      await waitFor(() =>
        expect(eventRequests(from)).toEqual([download(brisbane)]),
      );
      expect(statusLines('Brisbane')).toEqual([]);
    },
  );

  test('[SYNC-316.1] says so only on the screen of the ledger whose sync got no answer', async () => {
    const { brisbane } = await synced(WITH_TOKYO, BOTH);
    apiLosesNextAnswer(isDownloadOf(brisbane));

    await comeBack();
    await showGroup('Brisbane');

    await waitFor(() =>
      expect(statusLines('Brisbane')).toEqual([OFFLINE_NOTICE]),
    );
    await goBackFrom('Brisbane');
    await showGroup('Tokyo');
    expect(statusLines('Tokyo')).toEqual([]);
  });

  test('[SYNC-316.1] says so again after a restart with no network, once the sync that opens the app has ended', async () => {
    const { app } = await synced();
    goOffline();

    await app.unmount();
    const calls = fetchCalls();
    await startExpenses();
    await expectFetchedSince(calls);
    await showGroup('Brisbane');

    await waitFor(() =>
      expect(statusLines('Brisbane')).toEqual([OFFLINE_NOTICE]),
    );
  });
});

describe('SYNC-317.1', () => {
  /** Every line a shared ledger's screen can show about its sync. */
  const aboutSync = (group: string) =>
    textsOn(group).filter(
      (text) =>
        text === UPDATE_NOTICE ||
        text === FULL_NOTICE ||
        text === OFFLINE_NOTICE ||
        text === WAITING_NOTICE ||
        text.startsWith('Last synced '),
    );

  test('[SYNC-317.1] says nothing about sync while all is well, also while a sync is on its way', async () => {
    await synced();
    await showGroup('Brisbane');

    expect(aboutSync('Brisbane')).toEqual([]);

    holdAnswers('GET');
    await addDinner();
    await tapTab('Groups');

    expect(aboutSync('Brisbane')).toEqual([]);
    expect(await unsent()).toHaveLength(1);
    await releaseAnswers();
    await waitFor(async () => expect(await unsent()).toEqual([]));
    expect(aboutSync('Brisbane')).toEqual([]);
  });

  test('[SYNC-317.1] puts the line under the lines about an app update and a full group', async () => {
    await startSynced();
    const brisbane = await groupId('Brisbane');
    otherPhoneUploads(brisbane, newerEvent());
    groupIsFull(brisbane, true);
    const from = mark();
    await addDinner();
    await waitFor(() =>
      expect(eventRequests(from)).toEqual([
        download(brisbane),
        upload(brisbane),
      ]),
    );
    await showGroup('Brisbane');
    goOffline();

    await comeBack();

    await waitFor(() =>
      expect(textsOn('Brisbane').slice(0, 3)).toEqual([
        UPDATE_NOTICE,
        FULL_NOTICE,
        OFFLINE_NOTICE,
      ]),
    );
  });

  test('[SYNC-317.1] puts the line above the number of expenses to review', async () => {
    const { brisbane } = await synced();
    await addDinner();
    await waitFor(async () => expect(await unsent()).toEqual([]));
    // Another phone adds an expense of the same amount, currency and date: a possible duplicate.
    const supper = await lunchCreated(otherStamp(LATER + 60_000));
    supper.units.title.value = 'Supper';
    supper.units.money.value.amountMinor = 10001;
    supper.units.money.value.payments[0].amountMinor = 10001;
    supper.units.money.value.shares[0].amountMinor = 5001;
    supper.units.money.value.shares[1].amountMinor = 5000;
    otherPhoneUploads(brisbane, supper);
    await comeBack();
    await showGroup('Brisbane');
    await waitFor(() => expect(textsOn('Brisbane')).toContain(needsReview(1)));
    goOffline();

    await comeBack();

    await waitFor(() =>
      expect(statusLines('Brisbane')).toEqual([OFFLINE_NOTICE]),
    );
    const texts = textsOn('Brisbane');
    expect(texts.indexOf(OFFLINE_NOTICE)).toBe(0);
    expect(texts.indexOf(needsReview(1))).toBeGreaterThan(0);
  });

  test('[SYNC-317.1] puts the line above the read-only line of an archived shared ledger', async () => {
    await synced();
    await archiveGroup('Brisbane');
    goOffline();
    await comeBack();

    await openArchivedGroups();
    await openArchivedGroup('Brisbane');

    await waitFor(() =>
      expect(textsOn('Brisbane').slice(0, 3)).toEqual([
        OFFLINE_NOTICE,
        READ_ONLY,
        'Restore Group',
      ]),
    );
  });

  test('[SYNC-317.1] shows only the banner once the ledger is a read-only copy, though its last sync was four days ago', async () => {
    const { brisbane } = await synced();
    await showGroup('Brisbane');
    apiAnswersNext(isDownloadOf(brisbane), 500, '');
    await comeBackAt(LATER + 4 * DAY);
    await waitFor(() =>
      expect(statusLines('Brisbane')).toEqual([
        lastSyncedNotice('Oct 30, 2026'),
      ]),
    );
    apiDropsThisPhone(brisbane);

    await comeBack();

    await waitFor(() => expect(textsOn('Brisbane')).toContain(REMOVED_BANNER));
    expect(statusLines('Brisbane')).toEqual([]);
  });

  test('[SYNC-317.1] says nothing on a group that is not shared, and sends nothing for it', async () => {
    await startSynced({ Tokyo: ['Dana'] }, []);
    goOffline();

    await addGroupExpense({
      group: 'Tokyo',
      title: 'Sushi',
      payer: 'Dana',
      sharers: [YOU, 'Dana'],
    });
    await leaveAndComeBack();
    await showGroup('Tokyo');
    await secondsPass(61);

    expect(textsOn('Tokyo')).toContain('Sushi');
    expect(statusLines('Tokyo')).toEqual([]);
    expect(fetchCalls()).toBe(0);
  });
});

describe('SYNC-318.1', () => {
  test('[SYNC-318.1] syncs the ledger once when its list is pulled down, and shows what another phone changed', async () => {
    const { brisbane } = await synced();
    await showGroup('Brisbane');
    otherPhoneUploads(brisbane, await lunchCreated());
    const from = mark();

    await pullDown('Brisbane');

    await waitFor(() => expect(textsOn('Brisbane')).toContain('Lunch'));
    expect(eventRequests(from)).toEqual([download(brisbane)]);
    await waitFor(() => expect(isRefreshing('Brisbane')).toBe(false));
  });

  test('[SYNC-318.1] shows the refresh indicator until the sync ends', async () => {
    const { brisbane } = await synced();
    await showGroup('Brisbane');
    holdAnswers('GET');
    const from = mark();

    await pullDown('Brisbane');

    await waitFor(() =>
      expect(eventRequests(from)).toEqual([download(brisbane)]),
    );
    expect(isRefreshing('Brisbane')).toBe(true);

    await releaseAnswers();

    await waitFor(() => expect(isRefreshing('Brisbane')).toBe(false));
  });

  test('[SYNC-318.1] ends the indicator and says to connect when the pull gets no answer, with no alert', async () => {
    await synced();
    await showGroup('Brisbane');
    goOffline();
    const calls = fetchCalls();

    await pullDown('Brisbane');
    await expectFetchedSince(calls);

    await waitFor(() =>
      expect(statusLines('Brisbane')).toEqual([OFFLINE_NOTICE]),
    );
    expect(isRefreshing('Brisbane')).toBe(false);
    expect(alertsShown()).toEqual([]);
  });

  test('[SYNC-318.1] finds out by a pull that the phone was removed: the ledger becomes a read-only copy, which cannot be pulled', async () => {
    const { brisbane } = await synced();
    await showGroup('Brisbane');
    apiDropsThisPhone(brisbane);

    await pullDown('Brisbane');

    await waitFor(() => expect(textsOn('Brisbane')).toContain(REMOVED_BANNER));
    expect(await readOnlyCopyOf(appDatabase(), brisbane)).toEqual(
      expect.objectContaining({ reason: 'not-a-member' }),
    );
    expect(canPull('Brisbane')).toBe(false);
  });

  test('[SYNC-318.1] starts no second sync while one runs: it syncs once more after that one, and the indicator stays until then', async () => {
    const { brisbane } = await synced();
    await showGroup('Brisbane');
    holdAnswers('GET');
    const from = mark();
    await addDinner();
    await tapTab('Groups');
    await waitFor(() =>
      expect(eventRequests(from)).toEqual([download(brisbane)]),
    );

    await pullDown('Brisbane');

    expect(eventRequests(from)).toEqual([download(brisbane)]);
    expect(isRefreshing('Brisbane')).toBe(true);

    await releaseAnswers();

    // The sync of the save: a download, the upload, the download after it. Then the pull's.
    await waitFor(() =>
      expect(
        eventRequests(from).filter((request) => request.startsWith('GET')),
      ).toHaveLength(3),
    );
    await waitFor(() => expect(isRefreshing('Brisbane')).toBe(false));
    expect(eventRequests(from).filter((r) => r === upload(brisbane))).toEqual([
      upload(brisbane),
    ]);
    expect(mostAtOnce(brisbane)).toBe(1);
  });

  test('[SYNC-318.1] can be pulled with no expenses, and when the shared ledger is archived', async () => {
    const { brisbane } = await synced();
    await showGroup('Brisbane');
    let from = mark();

    await pullDown('Brisbane');

    await waitFor(() =>
      expect(eventRequests(from)).toEqual([download(brisbane)]),
    );

    await goBackFrom('Brisbane');
    await archiveGroup('Brisbane');
    await openArchivedGroups();
    await openArchivedGroup('Brisbane');
    from = mark();

    await pullDown('Brisbane');

    await waitFor(() =>
      expect(eventRequests(from)).toEqual([download(brisbane)]),
    );
  });

  test('[SYNC-318.1] syncs only the ledger that was pulled', async () => {
    const { brisbane } = await synced(WITH_TOKYO, BOTH);
    await showGroup('Brisbane');
    const from = mark();

    await pullDown('Brisbane');

    await waitFor(() =>
      expect(eventRequests(from)).toEqual([download(brisbane)]),
    );
    await secondsPass(1);
    expect(eventRequests(from)).toEqual([download(brisbane)]);
  });

  test('[SYNC-318.1] offers no pull to refresh on a group that is not shared', async () => {
    await startSynced(WITH_TOKYO);
    const calls = fetchCalls();

    await showGroup('Tokyo');

    expect(textsOn('Tokyo')).toContain('No expenses in this group yet.');
    expect(canPull('Tokyo')).toBe(false);
    expect(fetchCalls()).toBe(calls);
  });

  test('[SYNC-318.1] offers no pull to refresh on a read-only copy', async () => {
    const { brisbane } = await synced();
    apiDropsThisPhone(brisbane);
    await comeBack();
    await showGroup('Brisbane');
    await waitFor(() => expect(textsOn('Brisbane')).toContain(REMOVED_BANNER));
    const from = mark();

    expect(canPull('Brisbane')).toBe(false);
    expect(eventRequests(from)).toEqual([]);
  });

  test('[SYNC-318.1] offers no pull to refresh in a build that names no API', async () => {
    await synced();
    setBuiltApiUrl(undefined);

    await showGroup('Brisbane');

    expect(textsOn('Brisbane')).toContain('No expenses in this group yet.');
    expect(canPull('Brisbane')).toBe(false);
  });
});
