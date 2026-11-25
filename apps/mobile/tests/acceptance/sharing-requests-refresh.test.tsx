import { waitFor } from '@testing-library/react-native';
import { makeReadOnlyCopy } from '../../src/sync';
import {
  openArchivedGroup,
  openArchivedGroups,
  pressRestoreGroup,
} from './group-archive-app';
import {
  alertsShown,
  expectClosed,
  expectMembers,
  expectOpen,
  goBackFrom,
  membersShown,
  openGroup,
  openMembers,
  openRenameGroup,
  openRenameMember,
  pressOnBar,
  tapMember,
} from './group-details-app';
import { archiveGroup } from './ledger-group-expense-app';
import {
  goOffline,
  goOnline,
  mistakes,
  received,
  removeWorld,
  resetWorld,
} from './sharing-app';
import {
  APPROVE,
  E,
  EVAN_USER,
  NEW_MEMBER,
  WEEK,
  approvals,
  asks,
  expectJoinCount,
  groupRequests,
  holdDecisions,
  lists,
  releaseDecisions,
  startDecisionApi,
  startWithInvite,
  syncs,
  withdraws,
} from './sharing-decision-app';
import {
  closeInvite,
  pressInvite,
  secondsPass,
  shownLink,
} from './sharing-invite-app';
import { comesToForeground, goesToBackground } from './sharing-refresh-app';
import { tapTab } from './shell-tabs-app';
import {
  LATER,
  YOU,
  appDatabase,
  eachTestGetsAPhone,
  setClock,
  showMembers,
} from './sync-app';
import { startEventApi, startSynced } from './sync-screens-app';

// Runs on iOS. Each test starts the whole app as sharing-decision.test.tsx does: Taylor's
// phone, with Brisbane a shared ledger that syncs and holds an invite another member's
// phone made. Other phones' requests to join are put in the API while a screen stays open,
// and the tests let the phone's clock run: no test opens a screen again or syncs to see
// a request, unless it says so.

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

eachTestGetsAPhone('sharing-requests-refresh-');

beforeEach(() => {
  resetWorld();
  startEventApi();
  startDecisionApi();
});

afterEach(async () => {
  const wrong = mistakes();
  await removeWorld();
  expect(wrong).toEqual([]);
});

const DANA_ROW = `Dana, ${NEW_MEMBER}`;
const EVAN_ROW = `Evan, ${NEW_MEMBER}`;
const MEMBERS = [YOU, 'Casey', 'Blake', 'Add Member'];

/** The app is started with Brisbane's invite, and Brisbane's screen is the one shown. */
async function onBrisbane(
  groups?: Parameters<typeof startWithInvite>[0],
): Promise<{ brisbane: string }> {
  const started = await startWithInvite(groups);
  await tapTab('Groups');
  await openGroup('Brisbane');
  return started;
}

/**
 * The app is started with Brisbane's invite and Brisbane's Members is open. Resolves once
 * the API has the list Members sends as it opens (SHARING-190.2), with the number of
 * requests the API has received by then.
 */
async function inMembers() {
  const started = await startWithInvite();
  const opened = received().length;
  await showMembers('Brisbane');
  await waitFor(() => expect(lists(opened)).toHaveLength(1));
  await expectMembers(MEMBERS);
  return { ...started, from: received().length };
}

/** Dana has asked, the app has synced since, and Brisbane's Members is open and shows her request. */
async function inMembersWithDana() {
  const started = await startWithInvite();
  await asks();
  await syncs();
  await showMembers('Brisbane');
  await waitFor(() =>
    expect(membersShown()[0]).toContain(', Wants to join as '),
  );
  return started;
}

describe('SHARING-290.2', () => {
  test("[SHARING-290.2] lists the requests 3 seconds after the group's screen is shown, shows the one that came meanwhile, and starts no sync", async () => {
    const { brisbane } = await onBrisbane();
    await asks();
    const from = received().length;

    await secondsPass(2.5);

    expect(lists(from)).toEqual([]);

    await secondsPass(1);

    expect(lists(from)).toHaveLength(1);
    await expectJoinCount('Brisbane', 1);
    expect(groupRequests(from)).toEqual([`GET /groups/${brisbane}/requests`]);
  });

  test('[SHARING-290.2] shows in the open Members a request that comes, and takes it away once it is withdrawn', async () => {
    const { brisbane } = await inMembers();
    await asks();

    await secondsPass(3.5);

    await expectMembers([DANA_ROW, ...MEMBERS]);

    withdraws(brisbane);
    await secondsPass(3);

    await expectMembers(MEMBERS);
  });

  test('[SHARING-290.2] goes on listing while Invite shows in Members', async () => {
    await inMembers();
    await pressInvite();
    expect(shownLink()).toBeDefined();
    await asks();
    const from = received().length;

    await secondsPass(3.5);

    expect(lists(from)).toHaveLength(1);
    await closeInvite();
    expect(membersShown()).toEqual([DANA_ROW, ...MEMBERS]);
  });

  test('[SHARING-290.2] lists every 3 seconds at first', async () => {
    const { from } = await inMembers();

    await secondsPass(8);

    expect(lists(from)).toHaveLength(2);

    await secondsPass(2);

    expect(lists(from)).toHaveLength(3);
  });

  test('[SHARING-290.2] lists every 30 seconds once the screen has been shown for 2 minutes', async () => {
    const { from } = await inMembers();

    // 3 seconds apart up to the end of the 2 minutes: 39 by 119 seconds, the 40th at 120.
    await secondsPass(119);

    expect(lists(from)).toHaveLength(39);

    await secondsPass(1.5);

    expect(lists(from)).toHaveLength(40);

    // Then 30 seconds apart: the next ones at 150 and at 180 seconds.
    await secondsPass(28);

    expect(lists(from)).toHaveLength(40);

    await secondsPass(3);

    expect(lists(from)).toHaveLength(41);

    await secondsPass(27);

    expect(lists(from)).toHaveLength(41);

    await secondsPass(3);

    expect(lists(from)).toHaveLength(42);
  });

  test('[SHARING-290.2] sends no second list while one of its own has no answer, and the next one 3 seconds after the answer', async () => {
    await onBrisbane();
    holdDecisions('list');
    const from = received().length;
    await secondsPass(3.5);
    expect(lists(from)).toHaveLength(1);

    await secondsPass(31);

    expect(lists(from)).toHaveLength(1);

    await releaseDecisions();
    await secondsPass(2.5);

    expect(lists(from)).toHaveLength(1);

    await secondsPass(1);

    expect(lists(from)).toHaveLength(2);
  });

  test('[SHARING-290.2] sends no list while the one Members sent as it opened has no answer', async () => {
    await startWithInvite();
    holdDecisions('list');
    const from = received().length;
    await showMembers('Brisbane');
    await waitFor(() => expect(lists(from)).toHaveLength(1));

    await secondsPass(30);

    expect(lists(from)).toHaveLength(1);
    await releaseDecisions();
  });

  test('[SHARING-290.2] lists nothing for a shared ledger that never had an invite, however long its Members stays open', async () => {
    await startSynced();
    await showMembers('Brisbane');
    const from = received().length;

    await secondsPass(60 * 60);

    expect(lists(from)).toEqual([]);
  });

  test('[SHARING-290.2] lists nothing once the invite has expired', async () => {
    await onBrisbane();
    setClock(LATER + WEEK);
    const from = received().length;

    await secondsPass(60 * 60);

    expect(lists(from)).toEqual([]);
  });

  test('[SHARING-290.2] lists nothing while the phone is approving a request', async () => {
    await inMembersWithDana();
    holdDecisions('approve');
    const pressed = received().length;
    const menu = await tapMember(DANA_ROW);
    await menu!.choose(APPROVE);
    await waitFor(() => expect(approvals(pressed)).toHaveLength(1));

    await secondsPass(30);

    expect(lists(pressed)).toEqual([]);
    await releaseDecisions();
    await waitFor(() =>
      expect(lists(pressed).length).toBeGreaterThanOrEqual(1),
    );
  });

  test("[SHARING-290.2] lists nothing while an archived shared ledger's screen or its Members is open", async () => {
    await startWithInvite();
    await asks();
    await archiveGroup('Brisbane');
    const from = received().length;
    await openArchivedGroups();
    await openArchivedGroup('Brisbane');

    await secondsPass(60);
    await openMembers('Brisbane');
    await secondsPass(60);

    expect(lists(from)).toEqual([]);
  });

  test('[SHARING-290.2] lists nothing while the screen or the Members of a read-only copy is open', async () => {
    const { brisbane } = await startWithInvite();
    await makeReadOnlyCopy(appDatabase(), brisbane, 'not-a-member');
    await tapTab('Groups');
    const from = received().length;
    await openGroup('Brisbane');

    await secondsPass(60);
    await openMembers('Brisbane');
    await secondsPass(60);

    expect(lists(from)).toEqual([]);
  });

  test('[SHARING-290.2] sends nothing at all while the screen or the Members of a group that is not shared is open', async () => {
    await startWithInvite({ Brisbane: ['Casey', 'Blake'], Tokyo: ['Alex'] });
    await tapTab('Groups');
    const from = received().length;
    await openGroup('Tokyo');

    await secondsPass(60);
    await openMembers('Tokyo');
    await secondsPass(60);

    expect(received().slice(from)).toEqual([]);
  });

  test('[SHARING-290.2] says nothing and keeps its requests when a list fails, and lists again the next time', async () => {
    await inMembersWithDana();
    goOffline();

    await secondsPass(6);

    expect(alertsShown()).toEqual([]);
    expect(membersShown()).toEqual([DANA_ROW, ...MEMBERS]);

    goOnline();
    await asks({ name: 'Evan', deviceId: E, userId: EVAN_USER });
    await secondsPass(3.5);

    await expectMembers([DANA_ROW, EVAN_ROW, ...MEMBERS]);
    expect(alertsShown()).toEqual([]);
  });

  test.each<[string, () => Promise<void>, () => Promise<void>]>([
    [
      'the user goes back to the Groups root',
      () => goBackFrom('Brisbane'),
      () => openGroup('Brisbane'),
    ],
    [
      'another tab is selected',
      () => tapTab('Expenses'),
      () => tapTab('Groups'),
    ],
    [
      'Rename Group covers it',
      () => openRenameGroup('Brisbane'),
      async () => {
        await pressOnBar('Rename Group', 'Cancel');
        await expectClosed('Rename Group');
      },
    ],
  ])(
    "[SHARING-290.2] stops listing when %s, and starts anew when the group's screen is shown again",
    async (_case, leave, comeBack) => {
      await onBrisbane();
      await leave();
      await asks();
      const left = received().length;

      await secondsPass(60);

      expect(lists(left)).toEqual([]);

      await comeBack();
      await expectOpen('Brisbane');
      const back = received().length;
      await secondsPass(2.5);

      expect(lists(back)).toEqual([]);

      await secondsPass(1);

      expect(lists(back)).toHaveLength(1);
      await expectJoinCount('Brisbane', 1);
    },
  );

  test('[SHARING-290.2] stops listing while Rename Member covers Members, and starts anew when Members is shown again', async () => {
    await inMembers();
    await openRenameMember('Casey');
    await asks();
    const covered = received().length;

    await secondsPass(60);

    expect(lists(covered)).toEqual([]);

    await pressOnBar('Rename Member', 'Cancel');
    await expectClosed('Rename Member');
    const back = received().length;
    await secondsPass(2.5);

    expect(lists(back)).toEqual([]);

    await secondsPass(1);

    expect(lists(back)).toHaveLength(1);
    await expectMembers([DANA_ROW, ...MEMBERS]);
  });

  test('[SHARING-290.2] counts from the moment an archived shared ledger is restored on its screen', async () => {
    await startWithInvite();
    await archiveGroup('Brisbane');
    await openArchivedGroups();
    await openArchivedGroup('Brisbane');
    await secondsPass(125);
    await pressRestoreGroup('Brisbane');
    const restored = received().length;

    await secondsPass(8);

    // Saving the restore starts a sync, which lists once more as it ends (SHARING-190.2).
    expect(lists(restored).length).toBeGreaterThanOrEqual(2);
    expect(lists(restored).length).toBeLessThanOrEqual(3);
  });

  test('[SHARING-290.2] counts the 2 minutes anew when Invite is opened in Members', async () => {
    await inMembers();
    await secondsPass(125);
    await pressInvite();
    expect(shownLink()).toBeDefined();
    const opened = received().length;

    await secondsPass(8);

    expect(lists(opened)).toHaveLength(2);

    await secondsPass(2);

    expect(lists(opened)).toHaveLength(3);
  });

  test("[SHARING-290.2] keeps to 3 seconds when the phone's clock is set 10 minutes ahead", async () => {
    const { from } = await inMembers();
    await secondsPass(60);
    const before = lists(from).length;
    jest.setSystemTime(Date.now() + 10 * 60_000);

    await secondsPass(3.5);

    expect(lists(from)).toHaveLength(before + 1);

    await secondsPass(3);

    expect(lists(from)).toHaveLength(before + 2);
  });

  test('[SHARING-290.2] keeps the answer that comes after the screen was left, and starts no timer with it', async () => {
    await onBrisbane();
    await asks();
    holdDecisions('list');
    const from = received().length;
    await secondsPass(3.5);
    expect(lists(from)).toHaveLength(1);
    await tapTab('Expenses');

    await releaseDecisions();
    await secondsPass(60);

    expect(lists(from)).toHaveLength(1);

    await tapTab('Groups');

    await expectJoinCount('Brisbane', 1);
    expect(lists(from)).toHaveLength(1);
  });

  test("[SHARING-290.2] counts the 2 minutes anew when the group's screen is shown again", async () => {
    await onBrisbane();
    await secondsPass(125);
    await tapTab('Expenses');
    await tapTab('Groups');
    await expectOpen('Brisbane');
    const back = received().length;

    await secondsPass(8);

    expect(lists(back)).toHaveLength(2);

    await secondsPass(2);

    expect(lists(back)).toHaveLength(3);
  });

  test('[SHARING-290.2] stops listing in the background, and starts anew when the app comes back', async () => {
    await onBrisbane();
    await goesToBackground();
    const away = received().length;

    await secondsPass(60);

    expect(lists(away)).toEqual([]);

    await comesToForeground();
    // The sync that the app starts as it comes back lists once when it ends (SHARING-190.2).
    await waitFor(() => expect(lists(away)).toHaveLength(1));
    await secondsPass(2.5);

    expect(lists(away)).toHaveLength(1);

    await secondsPass(1);

    expect(lists(away)).toHaveLength(2);
  });
});
