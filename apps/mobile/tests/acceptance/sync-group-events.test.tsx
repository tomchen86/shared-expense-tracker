import { fireEvent, waitFor } from '@testing-library/react-native';
import { linesIn } from './ledger-expense-list-app';
import {
  addGroupExpense,
  addToGroup,
  archiveGroup,
  removeFromGroup,
  renameInGroup,
  restoreGroup,
  startWithGroups,
} from './ledger-group-expense-app';
import { deleteByAction, restoreFromTrash } from './ledger-trash-app';
import { createGroup } from './groups-app';
import {
  ADD_FAILED,
  alertsShown,
  expectClosed,
  expectMembers,
  groupNameField,
  isOpen,
  memberField,
  memberNameField,
  membersShown,
  openGroup,
  openMemberField,
  openRenameGroup,
  openRenameMember,
  pressAlertButton,
  pressOnBar,
  pressReturn,
  removeMember,
  screenOf,
} from './group-details-app';
import { allowWrites, failWritesAfter } from './shell-appearance-app';
import { tapTab } from './shell-tabs-app';
import {
  LATER,
  MEMBER_LIMIT_NOTE,
  NAME_TOO_LONG,
  SHARED_STAMP,
  YOU,
  eachTestGetsAPhone,
  eventsOf,
  everything,
  expenseTitled,
  groupId,
  groupNamed,
  leaveMembers,
  members,
  renameGroupTo,
  setClock,
  share,
  showMembers,
  stamped,
  startShared,
  unsent,
} from './sync-app';

// Runs on iOS. Each test starts the app as the group expense tests do, with Taylor
// saved as your name and Brisbane's members Taylor, Casey and Blake unless it says
// otherwise, makes Brisbane a shared ledger at 2026-10-30T04:00:00Z with phone-a as
// this phone's device ID, and leaves the clock a minute later (sync-app). It renames
// the group and changes its members as a person would, in Rename Group and Members,
// and reads the events the phone wrote for upload through the sync capability's
// listUnsentSyncEvents.

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

eachTestGetsAPhone('sync-groups-');

/** An event that changes units of a member. */
const memberChanged = (
  id: string,
  stamp: object,
  units: Record<string, { value: unknown; base?: object }>,
) => ({ version: 1, stamp, type: 'member', id, units });

/** `count` member names: Member 1, Member 2, and so on. */
const names = (count: number) =>
  Array.from({ length: count }, (_, index) => `Member ${index + 1}`);

/** Renames you in the group named `group`, where Members lists you as Taylor (You). */
async function renameYouTo(group: string, to: string) {
  await showMembers(group);
  await openRenameMember(YOU, 'Taylor');
  await fireEvent.changeText(memberNameField(), to);
  await pressOnBar('Rename Member', 'Save');
  await expectClosed('Rename Member');
  await waitFor(() => expect(membersShown()).toContain(`${to} (You)`));
  await leaveMembers(group);
}

// The group

test("[SYNC-33.1] writes an event that changes the group's name when a shared ledger is renamed, with the stamp it replaces as its base", async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');

  const events = await eventsOf(async () => {
    await renameGroupTo('Brisbane', ' Brissie ');
    await renameGroupTo('Brissie', 'Brisbane 2026');
  });

  expect(events).toEqual([
    {
      version: 1,
      stamp: stamped(0),
      type: 'group',
      id: brisbane,
      units: { name: { value: 'Brissie', base: SHARED_STAMP } },
    },
    {
      version: 1,
      stamp: stamped(1),
      type: 'group',
      id: brisbane,
      units: { name: { value: 'Brisbane 2026', base: stamped(0) } },
    },
  ]);
});

// Members

test('[SYNC-34.1] writes a first event with the name, not removed and no base, when a member is added', async () => {
  await startShared();

  const events = await eventsOf(() => addToGroup('Brisbane', 'Dana'));

  expect(events).toEqual([
    memberChanged((await members('Brisbane')).Dana, stamped(0), {
      name: { value: 'Dana' },
      removed: { value: false },
    }),
  ]);
});

test('[SYNC-34.1] writes only the name when a member is renamed, yours too', async () => {
  await startShared();
  const ids = await members('Brisbane');

  const events = await eventsOf(async () => {
    await renameInGroup('Brisbane', 'Casey', ' Casey Lee ');
    await renameYouTo('Brisbane', 'Sam');
  });

  expect(events).toEqual([
    memberChanged(ids.Casey, stamped(0), {
      name: { value: 'Casey Lee', base: SHARED_STAMP },
    }),
    memberChanged(ids.Taylor, stamped(1), {
      name: { value: 'Sam', base: SHARED_STAMP },
    }),
  ]);
});

test('[SYNC-34.1] writes only that a member is removed when they are removed, and that they are not when they are added back', async () => {
  await startShared();
  const ids = await members('Brisbane');

  const events = await eventsOf(async () => {
    await removeFromGroup('Brisbane', 'Blake');
    await addToGroup('Brisbane', 'blake');
  });

  expect(events).toEqual([
    memberChanged(ids.Blake, stamped(0), {
      removed: { value: true, base: SHARED_STAMP },
    }),
    memberChanged(ids.Blake, stamped(1), {
      removed: { value: false, base: stamped(0) },
    }),
  ]);
});

test('[SYNC-21.1] adds neither the member nor its event when a write fails, whichever it is', async () => {
  await startShared();
  await showMembers('Brisbane');
  await openMemberField();
  await fireEvent.changeText(memberField()!, 'Dana');
  const before = everything();

  let writesThrough = 0;
  for (; writesThrough < 40; writesThrough += 1) {
    const shown = alertsShown().length;
    failWritesAfter(writesThrough);
    await pressReturn(memberField()!);
    if (alertsShown().length === shown) break;
    expect(alertsShown().at(-1)).toEqual(ADD_FAILED);
    expect(everything()).toEqual(before);
  }
  allowWrites();

  expect(writesThrough).toBeGreaterThan(1);
  expect((await unsent()).map((event) => event.content)).toEqual([
    memberChanged((await members('Brisbane')).Dana, stamped(0), {
      name: { value: 'Dana' },
      removed: { value: false },
    }),
  ]);
});

// What writes no event

test('[SYNC-26.1] writes no event for a group that is not a shared ledger, its members, or a new group', async () => {
  await startShared({ Brisbane: ['Casey', 'Blake'], Tokyo: ['Dana'] });

  await renameGroupTo('Tokyo', 'Kyoto');
  await addToGroup('Kyoto', 'Evan');
  await renameInGroup('Kyoto', 'Dana', 'Dana D.');
  await removeFromGroup('Kyoto', 'Evan');
  await tapTab('Groups');
  await createGroup('Osaka');

  expect((await groupNamed('Kyoto')).members.map(({ name }) => name)).toEqual([
    'Taylor',
    'Dana D.',
  ]);
  expect(await unsent()).toEqual([]);
});

test('[SYNC-35.1] writes no event when a shared ledger is archived or restored', async () => {
  await startShared();

  await archiveGroup('Brisbane');
  expect((await groupNamed('Brisbane')).archived).toBe(true);
  await restoreGroup('Brisbane');

  expect((await groupNamed('Brisbane')).archived).toBe(false);
  expect(await unsent()).toEqual([]);
});

test('[SYNC-35.1] still writes the event when an expense of an archived shared ledger is restored from Trash', async () => {
  await startShared();
  await addGroupExpense({
    group: 'Brisbane',
    payer: 'Casey',
    sharers: [YOU, 'Casey'],
  });
  const dinner = await expenseTitled('Dinner');
  await deleteByAction('Dinner');
  await archiveGroup('Brisbane');

  const events = await eventsOf(() => restoreFromTrash('Dinner'));

  expect(events).toEqual([
    {
      version: 1,
      stamp: stamped(2),
      type: 'expense',
      id: dinner.id,
      units: { trashed: { value: false, base: stamped(1) } },
    },
  ]);
});

// Names too long for an event

test("[SYNC-27.1] keeps a shared ledger's name when the new one would write too large an event, and says why", async () => {
  await startShared();
  await tapTab('Groups');
  await openGroup('Brisbane');
  await openRenameGroup('Brisbane');
  await fireEvent.changeText(groupNameField(), 'a'.repeat(70_000));

  await pressOnBar('Rename Group', 'Save');

  await waitFor(() =>
    expect(alertsShown()).toEqual([['Unable to Rename Group', NAME_TOO_LONG]]),
  );
  expect(isOpen('Rename Group')).toBe(true);
  expect(groupNameField().props.value).toHaveLength(70_000);
  expect((await groupNamed('Brisbane')).name).toBe('Brisbane');
  expect(await unsent()).toEqual([]);
});

test('[SYNC-27.1] adds no member whose name would write too large an event, and says why', async () => {
  await startShared();
  await showMembers('Brisbane');
  await openMemberField();
  await fireEvent.changeText(memberField()!, '帳'.repeat(22_000));

  await pressReturn(memberField()!);

  await waitFor(() =>
    expect(alertsShown()).toEqual([['Unable to Add Member', NAME_TOO_LONG]]),
  );
  expect(memberField()?.props.value).toHaveLength(22_000);
  expect(Object.keys(await members('Brisbane'))).toEqual([
    'Taylor',
    'Casey',
    'Blake',
  ]);
  expect(await unsent()).toEqual([]);
});

test("[SYNC-27.1] keeps a member's name when the new one would write too large an event, and says why", async () => {
  await startShared();
  await showMembers('Brisbane');
  await openRenameMember('Casey');
  await fireEvent.changeText(memberNameField(), 'a'.repeat(70_000));

  await pressOnBar('Rename Member', 'Save');

  await waitFor(() =>
    expect(alertsShown()).toEqual([['Unable to Rename Member', NAME_TOO_LONG]]),
  );
  expect(isOpen('Rename Member')).toBe(true);
  expect(memberNameField().props.value).toHaveLength(70_000);
  expect(Object.keys(await members('Brisbane'))).toContain('Casey');
  expect(await unsent()).toEqual([]);
});

test('[SYNC-27.1] [GROUPS-17.2] puts no limit on the names of a group that is not a shared ledger', async () => {
  await startShared({ Brisbane: ['Casey', 'Blake'], Tokyo: [] });
  const long = 'a'.repeat(70_000);

  await renameGroupTo('Tokyo', long);
  await addToGroup(long, long);

  expect(alertsShown()).toEqual([]);
  const tokyo = await groupNamed(long);
  expect(tokyo.members.map(({ name }) => name)).toEqual(['Taylor', long]);
});

// The limit of 20 members

test('[GROUPS-105.1] shows no Add Member, and says why, while a shared ledger has 20 members', async () => {
  await startShared({ Brisbane: names(19) });

  await showMembers('Brisbane');

  await expectMembers([YOU, ...names(19)]);
  expect(linesIn(screenOf('Members')).at(-1)).toBe(MEMBER_LIMIT_NOTE);
  expect(memberField()).toBeUndefined();
});

test('[GROUPS-105.1] closes the name field once the 20th member is added, and offers Add Member again once one is removed', async () => {
  await startShared({ Brisbane: names(18) });
  await showMembers('Brisbane');
  await expectMembers([YOU, ...names(18), 'Add Member']);
  expect(linesIn(screenOf('Members'))).not.toContain(MEMBER_LIMIT_NOTE);
  await openMemberField();
  await fireEvent.changeText(memberField()!, 'Tina');

  await pressReturn(memberField()!);

  await expectMembers([YOU, ...names(18), 'Tina']);
  await waitFor(() => expect(memberField()).toBeUndefined());
  expect(linesIn(screenOf('Members')).at(-1)).toBe(MEMBER_LIMIT_NOTE);

  await removeMember('Member 1');

  await expectMembers([YOU, ...names(18).slice(1), 'Tina', 'Add Member']);
  expect(linesIn(screenOf('Members'))).not.toContain(MEMBER_LIMIT_NOTE);
});

test('[GROUPS-105.1] closes the name field when the 20th member is a former member added back', async () => {
  await startWithGroups({ Brisbane: names(19) });
  await removeFromGroup('Brisbane', 'Member 19');
  await share('Brisbane');
  setClock(LATER);
  await showMembers('Brisbane');
  await expectMembers([YOU, ...names(18), 'Add Member']);
  await openMemberField();
  await fireEvent.changeText(memberField()!, 'member 19');

  await pressReturn(memberField()!);
  await pressAlertButton('Add Back');

  await expectMembers([YOU, ...names(18), 'Member 19']);
  await waitFor(() => expect(memberField()).toBeUndefined());
  expect(linesIn(screenOf('Members')).at(-1)).toBe(MEMBER_LIMIT_NOTE);
});

test('[GROUPS-105.1] counts the members of a shared ledger, not its former members', async () => {
  await startWithGroups({ Brisbane: names(20) });
  await removeFromGroup('Brisbane', 'Member 1');
  await removeFromGroup('Brisbane', 'Member 2');
  await share('Brisbane');
  setClock(LATER);

  await showMembers('Brisbane');

  await expectMembers([YOU, ...names(20).slice(2), 'Add Member']);
  expect(linesIn(screenOf('Members'))).not.toContain(MEMBER_LIMIT_NOTE);
});
