import { act, waitFor } from '@testing-library/react-native';
import { readOnlyCopyOf } from '../../src/sync';
import { leaveAndComeBack } from './ledger-list-period-app';
import { archiveGroup } from './ledger-group-expense-app';
import { openArchivedGroup, openArchivedGroups } from './group-archive-app';
import {
  alertsShown,
  expectMembers,
  membersShown,
  openMembers,
  tapMember,
  textsOn,
} from './group-details-app';
import {
  apiAnswers,
  goOffline,
  mistakes,
  removeWorld,
  resetWorld,
} from './sharing-app';
import {
  LATER,
  START,
  YOU,
  appDatabase,
  at,
  changed,
  eachTestGetsAPhone,
  everything,
  groupId,
  groupNamed,
  leaveMembers,
  receive,
  members,
  setClock,
  showMembers,
} from './sync-app';
import {
  apiDropsThisPhone,
  deviceId,
  mark,
  setBuiltApiUrl,
  startEventApi,
  startSynced,
} from './sync-screens-app';
import {
  DAY,
  FIFTH_DEVICE,
  FOURTH_DEVICE,
  OTHER_DEVICE,
  THIRD_DEVICE,
  apiSaysDevicesSynced,
  devicesPath,
  devicesRequests,
  holdAnswersTo,
  lastSynced,
  phoneRepresents,
  releaseHeldAnswers,
  startHolding,
} from './sync-status-app';

// Runs on iOS. Each test starts the whole app as the sync screen tests do (sync-screens-app),
// in Taipei on 2026-10-30, with Brisbane a shared ledger of Taylor, Casey and Blake. It hands
// the app the roster entry of another phone, as its sync will, has the API say when each
// member device last synced (SYNC-310.1), and reads Members.

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

eachTestGetsAPhone('sync-status-members-');

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

const OCT_27 = Date.parse('2026-10-27T04:00:00Z');
const OCT_28 = Date.parse('2026-10-28T04:00:00Z');

/** Lets this many seconds pass with the app open. */
const secondsPass = (seconds: number) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(seconds * 1000);
  });

/**
 * Starts the app with Brisbane a shared ledger in which Casey's phone, OTHER_DEVICE,
 * represents Casey. The API has no answer about the member devices yet.
 */
async function caseyHasAPhone() {
  const app = await startSynced();
  const brisbane = await groupId('Brisbane');
  const { Casey, Blake } = await members('Brisbane');
  await phoneRepresents(brisbane, OTHER_DEVICE, Casey, 'user-b', LATER + 1_000);
  return { app, brisbane, Casey, Blake };
}

/** The same, and the API says Casey's phone last synced at `ms`; Members is open and shows it. */
async function caseySyncedAt(ms: number, row: string) {
  const setup = await caseyHasAPhone();
  apiSaysDevicesSynced(setup.brisbane, [
    [await deviceId(), LATER],
    [OTHER_DEVICE, ms],
  ]);
  await showMembers('Brisbane');
  await expectMembers([YOU, row, 'Blake', 'Add Member']);
  return setup;
}

describe('SYNC-320.1', () => {
  test('[SYNC-320.1] asks the API for the member devices when Members opens, and shows when a member last synced once the answer is there, without reopening', async () => {
    const { brisbane } = await caseyHasAPhone();
    apiSaysDevicesSynced(brisbane, [
      [await deviceId(), LATER],
      [OTHER_DEVICE, OCT_27],
    ]);
    holdAnswersTo('devices');
    const from = mark();

    await showMembers('Brisbane');

    await expectMembers([YOU, 'Casey, Joined', 'Blake', 'Add Member']);
    await waitFor(() =>
      expect(devicesRequests(from)).toEqual([`GET ${devicesPath(brisbane)}`]),
    );

    await releaseHeldAnswers();

    await expectMembers([
      YOU,
      'Casey, Last synced Oct 27, 2026',
      'Blake',
      'Add Member',
    ]);
    expect(devicesRequests(from)).toHaveLength(1);
  });

  test('[SYNC-320.1] shows the latest time of the phones that represent one member', async () => {
    const { brisbane, Casey } = await caseyHasAPhone();
    await phoneRepresents(
      brisbane,
      THIRD_DEVICE,
      Casey,
      'user-c',
      LATER + 2_000,
    );
    apiSaysDevicesSynced(brisbane, [
      [await deviceId(), LATER],
      [OTHER_DEVICE, OCT_27],
      [THIRD_DEVICE, OCT_28],
    ]);

    await showMembers('Brisbane');

    await expectMembers([
      YOU,
      'Casey, Last synced Oct 28, 2026',
      'Blake',
      'Add Member',
    ]);
  });

  test('[SYNC-320.1] leaves out the time of a phone whose roster entry represents the member under your own user ID', async () => {
    const { brisbane, Casey } = await caseyHasAPhone();
    const you = (await groupNamed('Brisbane')).members.find(
      ({ name }) => name === 'Taylor',
    )!.userId!;
    await phoneRepresents(brisbane, THIRD_DEVICE, Casey, you, LATER + 2_000);
    apiSaysDevicesSynced(brisbane, [
      [await deviceId(), LATER],
      [OTHER_DEVICE, OCT_27],
      [THIRD_DEVICE, OCT_28],
    ]);

    await showMembers('Brisbane');

    await expectMembers([
      YOU,
      'Casey, Last synced Oct 27, 2026',
      'Blake',
      'Add Member',
    ]);
  });

  test('[SYNC-320.1] knows no time for a phone with no progress or one the answer leaves out, and uses neither its own entry, nor one of a phone whose roster entry represents nobody any more, nor one of a device the roster lacks', async () => {
    const { brisbane, Blake } = await caseyHasAPhone();
    await phoneRepresents(
      brisbane,
      THIRD_DEVICE,
      Blake,
      'user-c',
      LATER + 2_000,
    );
    // A fourth phone represented Blake too, and has left: its entry represents nobody.
    await phoneRepresents(
      brisbane,
      FOURTH_DEVICE,
      Blake,
      'user-d',
      LATER + 3_000,
    );
    await receive(
      brisbane,
      changed(
        'device' as Parameters<typeof changed>[0],
        FOURTH_DEVICE,
        at(LATER + 4_000, 0, OTHER_DEVICE),
        { member: null },
        { member: at(LATER + 3_000, 0, FOURTH_DEVICE) },
      ),
    );
    apiSaysDevicesSynced(brisbane, [
      [await deviceId(), OCT_27],
      [OTHER_DEVICE, null],
      [FOURTH_DEVICE, OCT_28],
      [FIFTH_DEVICE, OCT_28],
    ]);
    const from = mark();

    await showMembers('Brisbane');

    await waitFor(() => expect(devicesRequests(from)).toHaveLength(1));
    await secondsPass(1);
    expect(membersShown()).toEqual([
      YOU,
      'Casey, Joined',
      'Blake, Joined',
      'Add Member',
    ]);
  });

  test.each<[string, (brisbane: string, own: string) => void]>([
    ['the phone is offline', () => goOffline()],
    [
      'the API answers with status 500',
      (brisbane) => apiAnswers('GET', devicesPath(brisbane), 500, ''),
    ],
    [
      'the API refuses it because the phone is no member',
      (brisbane) =>
        apiAnswers(
          'GET',
          devicesPath(brisbane),
          403,
          JSON.stringify({ error: 'not-a-member' }),
        ),
    ],
    [
      'the answer is an empty object',
      (brisbane) => apiAnswers('GET', devicesPath(brisbane), 200, '{}'),
    ],
    [
      'the answer holds no list',
      (brisbane) =>
        apiAnswers(
          'GET',
          devicesPath(brisbane),
          200,
          JSON.stringify({ devices: 'none' }),
        ),
    ],
    [
      'one entry of the answer writes its time as text',
      (brisbane, own) =>
        apiAnswers(
          'GET',
          devicesPath(brisbane),
          200,
          JSON.stringify({
            devices: [
              { deviceId: own, syncedAtMs: String(LATER) },
              { deviceId: OTHER_DEVICE, syncedAtMs: OCT_27 },
            ],
          }),
        ),
    ],
  ])(
    '[SYNC-320.1] shows Joined, no alert, and keeps the ledger shared when %s',
    async (_case, arrange) => {
      const { brisbane } = await caseyHasAPhone();
      arrange(brisbane, await deviceId());

      await showMembers('Brisbane');
      await secondsPass(1);

      expect(membersShown()).toEqual([
        YOU,
        'Casey, Joined',
        'Blake',
        'Add Member',
      ]);
      expect(alertsShown()).toEqual([]);
      expect(await readOnlyCopyOf(appDatabase(), brisbane)).toBeUndefined();
    },
  );

  test('[SYNC-320.1] gives the request up after 60 seconds: an answer that comes later changes nothing', async () => {
    const { brisbane } = await caseyHasAPhone();
    apiSaysDevicesSynced(brisbane, [
      [await deviceId(), LATER],
      [OTHER_DEVICE, OCT_27],
    ]);
    holdAnswersTo('devices');
    const from = mark();
    await showMembers('Brisbane');
    await waitFor(() => expect(devicesRequests(from)).toHaveLength(1));

    await secondsPass(61);
    await releaseHeldAnswers();
    await secondsPass(1);

    expect(membersShown()).toEqual([
      YOU,
      'Casey, Joined',
      'Blake',
      'Add Member',
    ]);
  });

  test('[SYNC-320.1] asks each time Members opens and keeps no time: not on the screen, not in the local data', async () => {
    const { brisbane } = await caseySyncedAt(
      OCT_27,
      'Casey, Last synced Oct 27, 2026',
    );
    await leaveMembers('Brisbane');
    const from = mark();
    apiSaysDevicesSynced(brisbane, [
      [await deviceId(), LATER],
      [OTHER_DEVICE, OCT_28],
    ]);

    await showMembers('Brisbane');

    await expectMembers([
      YOU,
      'Casey, Last synced Oct 28, 2026',
      'Blake',
      'Add Member',
    ]);
    expect(devicesRequests(from)).toHaveLength(1);

    await leaveMembers('Brisbane');
    goOffline();
    await showMembers('Brisbane');
    await secondsPass(1);

    expect(membersShown()).toEqual([
      YOU,
      'Casey, Joined',
      'Blake',
      'Add Member',
    ]);
    const stored = JSON.stringify(everything());
    expect(stored).not.toContain(String(OCT_27));
    expect(stored).not.toContain(String(OCT_28));
  });

  test('[SYNC-320.1] does not ask for a shared ledger in which nobody else has a phone', async () => {
    await startSynced();
    const from = mark();

    await showMembers('Brisbane');
    await secondsPass(1);

    expect(membersShown()).toEqual([YOU, 'Casey', 'Blake', 'Add Member']);
    expect(devicesRequests(from)).toEqual([]);
  });

  test('[SYNC-320.1] does not ask for an archived shared ledger', async () => {
    await caseyHasAPhone();
    await archiveGroup('Brisbane');
    await openArchivedGroups();
    await openArchivedGroup('Brisbane');
    const from = mark();

    await openMembers('Brisbane');
    await secondsPass(1);

    expect(textsOn('Members')).toContain('Casey');
    expect(devicesRequests(from)).toEqual([]);
  });

  test('[SYNC-320.1] does not ask for a read-only copy', async () => {
    const { brisbane } = await caseyHasAPhone();
    apiDropsThisPhone(brisbane);
    await leaveAndComeBack();
    await waitFor(async () =>
      expect(await readOnlyCopyOf(appDatabase(), brisbane)).toBeDefined(),
    );
    const from = mark();

    await showMembers('Brisbane');
    await secondsPass(1);

    expect(textsOn('Members')).toContain('Casey');
    expect(devicesRequests(from)).toEqual([]);
  });

  test('[SYNC-320.1] does not ask in a build that names no API', async () => {
    await caseyHasAPhone();
    setBuiltApiUrl(undefined);
    const from = mark();

    await showMembers('Brisbane');
    await secondsPass(1);

    expect(membersShown()).toEqual([
      YOU,
      'Casey, Joined',
      'Blake',
      'Add Member',
    ]);
    expect(devicesRequests(from)).toEqual([]);
  });
});

describe('SYNC-313.1', () => {
  test('[SYNC-313.1] asking the API for the member devices does not move the time the ledger last synced', async () => {
    const { brisbane } = await caseyHasAPhone();
    const from = mark();
    await leaveAndComeBack();
    await waitFor(async () => expect(await lastSynced(brisbane)).toBe(LATER));
    apiSaysDevicesSynced(brisbane, [
      [await deviceId(), LATER],
      [OTHER_DEVICE, OCT_27],
    ]);
    setClock(LATER + DAY);

    await showMembers('Brisbane');
    await expectMembers([
      YOU,
      'Casey, Last synced Oct 27, 2026',
      'Blake',
      'Add Member',
    ]);

    expect(devicesRequests(from)).toHaveLength(1);
    expect(await lastSynced(brisbane)).toBe(LATER);
  });
});

describe('GROUPS-24.5', () => {
  test("[GROUPS-24.5] shows the date a member's phone last synced as the row's second line and in its name, on a button that still opens his menu", async () => {
    await caseySyncedAt(OCT_27, 'Casey, Last synced Oct 27, 2026');

    const texts = textsOn('Members');
    expect(texts).toContain('Last synced Oct 27, 2026');
    expect(texts).not.toContain('Joined');
    expect(texts.indexOf('Last synced Oct 27, 2026')).toBe(
      texts.indexOf('Casey') + 1,
    );

    const menu = await tapMember('Casey, Last synced Oct 27, 2026');

    expect(menu).toMatchObject({ title: 'Casey' });
  });

  test.each([
    ['at noon today in Taipei', START],
    ['at the first millisecond of today in Taipei', '2026-10-29T16:00:00Z'],
    [
      'tomorrow in Taipei, by a clock ahead of this phone',
      '2026-10-30T16:30:00Z',
    ],
  ])(
    '[GROUPS-24.5] says Last synced today for a phone that synced %s',
    async (_case, when) => {
      const ms = typeof when === 'number' ? when : Date.parse(when);

      await caseySyncedAt(ms, 'Casey, Last synced today');

      expect(textsOn('Members')).toContain('Last synced today');
    },
  );

  test('[GROUPS-24.5] writes the date for a phone that last synced in the last millisecond of yesterday in Taipei', async () => {
    await caseySyncedAt(
      Date.parse('2026-10-29T15:59:59.999Z'),
      'Casey, Last synced Oct 29, 2026',
    );
  });

  test('[GROUPS-24.5] gives your row and the row of a member with no phone no second line', async () => {
    await caseySyncedAt(OCT_27, 'Casey, Last synced Oct 27, 2026');

    const texts = textsOn('Members');
    expect(texts.filter((text) => text.startsWith('Last synced'))).toEqual([
      'Last synced Oct 27, 2026',
    ]);
    // Each row ends with its chevron: your row and Blake's have nothing between the name and it.
    expect(texts[texts.indexOf(YOU) + 1]).toBe('›');
    expect(texts[texts.indexOf('Blake') + 1]).toBe('›');
    expect(texts[texts.indexOf('Casey') + 2]).toBe('›');
  });
});
