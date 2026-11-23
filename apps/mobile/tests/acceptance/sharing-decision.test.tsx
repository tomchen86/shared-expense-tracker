import { act, fireEvent, waitFor } from '@testing-library/react-native';
import {
  addBackAlert,
  alertsShown,
  expectMembers,
  lastAlertButtons,
  membersShown,
  openGroup,
  pressAlertButton,
  removeMember,
  renameMember,
  screenOf,
  tapMember,
} from './group-details-app';
import { restart } from './ledger-expense-app';
import { linesIn } from './ledger-expense-list-app';
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
  ANSWERED,
  APPROVE,
  APPROVING,
  CANCEL,
  CODE_A,
  D,
  DECLINE,
  DECLINING,
  DEVICES_FULL,
  E,
  EVAN_USER,
  GROUP_FULL,
  HAS_A_PHONE,
  IS_YOU,
  LEFT,
  MAY_SEE,
  NEW_MEMBER,
  NO_MEMBER,
  OFFLINE,
  SAME_NAME,
  UNABLE_TO_APPROVE,
  UNABLE_TO_DECLINE,
  WEEK,
  WENT_WRONG,
  apiAnswersDecision,
  apiHolds,
  approvalOf,
  approvals,
  asks,
  chunks,
  expectJoinCount,
  groupRequests,
  holdDecisions,
  joinButton,
  lists,
  memberDevicesOn,
  pagesOf,
  rejections,
  releaseDecisions,
  requestHash,
  requestsOn,
  someBoxKey,
  startDecisionApi,
  startWithInvite,
  syncs,
  wantsToBe,
  withdraws,
} from './sharing-decision-app';
import { settle } from './shell-appearance-app';
import { tapTab } from './shell-tabs-app';
import {
  LATER,
  YOU,
  changed,
  created,
  eachTestGetsAPhone,
  leaveMembers,
  members,
  setClock,
  showMembers,
  unsent,
} from './sync-app';
import {
  OTHER_DEVICE,
  lastSequence,
  otherPhoneUploads,
  otherStamp,
  startEventApi,
  startSynced,
} from './sync-screens-app';

// Runs on iOS. Each test starts the whole app with Taylor saved as your name and Brisbane's
// members Taylor, Casey and Blake, a shared ledger that syncs and holds an invite another
// member's phone made (sharing-decision-app). Other phones' requests to join are put in
// the API; the tests open the app again or its Members, and approve or reject through the
// screens.

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

eachTestGetsAPhone('sharing-decision-');

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
const MEMBERS = [YOU, 'Casey', 'Blake', 'Add Member'];

/** Dana has asked, the app has synced since, and Brisbane's Members is open and shows her request. */
async function inMembersWithDana(choice: Parameters<typeof asks>[0] = {}) {
  const started = await startWithInvite();
  await asks(choice);
  await syncs();
  await showMembers('Brisbane');
  await waitFor(() =>
    expect(membersShown()[0]).toContain(', Wants to join as '),
  );
  return started;
}

/** Lets `seconds` pass on the phone's clock, with the app at work. */
const secondsPass = (seconds: number) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(seconds * 1_000);
  });

/** Lets an hour pass with the app open: whatever the app was going to send, it has sent. */
const anHourPasses = () => secondsPass(60 * 60);

/** A roster entry another phone wrote: its own device represents `memberId`. */
const otherPhoneRepresents = (memberId: string) =>
  created('device' as never, OTHER_DEVICE, otherStamp(LATER + 1_000), {
    member: { memberId, userId: 'user-b', boxKey: someBoxKey() },
  });

describe('GROUPS-130.1', () => {
  test('[GROUPS-130.1] counts the requests to join under the title of a shared ledger, as a button that says where it leads', async () => {
    await startWithInvite();
    await asks();
    await syncs();
    await tapTab('Groups');
    await openGroup('Brisbane');

    await expectJoinCount('Brisbane', 1);
    expect(joinButton('Brisbane')!.props.accessibilityHint).toBe(
      'Opens Members',
    );
    expect(linesIn(screenOf('Brisbane'))).toContain('›');

    await asks({ name: 'Evan', deviceId: E, userId: EVAN_USER });
    await syncs();

    await expectJoinCount('Brisbane', 2);
  });

  test('[GROUPS-130.1] opens Members, with the requests in it, when the button is pressed', async () => {
    await startWithInvite();
    await asks();
    await syncs();
    await tapTab('Groups');
    await openGroup('Brisbane');
    await expectJoinCount('Brisbane', 1);

    await fireEvent.press(joinButton('Brisbane')!);

    await expectMembers([DANA_ROW, ...MEMBERS]);
  });

  test('[GROUPS-130.1] shows no such button while nobody has asked', async () => {
    await startWithInvite();
    await tapTab('Groups');
    await openGroup('Brisbane');
    await settle();

    expect(joinButton('Brisbane')).toBeUndefined();
  });
});

describe('GROUPS-131.1', () => {
  test('[GROUPS-131.1] lists each request above the members, with who asks and as whom', async () => {
    await startWithInvite();
    const { Casey } = await members('Brisbane');
    await asks();
    await asks({
      name: 'Evan',
      memberId: Casey,
      deviceId: E,
      userId: EVAN_USER,
    });
    await syncs();

    await showMembers('Brisbane');

    await expectMembers([DANA_ROW, `Evan, ${wantsToBe('Casey')}`, ...MEMBERS]);
    const lines = linesIn(screenOf('Members'));
    expect(lines).toContain('Requests');
    expect(lines.indexOf('Requests')).toBeGreaterThan(
      lines.indexOf('Invite with Link'),
    );
    expect(lines.indexOf('Requests')).toBeLessThan(lines.indexOf('Dana'));
  });

  test('[GROUPS-131.1] follows the member a request picked when they are renamed, and when they are removed', async () => {
    await startWithInvite();
    const { Casey } = await members('Brisbane');
    await asks({
      name: 'Evan',
      memberId: Casey,
      deviceId: E,
      userId: EVAN_USER,
    });
    await syncs();
    await showMembers('Brisbane');
    await expectMembers([`Evan, ${wantsToBe('Casey')}`, ...MEMBERS]);

    await renameMember('Casey', 'Casey Lee');

    await waitFor(() =>
      expect(membersShown()[0]).toBe(`Evan, ${wantsToBe('Casey Lee')}`),
    );

    await removeMember('Casey Lee');

    await waitFor(() => expect(membersShown()[0]).toBe(`Evan, ${LEFT}`));
  });

  test('[GROUPS-131.1] has no Requests while nobody has asked', async () => {
    await startWithInvite();

    await showMembers('Brisbane');

    await expectMembers(MEMBERS);
    expect(linesIn(screenOf('Members'))).not.toContain('Requests');
  });
});

describe('GROUPS-132.1', () => {
  test("[GROUPS-132.1] opens an action sheet titled with the applicant's name, with Approve, Decline and Cancel", async () => {
    await inMembersWithDana();

    const menu = await tapMember(DANA_ROW);

    expect(menu).toMatchObject({
      title: 'Dana',
      message: MAY_SEE,
      items: [APPROVE, DECLINE, CANCEL],
      destructive: [DECLINE],
      cancel: CANCEL,
    });
    expect(alertsShown()).toEqual([]);
  });

  test('[GROUPS-132.1] does nothing when Cancel is chosen', async () => {
    await inMembersWithDana();
    const from = received().length;

    const menu = await tapMember(DANA_ROW);
    await menu!.choose(CANCEL);

    await expectMembers([DANA_ROW, ...MEMBERS]);
    expect(approvals(from)).toEqual([]);
    expect(rejections(from)).toEqual([]);
  });
});

describe('SHARING-190.1', () => {
  test('[SHARING-190.1] lists the requests after the download of a sync, when the app is opened again', async () => {
    const { brisbane } = await startWithInvite();
    await asks();
    const from = received().length;

    await syncs();

    await waitFor(() => {
      const sent = groupRequests(from);
      const download = sent.findIndex((line) =>
        line.startsWith(`GET /groups/${brisbane}/events`),
      );
      expect(download).toBeGreaterThanOrEqual(0);
      expect(sent.indexOf(`GET /groups/${brisbane}/requests`)).toBeGreaterThan(
        download,
      );
    });
    await tapTab('Groups');
    await openGroup('Brisbane');
    await expectJoinCount('Brisbane', 1);
  });

  test('[SHARING-190.1] lists them again when Members opens, without a sync', async () => {
    await startWithInvite();
    await asks();
    const from = received().length;

    await showMembers('Brisbane');

    await expectMembers([DANA_ROW, ...MEMBERS]);
    expect(lists(from)).toHaveLength(1);
  });

  test('[SHARING-190.1] goes on after the last device of a page while the API says more follow', async () => {
    const { brisbane } = await startWithInvite();
    await asks();
    await asks({ name: 'Evan', deviceId: E, userId: EVAN_USER });
    pagesOf(1);
    const from = received().length;

    await syncs();

    await waitFor(() =>
      expect(lists(from).map(({ path }) => path)).toEqual([
        `/groups/${brisbane}/requests`,
        `/groups/${brisbane}/requests?after=${D}`,
      ]),
    );
    await showMembers('Brisbane');
    await expectMembers([DANA_ROW, `Evan, ${NEW_MEMBER}`, ...MEMBERS]);
  });

  test('[SHARING-190.1] asks for no requests while the phone holds no invite that has not expired, and shows none', async () => {
    await startWithInvite();
    await asks();
    await syncs();
    await tapTab('Groups');
    await openGroup('Brisbane');
    await expectJoinCount('Brisbane', 1);
    setClock(LATER + WEEK);
    const expired = received().length;

    await syncs();
    await anHourPasses();

    expect(lists(expired)).toEqual([]);
    await expectJoinCount('Brisbane', 0);
  });

  test('[SHARING-190.1] asks for no requests of a shared ledger that never had an invite', async () => {
    await startSynced();
    const from = received().length;

    await syncs();
    await showMembers('Brisbane');
    await anHourPasses();

    expect(lists(from)).toEqual([]);
  });

  test.each([
    ['there is no network', () => goOffline()],
    [
      'the API answers with an error',
      () => apiAnswersDecision('list', 500, {}),
    ],
  ])(
    '[SHARING-190.1] keeps the requests it had, and says nothing, when %s',
    async (_case, fail) => {
      await inMembersWithDana();
      await leaveMembers('Brisbane');
      fail();

      await showMembers('Brisbane');

      await expectMembers([DANA_ROW, ...MEMBERS]);
      expect(alertsShown()).toEqual([]);
      goOnline();
    },
  );

  test('[SHARING-190.1] drops a request the API no longer lists', async () => {
    const { brisbane } = await inMembersWithDana();
    await leaveMembers('Brisbane');
    withdraws(brisbane);

    await syncs();
    await showMembers('Brisbane');

    await expectMembers(MEMBERS);
  });

  test('[SHARING-190.1] lists nothing for a shared ledger that is archived', async () => {
    await startWithInvite();
    await asks();
    await archiveGroup('Brisbane');
    const from = received().length;

    await syncs();
    await anHourPasses();

    expect(lists(from)).toEqual([]);
  });

  test('[SHARING-190.1] lists nothing while it is approving a request, and lists again once the API has answered', async () => {
    await inMembersWithDana();
    holdDecisions('approve');
    const pressed = received().length;
    const menu = await tapMember(DANA_ROW);
    await menu!.choose(APPROVE);
    await waitFor(() => expect(approvals(pressed)).toHaveLength(1));

    await syncs();
    await secondsPass(30);

    expect(lists(pressed)).toEqual([]);
    await releaseDecisions();
    await waitFor(() =>
      expect(lists(pressed).length).toBeGreaterThanOrEqual(1),
    );
    await expectMembers([YOU, 'Casey', 'Blake', 'Dana, Joined', 'Add Member']);
  });
});

describe('SHARING-192.1', () => {
  test('[SHARING-192.1] shows only the request it can read, and rejects the other without asking', async () => {
    const { brisbane } = await startWithInvite();
    await asks();
    // The format version the phone knows, and bytes that do not open.
    apiHolds(brisbane, E, `01${'00'.repeat(296)}`);
    const unreadable = requestHash(brisbane, E);
    const from = received().length;

    await syncs();
    await showMembers('Brisbane');

    await expectMembers([DANA_ROW, ...MEMBERS]);
    expect(rejections(from).map(({ path }) => path)).toEqual([
      `/groups/${brisbane}/requests/${E}?request=${unreadable}`,
    ]);
    expect(requestsOn(brisbane)).toEqual([D]);
    expect(alertsShown()).toEqual([]);
  });
});

describe('SHARING-193.1', () => {
  test('[SHARING-193.1] has no request to show after a restart until it has listed them again', async () => {
    const { app } = await inMembersWithDana();
    await leaveMembers('Brisbane');
    goOffline();

    await restart(app);
    setClock(LATER);
    await showMembers('Brisbane');

    await expectMembers(MEMBERS);
    goOnline();
  });
});

describe('SHARING-194.1', () => {
  test('[SHARING-194.1] offers no Approve for a request whose member has a phone by now, and says why', async () => {
    const { brisbane } = await startWithInvite();
    const { Casey } = await members('Brisbane');
    await asks({ memberId: Casey });
    otherPhoneUploads(brisbane, otherPhoneRepresents(Casey));
    await syncs();
    await showMembers('Brisbane');
    await expectMembers([
      `Dana, ${wantsToBe('Casey')}`,
      YOU,
      'Casey, Joined',
      'Blake',
      'Add Member',
    ]);

    const menu = await tapMember(`Dana, ${wantsToBe('Casey')}`);

    expect(menu).toMatchObject({
      title: 'Dana',
      message: HAS_A_PHONE('Casey'),
      items: [DECLINE, CANCEL],
    });
  });

  test('[SHARING-194.1] offers no Approve for a request that picked your own member, which no roster entry names yet', async () => {
    await startWithInvite();
    const { Taylor } = await members('Brisbane');
    await asks({ memberId: Taylor });
    await syncs();
    await showMembers('Brisbane');
    await expectMembers([`Dana, ${wantsToBe('Taylor')}`, ...MEMBERS]);

    const menu = await tapMember(`Dana, ${wantsToBe('Taylor')}`);

    expect(menu).toMatchObject({
      title: 'Dana',
      message: IS_YOU('Taylor'),
      items: [DECLINE, CANCEL],
    });
  });

  test('[SHARING-194.1] offers no Approve for a request whose member was removed', async () => {
    await startWithInvite();
    const { Blake } = await members('Brisbane');
    await asks({ memberId: Blake });
    await syncs();
    await showMembers('Brisbane');
    await removeMember('Blake');
    await waitFor(() => expect(membersShown()[0]).toBe(`Dana, ${LEFT}`));

    const menu = await tapMember(`Dana, ${LEFT}`);

    expect(menu).toMatchObject({
      message: NO_MEMBER,
      items: [DECLINE, CANCEL],
    });
  });

  test("[SHARING-194.1] offers no Approve for a new member whose name is a member's", async () => {
    await inMembersWithDana({ name: ' casey ' });

    const menu = await tapMember(`casey, ${NEW_MEMBER}`);

    expect(menu).toMatchObject({
      message: SAME_NAME('Casey'),
      items: [DECLINE, CANCEL],
    });
  });

  test('[SHARING-194.1] offers no Approve for a new member of a group of 20, and offers it for one of its members', async () => {
    const others = Array.from(
      { length: 19 },
      (_, index) => `Member ${index + 1}`,
    );
    await startWithInvite({ Brisbane: others });
    const ids = await members('Brisbane');
    await asks();
    await asks({
      name: 'Evan',
      memberId: ids['Member 1'],
      deviceId: E,
      userId: EVAN_USER,
    });
    await syncs();
    await showMembers('Brisbane');
    await waitFor(() =>
      expect(membersShown().slice(0, 2)).toEqual([
        DANA_ROW,
        `Evan, ${wantsToBe('Member 1')}`,
      ]),
    );

    const full = await tapMember(DANA_ROW);
    const member = await tapMember(`Evan, ${wantsToBe('Member 1')}`);

    expect(full).toMatchObject({
      message: GROUP_FULL,
      items: [DECLINE, CANCEL],
    });
    expect(member).toMatchObject({
      message: MAY_SEE,
      items: [APPROVE, DECLINE, CANCEL],
    });
  });
});

describe('SHARING-195.1', () => {
  test('[SHARING-195.1] sends the cursor it checked at when the app synced meanwhile, and says why it cannot approve once the API calls it behind', async () => {
    const { brisbane } = await startWithInvite();
    const { Casey } = await members('Brisbane');
    await asks({ memberId: Casey });
    await syncs();
    await showMembers('Brisbane');
    const row = `Dana, ${wantsToBe('Casey')}`;
    await expectMembers([row, ...MEMBERS]);
    holdDecisions('chunk');
    const from = received().length;
    const menu = await tapMember(row);
    await menu!.choose(APPROVE);
    await waitFor(() => expect(chunks(from).length).toBeGreaterThanOrEqual(1));
    const checkedAt = lastSequence(brisbane);

    // While the snapshot is on its way, another phone is approved as Casey, and the app
    // comes back to the front and syncs.
    otherPhoneUploads(brisbane, otherPhoneRepresents(Casey));
    await syncs();
    await releaseDecisions();

    await waitFor(() =>
      expect(alertsShown().at(-1)).toEqual([
        UNABLE_TO_APPROVE,
        HAS_A_PHONE('Casey'),
      ]),
    );
    expect(approvals(from).map((sent) => approvalOf(sent).cursor)).toEqual([
      checkedAt,
    ]);
    expect(lastSequence(brisbane)).toBe(checkedAt + 1);
    expect(requestsOn(brisbane)).toEqual([D]);
    expect(await unsent()).toEqual([]);
  });

  test('[SHARING-195.1] approves the content its menu was opened for: a request replaced since is answered as gone, and the new one is shown', async () => {
    const { brisbane } = await inMembersWithDana();
    const { Casey } = await members('Brisbane');
    const menu = await tapMember(DANA_ROW);
    const shown = requestHash(brisbane);
    await asks({ memberId: Casey });
    await syncs();
    const replaced = `Dana, ${wantsToBe('Casey')}`;
    await expectMembers([replaced, ...MEMBERS]);
    const from = received().length;

    await menu!.choose(APPROVE);

    await waitFor(() =>
      expect(alertsShown().at(-1)).toEqual([UNABLE_TO_APPROVE, ANSWERED]),
    );
    expect(approvals(from).map((sent) => approvalOf(sent).request)).toEqual([
      shown,
    ]);
    expect(requestHash(brisbane)).not.toBe(shown);
    await expectMembers([replaced, ...MEMBERS]);
  });
});

describe('SHARING-199.1', () => {
  test('[SHARING-199.1] lists the new member as joined once the API has approved, and no request', async () => {
    await inMembersWithDana();
    const from = received().length;

    const menu = await tapMember(DANA_ROW);
    await menu!.choose(APPROVE);

    await expectMembers([YOU, 'Casey', 'Blake', 'Dana, Joined', 'Add Member']);
    expect(approvals(from)).toHaveLength(1);
    expect(chunks(from).length).toBeGreaterThanOrEqual(1);
    expect(await unsent()).toEqual([]);
    expect(alertsShown()).toEqual([]);
  });

  test('[SHARING-199.1] marks the member a phone was approved as', async () => {
    await startWithInvite();
    const { Casey } = await members('Brisbane');
    await asks({ memberId: Casey });
    await syncs();
    await showMembers('Brisbane');
    await expectMembers([`Dana, ${wantsToBe('Casey')}`, ...MEMBERS]);

    const menu = await tapMember(`Dana, ${wantsToBe('Casey')}`);
    await menu!.choose(APPROVE);

    await expectMembers([YOU, 'Casey, Joined', 'Blake', 'Add Member']);
  });
});

describe('SHARING-200.1', () => {
  test('[SHARING-200.1] says to connect when there is no network, and keeps the request', async () => {
    await inMembersWithDana();
    goOffline();

    const menu = await tapMember(DANA_ROW);
    await menu!.choose(APPROVE);

    await waitFor(() =>
      expect(alertsShown().at(-1)).toEqual([UNABLE_TO_APPROVE, OFFLINE]),
    );
    await expectMembers([DANA_ROW, ...MEMBERS]);
    expect(await unsent()).toEqual([]);
    goOnline();
  });

  test('[SHARING-200.1] says the request was answered when the API no longer has it, and lists again', async () => {
    const { brisbane } = await inMembersWithDana();
    apiAnswersDecision('approve', 404, { error: 'no-request' });
    withdraws(brisbane);

    const menu = await tapMember(DANA_ROW);
    await menu!.choose(APPROVE);

    await waitFor(() =>
      expect(alertsShown().at(-1)).toEqual([UNABLE_TO_APPROVE, ANSWERED]),
    );
    await expectMembers(MEMBERS);
  });

  test('[SHARING-200.1] says the group is full when it has its 20 member devices', async () => {
    const { brisbane } = await inMembersWithDana();
    memberDevicesOn(brisbane, 20);

    const menu = await tapMember(DANA_ROW);
    await menu!.choose(APPROVE);

    await waitFor(() =>
      expect(alertsShown().at(-1)).toEqual([UNABLE_TO_APPROVE, DEVICES_FULL]),
    );
    await expectMembers([DANA_ROW, ...MEMBERS]);
  });

  test('[SHARING-200.1] says why it cannot approve, and sends nothing, when the sync before it brings the reason', async () => {
    const { brisbane } = await startWithInvite();
    const { Casey } = await members('Brisbane');
    await asks({ memberId: Casey });
    await syncs();
    await showMembers('Brisbane');
    const row = `Dana, ${wantsToBe('Casey')}`;
    await expectMembers([row, ...MEMBERS]);
    const menu = await tapMember(row);
    otherPhoneUploads(brisbane, otherPhoneRepresents(Casey));
    const from = received().length;

    await menu!.choose(APPROVE);

    await waitFor(() =>
      expect(alertsShown().at(-1)).toEqual([
        UNABLE_TO_APPROVE,
        HAS_A_PHONE('Casey'),
      ]),
    );
    expect(chunks(from)).toEqual([]);
    expect(approvals(from)).toEqual([]);
    expect(requestsOn(brisbane)).toEqual([D]);
  });

  test('[SHARING-200.1] says the request was answered, and sends nothing, when the sync before it brings the news that the invite was revoked', async () => {
    const { brisbane } = await inMembersWithDana();
    const menu = await tapMember(DANA_ROW);
    // Another member's phone has revoked the invite; the API holds no request of it any more.
    otherPhoneUploads(brisbane, {
      version: 1,
      stamp: otherStamp(LATER + 1_000),
      type: 'invite',
      id: CODE_A,
      deleted: true,
    });
    withdraws(brisbane);
    const from = received().length;

    await menu!.choose(APPROVE);

    await waitFor(() =>
      expect(alertsShown().at(-1)).toEqual([UNABLE_TO_APPROVE, ANSWERED]),
    );
    expect(chunks(from)).toEqual([]);
    expect(approvals(from)).toEqual([]);
    await expectMembers(MEMBERS);
  });

  test('[SHARING-200.1] says something went wrong for an answer it cannot read', async () => {
    await inMembersWithDana();
    apiAnswersDecision('approve', 500, {});

    const menu = await tapMember(DANA_ROW);
    await menu!.choose(APPROVE);

    await waitFor(() =>
      expect(alertsShown().at(-1)).toEqual([UNABLE_TO_APPROVE, WENT_WRONG]),
    );
    await expectMembers([DANA_ROW, ...MEMBERS]);
  });
});

describe('SHARING-201.1', () => {
  test('[SHARING-201.1] rejects the request on the API when Decline is chosen, and writes nothing', async () => {
    const { brisbane } = await inMembersWithDana();
    const shown = requestHash(brisbane);
    const from = received().length;

    const menu = await tapMember(DANA_ROW);
    await menu!.choose(DECLINE);

    await expectMembers(MEMBERS);
    expect(
      rejections(from).map(({ path, body }) => [path, body.length]),
    ).toEqual([[`/groups/${brisbane}/requests/${D}?request=${shown}`, 0]]);
    expect(requestsOn(brisbane)).toEqual([]);
    expect(await unsent()).toEqual([]);
    expect(alertsShown()).toEqual([]);
  });

  test.each<[string, () => void, string]>([
    ['there is no network', () => goOffline(), OFFLINE],
    [
      'another member answered it',
      () => apiAnswersDecision('reject', 404, { error: 'no-request' }),
      ANSWERED,
    ],
    [
      'the API answers with an error',
      () => apiAnswersDecision('reject', 500, {}),
      WENT_WRONG,
    ],
  ])(
    '[SHARING-201.1] says why it could not decline when %s',
    async (_case, fail, message) => {
      await inMembersWithDana();
      fail();

      const menu = await tapMember(DANA_ROW);
      await menu!.choose(DECLINE);

      await waitFor(() =>
        expect(alertsShown().at(-1)).toEqual([UNABLE_TO_DECLINE, message]),
      );
      goOnline();
    },
  );
});

describe('SHARING-201.1', () => {
  test('[SHARING-201.1] declines the content its menu was opened for: a request replaced since stays, and is shown', async () => {
    const started = await startWithInvite();
    const { Casey } = await members('Brisbane');
    await asks({ memberId: Casey });
    await syncs();
    await showMembers('Brisbane');
    const row = `Dana, ${wantsToBe('Casey')}`;
    await expectMembers([row, ...MEMBERS]);
    const menu = await tapMember(row);
    await asks();

    await menu!.choose(DECLINE);

    await waitFor(() =>
      expect(alertsShown().at(-1)).toEqual([UNABLE_TO_DECLINE, ANSWERED]),
    );
    expect(requestsOn(started.brisbane)).toEqual([D]);
    await expectMembers([DANA_ROW, ...MEMBERS]);
  });
});

describe('SHARING-202.1', () => {
  test('[SHARING-202.1] shows Approving… on the row, and opens no menu for any request, while it approves', async () => {
    await startWithInvite();
    await asks();
    await asks({ name: 'Evan', deviceId: E, userId: EVAN_USER });
    await syncs();
    await showMembers('Brisbane');
    await expectMembers([DANA_ROW, `Evan, ${NEW_MEMBER}`, ...MEMBERS]);
    holdDecisions('approve');

    const menu = await tapMember(DANA_ROW);
    await menu!.choose(APPROVE);
    await waitFor(() => expect(membersShown()[0]).toBe(`Dana, ${APPROVING}`));

    expect(await tapMember(`Evan, ${NEW_MEMBER}`)).toBeUndefined();
    expect(await tapMember(`Dana, ${APPROVING}`)).toBeUndefined();

    await releaseDecisions();
    await expectMembers([
      `Evan, ${NEW_MEMBER}`,
      YOU,
      'Casey',
      'Blake',
      'Dana, Joined',
      'Add Member',
    ]);
  });

  test('[SHARING-202.1] shows Declining… on the row while it declines', async () => {
    await inMembersWithDana();
    holdDecisions('reject');

    const menu = await tapMember(DANA_ROW);
    await menu!.choose(DECLINE);

    await waitFor(() => expect(membersShown()[0]).toBe(`Dana, ${DECLINING}`));
    await releaseDecisions();
    await expectMembers(MEMBERS);
  });

  test('[SHARING-202.1] shows no alert for a result that comes once Members is closed', async () => {
    await inMembersWithDana();
    apiAnswersDecision('approve', 500, {});
    holdDecisions('approve');
    const menu = await tapMember(DANA_ROW);
    await menu!.choose(APPROVE);
    await waitFor(() => expect(approvals()).toHaveLength(1));

    await leaveMembers('Brisbane');
    await releaseDecisions();

    expect(alertsShown()).toEqual([]);
    await showMembers('Brisbane');
    await expectMembers([DANA_ROW, ...MEMBERS]);
  });
});

describe('SHARING-204.1', () => {
  test('[SHARING-204.1] gives an approval up after 60 seconds without an answer', async () => {
    await inMembersWithDana();
    holdDecisions('approve');
    const menu = await tapMember(DANA_ROW);
    await menu!.choose(APPROVE);
    await waitFor(() => expect(approvals()).toHaveLength(1));

    await secondsPass(50);
    expect(alertsShown()).toEqual([]);
    expect(membersShown()[0]).toBe(`Dana, ${APPROVING}`);
    await secondsPass(15);

    await waitFor(() =>
      expect(alertsShown().at(-1)).toEqual([UNABLE_TO_APPROVE, OFFLINE]),
    );
    await releaseDecisions();
    expect(alertsShown()).toHaveLength(1);
  });

  test('[SHARING-204.1] gives a list up after 60 seconds without an answer: Members sends a new one when it opens again, and says nothing', async () => {
    await startWithInvite();
    await asks();
    holdDecisions('list');
    const from = received().length;
    await showMembers('Brisbane');
    await waitFor(() => expect(lists(from)).toHaveLength(1));

    await secondsPass(65);
    await leaveMembers('Brisbane');
    await showMembers('Brisbane');

    await waitFor(() => expect(lists(from)).toHaveLength(2));
    expect(alertsShown()).toEqual([]);
    await releaseDecisions();
    await expectMembers([DANA_ROW, ...MEMBERS]);
  });

  test('[SHARING-204.1] gives a rejection up after 60 seconds without an answer', async () => {
    await inMembersWithDana();
    holdDecisions('reject');
    const menu = await tapMember(DANA_ROW);
    await menu!.choose(DECLINE);

    await secondsPass(65);

    await waitFor(() =>
      expect(alertsShown().at(-1)).toEqual([UNABLE_TO_DECLINE, OFFLINE]),
    );
    await releaseDecisions();
  });
});

describe('SHARING-288.1', () => {
  /**
   * Blake was removed from Brisbane, and a phone asks to join as a new member under this
   * name. Members is open; the row of the request is the first one.
   */
  async function someoneAsksAfterBlakeLeft(name = ' blake ') {
    const started = await startWithInvite();
    const { Blake } = await members('Brisbane');
    await showMembers('Brisbane');
    await removeMember('Blake');
    await asks({ name });
    await syncs();
    const row = `${name.trim()}, ${NEW_MEMBER}`;
    await waitFor(() => expect(membersShown()[0]).toBe(row));
    return { ...started, row, blake: Blake };
  }

  test('[SHARING-288.1] asks whether to add a former member back before it approves a new member with his name, and sends nothing yet', async () => {
    const { row } = await someoneAsksAfterBlakeLeft();
    const menu = await tapMember(row);
    const from = received().length;
    const shown = alertsShown().length;

    await menu!.choose(APPROVE);

    expect(alertsShown().slice(shown)).toEqual([addBackAlert('Blake')]);
    expect(lastAlertButtons()).toEqual(['Cancel', 'Add Back']);
    expect(chunks(from)).toEqual([]);
    expect(approvals(from)).toEqual([]);
  });

  test('[SHARING-288.1] approves once Add Back is pressed, and the phone joins as the former member, not as a second one', async () => {
    const { row, blake } = await someoneAsksAfterBlakeLeft();
    const menu = await tapMember(row);
    const from = received().length;
    const shown = alertsShown().length;
    await menu!.choose(APPROVE);
    expect(alertsShown().slice(shown)).toEqual([addBackAlert('Blake')]);

    await pressAlertButton('Add Back');

    await waitFor(() => expect(approvals(from)).toHaveLength(1));
    await waitFor(() => expect(membersShown()).toContain('Blake, Joined'));
    expect(membersShown().join('\n')).not.toMatch(/^blake/m);
    expect((await members('Brisbane')).Blake).toBe(blake);
    expect(Object.keys(await members('Brisbane')).sort()).toEqual([
      'Blake',
      'Casey',
      'Taylor',
    ]);
  });

  test('[SHARING-288.1] sends nothing, and keeps the request, when Cancel is pressed', async () => {
    const { row } = await someoneAsksAfterBlakeLeft();
    const menu = await tapMember(row);
    const from = received().length;
    const shown = alertsShown().length;
    await menu!.choose(APPROVE);
    expect(alertsShown().slice(shown)).toEqual([addBackAlert('Blake')]);

    await pressAlertButton('Cancel');

    expect(chunks(from)).toEqual([]);
    expect(approvals(from)).toEqual([]);
    expect(membersShown()[0]).toBe(row);
    expect(await tapMember(row)).toMatchObject({
      items: [APPROVE, DECLINE, CANCEL],
    });
  });

  test("[SHARING-288.1] approves a new member whose name is no former member's without asking", async () => {
    const { row } = await someoneAsksAfterBlakeLeft('Blake L');
    const menu = await tapMember(row);
    const from = received().length;
    const shown = alertsShown().length;

    await menu!.choose(APPROVE);

    await waitFor(() => expect(approvals(from)).toHaveLength(1));
    expect(alertsShown().slice(shown)).toEqual([]);
  });

  test("[SHARING-288.1] does not approve, and says the name is a member's, once another phone has added the former member back", async () => {
    const { row, blake, brisbane } = await someoneAsksAfterBlakeLeft();
    const menu = await tapMember(row);
    const from = received().length;
    const shown = alertsShown().length;
    await menu!.choose(APPROVE);
    expect(alertsShown().slice(shown)).toEqual([addBackAlert('Blake')]);
    otherPhoneUploads(
      brisbane,
      changed('member', blake, otherStamp(LATER + 9_000), { removed: false }),
    );

    await pressAlertButton('Add Back');

    await waitFor(() =>
      expect(alertsShown().at(-1)).toEqual([
        UNABLE_TO_APPROVE,
        SAME_NAME('Blake'),
      ]),
    );
    expect(approvals(from)).toEqual([]);
  });
});
