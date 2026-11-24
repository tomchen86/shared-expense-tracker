import { fireEvent, waitFor } from '@testing-library/react-native';
import {
  menuOptions,
  openNewExpense,
  restart,
  storedExpenses,
} from './ledger-expense-app';
import { card, linesIn, shownInOrder } from './ledger-expense-list-app';
import {
  addGroupExpense,
  addToGroup,
  archiveGroup,
  chooseGroup,
  groupCardTitles,
} from './ledger-group-expense-app';
import { expectCards } from './ledger-trash-app';
import { cardNames } from './groups-app';
import {
  addBackAlert,
  alertsShown,
  expectMembers,
  goBackFrom,
  memberField,
  openGroup,
  openMemberField,
  pressReturn,
  removeMember,
  screenOf,
} from './group-details-app';
import {
  archivedCardNames,
  openArchivedGroup,
  openArchivedGroups,
} from './group-archive-app';
import { navigationBarTitles, tab, tapTab } from './shell-tabs-app';
import {
  LATER,
  MEMBER_LIMIT_NOTE,
  MINUTE,
  YOU,
  at,
  categoryOf,
  changed,
  created,
  eachTestGetsAPhone,
  groupId,
  groupNamed,
  leaveMembers,
  members,
  receive,
  setClock,
  showMembers,
  startShared,
} from './sync-app';

// Runs on iOS. Each test starts the app as the group expense tests do, with Taylor
// saved as your name and Brisbane's members Taylor, Casey and Blake unless it says
// otherwise, makes Brisbane a shared ledger at 2026-10-30T04:00:00Z with phone-a as
// this phone's device ID, and leaves the clock a minute later (sync-app). It hands the
// app group and member events that other phones wrote, as its sync will: through the
// sync capability's applySyncEvents, on the app's own database connection.

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

eachTestGetsAPhone('sync-group-apply-');

/** The IDs of members that other phones add. */
const DANA = 'c0000000-0000-4000-8000-000000000001';
const BOB = 'c0000000-0000-4000-8000-000000000002';
const ZED = 'c0000000-0000-4000-8000-000000000003';
const LUNCH = 'b0000000-0000-4000-8000-000000000001';

/** A member's first event. */
const memberCreated = (id: string, name: string, stamp = at(LATER)) =>
  created('member', id, stamp, { name, removed: false });

/** `count` member names: Member 1, Member 2, and so on. */
const names = (count: number) =>
  Array.from({ length: count }, (_, index) => `Member ${index + 1}`);

/** Adds Brisbane's Dinner for 100.01: Casey pays, split between Blake, Taylor and Casey in that order. */
const addDinner = () =>
  addGroupExpense({
    group: 'Brisbane',
    payer: 'Casey',
    sharers: ['Blake', YOU, 'Casey'],
  });

// The group

test("[SYNC-36.3] shows a shared ledger's name, changed on another phone, on its screen that is open, on its card and on its expenses", async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  await addDinner();
  await tapTab('Groups');
  await openGroup('Brisbane');

  await receive(
    brisbane,
    changed('group', brisbane, at(LATER + 1000), { name: 'Brissie' }),
  );

  await waitFor(() =>
    expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups', 'Brissie']),
  );
  expect((await groupNamed('Brissie')).id).toBe(brisbane);
  // The Groups root shows its cards again once the group's screen is gone.
  await goBackFrom('Brissie');
  await waitFor(() => expect(cardNames()).toEqual(['Open Brissie']));
  await tapTab('Expenses');
  const shown = ['Dinner', '$33.34', 'Food & Dining', 'Brissie'];
  await waitFor(() =>
    expect(shownInOrder(linesIn(card('Dinner')), shown)).toEqual(shown),
  );
});

// Members

test('[SYNC-36.3] lists a member another phone added, with no user ID, in Members that is open and in the expense form', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  await showMembers('Brisbane');

  await receive(brisbane, memberCreated(DANA, 'Dana'));

  await expectMembers([YOU, 'Casey', 'Blake', 'Dana', 'Add Member']);
  expect((await groupNamed('Brisbane')).members.at(-1)).toEqual({
    id: DANA,
    userId: null,
    name: 'Dana',
  });
  await leaveMembers('Brisbane');
  await tapTab('Expenses');
  await openNewExpense();
  await chooseGroup('Brisbane');
  expect(menuOptions('Paid by').map(([name]) => name)).toEqual([
    YOU,
    'Casey',
    'Blake',
    'Dana',
  ]);
});

test('[SYNC-36.3] renames a member another phone renamed, and you too, still as you', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  const ids = await members('Brisbane');
  const you = (await groupNamed('Brisbane')).members[0];

  await receive(
    brisbane,
    changed('member', ids.Casey, at(LATER + 1000), { name: 'Casey Lee' }),
    changed('member', ids.Taylor, at(LATER + 2000), { name: 'Sam' }),
  );

  await showMembers('Brisbane');
  await expectMembers(['Sam (You)', 'Casey Lee', 'Blake', 'Add Member']);
  expect((await groupNamed('Brisbane')).members[0]).toEqual({
    ...you,
    name: 'Sam',
  });
});

test('[SYNC-36.3] makes a member another phone removed a former member, with their payments and shares kept, and a member again once that phone adds them back', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  const ids = await members('Brisbane');
  await addDinner();
  const stored = await storedExpenses();
  await showMembers('Brisbane');

  await receive(
    brisbane,
    changed('member', ids.Blake, at(LATER + 1000), { removed: true }),
  );

  await expectMembers([YOU, 'Casey', 'Add Member']);
  expect((await groupNamed('Brisbane')).members.map(({ id }) => id)).toEqual([
    ids.Taylor,
    ids.Casey,
  ]);
  expect((await members('Brisbane')).Blake).toBe(ids.Blake);
  expect(await storedExpenses()).toEqual(stored);

  await receive(
    brisbane,
    changed('member', ids.Blake, at(LATER + 2000), { removed: false }),
  );

  await expectMembers([YOU, 'Casey', 'Blake', 'Add Member']);
});

test('[SYNC-36.3] keeps you a member on this phone when another phone removes your member, placed by that event', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  const ids = await members('Brisbane');
  const you = (await groupNamed('Brisbane')).members[0];
  await showMembers('Brisbane');

  await receive(
    brisbane,
    changed('member', ids.Taylor, at(LATER + 1000), { removed: true }),
  );

  await expectMembers(['Casey', 'Blake', YOU, 'Add Member']);
  expect((await groupNamed('Brisbane')).members.at(-1)).toEqual(you);
});

test('[SYNC-36.3] lists nothing of a member until both of their units have arrived', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  await showMembers('Brisbane');

  await receive(
    brisbane,
    changed('member', DANA, at(LATER + 1000), { name: 'Dana D.' }),
  );
  await expectMembers([YOU, 'Casey', 'Blake', 'Add Member']);
  expect(Object.keys(await members('Brisbane'))).toEqual([
    'Taylor',
    'Casey',
    'Blake',
  ]);

  await receive(brisbane, memberCreated(DANA, 'Dana'));
  await expectMembers([YOU, 'Casey', 'Blake', 'Dana D.', 'Add Member']);
});

test('[SYNC-36.3] still lists the members as merged after a restart', async () => {
  const app = await startShared();
  const brisbane = await groupId('Brisbane');
  const ids = await members('Brisbane');
  await receive(
    brisbane,
    memberCreated(DANA, 'Dana'),
    changed('member', ids.Casey, at(LATER + 1000), { removed: true }),
  );

  await restart(app);

  await showMembers('Brisbane');
  await expectMembers([YOU, 'Blake', 'Dana', 'Add Member']);
});

// The order of members

test('[SYNC-37.1] lists a member another phone added earlier before one added here later, though it arrived afterwards', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  setClock(LATER + 2 * MINUTE);
  await addToGroup('Brisbane', 'Evan');

  await receive(brisbane, memberCreated(DANA, 'Dana', at(LATER + MINUTE)));

  await showMembers('Brisbane');
  await expectMembers([YOU, 'Casey', 'Blake', 'Dana', 'Evan', 'Add Member']);
});

test('[SYNC-37.1] keeps both members when two phones add one in the same millisecond, even under one name, the lower device ID first', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  await addToGroup('Brisbane', 'Bob');
  const here = (await members('Brisbane')).Bob;

  await receive(
    brisbane,
    memberCreated(BOB, 'Bob', at(LATER, 0, 'phone-b')),
    memberCreated(ZED, 'Zed', at(LATER, 0, 'phone-0')),
  );

  await showMembers('Brisbane');
  await expectMembers([
    YOU,
    'Casey',
    'Blake',
    'Zed',
    'Bob',
    'Bob',
    'Add Member',
  ]);
  expect(
    (await groupNamed('Brisbane')).members.slice(3).map(({ id }) => id),
  ).toEqual([ZED, here, BOB]);
});

test('[SYNC-37.1] moves a member another phone removed and added back to the end, and leaves one it renamed in place', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  const ids = await members('Brisbane');

  await receive(
    brisbane,
    changed('member', ids.Casey, at(LATER + 1000), { removed: true }),
    changed('member', ids.Casey, at(LATER + 2000), { removed: false }),
    changed('member', ids.Taylor, at(LATER + 3000), { name: 'Sam' }),
  );

  await showMembers('Brisbane');
  await expectMembers(['Sam (You)', 'Blake', 'Casey', 'Add Member']);
});

test('[SYNC-37.1] asks about the former member whose removal has the latest stamp, not the one whose removal arrived last', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  const ids = await members('Brisbane');
  await receive(
    brisbane,
    changed('member', ids.Blake, at(LATER + 2000), { removed: true }),
    changed('member', ids.Casey, at(LATER + 500), { name: 'BLAKE' }),
    changed('member', ids.Casey, at(LATER + 1000), { removed: true }),
  );
  await showMembers('Brisbane');
  await expectMembers([YOU, 'Add Member']);
  await openMemberField();
  await fireEvent.changeText(memberField()!, 'blake');

  await pressReturn(memberField()!);

  expect(alertsShown().at(-1)).toEqual(addBackAlert('Blake'));
});

// Archived shared ledgers

test('[SYNC-35.1] applies events to an archived shared ledger, which stays archived on this phone', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  const ids = await members('Brisbane');
  await archiveGroup('Brisbane');

  await receive(
    brisbane,
    changed('group', brisbane, at(LATER + 1000), { name: 'Brissie' }),
    created('expense', LUNCH, at(LATER + 2000), {
      title: 'Lunch',
      date: '2026-10-30',
      note: null,
      category: await categoryOf('Brisbane', 'Food & Dining'),
      money: {
        amountMinor: 3000,
        currency: 'USD',
        payments: [{ participant: ids.Casey, amountMinor: 3000 }],
        shares: [{ participant: ids.Taylor, amountMinor: 3000 }],
      },
      trashed: false,
    }),
  );

  expect((await groupNamed('Brissie')).archived).toBe(true);
  expect(cardNames()).toEqual([]);
  await tapTab('Expenses');
  await expectCards(['Lunch']);
  await openArchivedGroups();
  await waitFor(() => expect(archivedCardNames()).toEqual(['Open Brissie']));
  await openArchivedGroup('Brissie');
  await waitFor(() => expect(groupCardTitles('Brissie')).toEqual(['Lunch']));
});

// Other groups

test("[SYNC-32.1] leaves another group's member as they are when a shared ledger's event names their ID", async () => {
  await startShared({ Brisbane: ['Casey', 'Blake'], Tokyo: ['Dana'] });
  const brisbane = await groupId('Brisbane');
  const dana = (await members('Tokyo')).Dana;
  const before = [await groupNamed('Brisbane'), await groupNamed('Tokyo')];

  await receive(
    brisbane,
    changed('member', dana, at(LATER), { name: 'Hacked' }),
    changed('member', dana, at(LATER, 1), { removed: true }),
    memberCreated(dana, 'Dana', at(LATER, 2)),
  );

  expect([await groupNamed('Brisbane'), await groupNamed('Tokyo')]).toEqual(
    before,
  );
});

// The limit of 20 members

test('[GROUPS-105.1] keeps every member when another phone takes a shared ledger past 20, and offers Add Member only once it has fewer than 20 again', async () => {
  await startShared({ Brisbane: names(19) });
  const brisbane = await groupId('Brisbane');
  await showMembers('Brisbane');

  await receive(brisbane, memberCreated(DANA, 'Dana'));

  await expectMembers([YOU, ...names(19), 'Dana']);
  expect(linesIn(screenOf('Members')).at(-1)).toBe(MEMBER_LIMIT_NOTE);

  await removeMember('Member 1');
  await expectMembers([YOU, ...names(19).slice(1), 'Dana']);
  expect(linesIn(screenOf('Members')).at(-1)).toBe(MEMBER_LIMIT_NOTE);

  await removeMember('Member 2');
  await expectMembers([YOU, ...names(19).slice(2), 'Dana', 'Add Member']);
  expect(linesIn(screenOf('Members'))).not.toContain(MEMBER_LIMIT_NOTE);
});

test('[GROUPS-105.1] [GROUPS-29.2] closes a name field that holds a name when another phone adds the 20th member, and opens an empty one later', async () => {
  await startShared({ Brisbane: names(18) });
  const brisbane = await groupId('Brisbane');
  await showMembers('Brisbane');
  await openMemberField();
  await fireEvent.changeText(memberField()!, 'Tina');

  await receive(brisbane, memberCreated(DANA, 'Dana'));

  await expectMembers([YOU, ...names(18), 'Dana']);
  expect(memberField()).toBeUndefined();
  expect(linesIn(screenOf('Members')).at(-1)).toBe(MEMBER_LIMIT_NOTE);

  await removeMember('Member 1');
  await expectMembers([YOU, ...names(18).slice(1), 'Dana', 'Add Member']);
  await openMemberField();

  expect(memberField()!.props.value ?? '').toBe('');
});
