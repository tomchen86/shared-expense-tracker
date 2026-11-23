import type { SyncEvent } from '@shared-expense/domain';
import { expectMembers, tapMember } from './group-details-app';
import { restart } from './ledger-expense-app';
import {
  LATER,
  YOU,
  at,
  changed,
  created,
  eachTestGetsAPhone,
  groupId,
  groupNamed,
  members,
  receive,
  setClock,
  share,
  showMembers,
  startShared,
} from './sync-app';

// Runs on iOS. Each test starts the app as the group expense tests do, with Taylor saved
// as your name and Brisbane's members Taylor, Casey and Blake, a shared ledger since
// 2026-10-30T04:00:00Z with phone-a as this phone's device ID (sync-app). It hands the app
// roster entries that other phones wrote, as its sync will, and looks at what the phone
// stores for each member and at Members (ADR-0039).

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

eachTestGetsAPhone('sync-roster-');

const BOX_KEY =
  'bc908a559c76aef30842db38b5e1844f63847c087cf94b793fe477da10d44e75';
const DANA = '5d2c0e4f-8b1a-4c3d-9e7f-6a5b4c3d2e1f';

/** A roster entry's first event: `device` represents `memberId`, for the user `userId`. */
const entry = (
  device: string,
  memberId: string,
  userId: string,
  stamp = at(LATER + 1_000, 0, device),
) =>
  created('device' as SyncEvent['type'], device, stamp, {
    member: { memberId, userId, boxKey: BOX_KEY },
  });

const memberCreated = (id: string, name: string, stamp = at(LATER + 500)) =>
  created('member', id, stamp, { name, removed: false });

/** The user ID the phone stores for each member of the group, by name. */
const userIds = async (group = 'Brisbane') =>
  Object.fromEntries(
    (await groupNamed(group)).members.map(({ name, userId }) => [name, userId]),
  );

test('[SYNC-251.2] gives a member the user ID of the phone that represents them, in Members that is open', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  const { Casey } = await members('Brisbane');
  const you = (await userIds()).Taylor;
  await showMembers('Brisbane');

  await receive(brisbane, entry('phone-b', Casey, 'user-b'));

  await expectMembers([YOU, 'Casey, Joined', 'Blake', 'Add Member']);
  expect(await userIds()).toEqual({
    Taylor: you,
    Casey: 'user-b',
    Blake: null,
  });
});

test.each(['the member first', 'the roster entry first'])(
  '[SYNC-251.2] gives a new member the user ID of their roster entry, with %s',
  async (order) => {
    await startShared();
    const brisbane = await groupId('Brisbane');
    const events = [
      memberCreated(DANA, 'Dana'),
      entry('phone-c', DANA, 'user-c'),
    ];

    await receive(
      brisbane,
      ...(order === 'the member first' ? events : events.reverse()),
    );

    expect((await userIds()).Dana).toBe('user-c');
  },
);

test.each(['the earlier entry first', 'the later entry first'])(
  '[SYNC-251.2] follows the roster entry with the later stamp when two represent one member, with %s',
  async (order) => {
    await startShared();
    const brisbane = await groupId('Brisbane');
    const { Casey } = await members('Brisbane');
    const events = [
      entry('phone-b', Casey, 'user-b', at(LATER + 60_000, 0, 'phone-b')),
      entry('phone-c', Casey, 'user-c', at(LATER + 120_000, 0, 'phone-c')),
    ];

    await receive(
      brisbane,
      ...(order === 'the earlier entry first' ? events : events.reverse()),
    );

    expect((await userIds()).Casey).toBe('user-c');
  },
);

test('[SYNC-251.2] leaves you as you when your own roster entry arrives', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  const before = (await groupNamed('Brisbane')).members[0];

  await receive(
    brisbane,
    entry(
      'phone-a',
      before.id,
      before.userId!,
      at(LATER + 1_000, 0, 'phone-a'),
    ),
  );

  await showMembers('Brisbane');
  await expectMembers([YOU, 'Casey', 'Blake', 'Add Member']);
  expect((await groupNamed('Brisbane')).members[0]).toEqual(before);
});

test.each(['no roster entry of its own', 'a roster entry of its own'])(
  "[SYNC-251.2] leaves you as you when another phone's later entry names your member, on a phone with %s",
  async (own) => {
    await startShared();
    const brisbane = await groupId('Brisbane');
    const { Casey } = await members('Brisbane');
    const you = (await groupNamed('Brisbane')).members[0];
    if (own === 'a roster entry of its own') {
      await receive(
        brisbane,
        entry('phone-a', you.id, you.userId!, at(LATER + 1_000, 0, 'phone-a')),
      );
    }
    await showMembers('Brisbane');

    await receive(
      brisbane,
      entry('phone-b', you.id, 'user-b', at(LATER + 60_000, 0, 'phone-b')),
      entry('phone-c', Casey, 'user-c', at(LATER + 60_000, 0, 'phone-c')),
    );

    // Casey's entry shows that both were applied; yours did not make you somebody else.
    await expectMembers([YOU, 'Casey, Joined', 'Blake', 'Add Member']);
    expect(await userIds()).toEqual({
      Taylor: you.userId,
      Casey: 'user-c',
      Blake: null,
    });
  },
);

test('[SYNC-251.2] gives no user ID to a member that another phone names with your own user ID', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  const { Casey, Blake } = await members('Brisbane');
  const you = (await userIds()).Taylor!;
  await showMembers('Brisbane');

  await receive(
    brisbane,
    entry('phone-b', Casey, you),
    entry('phone-c', Blake, 'user-c'),
  );

  await expectMembers([YOU, 'Casey', 'Blake, Joined', 'Add Member']);
  expect(await userIds()).toEqual({
    Taylor: you,
    Casey: null,
    Blake: 'user-c',
  });
});

test('[SYNC-251.2] moves the user ID when a roster entry is changed to name another member', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  const { Casey, Blake } = await members('Brisbane');
  await showMembers('Brisbane');
  await receive(brisbane, entry('phone-b', Casey, 'user-b'));
  await expectMembers([YOU, 'Casey, Joined', 'Blake', 'Add Member']);

  await receive(
    brisbane,
    changed(
      'device' as SyncEvent['type'],
      'phone-b',
      at(LATER + 60_000, 0, 'phone-b'),
      { member: { memberId: Blake, userId: 'user-b', boxKey: BOX_KEY } },
    ),
  );

  await expectMembers([YOU, 'Casey', 'Blake, Joined', 'Add Member']);
  expect(await userIds()).toMatchObject({ Casey: null, Blake: 'user-b' });
});

test('[SYNC-251.2] makes you the member your own roster entry is changed to name, and leaves you as you when it names nobody in the group', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  const { Casey } = await members('Brisbane');
  const you = (await groupNamed('Brisbane')).members[0];
  const own = (memberId: string, ms: number) =>
    changed('device' as SyncEvent['type'], 'phone-a', at(ms, 0, 'phone-b'), {
      member: { memberId, userId: you.userId, boxKey: BOX_KEY },
    });
  await receive(
    brisbane,
    entry('phone-a', you.id, you.userId!, at(LATER + 1_000, 0, 'phone-a')),
  );
  await showMembers('Brisbane');

  await receive(brisbane, own(DANA, LATER + 60_000));

  await expectMembers([YOU, 'Casey', 'Blake', 'Add Member']);
  expect((await userIds()).Taylor).toBe(you.userId);

  await receive(brisbane, own(Casey, LATER + 120_000));

  await expectMembers(['Taylor', 'Casey (You)', 'Blake', 'Add Member']);
  expect(await userIds()).toEqual({
    Taylor: null,
    Casey: you.userId,
    Blake: null,
  });
});

test('[SYNC-251.2] still has the user ID after a restart', async () => {
  const app = await startShared();
  const brisbane = await groupId('Brisbane');
  const { Casey } = await members('Brisbane');
  await receive(brisbane, entry('phone-b', Casey, 'user-b'));

  await restart(app);
  setClock(LATER);

  expect((await userIds()).Casey).toBe('user-b');
  await showMembers('Brisbane');
  await expectMembers([YOU, 'Casey, Joined', 'Blake', 'Add Member']);
});

test('[SYNC-251.2] keeps the roster of each shared ledger to its own members', async () => {
  await startShared({ Brisbane: ['Casey', 'Blake'], Tokyo: ['Dana'] });
  const brisbane = await groupId('Brisbane');
  const tokyo = await share('Tokyo');
  const { Casey } = await members('Brisbane');
  const { Dana } = await members('Tokyo');

  await receive(brisbane, entry('phone-b', Casey, 'user-b'));
  await receive(tokyo, entry('phone-b', Dana, 'user-b'));

  expect(await userIds('Brisbane')).toMatchObject({
    Casey: 'user-b',
    Blake: null,
  });
  expect((await userIds('Tokyo')).Dana).toBe('user-b');
});

test.each(['the roster entry first', 'the removal first'])(
  '[SYNC-36.4] keeps a member who has a phone in the group when another phone removes them, with %s',
  async (order) => {
    await startShared();
    const brisbane = await groupId('Brisbane');
    const { Casey } = await members('Brisbane');
    const events = [
      entry('phone-b', Casey, 'user-b'),
      changed('member', Casey, at(LATER + 2_000), { removed: true }),
    ];
    await showMembers('Brisbane');

    await receive(
      brisbane,
      ...(order === 'the roster entry first' ? events : events.reverse()),
    );

    // Still a member, and listed where the stamp of the removal puts him.
    await expectMembers([YOU, 'Blake', 'Casey, Joined', 'Add Member']);
    expect(
      (await groupNamed('Brisbane')).members.map(({ name }) => name),
    ).toEqual(['Taylor', 'Blake', 'Casey']);
  },
);

test('[GROUPS-24.4] marks a member who has a phone as joined, and nobody else', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  const { Casey } = await members('Brisbane');
  await receive(brisbane, entry('phone-b', Casey, 'user-b'));

  await showMembers('Brisbane');

  await expectMembers([YOU, 'Casey, Joined', 'Blake', 'Add Member']);
});

test('[GROUPS-25.4] offers Rename and Remove from Group for a member another phone represents', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  const { Casey } = await members('Brisbane');
  await receive(brisbane, entry('phone-b', Casey, 'user-b'));
  await showMembers('Brisbane');
  await expectMembers([YOU, 'Casey, Joined', 'Blake', 'Add Member']);

  const menu = await tapMember('Casey, Joined');

  expect(menu).toMatchObject({
    title: 'Casey',
    message:
      'If removed, their historical payments and shares will be retained.',
    items: ['Rename', 'Remove from Group', 'Cancel'],
    destructive: ['Remove from Group'],
    cancel: 'Cancel',
  });
});

test('[GROUPS-25.4] offers Leave Group in your own menu once the group is a shared ledger', async () => {
  await startShared();
  await showMembers('Brisbane');

  const menu = await tapMember(YOU);

  expect(menu).toMatchObject({
    title: 'Taylor',
    items: ['Rename', 'Leave Group', 'Cancel'],
    destructive: ['Leave Group'],
    cancel: 'Cancel',
  });
  expect(menu?.message ?? '').toBe('');
});

// A device that left represents nobody (ADR-0041)

/** The event by which a device's roster entry comes to represent nobody. */
const leaves = (device: string, stamp = at(LATER + 3_000)) =>
  changed('device' as SyncEvent['type'], device, stamp, { member: null });

test('[SYNC-36.4] keeps a member in the group whom another phone represents with your own user ID', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  const { Casey } = await members('Brisbane');
  const you = (await userIds()).Taylor!;
  await showMembers('Brisbane');

  await receive(
    brisbane,
    entry('phone-b', Casey, you),
    changed('member', Casey, at(LATER + 2_000), { removed: true }),
  );

  // No user ID is stored for him here, and he is a member all the same.
  expect((await userIds()).Casey).toBeNull();
  await expectMembers([YOU, 'Blake', 'Casey', 'Add Member']);
  expect(
    (await groupNamed('Brisbane')).members.map(({ name }) => name),
  ).toEqual(['Taylor', 'Blake', 'Casey']);
});

test.each(['the removal first', 'the departure first'])(
  '[SYNC-36.4] makes a removed member a former member once the phone that represented them represents nobody, with %s',
  async (order) => {
    await startShared();
    const brisbane = await groupId('Brisbane');
    const { Casey } = await members('Brisbane');
    await receive(brisbane, entry('phone-b', Casey, 'user-b'));
    const events = [
      changed('member', Casey, at(LATER + 2_000), { removed: true }),
      leaves('phone-b'),
    ];
    await showMembers('Brisbane');

    await receive(
      brisbane,
      ...(order === 'the removal first' ? events : events.reverse()),
    );

    await expectMembers([YOU, 'Blake', 'Add Member']);
    expect(
      (await groupNamed('Brisbane')).members.map(({ name }) => name),
    ).toEqual(['Taylor', 'Blake']);
    expect(Object.keys(await members('Brisbane'))).toContain('Casey');
  },
);

test('[SYNC-36.4] keeps a removed member in the group while another phone still represents them', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  const { Casey } = await members('Brisbane');
  await showMembers('Brisbane');

  await receive(
    brisbane,
    entry('phone-b', Casey, 'user-b'),
    entry('phone-c', Casey, 'user-c', at(LATER + 1_500, 0, 'phone-c')),
    changed('member', Casey, at(LATER + 2_000), { removed: true }),
    leaves('phone-b'),
  );

  await expectMembers([YOU, 'Blake', 'Casey, Joined', 'Add Member']);
});

test('[SYNC-36.4] leaves a member in the group whose phone left when nothing removed the member', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  const { Casey } = await members('Brisbane');
  await showMembers('Brisbane');

  await receive(brisbane, entry('phone-b', Casey, 'user-b'), leaves('phone-b'));

  await expectMembers([YOU, 'Casey', 'Blake', 'Add Member']);
  expect((await userIds()).Casey).toBeNull();
});

test('[SYNC-251.2] takes the user ID from a member whose roster entry comes to represent nobody, and gives it to the member the entry names next', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  const { Casey, Blake } = await members('Brisbane');
  await receive(brisbane, entry('phone-b', Casey, 'user-b'));
  await showMembers('Brisbane');
  await expectMembers([YOU, 'Casey, Joined', 'Blake', 'Add Member']);

  await receive(brisbane, leaves('phone-b'));

  await expectMembers([YOU, 'Casey', 'Blake', 'Add Member']);
  expect((await userIds()).Casey).toBeNull();

  await receive(
    brisbane,
    changed('device' as SyncEvent['type'], 'phone-b', at(LATER + 4_000), {
      member: { memberId: Blake, userId: 'user-b', boxKey: BOX_KEY },
    }),
  );

  await expectMembers([YOU, 'Casey', 'Blake, Joined', 'Add Member']);
  expect(await userIds()).toMatchObject({ Casey: null, Blake: 'user-b' });
});

test('[SYNC-251.2] leaves you as you when your own roster entry comes to represent nobody', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  const { Taylor } = await members('Brisbane');
  const you = (await userIds()).Taylor!;
  await receive(
    brisbane,
    entry('phone-a', Taylor, you, at(LATER + 1_000, 0, 'phone-a')),
  );
  await showMembers('Brisbane');

  await receive(brisbane, leaves('phone-a', at(LATER + 3_000, 0, 'phone-b')));

  await expectMembers([YOU, 'Casey', 'Blake', 'Add Member']);
  expect((await userIds()).Taylor).toBe(you);
});
