import { waitFor } from '@testing-library/react-native';
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

test('[SYNC-251.1] gives a member the user ID of the phone that represents them, in Members that is open', async () => {
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
  '[SYNC-251.1] gives a new member the user ID of their roster entry, with %s',
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
  '[SYNC-251.1] follows the roster entry with the later stamp when two represent one member, with %s',
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

test('[SYNC-251.1] leaves you as you when your own roster entry arrives', async () => {
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

test('[SYNC-251.1] still has the user ID after a restart', async () => {
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

test('[SYNC-251.1] keeps the roster of each shared ledger to its own members', async () => {
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
  '[SYNC-36.3] keeps a member who has a phone in the group when another phone removes them, with %s',
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

test('[GROUPS-25.3] offers only Rename for a member who has a phone', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  const { Casey } = await members('Brisbane');
  await receive(brisbane, entry('phone-b', Casey, 'user-b'));
  await showMembers('Brisbane');
  await waitFor(() =>
    expectMembers([YOU, 'Casey, Joined', 'Blake', 'Add Member']),
  );

  const menu = await tapMember('Casey, Joined');

  expect(menu).toMatchObject({
    title: 'Casey',
    items: ['Rename', 'Cancel'],
    destructive: [],
    cancel: 'Cancel',
  });
  expect(menu?.message ?? '').toBe('');
});
