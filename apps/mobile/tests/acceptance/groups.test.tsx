import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Alert } from 'react-native';
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
  nativeViews,
  navigationBarTitles,
  navigationBars,
  selectedTab,
  tab,
} from './shell-tabs-app';
import {
  CREATE_FAILED,
  EMPTY_LIST,
  USERNAME_REQUIRED,
  addGroupButton,
  alertsShown,
  barButtons,
  cardNames,
  cards,
  createGroup,
  expectNewGroupClosed,
  expectNewGroupOpen,
  groupsRoot,
  inTreeOrder,
  lastAlertButtons,
  localData,
  nameField,
  newGroupIsOpen,
  newGroupScreen,
  press,
  pressAddGroup,
  pressAlertButton,
  pressReturn,
  readIdentity,
  refusesSwipeDown,
  saveName,
  scrollViewTheTitleFollows,
  sharedAddButtons,
  startGroupsApp,
  storedGroups,
  titleBarAction,
  typeName,
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

// Runs on iOS; groups-android.test.tsx checks what Android shows differently. The
// phone database is a file each test chooses (ADR-0006), so a test can restart the
// app on the same data, and hold or fail its writes as a slow or full disk would.

let mockOpen: () => Promise<Database>;

jest.mock('../../src/storage/expo', () => ({
  openPhoneDatabase: () => mockOpen(),
}));

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const NOTE = 'Members can be added after the group is created.';
/** The ways iOS presents a screen as a sheet that rises from the bottom. */
const SHEETS = ['formSheet', 'pageSheet', 'modal'];
// Compares the field's text as typed, spaces included.
const AS_TYPED = { normalizer: (text: string) => text };

let directory: string;
let file: string;
let alert: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'groups-'));
  file = path.join(directory, 'app.db');
  mockOpen = async () => testDatabase(file);
  allowWrites();
  fakePhoneAppearance('light');
  fakeReduceTransparency(false);
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
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

/** Starts the app with `name` saved, then restarts it at `url`. */
async function restartWithName(url: string, name = 'Taylor') {
  const first = await startWithName(name);
  first.unmount();
  return startGroupsApp(url);
}

async function openNewGroup() {
  await pressAddGroup();
  await expectNewGroupOpen();
}

const storedNames = async () =>
  (await storedGroups(file)).map((group) => group.name);

async function openCard(name: string) {
  fireEvent.press(
    within(groupsRoot()).getByRole('button', { name: `Open ${name}` }),
  );
  await settle();
}

test('[GROUPS-1.1] says there are no groups yet on the Groups root of a new app', async () => {
  await startGroupsApp();

  expect(within(groupsRoot()).getByText(EMPTY_LIST)).toBeOnTheScreen();
  expect(cards()).toEqual([]);
});

test('[GROUPS-1.1] stops saying there are no groups once one is created', async () => {
  await startWithName();

  await createGroup('Brisbane');

  expect(within(groupsRoot()).queryByText(EMPTY_LIST)).toBeNull();
  expect(cardNames()).toEqual(['Open Brisbane']);
});

test('[GROUPS-2.1] lists the groups in the order they were created, each a button showing its name', async () => {
  await startWithName();

  for (const name of ['Brisbane', 'Tokyo', 'Paris']) await createGroup(name);

  expect(cardNames()).toEqual(['Open Brisbane', 'Open Tokyo', 'Open Paris']);
  ['Brisbane', 'Tokyo', 'Paris'].forEach((name, index) =>
    expect(within(cards()[index]).getByText(name)).toBeOnTheScreen(),
  );
});

test('[GROUPS-2.1] keeps a group created after the phone clock went back below the earlier one', async () => {
  const app = await startWithName();
  jest.setSystemTime(new Date('2026-10-30T12:00:00Z'));
  await createGroup('Brisbane');
  jest.setSystemTime(new Date('2026-10-29T12:00:00Z'));
  await createGroup('Tokyo');
  expect(cardNames()).toEqual(['Open Brisbane', 'Open Tokyo']);
  app.unmount();

  await startGroupsApp();

  await waitFor(() =>
    expect(cardNames()).toEqual(['Open Brisbane', 'Open Tokyo']),
  );
});

test('[GROUPS-3.1] shows the shared + button named Add group on the Groups root, with or without groups', async () => {
  await startWithName();

  expect(sharedAddButtons()).toEqual(['Add group']);
  expect(addGroupButton()).toBeOnTheScreen();
  await createGroup('Brisbane');
  expect(sharedAddButtons()).toEqual(['Add group']);
});

test('[GROUPS-4.1] asks for a name instead of opening New Group before a name is saved', async () => {
  await startGroupsApp();

  await pressAddGroup();

  expect(alertsShown(alert)).toEqual([USERNAME_REQUIRED]);
  expect(lastAlertButtons(alert)).toEqual(['Cancel', 'Go to Settings']);
  expect(newGroupIsOpen()).toBe(false);
});

test('[GROUPS-4.1] goes to the Settings root from the name alert', async () => {
  await startGroupsApp();
  await pressAddGroup();

  await pressAlertButton(alert, 'Go to Settings');

  expect(selectedTab()).toBe('Settings');
  expect(navigationBarTitles(tab('Settings'))).toEqual(['Settings']);
});

test('[GROUPS-4.1] stays on the Groups root when the name alert is cancelled', async () => {
  const app = await startGroupsApp();
  await pressAddGroup();

  await pressAlertButton(alert, 'Cancel');

  expect(selectedTab()).toBe('Groups');
  expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups']);
  expect(app.getPathname()).toBe('/groups');
  expect(newGroupIsOpen()).toBe(false);
});

test('[GROUPS-5.1] opens New Group as a sheet over the Groups root once a name is saved', async () => {
  await startWithName();

  await openNewGroup();

  expect(SHEETS).toContain(newGroupScreen().props.stackPresentation);
  expect(selectedTab()).toBe('Groups');
  expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups', 'New Group']);
  expect(alertsShown(alert)).toEqual([]);
});

test('[GROUPS-5.1] opens one New Group when Add group is pressed twice', async () => {
  await startWithName();
  const button = addGroupButton();

  fireEvent.press(button);
  fireEvent.press(button);
  await settle();

  await expectNewGroupOpen();
  expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups', 'New Group']);
  await press('Cancel');
  await expectNewGroupClosed();
  expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups']);
});

test('[GROUPS-6.1] titles New Group with Cancel on the left and Create on the right of its bar', async () => {
  await startWithName();

  await openNewGroup();

  expect(barButtons()).toEqual({
    left: ['Cancel (plain)'],
    right: ['Create (prominent)'],
  });
});

test('[GROUPS-6.1] shows only the Name row under GROUP DETAILS, then the note', async () => {
  await startWithName();

  await openNewGroup();

  const sheet = newGroupScreen();
  expect(
    inTreeOrder(
      within(sheet).getByText('GROUP DETAILS'),
      within(sheet).getByText('Name'),
      nameField(),
      within(sheet).getByText(NOTE),
    ),
  ).toBe(true);
  expect(nativeViews(/^TextInput$/, sheet)).toHaveLength(1);
});

test('[GROUPS-6.1] opens with an empty name field named Group name, which has the focus', async () => {
  await startWithName();

  await openNewGroup();

  expect(nameField()).toHaveDisplayValue('', AS_TYPED);
  expect(screen.getByPlaceholderText('Group name')).toBe(nameField());
  expect(nameField().props.autoFocus).toBe(true);
});

test('[GROUPS-7.1] disables Create until the name has more than spaces', async () => {
  await startWithName();
  await openNewGroup();

  expect(titleBarAction('Create').disabled).toBe(true);
  typeName('   ');
  expect(titleBarAction('Create').disabled).toBe(true);
  typeName('Brisbane');
  expect(titleBarAction('Create').disabled).toBe(false);
});

test('[GROUPS-7.1] disables Create again when the name is cleared', async () => {
  await startWithName();
  await openNewGroup();

  typeName('Brisbane');
  typeName('');

  expect(titleBarAction('Create').disabled).toBe(true);
  expect(titleBarAction('Cancel').disabled).toBe(false);
});

test('[GROUPS-8.1] creates the group with the name trimmed, closes New Group, and lists the group last', async () => {
  const app = await startWithName();
  await createGroup('Tokyo');
  await openNewGroup();
  typeName(' Brisbane ');

  await press('Create');

  await expectNewGroupClosed();
  expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups']);
  expect(app.getPathname()).toBe('/groups');
  expect(cardNames()).toEqual(['Open Tokyo', 'Open Brisbane']);
  expect(await storedNames()).toEqual(['Tokyo', 'Brisbane']);
  expect(alertsShown(alert)).toEqual([]);
});

test('[GROUPS-8.1] creates the group when Return is pressed in the name field', async () => {
  await startWithName();
  await openNewGroup();
  typeName('Tokyo');

  await pressReturn();

  await expectNewGroupClosed();
  expect(cardNames()).toEqual(['Open Tokyo']);
  expect(await storedNames()).toEqual(['Tokyo']);
});

test('[GROUPS-8.1] creates nothing when Return is pressed with only spaces as the name', async () => {
  await startWithName();
  await openNewGroup();
  typeName('   ');

  await pressReturn();

  expect(newGroupIsOpen()).toBe(true);
  expect(await storedGroups(file)).toEqual([]);
  expect(alertsShown(alert)).toEqual([]);
});

test('[GROUPS-8.1] keeps a name of 300 characters in full', async () => {
  await startWithName();
  await openNewGroup();
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

  await user.type(nameField(), 'a'.repeat(300));
  expect(nameField()).toHaveDisplayValue('a'.repeat(300), AS_TYPED);
  await press('Create');

  await expectNewGroupClosed();
  expect(await storedNames()).toEqual(['a'.repeat(300)]);
});

test('[GROUPS-8.1] creates a second group with the same name', async () => {
  await startWithName();

  await createGroup('Trip');
  await createGroup('Trip');

  expect(cardNames()).toEqual(['Open Trip', 'Open Trip']);
  const [first, second] = await storedGroups(file);
  expect([first.name, second.name]).toEqual(['Trip', 'Trip']);
  expect(first.id).not.toBe(second.id);
});

test('[GROUPS-8.1] creates one group when Create is pressed twice before it is saved', async () => {
  await startWithName();
  await openNewGroup();
  typeName('Brisbane');
  const create = titleBarAction('Create');

  act(() => {
    create.press();
    create.press();
  });
  await settle();

  await expectNewGroupClosed();
  expect(cardNames()).toEqual(['Open Brisbane']);
  expect(await storedNames()).toEqual(['Brisbane']);
});

test('[GROUPS-8.1] ignores Return while the group is being created', async () => {
  await startWithName();
  await openNewGroup();
  typeName('Brisbane');
  const writes = holdWrites();

  await press('Create');
  await pressReturn();
  await writes.release();
  await settle();

  await expectNewGroupClosed();
  expect(await storedNames()).toEqual(['Brisbane']);
});

test('[GROUPS-9.1] makes you the only member of a new group, with new version 4 IDs', async () => {
  await startWithName('Taylor');

  await createGroup('Brisbane');

  const [group] = await storedGroups(file);
  const identity = await readIdentity();
  expect(group.members).toHaveLength(1);
  const [member] = group.members;
  expect(member).toMatchObject({ userId: identity.userId, name: 'Taylor' });
  expect(group.id).toMatch(UUID_V4);
  expect(member.id).toMatch(UUID_V4);
  const ids = [
    group.id,
    member.id,
    identity.userId,
    identity.personalSpaceId,
    identity.personalParticipantId,
  ];
  expect(new Set(ids).size).toBe(ids.length);
});

test('[GROUPS-9.1] gives a later group new IDs and the name you have when you create it', async () => {
  await startWithName('Taylor');
  await createGroup('Brisbane');
  await saveName('Sam');

  await createGroup('Tokyo');

  const [brisbane, tokyo] = await storedGroups(file);
  expect(tokyo.members).toHaveLength(1);
  expect(tokyo.members[0]).toMatchObject({
    name: 'Sam',
    userId: brisbane.members[0].userId,
  });
  expect(tokyo.id).toMatch(UUID_V4);
  expect(tokyo.members[0].id).toMatch(UUID_V4);
  expect(tokyo.id).not.toBe(brisbane.id);
  expect(tokyo.members[0].id).not.toBe(brisbane.members[0].id);
});

test('[GROUPS-10.1] asks for a name and creates nothing when Create is pressed before a name is saved', async () => {
  await startGroupsApp('/groups/new');
  await expectNewGroupOpen();
  typeName('Brisbane');

  await press('Create');

  expect(alertsShown(alert)).toEqual([USERNAME_REQUIRED]);
  expect(lastAlertButtons(alert)).toEqual(['Cancel', 'Go to Settings']);
  expect(await storedGroups(file)).toEqual([]);
});

test('[GROUPS-10.1] asks for a name when Return is pressed before a name is saved', async () => {
  await startGroupsApp('/groups/new');
  await expectNewGroupOpen();
  typeName('Brisbane');

  await pressReturn();

  expect(alertsShown(alert)).toEqual([USERNAME_REQUIRED]);
  expect(await storedGroups(file)).toEqual([]);
});

test('[GROUPS-10.1] keeps New Group and its name when the name alert is cancelled', async () => {
  await startGroupsApp('/groups/new');
  await expectNewGroupOpen();
  typeName('Brisbane');
  await press('Create');

  await pressAlertButton(alert, 'Cancel');

  expect(newGroupIsOpen()).toBe(true);
  expect(nameField()).toHaveDisplayValue('Brisbane', AS_TYPED);
  expect(await storedGroups(file)).toEqual([]);
});

test('[GROUPS-10.1] closes New Group and goes to the Settings root from the name alert', async () => {
  await startGroupsApp('/groups/new');
  await expectNewGroupOpen();
  typeName('Brisbane');
  await press('Create');

  await pressAlertButton(alert, 'Go to Settings');

  await expectNewGroupClosed();
  expect(selectedTab()).toBe('Settings');
  expect(navigationBarTitles(tab('Settings'))).toEqual(['Settings']);
  expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups']);
  expect(await storedGroups(file)).toEqual([]);
});

test('[GROUPS-11.1] disables Cancel and Create and locks the name until the group is saved', async () => {
  await startWithName();
  await openNewGroup();
  typeName('Brisbane');
  const writes = holdWrites();

  await press('Create');

  expect(titleBarAction('Cancel').disabled).toBe(true);
  expect(titleBarAction('Create').disabled).toBe(true);
  expect(nameField()).toBeDisabled();
  expect(newGroupIsOpen()).toBe(true);
  await writes.release();
  await settle();
  await expectNewGroupClosed();
  expect(cardNames()).toEqual(['Open Brisbane']);
});

test('[GROUPS-11.1] keeps New Group from being swiped down until the group is saved', async () => {
  await startWithName();
  await openNewGroup();
  typeName('Brisbane');
  const writes = holdWrites();

  await press('Create');

  expect(refusesSwipeDown(newGroupScreen())).toBe(true);
  await writes.release();
  await settle();
  await expectNewGroupClosed();
  expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups']);
});

test('[GROUPS-11.1] unlocks Cancel, Create, the name and swiping down once the save fails', async () => {
  await startWithName();
  await openNewGroup();
  typeName('Brisbane');
  const writes = holdWrites();
  await press('Create');

  await writes.fail();
  await settle();

  expect(titleBarAction('Cancel').disabled).toBe(false);
  expect(titleBarAction('Create').disabled).toBe(false);
  expect(nameField()).toBeEnabled();
  expect(refusesSwipeDown(newGroupScreen())).toBe(false);
});

test('[GROUPS-12.1] alerts, keeps New Group with its name, and leaves the local data as it was when nothing can be written', async () => {
  await startWithName();
  await openNewGroup();
  typeName('Brisbane');
  const before = localData(file);
  failWrites();

  await press('Create');

  expect(alertsShown(alert)).toEqual([CREATE_FAILED]);
  expect(newGroupIsOpen()).toBe(true);
  expect(nameField()).toHaveDisplayValue('Brisbane', AS_TYPED);
  expect(titleBarAction('Create').disabled).toBe(false);
  expect(localData(file)).toEqual(before);
});

test('[GROUPS-12.1] leaves the local data as it was whichever write of the new group fails', async () => {
  await startWithName();
  await openNewGroup();
  typeName('Brisbane');
  const before = localData(file);

  // Each attempt lets one more write through before the disk fills up, until
  // every write of the group gets through.
  let writesThrough = 0;
  for (; writesThrough < 20; writesThrough += 1) {
    alert.mockClear();
    failWritesAfter(writesThrough);
    await press('Create');
    if (!newGroupIsOpen()) break;
    expect(alertsShown(alert)).toEqual([CREATE_FAILED]);
    expect(localData(file)).toEqual(before);
  }

  expect(writesThrough).toBeGreaterThan(0);
  await expectNewGroupClosed();
  expect(await storedNames()).toEqual(['Brisbane']);
});

test('[GROUPS-12.1] creates the group once when Create is pressed again after writes recover', async () => {
  await startWithName();
  await openNewGroup();
  typeName('Brisbane');
  failWrites();
  await press('Create');
  allowWrites();

  await press('Create');

  await expectNewGroupClosed();
  expect(cardNames()).toEqual(['Open Brisbane']);
  expect(await storedNames()).toEqual(['Brisbane']);
});

test('[GROUPS-12.1] creates no group when New Group is cancelled after a failed save', async () => {
  await startWithName();
  await openNewGroup();
  typeName('Brisbane');
  failWrites();
  await press('Create');
  allowWrites();

  await press('Cancel');

  await expectNewGroupClosed();
  expect(cards()).toEqual([]);
  expect(await storedGroups(file)).toEqual([]);
});

test('[GROUPS-13.1] closes New Group without creating a group when Cancel is pressed', async () => {
  await startWithName();
  await openNewGroup();
  typeName('Brisbane');

  await press('Cancel');

  await expectNewGroupClosed();
  expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups']);
  expect(within(groupsRoot()).getByText(EMPTY_LIST)).toBeOnTheScreen();
  expect(await storedGroups(file)).toEqual([]);
  await openNewGroup();
  expect(nameField()).toHaveDisplayValue('', AS_TYPED);
});

test('[GROUPS-13.1] lets New Group be swiped down without creating a group', async () => {
  await startWithName();
  await openNewGroup();
  typeName('Brisbane');
  const sheet = newGroupScreen();
  expect(refusesSwipeDown(sheet)).toBe(false);

  // A swipe down dismisses the native sheet, which reports it as dismissed.
  act(() => {
    fireEvent(sheet, 'dismissed', { nativeEvent: { dismissCount: 1 } });
  });
  await settle();

  await expectNewGroupClosed();
  expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups']);
  expect(await storedGroups(file)).toEqual([]);
});

test('[GROUPS-14.1] has the URL /groups/new while New Group is open', async () => {
  const app = await startWithName();

  await openNewGroup();

  expect(app.getPathname()).toBe('/groups/new');
});

test('[GROUPS-14.1] opens New Group over the Groups root at /groups/new, and closes it to the Groups root', async () => {
  const app = await restartWithName('/groups/new');

  await expectNewGroupOpen();
  expect(selectedTab()).toBe('Groups');
  expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups', 'New Group']);
  await press('Cancel');

  await expectNewGroupClosed();
  expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups']);
  expect(app.getPathname()).toBe('/groups');
});

test('[GROUPS-14.1] lists a group created in a New Group opened at /groups/new', async () => {
  await restartWithName('/groups/new');
  await expectNewGroupOpen();
  typeName('Brisbane');

  await press('Create');

  await expectNewGroupClosed();
  expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups']);
  expect(cardNames()).toEqual(['Open Brisbane']);
});

test("[GROUPS-14.1] has the URL /groups/<group ID> on a group's screen", async () => {
  const app = await startWithName();
  await createGroup('Brisbane');
  const [brisbane] = await storedGroups(file);

  await openCard('Brisbane');

  expect(app.getPathname()).toBe(`/groups/${brisbane.id}`);
});

test("[GROUPS-14.1] opens a group's screen over the Groups root at its URL", async () => {
  const first = await startWithName();
  await createGroup('Brisbane');
  first.unmount();
  const [brisbane] = await storedGroups(file);

  const app = await startGroupsApp(`/groups/${brisbane.id}`);

  expect(selectedTab()).toBe('Groups');
  await waitFor(() =>
    expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups', 'Brisbane']),
  );
  expect(app.getPathname()).toBe(`/groups/${brisbane.id}`);
});

test('[GROUPS-15.1] pushes the screen of the group pressed, titled with its name, onto the Groups tab', async () => {
  await startWithName();
  await createGroup('Brisbane');
  await createGroup('Tokyo');

  await openCard('Tokyo');

  expect(selectedTab()).toBe('Groups');
  await waitFor(() =>
    expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups', 'Tokyo']),
  );
});

test('[GROUPS-15.1] opens the later of two groups with the same name from its card', async () => {
  const app = await startWithName();
  await createGroup('Trip');
  await createGroup('Trip');
  const [, later] = await storedGroups(file);

  fireEvent.press(cards()[1]);
  await settle();

  expect(app.getPathname()).toBe(`/groups/${later.id}`);
  await waitFor(() =>
    expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups', 'Trip']),
  );
});

test("[SHELL-13.1] shows only a back arrow named Back on a group's screen", async () => {
  await startWithName();
  await createGroup('Brisbane');

  await openCard('Brisbane');

  await waitFor(() =>
    expect(navigationBars(tab('Groups')).at(-1)?.props.title).toBe('Brisbane'),
  );
  const pushed = navigationBars(tab('Groups')).at(-1)?.props;
  // The native stack hides the back title with backButtonDisplayMode on iOS 14
  // and later, and with backTitleVisible when it knows no iOS version, as in Jest.
  expect(pushed).toMatchObject(
    pushed?.backButtonDisplayMode === undefined
      ? { backTitle: 'Back', backTitleVisible: false }
      : { backTitle: 'Back', backButtonDisplayMode: 'minimal' },
  );
});

test('[GROUPS-16.1] keeps the groups, their order and their members after a restart', async () => {
  const app = await startWithName('Taylor');
  await createGroup('Brisbane');
  await createGroup('Tokyo');
  const before = await storedGroups(file);
  app.unmount();

  await startGroupsApp();

  await waitFor(() =>
    expect(cardNames()).toEqual(['Open Brisbane', 'Open Tokyo']),
  );
  expect(before.map((group) => group.name)).toEqual(['Brisbane', 'Tokyo']);
  expect(before.map((group) => group.members.length)).toEqual([1, 1]);
  expect(await storedGroups(file)).toEqual(before);
});

test('[SHELL-25.1] puts the Groups root content in the scroll view its large title follows', async () => {
  await startWithName();
  await createGroup('Brisbane');
  await createGroup('Tokyo');

  const scrollView = scrollViewTheTitleFollows();

  expect(scrollView?.props.contentInsetAdjustmentBehavior).toBe('automatic');
  expect(
    within(scrollView!).getByRole('button', { name: 'Open Tokyo' }),
  ).toBeOnTheScreen();
});

test('[SHELL-34.1] uses colors that follow the appearance on the Groups list and in New Group', async () => {
  await startWithName();
  await createGroup('Brisbane');
  await openNewGroup();
  typeName('Tokyo');

  const light = { colors: fixedColors(), uncolored: textsWithoutColor() };
  switchPhoneTo('dark');
  const dark = { colors: fixedColors(), uncolored: textsWithoutColor() };

  expect(colorsInBoth(light.colors, dark.colors)).toEqual([]);
  expect([...light.uncolored, ...dark.uncolored]).toEqual([]);
});

test('[SHELL-36.1] adds no blur or glass of its own to the Groups list or New Group while Reduce Transparency is on', async () => {
  fakeReduceTransparency(true);
  await startWithName();
  await createGroup('Brisbane');

  expect(translucentViews()).toEqual([]);
  await openNewGroup();
  expect(translucentViews()).toEqual([]);
});
