import { act, waitFor } from '@testing-library/react-native';
import {
  alertsShown,
  expectClosed,
  expectMembers,
  lastAlertButtonStyles,
  membersShown,
  pressAlertButton,
  tapMember,
  textsOn,
} from './group-details-app';
import {
  goOffline,
  mistakes,
  received,
  removeWorld,
  resetWorld,
  secureStoreEntries,
} from './sharing-app';
import {
  CODE_A,
  D,
  OFFLINE,
  WENT_WRONG,
  startDecisionApi,
  startWithInvite,
  syncs,
} from './sharing-decision-app';
import {
  DANA_MEMBER,
  KEEPS_A_COPY,
  LEAVE,
  LEAVE_GROUP,
  LEAVING,
  LEFT_BANNER,
  NO_OTHER_PHONE,
  REMOVE,
  REMOVE_FROM_GROUP,
  REMOVING,
  UNABLE_TO_LEAVE,
  UNABLE_TO_REMOVE,
  apiAnswersRemoval,
  danaJoined,
  holdRemovals,
  leaves,
  releaseRemovals,
  removeMessage,
  removeTitle,
  represents,
  revocations,
  rotations,
  startRemovalApi,
} from './sharing-removal-app';
import {
  LATER,
  YOU,
  eachTestGetsAPhone,
  groupId,
  groupNamed,
  members,
  receive,
  showMembers,
  unsent,
} from './sync-app';
import {
  deviceId,
  download,
  eventRequests,
  groupNeedsRotation,
  lunchCreated,
  mark,
  otherPhoneUploads,
  startEventApi,
  startSynced,
} from './sync-screens-app';

// Runs on iOS. Each test starts the whole app with Taylor saved as your name and Brisbane's
// members Taylor, Casey and Blake, a shared ledger that syncs (sync-screens-app). Dana has
// joined from a phone of her own: the app has applied her member and her phone's roster
// entry. The tests remove her, or leave, through Members, against the API of
// sharing-removal-app (ADR-0041).

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

eachTestGetsAPhone('sharing-removal-');

beforeEach(() => {
  resetWorld();
  startEventApi();
  startDecisionApi();
  startRemovalApi();
});

afterEach(async () => {
  const wrong = mistakes();
  await removeWorld();
  expect(wrong).toEqual([]);
});

const DANA_ROW = 'Dana, Joined';
const WITH_DANA = [YOU, 'Casey', 'Blake', DANA_ROW, 'Add Member'];
const WITHOUT_DANA = [YOU, 'Casey', 'Blake', 'Add Member'];

/** Dana has joined, and Brisbane's Members is open and lists her. */
async function inMembersWithDana() {
  await startSynced();
  const brisbane = await danaJoined();
  await showMembers('Brisbane');
  await expectMembers(WITH_DANA);
  return { brisbane, device: await deviceId() };
}

/** Chooses Remove from Group in Dana's menu: the confirmation is up. */
async function askToRemoveDana() {
  const menu = await tapMember(DANA_ROW);
  await menu!.choose(REMOVE_FROM_GROUP);
}

/** Chooses Leave Group in your own menu: the confirmation is up. */
async function askToLeave() {
  const menu = await tapMember(YOU);
  await menu!.choose(LEAVE_GROUP);
}

/** Lets `seconds` pass on the phone's clock, with the app at work. */
const secondsPass = (seconds: number) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(seconds * 1_000);
  });

const keyEntries = (group: string) =>
  secureStoreEntries()
    .map(({ key }) => key)
    .filter((key) => key.startsWith(`group-key.${group}.`))
    .sort();

describe('GROUPS-150.1', () => {
  test('[GROUPS-150.1] asks before it removes a member another phone represents, and has sent nothing yet', async () => {
    await inMembersWithDana();
    const from = mark();
    const before = alertsShown().length;

    await askToRemoveDana();

    expect(alertsShown().slice(before)).toEqual([
      [removeTitle('Dana'), removeMessage('Dana')],
    ]);
    expect(lastAlertButtonStyles()).toEqual([
      ['Cancel', 'cancel'],
      [REMOVE, 'destructive'],
    ]);
    expect(received().slice(from)).toEqual([]);
    await expectMembers(WITH_DANA);
  });

  test('[GROUPS-150.1] removes nobody and sends nothing when Cancel is pressed', async () => {
    await inMembersWithDana();
    const from = mark();
    await askToRemoveDana();
    expect(alertsShown().at(-1)).toEqual([
      removeTitle('Dana'),
      removeMessage('Dana'),
    ]);

    await pressAlertButton('Cancel');

    await expectMembers(WITH_DANA);
    expect(rotations(from)).toEqual([]);
  });
});

describe('GROUPS-26.2', () => {
  test('[GROUPS-26.2] removes a member no phone represents at once, with no question and no request', async () => {
    await inMembersWithDana();
    const from = mark();
    const before = alertsShown().length;

    const menu = await tapMember('Blake');
    await menu!.choose(REMOVE_FROM_GROUP);

    await expectMembers([YOU, 'Casey', DANA_ROW, 'Add Member']);
    expect(alertsShown().slice(before)).toEqual([]);
    expect(rotations(from)).toEqual([]);
  });
});

describe('SHARING-270.1', () => {
  test('[SHARING-270.1] syncs, then sends one rotation that removes the member’s phone and boxes the key for this phone', async () => {
    const { brisbane, device } = await inMembersWithDana();
    await askToRemoveDana();
    const from = mark();

    await pressAlertButton(REMOVE);

    await waitFor(() => expect(rotations(from)).toHaveLength(1));
    expect(eventRequests(from)[0]).toBe(download(brisbane, 0));
    const [rotation] = rotations(from);
    expect(rotation.epoch).toBe(2);
    expect(rotation.remove).toEqual([D]);
    expect(rotation.boxes.map(({ deviceId: to }) => to)).toEqual([device]);
    expect(rotation.senderKey).toMatch(/^[0-9a-f]{64}$/);
  });

  test('[SHARING-270.1] changes nothing on the phone before the API has answered', async () => {
    const { brisbane } = await inMembersWithDana();
    await askToRemoveDana();
    const from = mark();
    holdRemovals('rotation');

    await pressAlertButton(REMOVE);
    await waitFor(() => expect(rotations(from)).toHaveLength(1));

    expect(
      (await groupNamed('Brisbane')).members.map(({ name }) => name),
    ).toEqual(['Taylor', 'Casey', 'Blake', 'Dana']);
    expect(await unsent()).toEqual([]);
    expect(keyEntries(brisbane)).toEqual([`group-key.${brisbane}.1`]);
    await releaseRemovals();
  });

  test('[SHARING-270.1] removes every phone that represents the member, and boxes the key for a phone that represents another', async () => {
    const { device } = await inMembersWithDana();
    const { Casey } = await members('Brisbane');
    const other = 'c0ffee00-0000-4000-8000-00000000000e';
    const third = 'c0ffee00-0000-4000-8000-00000000000f';
    await receive(
      await groupId('Brisbane'),
      represents(other, DANA_MEMBER, 'user-e', LATER + 3_000),
      represents(third, Casey, 'user-f', LATER + 4_000),
    );
    await askToRemoveDana();
    const from = mark();

    await pressAlertButton(REMOVE);

    await waitFor(() => expect(rotations(from)).toHaveLength(1));
    const [rotation] = rotations(from);
    expect([...rotation.remove].sort()).toEqual([D, other].sort());
    expect(rotation.boxes.map(({ deviceId: to }) => to).sort()).toEqual(
      [device, third].sort(),
    );
  });
});

describe('GROUPS-151.1', () => {
  test('[GROUPS-151.1] shows Removing… on the member’s row and locks Members until the removal has ended', async () => {
    await inMembersWithDana();
    await askToRemoveDana();
    const from = mark();
    holdRemovals('rotation');

    await pressAlertButton(REMOVE);
    await waitFor(() => expect(rotations(from)).toHaveLength(1));

    await expectMembers([
      YOU,
      'Casey',
      'Blake',
      `Dana, ${REMOVING}`,
      'Add Member',
    ]);
    expect(await tapMember('Casey')).toBeUndefined();

    await releaseRemovals();
    await expectMembers(WITHOUT_DANA);
    expect(await tapMember('Casey')).toBeDefined();
  });

  test('[GROUPS-151.1] shows Leaving… on your row and locks Members until the leave has ended', async () => {
    await inMembersWithDana();
    await askToLeave();
    const from = mark();
    holdRemovals('leave');

    await pressAlertButton(LEAVE);
    await waitFor(() => expect(leaves(from)).toHaveLength(1));

    expect(membersShown()).toContain(`${YOU}, ${LEAVING}`);
    expect(await tapMember('Casey')).toBeUndefined();
    await releaseRemovals();
  });

  test('[GROUPS-151.1] shows the member as before, and unlocks Members, when the removal did not go through', async () => {
    await inMembersWithDana();
    await askToRemoveDana();
    apiAnswersRemoval('rotation', 500, {});

    await pressAlertButton(REMOVE);

    await waitFor(() =>
      expect(alertsShown().at(-1)).toEqual([UNABLE_TO_REMOVE, WENT_WRONG]),
    );
    await expectMembers(WITH_DANA);
    expect(await tapMember('Casey')).toBeDefined();
  });
});

describe('SHARING-273.1', () => {
  test('[SHARING-273.1] saves the new key and lists the member no more once the API has rotated', async () => {
    const { brisbane } = await inMembersWithDana();
    await askToRemoveDana();
    const before = alertsShown().length;

    await pressAlertButton(REMOVE);

    await expectMembers(WITHOUT_DANA);
    expect(keyEntries(brisbane)).toEqual([
      `group-key.${brisbane}.1`,
      `group-key.${brisbane}.2`,
    ]);
    expect(
      (await groupNamed('Brisbane')).members.map(({ name }) => name),
    ).toEqual(['Taylor', 'Casey', 'Blake']);
    expect(Object.keys(await members('Brisbane'))).toContain('Dana');
    expect(await unsent()).toEqual([]);
    expect(alertsShown().slice(before)).toEqual([]);
  });
});

describe('SHARING-274.1', () => {
  test('[SHARING-274.1] says to connect when there is no network, and keeps the member', async () => {
    await inMembersWithDana();
    await askToRemoveDana();
    goOffline();

    await pressAlertButton(REMOVE);

    await waitFor(() =>
      expect(alertsShown().at(-1)).toEqual([UNABLE_TO_REMOVE, OFFLINE]),
    );
    await expectMembers(WITH_DANA);
    expect(await unsent()).toEqual([]);
  });

  test('[SHARING-274.1] prepares the rotation again from the member devices the API lists, and removes nobody when the phone has left already', async () => {
    const { device } = await inMembersWithDana();
    await askToRemoveDana();
    const from = mark();
    apiAnswersRemoval('rotation', 409, { error: 'devices', devices: [device] });
    const before = alertsShown().length;

    await pressAlertButton(REMOVE);

    await waitFor(() => expect(rotations(from)).toHaveLength(2));
    const [, second] = rotations(from);
    expect(second.remove).toEqual([]);
    expect(second.boxes.map(({ deviceId: to }) => to)).toEqual([device]);
    expect(second.events).toHaveLength(2);
    await expectMembers(WITHOUT_DANA);
    expect(alertsShown().slice(before)).toEqual([]);
  });

  test('[SHARING-274.1] gives up after three rotations the API refuses for its member devices', async () => {
    const { device } = await inMembersWithDana();
    await askToRemoveDana();
    const from = mark();
    for (let each = 0; each < 3; each += 1) {
      apiAnswersRemoval('rotation', 409, {
        error: 'devices',
        devices: [device, D],
      });
    }

    await pressAlertButton(REMOVE);

    await waitFor(() =>
      expect(alertsShown().at(-1)).toEqual([UNABLE_TO_REMOVE, WENT_WRONG]),
    );
    expect(rotations(from)).toHaveLength(3);
    await expectMembers(WITH_DANA);
  });

  test('[SHARING-274.1] takes the removal for done when the API says no rotation is needed', async () => {
    await inMembersWithDana();
    await askToRemoveDana();
    const from = mark();
    apiAnswersRemoval('rotation', 409, { error: 'rotation-not-needed' });
    const before = alertsShown().length;

    await pressAlertButton(REMOVE);

    await waitFor(() => expect(eventRequests(from).length).toBeGreaterThan(1));
    expect(rotations(from)).toHaveLength(1);
    expect(alertsShown().slice(before)).toEqual([]);
  });

  test.each([
    ['a full group', 413, { error: 'group-full' }],
    ['an answer it cannot read', 500, {}],
  ])(
    '[SHARING-274.1] says something went wrong for %s, and saves no new key',
    async (_, status, body) => {
      const { brisbane } = await inMembersWithDana();
      await askToRemoveDana();
      apiAnswersRemoval('rotation', status, body);

      await pressAlertButton(REMOVE);

      await waitFor(() =>
        expect(alertsShown().at(-1)).toEqual([UNABLE_TO_REMOVE, WENT_WRONG]),
      );
      await expectMembers(WITH_DANA);
      expect(keyEntries(brisbane)).toEqual([`group-key.${brisbane}.1`]);
    },
  );
});

describe('SHARING-275.1', () => {
  test('[SHARING-275.1] rotates for the group when the API says it needs a rotation, and writes down who left', async () => {
    const { brisbane, device } = await inMembersWithDana();
    groupNeedsRotation(brisbane, [device]);
    const from = mark();
    const before = alertsShown().length;

    await syncs();

    await waitFor(() => expect(rotations(from)).toHaveLength(1));
    const [rotation] = rotations(from);
    expect(rotation.epoch).toBe(2);
    expect(rotation.remove).toEqual([]);
    expect(rotation.boxes.map(({ deviceId: to }) => to)).toEqual([device]);
    expect(rotation.events).toHaveLength(2);
    await expectMembers(WITHOUT_DANA);
    expect(keyEntries(brisbane)).toContain(`group-key.${brisbane}.2`);
    expect(alertsShown().slice(before)).toEqual([]);
  });

  test('[SHARING-275.1] sends no rotation when the API lists a device the phone’s roster does not name', async () => {
    const { brisbane, device } = await inMembersWithDana();
    groupNeedsRotation(brisbane, [
      device,
      'c0ffee00-0000-4000-8000-0000000000ff',
    ]);
    const from = mark();
    const before = alertsShown().length;

    await syncs();
    await secondsPass(5);

    expect(rotations(from)).toEqual([]);
    expect(alertsShown().slice(before)).toEqual([]);
    await expectMembers(WITH_DANA);
  });
});

describe('GROUPS-152.1', () => {
  test('[GROUPS-152.1] asks before leaving, and says what you still owe', async () => {
    const { brisbane } = await inMembersWithDana();
    otherPhoneUploads(brisbane, await lunchCreated());
    await syncs();
    const from = mark();

    await askToLeave();

    expect(alertsShown().at(-1)).toEqual([
      'Leave Brisbane?',
      `${KEEPS_A_COPY}\n\nYou owe: $15.00`,
    ]);
    expect(lastAlertButtonStyles()).toEqual([
      ['Cancel', 'cancel'],
      [LEAVE, 'destructive'],
    ]);
    expect(leaves(from)).toEqual([]);
  });

  test('[GROUPS-152.1] says nothing about money when you owe nothing and are owed nothing', async () => {
    await inMembersWithDana();

    await askToLeave();

    expect(alertsShown().at(-1)).toEqual(['Leave Brisbane?', KEEPS_A_COPY]);
  });

  test('[GROUPS-152.1] says that nobody else will have the expenses when no other phone has joined', async () => {
    await startSynced();
    await showMembers('Brisbane');
    await expectMembers(WITHOUT_DANA);

    await askToLeave();

    expect(alertsShown().at(-1)).toEqual([
      'Leave Brisbane?',
      `${KEEPS_A_COPY}\n\n${NO_OTHER_PHONE}`,
    ]);
  });

  test('[GROUPS-152.1] leaves nothing and sends nothing when Cancel is pressed', async () => {
    await inMembersWithDana();
    const from = mark();
    await askToLeave();
    expect(alertsShown().at(-1)?.[0]).toBe('Leave Brisbane?');

    await pressAlertButton('Cancel');

    expect(leaves(from)).toEqual([]);
    await expectMembers(WITH_DANA);
  });
});

describe('SHARING-276.1', () => {
  test('[SHARING-276.1] syncs, leaves on the API, closes Members and shows the group as a copy you left', async () => {
    const { brisbane } = await inMembersWithDana();
    await askToLeave();
    const from = mark();

    await pressAlertButton(LEAVE);

    await waitFor(() => expect(leaves(from)).toHaveLength(1));
    expect(eventRequests(from)[0]).toBe(download(brisbane, 0));
    const [leave] = leaves(from);
    expect(leave.path).toBe(`/groups/${brisbane}/leave`);
    expect(leave.body).toHaveLength(0);
    await expectClosed('Members');
    await waitFor(() => expect(textsOn('Brisbane')).toContain(LEFT_BANNER));
    expect(await unsent()).toEqual([]);
  });
});

describe('SHARING-277.1', () => {
  test('[SHARING-277.1] says to connect when there is no network, and stays a member', async () => {
    await inMembersWithDana();
    await askToLeave();
    goOffline();

    await pressAlertButton(LEAVE);

    await waitFor(() =>
      expect(alertsShown().at(-1)).toEqual([UNABLE_TO_LEAVE, OFFLINE]),
    );
    await expectMembers(WITH_DANA);
  });

  test('[SHARING-277.1] says something went wrong for an answer it cannot read, and stays a member', async () => {
    await inMembersWithDana();
    await askToLeave();
    apiAnswersRemoval('leave', 500, {});

    await pressAlertButton(LEAVE);

    await waitFor(() =>
      expect(alertsShown().at(-1)).toEqual([UNABLE_TO_LEAVE, WENT_WRONG]),
    );
    await expectMembers(WITH_DANA);
  });
});

describe('SHARING-284.1', () => {
  test('[SHARING-284.1] revokes the invite that was made before a phone left, and writes its deletion', async () => {
    const { brisbane } = await startWithInvite();
    await danaJoined();
    await showMembers('Brisbane');
    await expectMembers(WITH_DANA);
    await askToRemoveDana();
    const from = mark();
    const before = alertsShown().length;

    await pressAlertButton(REMOVE);

    await waitFor(() =>
      expect(revocations(from)).toEqual([
        `/groups/${brisbane}/invites/${CODE_A}`,
      ]),
    );
    await waitFor(async () =>
      expect(await unsent()).toMatchObject([
        {
          groupId: brisbane,
          content: { type: 'invite', id: CODE_A, deleted: true },
        },
      ]),
    );
    expect(alertsShown().slice(before)).toEqual([]);
  });

  test('[SHARING-284.1] revokes no invite while no phone has left', async () => {
    await startWithInvite();
    await danaJoined();
    const from = mark();

    await syncs();
    await secondsPass(5);

    expect(revocations(from)).toEqual([]);
  });
});

describe('SHARING-286.1', () => {
  test('[SHARING-286.1] gives a rotation up after 60 seconds without an answer', async () => {
    await inMembersWithDana();
    await askToRemoveDana();
    const from = mark();
    holdRemovals('rotation');
    const before = alertsShown().length;

    await pressAlertButton(REMOVE);
    await waitFor(() => expect(rotations(from)).toHaveLength(1));
    await secondsPass(50);

    await expectMembers([
      YOU,
      'Casey',
      'Blake',
      `Dana, ${REMOVING}`,
      'Add Member',
    ]);
    expect(alertsShown().slice(before)).toEqual([]);

    await secondsPass(15);

    await waitFor(() =>
      expect(alertsShown().slice(before)).toEqual([
        [UNABLE_TO_REMOVE, OFFLINE],
      ]),
    );

    await releaseRemovals();
    await secondsPass(5);
    expect(alertsShown().slice(before)).toEqual([[UNABLE_TO_REMOVE, OFFLINE]]);
  });

  test('[SHARING-286.1] gives a leave up after 60 seconds without an answer', async () => {
    await inMembersWithDana();
    await askToLeave();
    const from = mark();
    holdRemovals('leave');

    await pressAlertButton(LEAVE);
    await waitFor(() => expect(leaves(from)).toHaveLength(1));
    await secondsPass(65);

    await waitFor(() =>
      expect(alertsShown().at(-1)).toEqual([UNABLE_TO_LEAVE, OFFLINE]),
    );
    await releaseRemovals();
  });
});
