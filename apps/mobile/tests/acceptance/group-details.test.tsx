import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { AccessibilityInfo, ActionSheetIOS, Alert } from 'react-native';
import {
  act,
  fireEvent,
  screen,
  userEvent,
  waitFor,
  within,
} from '@testing-library/react-native';
import type { Database } from '../../src/storage';
import {
  navigationBarTitles,
  selectedTab,
  tab,
  tapTab,
} from './shell-tabs-app';
import {
  cardNames,
  createGroup,
  groupsRoot,
  inTreeOrder,
  localData,
  readIdentity,
  saveName,
  startGroupsApp,
  storedGroups,
} from './groups-app';
import {
  allowWrites,
  colorsInBoth,
  failWrites,
  failWritesAfter,
  fakePhoneAppearance,
  fakeReduceTransparency,
  fixedColors,
  holdWrites,
  settle,
  switchPhoneTo,
  testDatabase,
  textsWithoutColor,
  translucentViews,
} from './shell-appearance-app';
import {
  ADD_FAILED,
  ALREADY_EXISTS,
  NOT_FOUND,
  NO_EXPENSES,
  REMOVE_FAILED,
  RENAME_GROUP_FAILED,
  RENAME_MEMBER_FAILED,
  RETAINED,
  SETTINGS_FAILED,
  addBackAlert,
  addMember,
  alertsShown,
  barAction,
  barItems,
  chooseForMember,
  expectClosed,
  expectMembers,
  expectOpen,
  goBackFrom,
  groupNameField,
  isEnabled,
  isOpen,
  lastAlertButtons,
  memberNameField,
  membersButton,
  membersShown,
  openAddMember,
  openGroup,
  openMembers,
  openRenameGroup,
  openRenameMember,
  openWithMembers,
  pressAlertButton,
  pressOnBar,
  pressReturn,
  refusesSwipeDown,
  removeMember,
  renameMember,
  screenOf,
  storedMember,
  storedMemberNames,
  storedMembers,
  swipeDown,
  tapMember,
  textsOn,
} from './group-details-app';

// Runs on iOS; group-details-android.test.tsx checks what Android shows differently.
// The phone database is a file each test chooses (ADR-0006), so a test can restart
// the app on the same data, and hold or fail its writes as a slow or full disk would.

let mockOpen: () => Promise<Database>;

jest.mock('../../src/storage/expo', () => ({
  openPhoneDatabase: () => mockOpen(),
}));

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** The ways iOS presents a screen as a sheet that rises from the bottom. */
const SHEETS = ['formSheet', 'pageSheet', 'modal'];
// Compares the field's text as typed, spaces included.
const AS_TYPED = { normalizer: (text: string) => text };
/** A version 4 UUID that no group has. */
const NO_GROUP = '/groups/00000000-0000-4000-8000-000000000000';

let directory: string;
let file: string;

beforeEach(() => {
  jest.clearAllMocks();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'group-details-'));
  file = path.join(directory, 'app.db');
  mockOpen = async () => testDatabase(file);
  allowWrites();
  fakePhoneAppearance('light');
  fakeReduceTransparency(false);
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  jest
    .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
    .mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});

/** Starts the app on Groups with `name` saved as your name. */
async function startWithName(name = 'Taylor') {
  const app = await startGroupsApp();
  await saveName(name);
  return app;
}

/** Starts the app with your name saved and Brisbane's Members open, with `members` added in order. */
async function startInMembers(members: string[] = []) {
  const app = await startWithName();
  await createGroup('Brisbane');
  await openWithMembers('Brisbane', members);
  return app;
}

/** Restarts the app on the same data, on the Groups root. */
function restart(app: { unmount: () => void }) {
  app.unmount();
  return startGroupsApp();
}

const actionSheets = () =>
  jest.mocked(ActionSheetIOS.showActionSheetWithOptions).mock.calls;

const announcements = () =>
  [
    ...jest.mocked(AccessibilityInfo.announceForAccessibility).mock.calls,
    ...jest.mocked(AccessibilityInfo.announceForAccessibilityWithOptions).mock
      .calls,
  ].map(([message]) => message);

const clearAlerts = () => jest.mocked(Alert.alert).mockClear();

/** Types `name` in a name field and presses the form's confirm button. */
async function submit(form: string, confirm: string, name: string) {
  const field = form === 'Rename Group' ? groupNameField() : memberNameField();
  fireEvent.changeText(field, name);
  await pressOnBar(form, confirm);
}

// The group's screen

test('[GROUPS-20.1] says a new group has no expenses on its screen', async () => {
  await startWithName();
  await createGroup('Brisbane');

  await openGroup('Brisbane');

  await waitFor(() => expect(textsOn('Brisbane')).toContain(NO_EXPENSES));
});

test('[GROUPS-21.1] shows only Group not found., titled Group Details, for an ID that is no group', async () => {
  await startGroupsApp(NO_GROUP);

  await expectOpen('Group Details');
  expect(selectedTab()).toBe('Groups');
  await waitFor(() => expect(textsOn('Group Details')).toEqual([NOT_FOUND]));
  expect(barItems('Group Details').right).toEqual([]);
});

test("[GROUPS-21.1] never shows Group not found. while an existing group's screen opens", async () => {
  await startWithName();
  await createGroup('Brisbane');

  fireEvent.press(
    within(groupsRoot()).getByRole('button', { name: 'Open Brisbane' }),
  );

  expect(screen.queryByText(NOT_FOUND)).toBeNull();
  await waitFor(() => expect(textsOn('Brisbane')).toContain(NO_EXPENSES));
  expect(screen.queryByText(NOT_FOUND)).toBeNull();
});

test('[GROUPS-21.1] never shows Group not found. while a group opened at its URL loads', async () => {
  const first = await startWithName();
  await createGroup('Brisbane');
  const [brisbane] = await storedGroups(file);
  first.unmount();

  await startGroupsApp(`/groups/${brisbane.id}`);

  expect(screen.queryByText(NOT_FOUND)).toBeNull();
  await waitFor(() => expect(textsOn('Brisbane')).toContain(NO_EXPENSES));
  expect(screen.queryByText(NOT_FOUND)).toBeNull();
});

test("[GROUPS-22.1] puts a Group actions menu with Members and Rename Group in the group's title bar", async () => {
  await startWithName();
  await createGroup('Brisbane');

  await openGroup('Brisbane');

  await waitFor(() =>
    expect(barItems('Brisbane').right).toEqual([
      {
        menu: 'Group actions',
        icon: 'ellipsis.circle',
        items: ['Members', 'Rename Group'],
      },
    ]),
  );
});

// Members

test("[GROUPS-23.1] opens Members rising from the bottom over the group's screen, with only Close", async () => {
  await startWithName();
  await createGroup('Brisbane');
  await openGroup('Brisbane');

  await openMembers('Brisbane');

  expect(SHEETS).toContain(screenOf('Members').props.stackPresentation);
  expect(navigationBarTitles(tab('Groups'))).toEqual([
    'Groups',
    'Brisbane',
    'Members',
  ]);
  expect(selectedTab()).toBe('Groups');
  expect(barItems('Members')).toEqual({ left: ['Close (plain)'], right: [] });
});

test("[GROUPS-23.1] closes Members with Close, back on the group's screen", async () => {
  await startInMembers();

  await pressOnBar('Members', 'Close');

  await expectClosed('Members');
  expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups', 'Brisbane']);
});

test("[GROUPS-23.1] lets Members be swiped down, back on the group's screen", async () => {
  await startInMembers();
  expect(refusesSwipeDown(screenOf('Members'))).toBe(false);

  await swipeDown('Members');

  await expectClosed('Members');
  expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups', 'Brisbane']);
});

test("[GROUPS-24.1] lists only you, marked (You), in a new group's Members", async () => {
  await startInMembers();

  await expectMembers(['Taylor (You)', 'Add Member']);
  expect(
    within(screenOf('Members')).queryByRole('button', { name: /Taylor/ }),
  ).toBeNull();
});

test('[GROUPS-24.1] lists the members in the order they joined, each other member as a button named after them, with a chevron', async () => {
  await startInMembers(['Blake', 'Casey']);

  await expectMembers(['Taylor (You)', 'Blake', 'Casey', 'Add Member']);
  for (const name of ['Blake', 'Casey'])
    expect(within(membersButton(name)).getByText('›')).toBeOnTheScreen();
});

test("[GROUPS-25.1] opens an action sheet titled with the member's name when their row is tapped", async () => {
  await startInMembers(['Blake']);

  const menu = await tapMember('Blake');

  expect(actionSheets()).toHaveLength(1);
  expect(menu).toMatchObject({
    title: 'Blake',
    message: RETAINED,
    items: ['Rename', 'Remove from Group', 'Cancel'],
    destructive: ['Remove from Group'],
    cancel: 'Cancel',
  });
  expect(alertsShown()).toEqual([]);
});

test("[GROUPS-25.1] changes nothing when Cancel is chosen in a member's menu", async () => {
  await startInMembers(['Blake']);
  const before = localData(file);

  await chooseForMember('Blake', 'Cancel');

  await expectMembers(['Taylor (You)', 'Blake', 'Add Member']);
  expect(isOpen('Rename Member')).toBe(false);
  expect(alertsShown()).toEqual([]);
  expect(localData(file)).toEqual(before);
});

test('[GROUPS-26.1] removes a member right away when Remove from Group is chosen', async () => {
  await startInMembers(['Blake', 'Casey']);

  await removeMember('Blake');

  await waitFor(() =>
    expect(membersShown()).toEqual(['Taylor (You)', 'Casey', 'Add Member']),
  );
  expect(actionSheets()).toHaveLength(1);
  expect(alertsShown()).toEqual([]);
  expect(await storedMemberNames(file, 'Brisbane')).toEqual([
    'Taylor',
    'Casey',
  ]);
});

test('[GROUPS-26.1] keeps a removed member out of the group after a restart', async () => {
  const app = await startInMembers(['Blake', 'Casey']);
  await removeMember('Blake');
  await waitFor(() => expect(membersShown()).not.toContain('Blake'));

  await restart(app);

  expect(await storedMemberNames(file, 'Brisbane')).toEqual([
    'Taylor',
    'Casey',
  ]);
  await openWithMembers('Brisbane', []);
  await expectMembers(['Taylor (You)', 'Casey', 'Add Member']);
});

test('[GROUPS-27.1] locks Members while a member is removed', async () => {
  await startInMembers(['Blake', 'Casey']);
  const writes = holdWrites();

  await removeMember('Blake');

  expect(barAction('Members', 'Close').disabled).toBe(true);
  expect(await tapMember('Casey')).toBeUndefined();
  fireEvent.press(membersButton('Add Member'));
  await settle();
  expect(isOpen('Add Member')).toBe(false);
  expect(isOpen('Members')).toBe(true);
  await writes.release();
  await settle();
  await waitFor(() =>
    expect(membersShown()).toEqual(['Taylor (You)', 'Casey', 'Add Member']),
  );
  expect(barAction('Members', 'Close').disabled).toBe(false);
});

test('[GROUPS-27.1] keeps Members from being swiped down while a member is removed', async () => {
  await startInMembers(['Blake']);
  const writes = holdWrites();

  await removeMember('Blake');

  expect(refusesSwipeDown(screenOf('Members'))).toBe(true);
  await writes.release();
  await settle();
  await waitFor(() => expect(membersShown()).not.toContain('Blake'));
  expect(refusesSwipeDown(screenOf('Members'))).toBe(false);
});

test('[GROUPS-27.1] unlocks Members once the removal fails', async () => {
  await startInMembers(['Blake', 'Casey']);
  const writes = holdWrites();
  await removeMember('Blake');

  await writes.fail();
  await settle();

  expect(barAction('Members', 'Close').disabled).toBe(false);
  expect(refusesSwipeDown(screenOf('Members'))).toBe(false);
  expect(isEnabled(membersButton('Add Member'))).toBe(true);
  expect(await tapMember('Casey')).toBeDefined();
});

test('[GROUPS-28.1] says the member could not be removed when the write fails, and keeps them', async () => {
  await startInMembers(['Blake']);
  const before = localData(file);
  failWrites();

  await removeMember('Blake');

  expect(alertsShown()).toEqual([REMOVE_FAILED]);
  await expectMembers(['Taylor (You)', 'Blake', 'Add Member']);
  expect(localData(file)).toEqual(before);
});

test('[GROUPS-28.1] leaves the local data as it was whichever write of the removal fails', async () => {
  await startInMembers(['Blake']);
  const before = localData(file);

  // Each attempt lets one more write through before the disk fills up, until
  // every write of the removal gets through.
  let writesThrough = 0;
  for (; writesThrough < 20; writesThrough += 1) {
    clearAlerts();
    failWritesAfter(writesThrough);
    await removeMember('Blake');
    if (alertsShown().length === 0) break;
    expect(alertsShown()).toEqual([REMOVE_FAILED]);
    expect(localData(file)).toEqual(before);
  }

  expect(writesThrough).toBeGreaterThan(0);
  expect(await storedMemberNames(file, 'Brisbane')).toEqual(['Taylor']);
});

test('[GROUPS-28.1] removes the member when Remove from Group is chosen again after writes recover', async () => {
  await startInMembers(['Blake']);
  failWrites();
  await removeMember('Blake');
  allowWrites();

  await removeMember('Blake');

  await waitFor(() =>
    expect(membersShown()).toEqual(['Taylor (You)', 'Add Member']),
  );
  expect(await storedMemberNames(file, 'Brisbane')).toEqual(['Taylor']);
});

// Add Member

test('[GROUPS-29.1] opens Add Member over Members with Cancel, Add and an empty name field that has the focus', async () => {
  await startInMembers();

  await openAddMember();

  expect(SHEETS).toContain(screenOf('Add Member').props.stackPresentation);
  expect(navigationBarTitles(tab('Groups'))).toEqual([
    'Groups',
    'Brisbane',
    'Members',
    'Add Member',
  ]);
  expect(barItems('Add Member')).toEqual({
    left: ['Cancel (plain)'],
    right: ['Add (prominent)'],
  });
  expect(memberNameField()).toHaveDisplayValue('', AS_TYPED);
  expect(memberNameField().props.placeholder).toBe('Enter member name');
  expect(memberNameField().props.autoFocus).toBe(true);
  expect(textsOn('Add Member')).toEqual([]);
});

test('[GROUPS-30.1] disables Add while the name is blank, and Return adds no one', async () => {
  await startInMembers();
  await openAddMember();

  expect(barAction('Add Member', 'Add').disabled).toBe(true);
  fireEvent.changeText(memberNameField(), '   ');
  expect(barAction('Add Member', 'Add').disabled).toBe(true);
  await pressReturn(memberNameField());
  expect(isOpen('Add Member')).toBe(true);
  expect(await storedMemberNames(file, 'Brisbane')).toEqual(['Taylor']);

  fireEvent.changeText(memberNameField(), 'Blake');
  expect(barAction('Add Member', 'Add').disabled).toBe(false);
});

test('[GROUPS-31.1] adds a member with the name trimmed, listed last', async () => {
  await startInMembers();
  await openAddMember();

  await submit('Add Member', 'Add', ' Blake ');

  await expectClosed('Add Member');
  await expectMembers(['Taylor (You)', 'Blake', 'Add Member']);
  expect(await storedMemberNames(file, 'Brisbane')).toEqual([
    'Taylor',
    'Blake',
  ]);
});

test('[GROUPS-31.1] adds a member when Return is pressed in the name field', async () => {
  await startInMembers(['Blake']);
  await openAddMember();
  fireEvent.changeText(memberNameField(), 'Casey');

  await pressReturn(memberNameField());

  await expectClosed('Add Member');
  await expectMembers(['Taylor (You)', 'Blake', 'Casey', 'Add Member']);
});

test('[GROUPS-31.1] adds as many members as you like, in the order they join', async () => {
  const names = Array.from({ length: 30 }, (_, index) => `Member ${index + 1}`);

  await startInMembers(names);

  expect(await storedMemberNames(file, 'Brisbane')).toEqual([
    'Taylor',
    ...names,
  ]);
}, 60_000);

test('[GROUPS-31.1] keeps a member name of 300 characters in full', async () => {
  await startInMembers();
  await openAddMember();
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

  await user.type(memberNameField(), 'a'.repeat(300));
  expect(memberNameField()).toHaveDisplayValue('a'.repeat(300), AS_TYPED);
  await pressOnBar('Add Member', 'Add');

  await expectClosed('Add Member');
  expect(await storedMemberNames(file, 'Brisbane')).toEqual([
    'Taylor',
    'a'.repeat(300),
  ]);
});

test('[GROUPS-32.1] gives a new member a new version 4 member ID and no user ID', async () => {
  await startInMembers(['Blake']);

  const [brisbane] = await storedGroups(file);
  const [you, blake] = brisbane.members;
  expect(blake.name).toBe('Blake');
  expect(blake.userId ?? null).toBeNull();
  expect(blake.id).toMatch(UUID_V4);
  const identity = await readIdentity();
  expect(
    new Set([
      blake.id,
      brisbane.id,
      you.id,
      identity.userId,
      identity.personalSpaceId,
      identity.personalParticipantId,
    ]).size,
  ).toBe(6);
});

test('[GROUPS-32.1] gives members of the same name in two groups different member IDs', async () => {
  const app = await startWithName();
  await createGroup('Brisbane');
  await createGroup('Tokyo');
  await openWithMembers('Brisbane', ['Blake']);
  await restart(app);

  await openWithMembers('Tokyo', ['Blake']);

  const brisbaneBlake = await storedMember(file, 'Brisbane', 'Blake');
  const tokyoBlake = await storedMember(file, 'Tokyo', 'Blake');
  expect(tokyoBlake.id).toMatch(UUID_V4);
  expect(tokyoBlake.id).not.toBe(brisbaneBlake.id);
});

test('[GROUPS-33.1] keeps Add Member open and says below the name that a member has it', async () => {
  await startInMembers(['Blake']);
  await openAddMember();

  await submit('Add Member', 'Add', ' blake ');

  expect(isOpen('Add Member')).toBe(true);
  expect(inTreeOrder(memberNameField(), screen.getByText(ALREADY_EXISTS))).toBe(
    true,
  );
  expect(announcements()).toContain(ALREADY_EXISTS);
  expect(alertsShown()).toEqual([]);
  expect(await storedMemberNames(file, 'Brisbane')).toEqual([
    'Taylor',
    'Blake',
  ]);
});

test('[GROUPS-33.1] counts your own name, in any case, as a member name', async () => {
  await startInMembers();
  await openAddMember();

  await submit('Add Member', 'Add', 'TAYLOR');

  expect(isOpen('Add Member')).toBe(true);
  expect(screen.getByText(ALREADY_EXISTS)).toBeOnTheScreen();
  expect(await storedMemberNames(file, 'Brisbane')).toEqual(['Taylor']);
});

test("[GROUPS-33.1] keeps Rename Member open when the new name is another member's", async () => {
  await startInMembers(['Blake', 'Casey']);
  await openRenameMember('Casey');

  await submit('Rename Member', 'Save', 'Blake');

  expect(isOpen('Rename Member')).toBe(true);
  expect(inTreeOrder(memberNameField(), screen.getByText(ALREADY_EXISTS))).toBe(
    true,
  );
  expect(announcements()).toContain(ALREADY_EXISTS);
  expect(alertsShown()).toEqual([]);
  expect(await storedMemberNames(file, 'Brisbane')).toEqual([
    'Taylor',
    'Blake',
    'Casey',
  ]);
});

test('[GROUPS-33.1] stops saying a member has the name once the name is edited', async () => {
  await startInMembers(['Blake']);
  await openAddMember();
  await submit('Add Member', 'Add', 'Blake');
  expect(screen.getByText(ALREADY_EXISTS)).toBeOnTheScreen();

  fireEvent.changeText(memberNameField(), 'Blake K.');

  expect(screen.queryByText(ALREADY_EXISTS)).toBeNull();
});

test('[GROUPS-33.1] says a member has the name, without asking to add anyone back, when a member and a former member both have it', async () => {
  await startInMembers(['Blake', 'Casey']);
  await removeMember('Blake');
  await waitFor(() => expect(membersShown()).not.toContain('Blake'));
  await renameMember('Casey', 'Blake');
  await openAddMember();

  await submit('Add Member', 'Add', 'blake');

  expect(screen.getByText(ALREADY_EXISTS)).toBeOnTheScreen();
  expect(alertsShown()).toEqual([]);
  expect(await storedMemberNames(file, 'Brisbane')).toEqual([
    'Taylor',
    'Blake',
  ]);
});

test('[GROUPS-34.1] asks to add a former member back, then adds them back last with their member ID and name', async () => {
  await startInMembers(['Blake', 'Casey']);
  const blake = await storedMember(file, 'Brisbane', 'Blake');
  await removeMember('Blake');
  await waitFor(() => expect(membersShown()).not.toContain('Blake'));
  await openAddMember();

  await submit('Add Member', 'Add', 'blake');

  expect(alertsShown()).toEqual([addBackAlert('Blake')]);
  expect(lastAlertButtons()).toEqual(['Cancel', 'Add Back']);
  expect(await storedMemberNames(file, 'Brisbane')).toEqual([
    'Taylor',
    'Casey',
  ]);
  await pressAlertButton('Add Back');
  await expectClosed('Add Member');
  await expectMembers(['Taylor (You)', 'Casey', 'Blake', 'Add Member']);
  const members = await storedMembers(file, 'Brisbane');
  expect(members.map((member) => member.name)).toEqual([
    'Taylor',
    'Casey',
    'Blake',
  ]);
  expect(members[2]).toEqual(blake);
});

test('[GROUPS-34.1] stays in Add Member with the name when Cancel is pressed instead of Add Back', async () => {
  await startInMembers(['Blake', 'Casey']);
  await removeMember('Blake');
  await waitFor(() => expect(membersShown()).not.toContain('Blake'));
  await openAddMember();
  await submit('Add Member', 'Add', 'blake');

  await pressAlertButton('Cancel');

  expect(isOpen('Add Member')).toBe(true);
  expect(memberNameField()).toHaveDisplayValue('blake', AS_TYPED);
  expect(await storedMemberNames(file, 'Brisbane')).toEqual([
    'Taylor',
    'Casey',
  ]);
});

test('[GROUPS-34.1] adds a former member back with their member ID after a restart', async () => {
  const app = await startInMembers(['Blake']);
  const blake = await storedMember(file, 'Brisbane', 'Blake');
  await removeMember('Blake');
  await waitFor(() => expect(membersShown()).not.toContain('Blake'));
  await restart(app);
  await openWithMembers('Brisbane', []);
  await openAddMember();

  await submit('Add Member', 'Add', 'Blake');

  expect(alertsShown()).toEqual([addBackAlert('Blake')]);
  await pressAlertButton('Add Back');
  await expectClosed('Add Member');
  expect(await storedMember(file, 'Brisbane', 'Blake')).toEqual(blake);
});

test("[GROUPS-34.1] adds a new member, without asking, for the name of another group's former member", async () => {
  const app = await startWithName();
  await createGroup('Brisbane');
  await createGroup('Tokyo');
  await openWithMembers('Tokyo', ['Blake']);
  const tokyoBlake = await storedMember(file, 'Tokyo', 'Blake');
  await removeMember('Blake');
  await waitFor(() => expect(membersShown()).not.toContain('Blake'));
  await restart(app);
  await openWithMembers('Brisbane', []);
  await openAddMember();
  clearAlerts();

  await submit('Add Member', 'Add', 'Blake');

  await expectClosed('Add Member');
  expect(alertsShown()).toEqual([]);
  const brisbaneBlake = await storedMember(file, 'Brisbane', 'Blake');
  expect(brisbaneBlake.id).not.toBe(tokyoBlake.id);
});

test('[GROUPS-35.1] says the member could not be saved, and keeps Add Member open with the name', async () => {
  await startInMembers();
  await openAddMember();
  const before = localData(file);
  failWrites();

  await submit('Add Member', 'Add', 'Blake');

  expect(alertsShown()).toEqual([ADD_FAILED]);
  expect(isOpen('Add Member')).toBe(true);
  expect(memberNameField()).toHaveDisplayValue('Blake', AS_TYPED);
  expect(barAction('Add Member', 'Add').disabled).toBe(false);
  expect(localData(file)).toEqual(before);
});

test('[GROUPS-35.1] leaves the local data as it was whichever write of the new member fails', async () => {
  await startInMembers();
  await openAddMember();
  fireEvent.changeText(memberNameField(), 'Blake');
  const before = localData(file);

  let writesThrough = 0;
  for (; writesThrough < 20; writesThrough += 1) {
    clearAlerts();
    failWritesAfter(writesThrough);
    await pressOnBar('Add Member', 'Add');
    if (alertsShown().length === 0) break;
    expect(alertsShown()).toEqual([ADD_FAILED]);
    expect(localData(file)).toEqual(before);
  }

  expect(writesThrough).toBeGreaterThan(0);
  expect(await storedMemberNames(file, 'Brisbane')).toEqual([
    'Taylor',
    'Blake',
  ]);
});

test('[GROUPS-35.1] keeps a former member out of the group whichever write of adding them back fails', async () => {
  await startInMembers(['Blake']);
  await removeMember('Blake');
  await waitFor(() => expect(membersShown()).not.toContain('Blake'));
  await openAddMember();
  fireEvent.changeText(memberNameField(), 'Blake');
  const before = localData(file);

  let writesThrough = 0;
  for (; writesThrough < 20; writesThrough += 1) {
    clearAlerts();
    failWritesAfter(writesThrough);
    await pressOnBar('Add Member', 'Add');
    expect(alertsShown()).toEqual([addBackAlert('Blake')]);
    await pressAlertButton('Add Back');
    if (alertsShown().length === 1) break;
    expect(alertsShown()).toEqual([addBackAlert('Blake'), ADD_FAILED]);
    expect(localData(file)).toEqual(before);
  }

  expect(writesThrough).toBeGreaterThan(0);
  expect(await storedMemberNames(file, 'Brisbane')).toEqual([
    'Taylor',
    'Blake',
  ]);
});

test('[GROUPS-35.1] adds one member when Add is pressed again after writes recover', async () => {
  await startInMembers();
  await openAddMember();
  failWrites();
  await submit('Add Member', 'Add', 'Blake');
  allowWrites();

  await pressOnBar('Add Member', 'Add');

  await expectClosed('Add Member');
  expect(await storedMemberNames(file, 'Brisbane')).toEqual([
    'Taylor',
    'Blake',
  ]);
});

// Rename Member

test('[GROUPS-36.1] opens Rename Member over Members with Cancel, Save and the name in a field that has the focus', async () => {
  await startInMembers(['Blake']);

  await openRenameMember('Blake');

  expect(SHEETS).toContain(screenOf('Rename Member').props.stackPresentation);
  expect(navigationBarTitles(tab('Groups'))).toEqual([
    'Groups',
    'Brisbane',
    'Members',
    'Rename Member',
  ]);
  expect(barItems('Rename Member')).toEqual({
    left: ['Cancel (plain)'],
    right: ['Save (prominent)'],
  });
  expect(memberNameField()).toHaveDisplayValue('Blake', AS_TYPED);
  expect(memberNameField().props.autoFocus).toBe(true);
  expect(textsOn('Rename Member')).toEqual([]);
});

test('[GROUPS-37.1] disables Save in Rename Member until the name differs from what it was', async () => {
  await startInMembers(['Blake']);
  await openRenameMember('Blake');

  expect(barAction('Rename Member', 'Save').disabled).toBe(true);
  for (const unchanged of [' Blake ', '   ']) {
    fireEvent.changeText(memberNameField(), unchanged);
    expect(barAction('Rename Member', 'Save').disabled).toBe(true);
    await pressReturn(memberNameField());
    expect(isOpen('Rename Member')).toBe(true);
  }
  fireEvent.changeText(memberNameField(), 'BLAKE');
  expect(barAction('Rename Member', 'Save').disabled).toBe(false);
  expect(await storedMemberNames(file, 'Brisbane')).toEqual([
    'Taylor',
    'Blake',
  ]);
});

test('[GROUPS-37.1] disables Save in Rename Group until the name differs from what it was', async () => {
  await startWithName();
  await createGroup('Brisbane');
  await openGroup('Brisbane');
  await openRenameGroup('Brisbane');

  expect(barAction('Rename Group', 'Save').disabled).toBe(true);
  for (const unchanged of [' Brisbane ', '   ']) {
    fireEvent.changeText(groupNameField(), unchanged);
    expect(barAction('Rename Group', 'Save').disabled).toBe(true);
    await pressReturn(groupNameField());
    expect(isOpen('Rename Group')).toBe(true);
  }
  fireEvent.changeText(groupNameField(), 'brisbane');
  expect(barAction('Rename Group', 'Save').disabled).toBe(false);
  expect((await storedGroups(file)).map((group) => group.name)).toEqual([
    'Brisbane',
  ]);
});

test("[GROUPS-38.1] saves a member's new name, trimmed, in the same place and with the same member ID", async () => {
  await startInMembers(['Blak', 'Casey']);
  const blak = await storedMember(file, 'Brisbane', 'Blak');
  await openRenameMember('Blak');

  await submit('Rename Member', 'Save', ' Blake ');

  await expectClosed('Rename Member');
  await expectMembers(['Taylor (You)', 'Blake', 'Casey', 'Add Member']);
  const members = await storedMembers(file, 'Brisbane');
  expect(members.map((member) => member.name)).toEqual([
    'Taylor',
    'Blake',
    'Casey',
  ]);
  expect(members[1]).toEqual({ ...blak, name: 'Blake' });
});

test("[GROUPS-38.1] saves a member's new name when Return is pressed", async () => {
  await startInMembers(['Casey']);
  await openRenameMember('Casey');
  fireEvent.changeText(memberNameField(), 'Casey Lee');

  await pressReturn(memberNameField());

  await expectClosed('Rename Member');
  await expectMembers(['Taylor (You)', 'Casey Lee', 'Add Member']);
});

test('[GROUPS-38.1] lets a member change only the case of their name', async () => {
  await startInMembers(['Blake']);
  await openRenameMember('Blake');

  await submit('Rename Member', 'Save', 'BLAKE');

  await expectClosed('Rename Member');
  expect(screen.queryByText(ALREADY_EXISTS)).toBeNull();
  expect(await storedMemberNames(file, 'Brisbane')).toEqual([
    'Taylor',
    'BLAKE',
  ]);
});

test("[GROUPS-38.1] lets a member take a former member's name", async () => {
  await startInMembers(['Blake', 'Casey']);
  await removeMember('Blake');
  await waitFor(() => expect(membersShown()).not.toContain('Blake'));
  await openRenameMember('Casey');

  await submit('Rename Member', 'Save', 'Blake');

  await expectClosed('Rename Member');
  expect(await storedMemberNames(file, 'Brisbane')).toEqual([
    'Taylor',
    'Blake',
  ]);
});

test("[GROUPS-38.1] keeps a member's new name after a restart", async () => {
  const app = await startInMembers(['Blak']);
  await renameMember('Blak', 'Blake');

  await restart(app);

  expect(await storedMemberNames(file, 'Brisbane')).toEqual([
    'Taylor',
    'Blake',
  ]);
});

test('[GROUPS-39.1] says the member could not be saved, and keeps Rename Member open with the new name', async () => {
  await startInMembers(['Blak']);
  await openRenameMember('Blak');
  const before = localData(file);
  failWrites();

  await submit('Rename Member', 'Save', 'Blake');

  expect(alertsShown()).toEqual([RENAME_MEMBER_FAILED]);
  expect(isOpen('Rename Member')).toBe(true);
  expect(memberNameField()).toHaveDisplayValue('Blake', AS_TYPED);
  expect(barAction('Rename Member', 'Save').disabled).toBe(false);
  expect(localData(file)).toEqual(before);
});

test("[GROUPS-39.1] leaves the local data as it was whichever write of a member's new name fails", async () => {
  await startInMembers(['Blak']);
  await openRenameMember('Blak');
  fireEvent.changeText(memberNameField(), 'Blake');
  const before = localData(file);

  let writesThrough = 0;
  for (; writesThrough < 20; writesThrough += 1) {
    clearAlerts();
    failWritesAfter(writesThrough);
    await pressOnBar('Rename Member', 'Save');
    if (alertsShown().length === 0) break;
    expect(alertsShown()).toEqual([RENAME_MEMBER_FAILED]);
    expect(localData(file)).toEqual(before);
  }

  expect(writesThrough).toBeGreaterThan(0);
  expect(await storedMemberNames(file, 'Brisbane')).toEqual([
    'Taylor',
    'Blake',
  ]);
});

test("[GROUPS-39.1] saves a member's new name when Save is pressed again after writes recover", async () => {
  await startInMembers(['Blak']);
  await openRenameMember('Blak');
  failWrites();
  await submit('Rename Member', 'Save', 'Blake');
  allowWrites();

  await pressOnBar('Rename Member', 'Save');

  await expectClosed('Rename Member');
  expect(await storedMemberNames(file, 'Brisbane')).toEqual([
    'Taylor',
    'Blake',
  ]);
});

// Rename Group

test("[GROUPS-40.1] opens Rename Group over the group's screen with Cancel, Save and the group's name in a field that has the focus", async () => {
  await startWithName();
  await createGroup('Brisbane');
  await openGroup('Brisbane');

  await openRenameGroup('Brisbane');

  expect(SHEETS).toContain(screenOf('Rename Group').props.stackPresentation);
  expect(navigationBarTitles(tab('Groups'))).toEqual([
    'Groups',
    'Brisbane',
    'Rename Group',
  ]);
  expect(barItems('Rename Group')).toEqual({
    left: ['Cancel (plain)'],
    right: ['Save (prominent)'],
  });
  expect(textsOn('Rename Group')).toEqual(['GROUP DETAILS', 'Name']);
  expect(
    inTreeOrder(
      within(screenOf('Rename Group')).getByText('GROUP DETAILS'),
      within(screenOf('Rename Group')).getByText('Name'),
      groupNameField(),
    ),
  ).toBe(true);
  expect(groupNameField()).toHaveDisplayValue('Brisbane', AS_TYPED);
  expect(groupNameField().props.autoFocus).toBe(true);
});

test("[GROUPS-41.1] saves the group's new name, trimmed, in its title and on its card", async () => {
  await startWithName();
  await createGroup('Trip');
  await createGroup('Paris');
  const [trip, paris] = await storedGroups(file);
  await openGroup('Trip');
  await openRenameGroup('Trip');

  await submit('Rename Group', 'Save', ' Tokyo 2026 ');

  await expectClosed('Rename Group');
  await waitFor(() =>
    expect(navigationBarTitles(tab('Groups'))).toEqual([
      'Groups',
      'Tokyo 2026',
    ]),
  );
  expect(await storedGroups(file)).toEqual([
    { ...trip, name: 'Tokyo 2026' },
    paris,
  ]);
  await goBackFrom('Tokyo 2026');
  await waitFor(() =>
    expect(cardNames()).toEqual(['Open Tokyo 2026', 'Open Paris']),
  );
});

test("[GROUPS-41.1] saves the group's new name when Return is pressed", async () => {
  await startWithName();
  await createGroup('Trip');
  await openGroup('Trip');
  await openRenameGroup('Trip');
  fireEvent.changeText(groupNameField(), 'Kyoto');

  await pressReturn(groupNameField());

  await expectClosed('Rename Group');
  await waitFor(() =>
    expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups', 'Kyoto']),
  );
});

test("[GROUPS-41.1] keeps the group's new name after a restart", async () => {
  const app = await startWithName();
  await createGroup('Trip');
  await openGroup('Trip');
  await openRenameGroup('Trip');
  await submit('Rename Group', 'Save', 'Tokyo 2026');
  await expectClosed('Rename Group');

  await restart(app);

  expect(cardNames()).toEqual(['Open Tokyo 2026']);
});

test("[GROUPS-17.1] lets a group be renamed to another group's name", async () => {
  await startWithName();
  await createGroup('Trip');
  await createGroup('Paris');
  await openGroup('Paris');
  await openRenameGroup('Paris');

  await submit('Rename Group', 'Save', 'Trip');

  await expectClosed('Rename Group');
  expect((await storedGroups(file)).map((group) => group.name)).toEqual([
    'Trip',
    'Trip',
  ]);
});

test('[GROUPS-42.1] says the group could not be saved, and keeps Rename Group open with the new name', async () => {
  await startWithName();
  await createGroup('Trip');
  await openGroup('Trip');
  await openRenameGroup('Trip');
  const before = localData(file);
  failWrites();

  await submit('Rename Group', 'Save', 'Tokyo');

  expect(alertsShown()).toEqual([RENAME_GROUP_FAILED]);
  expect(isOpen('Rename Group')).toBe(true);
  expect(groupNameField()).toHaveDisplayValue('Tokyo', AS_TYPED);
  expect(barAction('Rename Group', 'Save').disabled).toBe(false);
  expect(localData(file)).toEqual(before);
});

test("[GROUPS-42.1] leaves the local data as it was whichever write of the group's new name fails", async () => {
  await startWithName();
  await createGroup('Trip');
  await openGroup('Trip');
  await openRenameGroup('Trip');
  fireEvent.changeText(groupNameField(), 'Tokyo');
  const before = localData(file);

  let writesThrough = 0;
  for (; writesThrough < 20; writesThrough += 1) {
    clearAlerts();
    failWritesAfter(writesThrough);
    await pressOnBar('Rename Group', 'Save');
    if (alertsShown().length === 0) break;
    expect(alertsShown()).toEqual([RENAME_GROUP_FAILED]);
    expect(localData(file)).toEqual(before);
  }

  expect(writesThrough).toBeGreaterThan(0);
  expect((await storedGroups(file)).map((group) => group.name)).toEqual([
    'Tokyo',
  ]);
});

test("[GROUPS-42.1] saves the group's new name when Save is pressed again after writes recover", async () => {
  await startWithName();
  await createGroup('Trip');
  await openGroup('Trip');
  await openRenameGroup('Trip');
  failWrites();
  await submit('Rename Group', 'Save', 'Tokyo');
  allowWrites();

  await pressOnBar('Rename Group', 'Save');

  await expectClosed('Rename Group');
  expect((await storedGroups(file)).map((group) => group.name)).toEqual([
    'Tokyo',
  ]);
});

// What the name forms share

test('[GROUPS-43.1] closes Add Member without adding anyone when Cancel is pressed', async () => {
  await startInMembers();
  await openAddMember();
  fireEvent.changeText(memberNameField(), 'Blake');

  await pressOnBar('Add Member', 'Cancel');

  await expectClosed('Add Member');
  await expectMembers(['Taylor (You)', 'Add Member']);
  expect(await storedMemberNames(file, 'Brisbane')).toEqual(['Taylor']);
  await openAddMember();
  expect(memberNameField()).toHaveDisplayValue('', AS_TYPED);
});

test('[GROUPS-43.1] closes Rename Member without renaming when Cancel is pressed', async () => {
  await startInMembers(['Blake']);
  await openRenameMember('Blake');
  fireEvent.changeText(memberNameField(), 'Blake K.');

  await pressOnBar('Rename Member', 'Cancel');

  await expectClosed('Rename Member');
  await expectMembers(['Taylor (You)', 'Blake', 'Add Member']);
  expect(await storedMemberNames(file, 'Brisbane')).toEqual([
    'Taylor',
    'Blake',
  ]);
});

test('[GROUPS-43.1] closes Rename Group without renaming when Cancel is pressed', async () => {
  await startWithName();
  await createGroup('Trip');
  await openGroup('Trip');
  await openRenameGroup('Trip');
  fireEvent.changeText(groupNameField(), 'Tokyo');

  await pressOnBar('Rename Group', 'Cancel');

  await expectClosed('Rename Group');
  expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups', 'Trip']);
  expect((await storedGroups(file)).map((group) => group.name)).toEqual([
    'Trip',
  ]);
});

test('[GROUPS-43.1] lets each name form be swiped down without saving', async () => {
  await startInMembers(['Blake']);
  const before = localData(file);

  await openAddMember();
  fireEvent.changeText(memberNameField(), 'Casey');
  expect(refusesSwipeDown(screenOf('Add Member'))).toBe(false);
  await swipeDown('Add Member');
  await expectClosed('Add Member');
  expect(isOpen('Members')).toBe(true);

  await openRenameMember('Blake');
  fireEvent.changeText(memberNameField(), 'Blake K.');
  expect(refusesSwipeDown(screenOf('Rename Member'))).toBe(false);
  await swipeDown('Rename Member');
  await expectClosed('Rename Member');
  expect(isOpen('Members')).toBe(true);

  await pressOnBar('Members', 'Close');
  await expectClosed('Members');
  await openRenameGroup('Brisbane');
  fireEvent.changeText(groupNameField(), 'Tokyo');
  expect(refusesSwipeDown(screenOf('Rename Group'))).toBe(false);
  await swipeDown('Rename Group');
  await expectClosed('Rename Group');
  expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups', 'Brisbane']);

  expect(localData(file)).toEqual(before);
});

test('[GROUPS-44.1] locks Add Member while the new member is saved', async () => {
  await startInMembers();
  await openAddMember();
  fireEvent.changeText(memberNameField(), 'Blake');
  const writes = holdWrites();

  await pressOnBar('Add Member', 'Add');

  expect(barAction('Add Member', 'Cancel').disabled).toBe(true);
  expect(barAction('Add Member', 'Add').disabled).toBe(true);
  expect(memberNameField()).toBeDisabled();
  expect(refusesSwipeDown(screenOf('Add Member'))).toBe(true);
  expect(isOpen('Add Member')).toBe(true);
  await writes.release();
  await settle();
  await expectClosed('Add Member');
  await expectMembers(['Taylor (You)', 'Blake', 'Add Member']);
});

test('[GROUPS-44.1] adds one member when Add or Return is pressed again before the save finishes', async () => {
  await startInMembers();
  await openAddMember();
  fireEvent.changeText(memberNameField(), 'Blake');
  const writes = holdWrites();

  // The second press comes before React renders the locked form.
  const add = barAction('Add Member', 'Add');
  add.press();
  add.press();
  await settle();
  await pressReturn(memberNameField());
  await writes.release();
  await settle();

  await expectClosed('Add Member');
  expect(screen.queryByText(ALREADY_EXISTS)).toBeNull();
  expect(alertsShown()).toEqual([]);
  expect(await storedMemberNames(file, 'Brisbane')).toEqual([
    'Taylor',
    'Blake',
  ]);
});

test('[GROUPS-44.1] locks Rename Member while the new name is saved', async () => {
  await startInMembers(['Blak']);
  await openRenameMember('Blak');
  fireEvent.changeText(memberNameField(), 'Blake');
  const writes = holdWrites();

  await pressOnBar('Rename Member', 'Save');

  expect(barAction('Rename Member', 'Cancel').disabled).toBe(true);
  expect(barAction('Rename Member', 'Save').disabled).toBe(true);
  expect(memberNameField()).toBeDisabled();
  expect(refusesSwipeDown(screenOf('Rename Member'))).toBe(true);
  await writes.release();
  await settle();
  await expectClosed('Rename Member');
  await expectMembers(['Taylor (You)', 'Blake', 'Add Member']);
});

test('[GROUPS-44.1] locks Rename Group while the new name is saved', async () => {
  await startWithName();
  await createGroup('Trip');
  await openGroup('Trip');
  await openRenameGroup('Trip');
  fireEvent.changeText(groupNameField(), 'Tokyo');
  const writes = holdWrites();

  await pressOnBar('Rename Group', 'Save');

  expect(barAction('Rename Group', 'Cancel').disabled).toBe(true);
  expect(barAction('Rename Group', 'Save').disabled).toBe(true);
  expect(groupNameField()).toBeDisabled();
  expect(refusesSwipeDown(screenOf('Rename Group'))).toBe(true);
  await writes.release();
  await settle();
  await expectClosed('Rename Group');
  await waitFor(() =>
    expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups', 'Tokyo']),
  );
});

test('[GROUPS-44.1] unlocks a name form once its save fails', async () => {
  await startInMembers();
  await openAddMember();
  fireEvent.changeText(memberNameField(), 'Blake');
  const writes = holdWrites();
  await pressOnBar('Add Member', 'Add');

  await writes.fail();
  await settle();

  expect(barAction('Add Member', 'Cancel').disabled).toBe(false);
  expect(barAction('Add Member', 'Add').disabled).toBe(false);
  expect(memberNameField()).not.toBeDisabled();
  expect(refusesSwipeDown(screenOf('Add Member'))).toBe(false);
});

test('[GROUPS-45.1] asks the keyboard of each name form to capitalize each word, not to autocorrect, and to show a done key', async () => {
  await startInMembers(['Blake']);
  // Jest has no keyboard, so the test reads what each field asks the native keyboard for.
  const keyboard = (field: ReturnType<typeof memberNameField>) => ({
    autoCapitalize: field.props.autoCapitalize,
    autoCorrect: field.props.autoCorrect,
    returnKeyType: field.props.returnKeyType,
  });
  const expected = {
    autoCapitalize: 'words',
    autoCorrect: false,
    returnKeyType: 'done',
  };

  await openAddMember();
  expect(keyboard(memberNameField())).toEqual(expected);
  await pressOnBar('Add Member', 'Cancel');
  await expectClosed('Add Member');

  await openRenameMember('Blake');
  expect(keyboard(memberNameField())).toEqual(expected);
  await pressOnBar('Rename Member', 'Cancel');
  await expectClosed('Rename Member');

  await pressOnBar('Members', 'Close');
  await expectClosed('Members');
  await openRenameGroup('Brisbane');
  expect(keyboard(groupNameField())).toEqual(expected);
});

// Your name in the groups

test('[GROUPS-46.1] changes your member name in every group when you save a new name', async () => {
  await startWithName('Taylor');
  await createGroup('Brisbane');
  await createGroup('Tokyo');
  const before = await storedGroups(file);

  await saveName('Sam');

  expect(await storedGroups(file)).toEqual(
    before.map((group) => ({
      ...group,
      members: group.members.map((member) => ({ ...member, name: 'Sam' })),
    })),
  );
  await openWithMembers('Brisbane', []);
  await expectMembers(['Sam (You)', 'Add Member']);
});

test("[GROUPS-46.1] leaves other members' names as they were when you save a new name", async () => {
  await startInMembers(['Blake']);

  await saveName('Sam');

  expect(await storedMemberNames(file, 'Brisbane')).toEqual(['Sam', 'Blake']);
});

test('[GROUPS-46.1] leaves your name and your member names as they were whichever write of the new name fails', async () => {
  await startWithName('Taylor');
  await createGroup('Brisbane');
  await createGroup('Tokyo');
  await tapTab('Settings');
  const before = localData(file);
  const field = () => screen.getByLabelText('Your name');
  fireEvent.changeText(field(), 'Sam');

  let writesThrough = 0;
  for (; writesThrough < 20; writesThrough += 1) {
    clearAlerts();
    failWritesAfter(writesThrough);
    act(() => {
      fireEvent(field(), 'submitEditing', { nativeEvent: { text: 'Sam' } });
    });
    await settle();
    if (alertsShown().length === 0) break;
    expect(alertsShown()).toEqual([SETTINGS_FAILED]);
    expect(localData(file)).toEqual(before);
  }

  expect(writesThrough).toBeGreaterThan(0);
  expect(await storedMemberNames(file, 'Brisbane')).toEqual(['Sam']);
  expect(await storedMemberNames(file, 'Tokyo')).toEqual(['Sam']);
});

test('[GROUPS-46.1] keeps your new member name after a restart', async () => {
  const app = await startWithName('Taylor');
  await createGroup('Brisbane');
  await saveName('Sam');

  await restart(app);

  expect(await storedMemberNames(file, 'Brisbane')).toEqual(['Sam']);
});

// The shell's rules on the new screens

test("[SHELL-34.1] uses colors that follow the appearance on a group's screen, Members and the name forms", async () => {
  await startInMembers(['Blake']);
  const compare = () => {
    const light = { colors: fixedColors(), uncolored: textsWithoutColor() };
    switchPhoneTo('dark');
    const dark = { colors: fixedColors(), uncolored: textsWithoutColor() };
    switchPhoneTo('light');
    expect(colorsInBoth(light.colors, dark.colors)).toEqual([]);
    expect([...light.uncolored, ...dark.uncolored]).toEqual([]);
  };

  compare();
  await openAddMember();
  fireEvent.changeText(memberNameField(), 'Blake');
  await pressOnBar('Add Member', 'Add');
  expect(screen.getByText(ALREADY_EXISTS)).toBeOnTheScreen();
  compare();
  await pressOnBar('Add Member', 'Cancel');
  await expectClosed('Add Member');
  await openRenameMember('Blake');
  compare();
  await pressOnBar('Rename Member', 'Cancel');
  await expectClosed('Rename Member');
  await pressOnBar('Members', 'Close');
  await expectClosed('Members');
  await openRenameGroup('Brisbane');
  compare();
});

test("[SHELL-36.1] adds no blur or glass of its own to a group's screen, Members or the name forms while Reduce Transparency is on", async () => {
  fakeReduceTransparency(true);
  await startWithName();
  await createGroup('Brisbane');
  await openGroup('Brisbane');

  expect(translucentViews()).toEqual([]);
  await openMembers('Brisbane');
  await addMember('Blake');
  expect(translucentViews()).toEqual([]);
  await openAddMember();
  expect(translucentViews()).toEqual([]);
  await pressOnBar('Add Member', 'Cancel');
  await expectClosed('Add Member');
  await openRenameMember('Blake');
  expect(translucentViews()).toEqual([]);
  await pressOnBar('Rename Member', 'Cancel');
  await expectClosed('Rename Member');
  await pressOnBar('Members', 'Close');
  await expectClosed('Members');
  await openRenameGroup('Brisbane');
  expect(translucentViews()).toEqual([]);
});
