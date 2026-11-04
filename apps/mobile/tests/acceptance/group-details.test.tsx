import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { AccessibilityInfo, ActionSheetIOS, Alert } from 'react-native';
import {
  fireEvent,
  screen,
  userEvent,
  waitFor,
  within,
} from '@testing-library/react-native';
import type { Database } from '../../src/storage';
import {
  navigationBarTitles,
  navigationBars,
  selectedTab,
  tab,
  tapTab,
} from './shell-tabs-app';
import {
  allowReads,
  cardNames,
  createGroup,
  groupsRoot,
  holdReads,
  inTreeOrder,
  localData,
  readIdentity,
  saveName,
  startGroupsApp,
  storedGroups,
  testDatabaseWithReads,
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
  textsWithoutColor,
  translucentViews,
} from './shell-appearance-app';
import {
  ADD_FAILED,
  ALREADY_EXISTS,
  NO_EXPENSES,
  NOT_FOUND,
  REMOVE_FAILED,
  RENAME_GROUP_FAILED,
  RENAME_MEMBER_FAILED,
  RETAINED,
  addBackAlert,
  addMember,
  alertsShown,
  barAction,
  barItems,
  barTitled,
  chooseForMember,
  expectClosed,
  expectMembers,
  expectOpen,
  goBackFrom,
  groupNameField,
  isEnabled,
  isOpen,
  lastAlertButtons,
  memberField,
  memberNameField,
  membersButton,
  membersShown,
  openGroup,
  openMemberField,
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
  startAddingMember,
  stopAddingMember,
  storedMember,
  storedMemberNames,
  storedMembers,
  swipeDown,
  tapMember,
  textsOn,
  titleButton,
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
  mockOpen = async () => testDatabaseWithReads(file);
  allowWrites();
  allowReads();
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
async function restart(app: { unmount: () => Promise<void> }) {
  await app.unmount();
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
  await fireEvent.changeText(field, name);
  await pressOnBar(form, confirm);
}

// The group's screen

test('[GROUPS-20.2] says a new group has no expenses on its screen', async () => {
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
  const reads = holdReads();

  await fireEvent.press(
    within(groupsRoot()).getByRole('button', { name: 'Open Brisbane' }),
  );
  await waitFor(() => expect(navigationBars(tab('Groups'))).toHaveLength(2));
  await settle();

  expect(screen.queryByText(NOT_FOUND)).toBeNull();
  await reads.release();
  await waitFor(() => expect(textsOn('Brisbane')).toContain(NO_EXPENSES));
  expect(screen.queryByText(NOT_FOUND)).toBeNull();
});

test('[GROUPS-21.1] never shows Group not found. while a group opened at its URL loads', async () => {
  const first = await startWithName();
  await createGroup('Brisbane');
  const [brisbane] = await storedGroups(file);
  await first.unmount();
  await settle();
  const reads = holdReads();

  await startGroupsApp(`/groups/${brisbane.id}`);
  await waitFor(() => expect(navigationBars(tab('Groups'))).toHaveLength(2));
  await settle();

  expect(screen.queryByText(NOT_FOUND)).toBeNull();
  await reads.release();
  await waitFor(() => expect(textsOn('Brisbane')).toContain(NO_EXPENSES));
  expect(screen.queryByText(NOT_FOUND)).toBeNull();
});

test("[GROUPS-22.2] puts a Group actions menu with Members and Rename Group in the group's title bar", async () => {
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

test("[GROUPS-24.2] lists only you, as a button marked (You) with a chevron, in a new group's Members", async () => {
  await startInMembers();

  await expectMembers(['Taylor (You)', 'Add Member']);
  expect(
    within(membersButton('Taylor (You)')).getByText('›'),
  ).toBeOnTheScreen();
});

test('[GROUPS-24.2] lists the members in the order they joined, each other member as a button named after them, with a chevron', async () => {
  // Not in alphabetical order, so a list sorted by name fails.
  await startInMembers(['Casey', 'Blake']);

  await expectMembers(['Taylor (You)', 'Casey', 'Blake', 'Add Member']);
  for (const name of ['Casey', 'Blake'])
    expect(within(membersButton(name)).getByText('›')).toBeOnTheScreen();
});

test("[GROUPS-25.2] opens an action sheet titled with the member's name when their row is tapped", async () => {
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

test('[GROUPS-25.2] opens your own action sheet, titled with your member name and offering only Rename, when your row is tapped', async () => {
  await startInMembers(['Blake']);

  const menu = await tapMember('Taylor (You)');

  expect(menu).toMatchObject({
    title: 'Taylor',
    items: ['Rename', 'Cancel'],
    destructive: [],
    cancel: 'Cancel',
  });
  expect(menu?.message ?? '').toBe('');
});

test("[GROUPS-25.2] changes nothing when Cancel is chosen in a member's menu", async () => {
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
  expect(await tapMember('Taylor (You)')).toBeUndefined();
  await fireEvent.press(membersButton('Add Member'));
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

// Adding members in Members

/** Whether pressing Return in the field leaves it focused, which Jest can only read from what the field asks the native view for. */
const keepsFocusOnReturn = (field: ReturnType<typeof memberNameField>) =>
  field.props.submitBehavior === 'submit' || field.props.blurOnSubmit === false;

/** Types `name` in Members' name field and presses Return. */
async function addInField(name: string) {
  await fireEvent.changeText(memberField()!, name);
  await pressReturn(memberField()!);
}

test('[GROUPS-29.2] turns Add Member into an empty name field that has the focus, without opening a new screen', async () => {
  await startInMembers();

  await fireEvent.press(membersButton('Add Member'));
  await settle();

  expect(isOpen('Add Member')).toBe(false);
  expect(navigationBarTitles(tab('Groups'))).toEqual([
    'Groups',
    'Brisbane',
    'Members',
  ]);
  const field = memberField();
  expect(field).toBeDefined();
  expect(field).toHaveDisplayValue('', AS_TYPED);
  expect(field!.props.placeholder).toBe('Enter member name');
  expect(field!.props.autoFocus).toBe(true);
  expect(membersShown()).toEqual(['Taylor (You)']);
});

test('[GROUPS-29.2] closes Members without adding the name left in the field', async () => {
  await startInMembers();
  await openMemberField();
  await fireEvent.changeText(memberField()!, 'Blake');

  await pressOnBar('Members', 'Close');

  await expectClosed('Members');
  expect(await storedMemberNames(file, 'Brisbane')).toEqual(['Taylor']);
});

test('[GROUPS-30.2] closes the name field, adding no one, when Return is pressed with no name or only spaces', async () => {
  await startInMembers();
  await openMemberField();

  await pressReturn(memberField()!);

  await waitFor(() => expect(memberField()).toBeUndefined());
  await expectMembers(['Taylor (You)', 'Add Member']);
  await openMemberField();
  await addInField('   ');
  await waitFor(() => expect(memberField()).toBeUndefined());
  await expectMembers(['Taylor (You)', 'Add Member']);
  expect(await storedMemberNames(file, 'Brisbane')).toEqual(['Taylor']);
});

test('[GROUPS-31.2] adds a member with the name trimmed, listed last, and keeps the name field, empty and focused, for the next', async () => {
  await startInMembers();
  await openMemberField();

  await addInField(' Blake ');

  await waitFor(() =>
    expect(membersShown()).toEqual(['Taylor (You)', 'Blake']),
  );
  expect(memberField()).toHaveDisplayValue('', AS_TYPED);
  expect(keepsFocusOnReturn(memberField()!)).toBe(true);
  expect(await storedMemberNames(file, 'Brisbane')).toEqual([
    'Taylor',
    'Blake',
  ]);
});

test('[GROUPS-31.2] adds the next member from the same name field', async () => {
  await startInMembers();
  await openMemberField();
  await addInField('Blake');
  await waitFor(() => expect(memberField()).toHaveDisplayValue('', AS_TYPED));

  await addInField('Casey');

  await waitFor(() =>
    expect(membersShown()).toEqual(['Taylor (You)', 'Blake', 'Casey']),
  );
  expect(await storedMemberNames(file, 'Brisbane')).toEqual([
    'Taylor',
    'Blake',
    'Casey',
  ]);
});

test('[GROUPS-31.2] adds as many members as you like, in the order they join', async () => {
  const names = Array.from({ length: 30 }, (_, index) => `Member ${index + 1}`);

  await startInMembers(names);

  expect(await storedMemberNames(file, 'Brisbane')).toEqual([
    'Taylor',
    ...names,
  ]);
}, 60_000);

test('[GROUPS-31.2] keeps a member name of 300 characters in full', async () => {
  await startInMembers();
  await openMemberField();
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

  await user.type(memberField()!, 'a'.repeat(300));
  expect(memberField()).toHaveDisplayValue('a'.repeat(300), AS_TYPED);
  await pressReturn(memberField()!);

  await waitFor(async () =>
    expect(await storedMemberNames(file, 'Brisbane')).toEqual([
      'Taylor',
      'a'.repeat(300),
    ]),
  );
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

test('[GROUPS-33.2] keeps the name in the field and says below it that a member has it', async () => {
  await startInMembers(['Blake']);
  await openMemberField();

  await addInField(' blake ');

  expect(memberField()).toHaveDisplayValue(' blake ', AS_TYPED);
  expect(inTreeOrder(memberField()!, screen.getByText(ALREADY_EXISTS))).toBe(
    true,
  );
  expect(announcements()).toContain(ALREADY_EXISTS);
  expect(alertsShown()).toEqual([]);
  expect(await storedMemberNames(file, 'Brisbane')).toEqual([
    'Taylor',
    'Blake',
  ]);
});

test('[GROUPS-33.2] counts your own name, in any case, as a member name', async () => {
  await startInMembers();
  await openMemberField();

  await addInField('TAYLOR');

  expect(screen.getByText(ALREADY_EXISTS)).toBeOnTheScreen();
  expect(memberField()).toBeDefined();
  expect(await storedMemberNames(file, 'Brisbane')).toEqual(['Taylor']);
});

test("[GROUPS-33.2] keeps Rename Member open when the new name is another member's", async () => {
  await startInMembers(['Blake', 'Casey']);
  await openRenameMember('Casey');

  await submit('Rename Member', 'Save', ' blake ');

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

test('[GROUPS-33.2] stops saying a member has the name once the name is edited', async () => {
  await startInMembers(['Blake']);
  await openMemberField();
  await addInField('Blake');
  expect(screen.getByText(ALREADY_EXISTS)).toBeOnTheScreen();

  await fireEvent.changeText(memberField()!, 'Blake K.');

  expect(screen.queryByText(ALREADY_EXISTS)).toBeNull();
});

test("[GROUPS-33.2] says a member has the name when Return is pressed in Rename Member with another member's name", async () => {
  await startInMembers(['Blake', 'Casey']);
  await openRenameMember('Casey');
  await fireEvent.changeText(memberNameField(), 'Blake');

  await pressReturn(memberNameField());

  expect(isOpen('Rename Member')).toBe(true);
  expect(screen.getByText(ALREADY_EXISTS)).toBeOnTheScreen();
  expect(alertsShown()).toEqual([]);
  expect(await storedMemberNames(file, 'Brisbane')).toEqual([
    'Taylor',
    'Blake',
    'Casey',
  ]);
});

test('[GROUPS-33.2] says a member has the name, without asking to add anyone back, when a member and a former member both have it', async () => {
  await startInMembers(['Blake', 'Casey']);
  await removeMember('Blake');
  await waitFor(() => expect(membersShown()).not.toContain('Blake'));
  await renameMember('Casey', 'Blake');
  await openMemberField();

  await addInField('blake');

  expect(screen.getByText(ALREADY_EXISTS)).toBeOnTheScreen();
  expect(alertsShown()).toEqual([]);
  expect(await storedMemberNames(file, 'Brisbane')).toEqual([
    'Taylor',
    'Blake',
  ]);
});

test('[GROUPS-34.2] asks to add a former member back, then adds them back last with their member ID and name', async () => {
  await startInMembers(['Blake', 'Casey']);
  const blake = await storedMember(file, 'Brisbane', 'Blake');
  await removeMember('Blake');
  await waitFor(() => expect(membersShown()).not.toContain('Blake'));
  await openMemberField();

  await addInField('blake');

  expect(alertsShown()).toEqual([addBackAlert('Blake')]);
  expect(lastAlertButtons()).toEqual(['Cancel', 'Add Back']);
  expect(await storedMemberNames(file, 'Brisbane')).toEqual([
    'Taylor',
    'Casey',
  ]);
  await pressAlertButton('Add Back');
  await waitFor(() =>
    expect(membersShown()).toEqual(['Taylor (You)', 'Casey', 'Blake']),
  );
  expect(memberField()).toHaveDisplayValue('', AS_TYPED);
  const members = await storedMembers(file, 'Brisbane');
  expect(members.map((member) => member.name)).toEqual([
    'Taylor',
    'Casey',
    'Blake',
  ]);
  expect(members[2]).toEqual(blake);
});

test('[GROUPS-34.2] keeps the name in the field when Cancel is pressed instead of Add Back', async () => {
  await startInMembers(['Blake', 'Casey']);
  await removeMember('Blake');
  await waitFor(() => expect(membersShown()).not.toContain('Blake'));
  await openMemberField();
  await addInField('blake');

  await pressAlertButton('Cancel');

  expect(memberField()).toHaveDisplayValue('blake', AS_TYPED);
  // Asking is not saving, so nothing stays locked.
  expect(memberField()).not.toBeDisabled();
  expect(barAction('Members', 'Close').disabled).toBe(false);
  expect(refusesSwipeDown(screenOf('Members'))).toBe(false);
  expect(await storedMemberNames(file, 'Brisbane')).toEqual([
    'Taylor',
    'Casey',
  ]);
});

test('[GROUPS-34.2] asks about the most recently removed of the former members with the name', async () => {
  await startInMembers(['Blake', 'Casey']);
  const blake = await storedMember(file, 'Brisbane', 'Blake');
  const casey = await storedMember(file, 'Brisbane', 'Casey');
  await removeMember('Blake');
  await waitFor(() => expect(membersShown()).not.toContain('Blake'));
  await renameMember('Casey', 'BLAKE');
  await removeMember('BLAKE');
  await waitFor(() => expect(membersShown()).not.toContain('BLAKE'));
  await openMemberField();

  await addInField('blake');

  expect(alertsShown()).toEqual([addBackAlert('BLAKE')]);
  await pressAlertButton('Add Back');
  await waitFor(() =>
    expect(membersShown()).toEqual(['Taylor (You)', 'BLAKE']),
  );
  const members = await storedMembers(file, 'Brisbane');
  expect(members.map((member) => member.name)).toEqual(['Taylor', 'BLAKE']);
  expect(members[1]).toEqual({ ...casey, name: 'BLAKE' });
  // The first Blake stays a former member, kept in the local data.
  expect(JSON.stringify(localData(file))).toContain(blake.id);
});

test('[GROUPS-34.2] asks about the most recently removed former member with the name, even one who joined earlier', async () => {
  // Blake joins first but leaves last, so neither the order of joining nor of
  // the rows picks him.
  await startInMembers(['Blake', 'Casey']);
  const blake = await storedMember(file, 'Brisbane', 'Blake');
  const casey = await storedMember(file, 'Brisbane', 'Casey');
  await removeMember('Casey');
  await waitFor(() => expect(membersShown()).not.toContain('Casey'));
  await renameMember('Blake', 'casey');
  await removeMember('casey');
  await waitFor(() => expect(membersShown()).not.toContain('casey'));
  await openMemberField();

  await addInField('Casey');

  expect(alertsShown()).toEqual([addBackAlert('casey')]);
  await pressAlertButton('Add Back');
  await waitFor(() =>
    expect(membersShown()).toEqual(['Taylor (You)', 'casey']),
  );
  const members = await storedMembers(file, 'Brisbane');
  expect(members.map((member) => member.name)).toEqual(['Taylor', 'casey']);
  expect(members[1]).toEqual({ ...blake, name: 'casey' });
  // The first Casey stays a former member, kept in the local data.
  expect(JSON.stringify(localData(file))).toContain(casey.id);
});

test('[GROUPS-34.2] adds a former member back with their member ID after a restart', async () => {
  const app = await startInMembers(['Blake']);
  const blake = await storedMember(file, 'Brisbane', 'Blake');
  await removeMember('Blake');
  await waitFor(() => expect(membersShown()).not.toContain('Blake'));
  await restart(app);
  // Restarting here keeps the app's modules loaded, so the former member must be
  // in the local data, as a restart of the phone's app would need.
  expect(JSON.stringify(localData(file))).toContain(blake.id);
  await openWithMembers('Brisbane', []);
  await openMemberField();

  await addInField('Blake');

  expect(alertsShown()).toEqual([addBackAlert('Blake')]);
  await pressAlertButton('Add Back');
  // Waits on the screen: an async waitFor on the storage here broke the next tests' renders.
  await waitFor(() => expect(membersShown()).toContain('Blake'));
  expect(await storedMember(file, 'Brisbane', 'Blake')).toEqual(blake);
});

test("[GROUPS-34.2] adds a new member, without asking, for the name of another group's former member", async () => {
  const app = await startWithName();
  await createGroup('Brisbane');
  await createGroup('Tokyo');
  await openWithMembers('Tokyo', ['Blake']);
  const tokyoBlake = await storedMember(file, 'Tokyo', 'Blake');
  await removeMember('Blake');
  await waitFor(() => expect(membersShown()).not.toContain('Blake'));
  await restart(app);
  await openWithMembers('Brisbane', []);
  await openMemberField();
  clearAlerts();

  await addInField('Blake');

  await waitFor(() =>
    expect(membersShown()).toEqual(['Taylor (You)', 'Blake']),
  );
  expect(alertsShown()).toEqual([]);
  const brisbaneBlake = await storedMember(file, 'Brisbane', 'Blake');
  expect(brisbaneBlake.id).not.toBe(tokyoBlake.id);
});

test('[GROUPS-35.2] says the member could not be saved, and keeps the name in the field', async () => {
  await startInMembers();
  await openMemberField();
  const before = localData(file);
  failWrites();

  await addInField('Blake');

  expect(alertsShown()).toEqual([ADD_FAILED]);
  expect(memberField()).toHaveDisplayValue('Blake', AS_TYPED);
  expect(memberField()).not.toBeDisabled();
  expect(localData(file)).toEqual(before);
});

test('[GROUPS-35.2] leaves the local data as it was whichever write of the new member fails', async () => {
  await startInMembers();
  await openMemberField();
  await fireEvent.changeText(memberField()!, 'Blake');
  const before = localData(file);

  let writesThrough = 0;
  for (; writesThrough < 20; writesThrough += 1) {
    clearAlerts();
    failWritesAfter(writesThrough);
    await pressReturn(memberField()!);
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

test('[GROUPS-35.2] keeps a former member out of the group whichever write of adding them back fails', async () => {
  await startInMembers(['Blake']);
  await removeMember('Blake');
  await waitFor(() => expect(membersShown()).not.toContain('Blake'));
  await openMemberField();
  await fireEvent.changeText(memberField()!, 'Blake');
  const before = localData(file);

  let writesThrough = 0;
  for (; writesThrough < 20; writesThrough += 1) {
    clearAlerts();
    failWritesAfter(writesThrough);
    await pressReturn(memberField()!);
    expect(alertsShown()).toEqual([addBackAlert('Blake')]);
    await pressAlertButton('Add Back');
    if (alertsShown().length === 1) break;
    expect(alertsShown()).toEqual([addBackAlert('Blake'), ADD_FAILED]);
    expect(memberField()).toHaveDisplayValue('Blake', AS_TYPED);
    expect(localData(file)).toEqual(before);
  }

  expect(writesThrough).toBeGreaterThan(0);
  expect(await storedMemberNames(file, 'Brisbane')).toEqual([
    'Taylor',
    'Blake',
  ]);
});

test('[GROUPS-35.2] adds one member when Return is pressed again after writes recover', async () => {
  await startInMembers();
  await openMemberField();
  failWrites();
  await addInField('Blake');
  allowWrites();

  await pressReturn(memberField()!);

  await waitFor(() =>
    expect(membersShown()).toEqual(['Taylor (You)', 'Blake']),
  );
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

test('[GROUPS-36.1] opens Rename Member with your member name, without (You), from your own row', async () => {
  await startInMembers();

  await chooseForMember('Taylor (You)', 'Rename');

  await expectOpen('Rename Member');
  await waitFor(() =>
    expect(memberNameField()).toHaveDisplayValue('Taylor', AS_TYPED),
  );
});

test('[GROUPS-36.1] shows Enter member name in Rename Member once the name is cleared', async () => {
  await startInMembers(['Blake']);
  await openRenameMember('Blake');

  await fireEvent.changeText(memberNameField(), '');

  expect(memberNameField()).toHaveDisplayValue('', AS_TYPED);
  expect(memberNameField().props.placeholder).toBe('Enter member name');
});

test('[GROUPS-37.1] disables Save in Rename Member until the name differs from what it was', async () => {
  await startInMembers(['Blake']);
  await openRenameMember('Blake');

  expect(barAction('Rename Member', 'Save').disabled).toBe(true);
  for (const unchanged of [' Blake ', '   ']) {
    await fireEvent.changeText(memberNameField(), unchanged);
    expect(barAction('Rename Member', 'Save').disabled).toBe(true);
    await pressReturn(memberNameField());
    expect(isOpen('Rename Member')).toBe(true);
  }
  await fireEvent.changeText(memberNameField(), 'BLAKE');
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
    await fireEvent.changeText(groupNameField(), unchanged);
    expect(barAction('Rename Group', 'Save').disabled).toBe(true);
    await pressReturn(groupNameField());
    expect(isOpen('Rename Group')).toBe(true);
  }
  await fireEvent.changeText(groupNameField(), 'brisbane');
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
  await fireEvent.changeText(memberNameField(), 'Casey Lee');

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

test('[GROUPS-38.1] saves your new member name, with the same member ID and user ID', async () => {
  await startInMembers();
  const [you] = await storedMembers(file, 'Brisbane');
  await openRenameMember('Taylor (You)', 'Taylor');
  await fireEvent.changeText(memberNameField(), 'Sam');

  await pressOnBar('Rename Member', 'Save');

  await expectClosed('Rename Member');
  await expectMembers(['Sam (You)', 'Add Member']);
  expect(await storedMembers(file, 'Brisbane')).toEqual([
    { ...you, name: 'Sam' },
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
  await fireEvent.changeText(memberNameField(), 'Blake');
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

test("[GROUPS-40.2] makes the group's title a button named after the group, which opens Rename Group with the name in a field that has the focus", async () => {
  await startWithName();
  await createGroup('Brisbane');
  await openGroup('Brisbane');

  await waitFor(() => expect(titleButton('Brisbane')).toBeDefined());
  expect(barTitled('Brisbane')?.props.title).toBe('Brisbane');
  await fireEvent.press(titleButton('Brisbane')!);
  await settle();

  await expectOpen('Rename Group');
  expect(SHEETS).toContain(screenOf('Rename Group').props.stackPresentation);
  await waitFor(() =>
    expect(groupNameField().props.value ?? '').toBe('Brisbane'),
  );
  expect(groupNameField().props.autoFocus).toBe(true);
});

test("[GROUPS-40.2] opens Rename Group over the group's screen with Cancel, Save and the group's name in a field that has the focus", async () => {
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

test('[GROUPS-40.2] shows Group name in Rename Group once the name is cleared', async () => {
  await startWithName();
  await createGroup('Brisbane');
  await openGroup('Brisbane');
  await openRenameGroup('Brisbane');

  await fireEvent.changeText(groupNameField(), '');

  expect(groupNameField()).toHaveDisplayValue('', AS_TYPED);
  expect(groupNameField().props.placeholder).toBe('Group name');
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
  await fireEvent.changeText(groupNameField(), 'Kyoto');

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
  await fireEvent.changeText(groupNameField(), 'Tokyo');
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

test('[GROUPS-43.2] closes Rename Member without renaming when Cancel is pressed', async () => {
  await startInMembers(['Blake']);
  await openRenameMember('Blake');
  await fireEvent.changeText(memberNameField(), 'Blake K.');

  await pressOnBar('Rename Member', 'Cancel');

  await expectClosed('Rename Member');
  await expectMembers(['Taylor (You)', 'Blake', 'Add Member']);
  expect(await storedMemberNames(file, 'Brisbane')).toEqual([
    'Taylor',
    'Blake',
  ]);
});

test('[GROUPS-43.2] closes Rename Group without renaming when Cancel is pressed', async () => {
  await startWithName();
  await createGroup('Trip');
  await openGroup('Trip');
  await openRenameGroup('Trip');
  await fireEvent.changeText(groupNameField(), 'Tokyo');

  await pressOnBar('Rename Group', 'Cancel');

  await expectClosed('Rename Group');
  expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups', 'Trip']);
  expect((await storedGroups(file)).map((group) => group.name)).toEqual([
    'Trip',
  ]);
});

test('[GROUPS-43.2] lets each name form be swiped down without saving', async () => {
  await startInMembers(['Blake']);
  const before = localData(file);

  await openRenameMember('Blake');
  await fireEvent.changeText(memberNameField(), 'Blake K.');
  expect(refusesSwipeDown(screenOf('Rename Member'))).toBe(false);
  await swipeDown('Rename Member');
  await expectClosed('Rename Member');
  expect(isOpen('Members')).toBe(true);

  await pressOnBar('Members', 'Close');
  await expectClosed('Members');
  await openRenameGroup('Brisbane');
  await fireEvent.changeText(groupNameField(), 'Tokyo');
  expect(refusesSwipeDown(screenOf('Rename Group'))).toBe(false);
  await swipeDown('Rename Group');
  await expectClosed('Rename Group');
  expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups', 'Brisbane']);

  expect(localData(file)).toEqual(before);
});

test('[GROUPS-44.2] locks the name field and Members while the new member is saved', async () => {
  await startInMembers();
  await openMemberField();
  await fireEvent.changeText(memberField()!, 'Blake');
  const writes = holdWrites();

  await pressReturn(memberField()!);

  expect(memberField()).toBeDisabled();
  expect(barAction('Members', 'Close').disabled).toBe(true);
  expect(isEnabled(membersButton('Taylor (You)'))).toBe(false);
  expect(refusesSwipeDown(screenOf('Members'))).toBe(true);
  await writes.release();
  await settle();
  await waitFor(() =>
    expect(membersShown()).toEqual(['Taylor (You)', 'Blake']),
  );
  expect(memberField()).not.toBeDisabled();
  expect(barAction('Members', 'Close').disabled).toBe(false);
});

test('[GROUPS-44.2] adds one member when Return is pressed again before the save finishes', async () => {
  await startInMembers();
  await openMemberField();
  await fireEvent.changeText(memberField()!, 'Blake');
  const writes = holdWrites();

  // The second press comes before React renders the locked field.
  const field = memberField()!;
  await pressReturn(field);
  await pressReturn(field);
  await writes.release();
  await settle();

  await waitFor(() =>
    expect(membersShown()).toEqual(['Taylor (You)', 'Blake']),
  );
  expect(screen.queryByText(ALREADY_EXISTS)).toBeNull();
  expect(alertsShown()).toEqual([]);
  expect(await storedMemberNames(file, 'Brisbane')).toEqual([
    'Taylor',
    'Blake',
  ]);
});

test('[GROUPS-44.2] locks the name field while a former member is added back, without asking again', async () => {
  await startInMembers(['Blake']);
  await removeMember('Blake');
  await waitFor(() => expect(membersShown()).not.toContain('Blake'));
  await openMemberField();
  await addInField('blake');
  const writes = holdWrites();

  await pressAlertButton('Add Back');

  expect(memberField()).toBeDisabled();
  expect(barAction('Members', 'Close').disabled).toBe(true);
  expect(refusesSwipeDown(screenOf('Members'))).toBe(true);
  await pressReturn(memberField()!);
  expect(alertsShown()).toEqual([addBackAlert('Blake')]);
  await writes.release();
  await settle();
  await waitFor(() =>
    expect(membersShown()).toEqual(['Taylor (You)', 'Blake']),
  );
});

test('[GROUPS-44.2] locks Rename Member while the new name is saved', async () => {
  await startInMembers(['Blak']);
  await openRenameMember('Blak');
  await fireEvent.changeText(memberNameField(), 'Blake');
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

test('[GROUPS-44.2] locks Rename Group while the new name is saved', async () => {
  await startWithName();
  await createGroup('Trip');
  await openGroup('Trip');
  await openRenameGroup('Trip');
  await fireEvent.changeText(groupNameField(), 'Tokyo');
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

test('[GROUPS-44.2] unlocks the name field and Members once the save fails', async () => {
  await startInMembers();
  await openMemberField();
  await fireEvent.changeText(memberField()!, 'Blake');
  const writes = holdWrites();
  await pressReturn(memberField()!);

  await writes.fail();
  await settle();

  expect(memberField()).not.toBeDisabled();
  expect(barAction('Members', 'Close').disabled).toBe(false);
  expect(refusesSwipeDown(screenOf('Members'))).toBe(false);
  // Usable, not only enabled: the name takes typing, and Close closes Members.
  await fireEvent.changeText(memberField()!, 'Blake K.');
  expect(memberField()).toHaveDisplayValue('Blake K.', AS_TYPED);
  await pressOnBar('Members', 'Close');
  await expectClosed('Members');
});

test('[GROUPS-44.2] unlocks Rename Member once its save fails', async () => {
  await startInMembers(['Blak']);
  await openRenameMember('Blak');
  await fireEvent.changeText(memberNameField(), 'Blake');
  const writes = holdWrites();
  await pressOnBar('Rename Member', 'Save');

  await writes.fail();
  await settle();

  expect(barAction('Rename Member', 'Cancel').disabled).toBe(false);
  expect(barAction('Rename Member', 'Save').disabled).toBe(false);
  expect(memberNameField()).not.toBeDisabled();
  expect(refusesSwipeDown(screenOf('Rename Member'))).toBe(false);
  await fireEvent.changeText(memberNameField(), 'Blake K.');
  expect(memberNameField()).toHaveDisplayValue('Blake K.', AS_TYPED);
  await pressOnBar('Rename Member', 'Cancel');
  await expectClosed('Rename Member');
});

test('[GROUPS-44.2] unlocks Rename Group once its save fails', async () => {
  await startWithName();
  await createGroup('Trip');
  await openGroup('Trip');
  await openRenameGroup('Trip');
  await fireEvent.changeText(groupNameField(), 'Tokyo');
  const writes = holdWrites();
  await pressOnBar('Rename Group', 'Save');

  await writes.fail();
  await settle();

  expect(barAction('Rename Group', 'Cancel').disabled).toBe(false);
  expect(barAction('Rename Group', 'Save').disabled).toBe(false);
  expect(groupNameField()).not.toBeDisabled();
  expect(refusesSwipeDown(screenOf('Rename Group'))).toBe(false);
  await fireEvent.changeText(groupNameField(), 'Kyoto');
  expect(groupNameField()).toHaveDisplayValue('Kyoto', AS_TYPED);
  await pressOnBar('Rename Group', 'Cancel');
  await expectClosed('Rename Group');
});

test("[GROUPS-45.2] asks the keyboard of Members' name field and of each name form to capitalize each word, not to autocorrect, and to show a done key", async () => {
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

  await openMemberField();
  expect(keyboard(memberField()!)).toEqual(expected);
  await pressReturn(memberField()!);
  await waitFor(() => expect(memberField()).toBeUndefined());

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

test('[GROUPS-46.1] leaves your member name in each group as it was when you save a new name in Settings', async () => {
  await startWithName('Taylor');
  await createGroup('Brisbane');
  const before = await storedGroups(file);

  await saveName('Sam');

  expect(await storedGroups(file)).toEqual(before);
  await openWithMembers('Brisbane', []);
  await expectMembers(['Taylor (You)', 'Add Member']);
});

test('[GROUPS-46.1] leaves your name and your member names in other groups as they were when you rename yourself in a group', async () => {
  const app = await startWithName('Taylor');
  await createGroup('Brisbane');
  await createGroup('Tokyo');
  await openWithMembers('Brisbane', []);
  await openRenameMember('Taylor (You)', 'Taylor');
  await fireEvent.changeText(memberNameField(), 'Sam');

  await pressOnBar('Rename Member', 'Save');

  await expectMembers(['Sam (You)', 'Add Member']);
  expect(await storedMemberNames(file, 'Tokyo')).toEqual(['Taylor']);
  await tapTab('Settings');
  expect(screen.getByLabelText('Your name')).toHaveDisplayValue('Taylor');
  // Your name is read back from the local data after a restart.
  await restart(app);
  await tapTab('Settings');
  expect(screen.getByLabelText('Your name')).toHaveDisplayValue('Taylor');
});

// The shell's rules on the new screens

test("[SHELL-34.1] uses colors that follow the appearance on a group's screen, Members and the name forms", async () => {
  await startInMembers(['Blake']);
  const compare = async () => {
    const light = { colors: fixedColors(), uncolored: textsWithoutColor() };
    await switchPhoneTo('dark');
    const dark = { colors: fixedColors(), uncolored: textsWithoutColor() };
    await switchPhoneTo('light');
    expect(colorsInBoth(light.colors, dark.colors)).toEqual([]);
    expect([...light.uncolored, ...dark.uncolored]).toEqual([]);
  };

  await compare();
  const adding = await startAddingMember();
  await fireEvent.changeText(memberNameField(), 'Blake');
  if (adding.inForm) await pressOnBar('Add Member', 'Add');
  else await pressReturn(memberNameField());
  expect(screen.getByText(ALREADY_EXISTS)).toBeOnTheScreen();
  await compare();
  await stopAddingMember(adding);
  await openRenameMember('Blake');
  await compare();
  await pressOnBar('Rename Member', 'Cancel');
  await expectClosed('Rename Member');
  await pressOnBar('Members', 'Close');
  await expectClosed('Members');
  await openRenameGroup('Brisbane');
  await compare();
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
  const adding = await startAddingMember();
  expect(translucentViews()).toEqual([]);
  await stopAddingMember(adding);
  await openRenameMember('Blake');
  expect(translucentViews()).toEqual([]);
  await pressOnBar('Rename Member', 'Cancel');
  await expectClosed('Rename Member');
  await pressOnBar('Members', 'Close');
  await expectClosed('Members');
  await openRenameGroup('Brisbane');
  expect(translucentViews()).toEqual([]);
});
