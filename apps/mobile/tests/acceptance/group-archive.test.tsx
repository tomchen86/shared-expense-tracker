import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { AccessibilityInfo, ActionSheetIOS, Alert } from 'react-native';
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';
import type { Database } from '../../src/storage';
import type { Group } from '../../src/groups';
import {
  navigationBarTitles,
  selectedTab,
  tab,
  tapTab,
} from './shell-tabs-app';
import {
  EMPTY_LIST,
  allowReads,
  cardNames,
  cards,
  createGroup,
  groupsRoot,
  holdReads,
  inTreeOrder,
  localData,
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
  NO_EXPENSES,
  addMember,
  alertsShown,
  barItems,
  chooseGroupAction,
  expectClosed,
  expectMembers,
  expectOpen,
  goBackFrom,
  groupNameField,
  isOpen,
  memberNameField,
  membersShown,
  openGroup,
  openMembers,
  openRenameMember,
  openWithMembers,
  pressOnBar,
  removeMember,
  screenOf,
  startAddingMember,
  stopAddingMember,
  storedMemberNames,
  textsOn,
  barAction,
  largeTitle,
  longPressLargeTitle,
} from './group-details-app';
import {
  ARCHIVED_STATUS,
  ARCHIVE_FAILED,
  NOTICE,
  NO_ARCHIVED,
  READ_ONLY,
  RESTORE_FAILED,
  accessibleName,
  archiveByAction,
  archivedCard,
  archivedCardNames,
  archivedGroupsRow,
  cardActionLabels,
  contentButton,
  contentButtons,
  isDisabled,
  noticeShown,
  openArchivedGroup,
  openArchivedGroups,
  pressRestore,
  pressRestoreGroup,
  restoreButton,
  rowCounts,
  textsIn,
} from './group-archive-app';

// Runs on iOS; group-archive-android.test.tsx checks what Android shows differently.
// The phone database is a file each test chooses (ADR-0006), so a test can restart
// the app on the same data, and hold or fail its writes as a slow or full disk would.

let mockOpen: () => Promise<Database>;

jest.mock('../../src/storage/expo', () => ({
  openPhoneDatabase: () => mockOpen(),
}));

let directory: string;
let file: string;

beforeEach(() => {
  jest.clearAllMocks();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'group-archive-'));
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

/** Starts the app on Groups with Taylor saved as your name, and creates `groups` in order. */
async function startWithGroups(groups: string[]) {
  const app = await startGroupsApp();
  await saveName('Taylor');
  for (const group of groups) await createGroup(group);
  return app;
}

/** Adds `members` to the group named `group` from its Members, then goes back to the Groups root. */
async function addMembers(group: string, members: string[]) {
  await openWithMembers(group, members);
  await pressOnBar('Members', 'Close');
  await expectClosed('Members');
  await goBackFrom(group);
}

/** Archives the group named `group` and opens its screen from Archived Groups. */
async function openArchived(group: string) {
  await archiveByAction(group);
  await openArchivedGroups();
  await openArchivedGroup(group);
}

/** What archiving must keep of each group: its ID, its name and its members. */
const idsNamesAndMembers = (groups: Group[]) =>
  groups.map(({ id, name, members }) => ({ id, name, members }));

const actionSheets = () =>
  jest.mocked(ActionSheetIOS.showActionSheetWithOptions).mock.calls;

const announcements = () =>
  [
    ...jest.mocked(AccessibilityInfo.announceForAccessibility).mock.calls,
    ...jest.mocked(AccessibilityInfo.announceForAccessibilityWithOptions).mock
      .calls,
  ].map(([message]) => message);

const clearAlerts = () => jest.mocked(Alert.alert).mockClear();

/** Moves the faked clock on by `ms` milliseconds. */
const wait = (ms: number) => act(() => jest.advanceTimersByTime(ms));

// The Groups root

/** Leaves the Groups root for Settings and comes back, so it reads the groups again. */
async function reopenGroupsRoot() {
  await tapTab('Settings');
  await tapTab('Groups');
  await settle();
}

test('[GROUPS-1.2] says there are no groups yet once the only group is archived', async () => {
  await startWithGroups(['Brisbane']);

  await archiveByAction('Brisbane');

  await waitFor(() => expect(cards()).toEqual([]));
  expect(within(groupsRoot()).getByText(EMPTY_LIST)).toBeOnTheScreen();
  await reopenGroupsRoot();
  expect(cards()).toEqual([]);
  expect(within(groupsRoot()).getByText(EMPTY_LIST)).toBeOnTheScreen();
});

test('[GROUPS-2.2] leaves an archived group out of the Groups root', async () => {
  await startWithGroups(['Brisbane', 'Tokyo', 'Paris']);

  await archiveByAction('Tokyo');

  await waitFor(() =>
    expect(cardNames()).toEqual(['Open Brisbane', 'Open Paris']),
  );
  await reopenGroupsRoot();
  expect(cardNames()).toEqual(['Open Brisbane', 'Open Paris']);
});

// Archiving

test('[GROUPS-48.1] gives every group card an Archive group accessibility action', async () => {
  await startWithGroups(['Brisbane', 'Tokyo']);

  expect(cardActionLabels('Brisbane')).toContain('Archive group');
  expect(cardActionLabels('Tokyo')).toContain('Archive group');
});

test('[GROUPS-48.1] archives a group from its card without asking, keeping its ID, name and members', async () => {
  await startWithGroups(['Brisbane', 'Tokyo']);
  await addMembers('Brisbane', ['Blake']);
  const before = idsNamesAndMembers(await storedGroups(file));

  await archiveByAction('Brisbane');

  expect(alertsShown()).toEqual([]);
  expect(actionSheets()).toEqual([]);
  await waitFor(() => expect(cardNames()).toEqual(['Open Tokyo']));
  // listGroups lists archived groups too.
  expect(idsNamesAndMembers(await storedGroups(file))).toEqual(before);
  expect(await storedMemberNames(file, 'Brisbane')).toEqual([
    'Taylor',
    'Blake',
  ]);
});

test('[GROUPS-48.1] keeps the card on the Groups root until the archive is saved', async () => {
  await startWithGroups(['Brisbane']);
  const writes = holdWrites();

  await archiveByAction('Brisbane');

  expect(cardNames()).toEqual(['Open Brisbane']);
  await writes.release();
  await settle();
  await waitFor(() => expect(cardNames()).toEqual([]));
});

// The notice

test('[GROUPS-49.1] shows and announces that the group was archived, for 4.5 seconds', async () => {
  await startWithGroups(['Brisbane']);

  await archiveByAction('Brisbane');

  expect(screen.getByText(NOTICE)).toBeOnTheScreen();
  expect(announcements()).toEqual([NOTICE]);
  await wait(4400);
  expect(noticeShown()).toBe(true);
  await wait(100);
  expect(noticeShown()).toBe(false);
});

test('[GROUPS-49.1] counts the 4.5 seconds again when another group is archived before the notice goes', async () => {
  await startWithGroups(['Brisbane', 'Tokyo']);
  await archiveByAction('Brisbane');
  await wait(3000);

  await archiveByAction('Tokyo');

  expect(announcements()).toEqual([NOTICE, NOTICE]);
  await wait(4400);
  expect(noticeShown()).toBe(true);
  await wait(100);
  expect(noticeShown()).toBe(false);
});

test('[GROUPS-49.1] shows no notice before the archive is saved', async () => {
  await startWithGroups(['Brisbane']);
  const writes = holdWrites();

  await archiveByAction('Brisbane');

  expect(noticeShown()).toBe(false);
  expect(announcements()).toEqual([]);
  await writes.release();
  await settle();
  expect(noticeShown()).toBe(true);
});

// When the archive is not saved

test('[GROUPS-50.1] says the group could not be archived, and keeps it, when the write fails', async () => {
  await startWithGroups(['Brisbane']);
  const before = localData(file);
  failWrites();

  await archiveByAction('Brisbane');

  expect(alertsShown()).toEqual([ARCHIVE_FAILED]);
  expect(noticeShown()).toBe(false);
  expect(announcements()).toEqual([]);
  expect(cardNames()).toEqual(['Open Brisbane']);
  expect(localData(file)).toEqual(before);
});

test('[GROUPS-50.1] keeps the group as it was whichever write of the archive fails', async () => {
  await startWithGroups(['Brisbane']);
  const before = localData(file);

  let writesThrough = 0;
  for (; writesThrough < 20; writesThrough += 1) {
    clearAlerts();
    failWritesAfter(writesThrough);
    await archiveByAction('Brisbane');
    if (alertsShown().length === 0) break;
    expect(alertsShown()).toEqual([ARCHIVE_FAILED]);
    expect(localData(file)).toEqual(before);
  }

  expect(writesThrough).toBeGreaterThan(0);
  await waitFor(() => expect(cardNames()).toEqual([]));
});

test('[GROUPS-50.1] archives the group when it is archived again after writes recover', async () => {
  await startWithGroups(['Brisbane']);
  failWrites();
  await archiveByAction('Brisbane');
  allowWrites();

  await archiveByAction('Brisbane');

  await waitFor(() => expect(cardNames()).toEqual([]));
  expect(noticeShown()).toBe(true);
});

// The Archived Groups row on the Settings root

test('[GROUPS-51.1] shows 0 next to Archived Groups on the Settings root of a new app', async () => {
  await startGroupsApp();

  await tapTab('Settings');

  await waitFor(() => expect(rowCounts()).toEqual(['0']));
  const row = archivedGroupsRow();
  expect(accessibleName(row)).toBe('Archived groups, 0');
  expect(
    inTreeOrder(
      within(row).getByText('Archived Groups'),
      within(row).getByText('0'),
    ),
  ).toBe(true);
});

test('[GROUPS-51.1] counts the archived groups next to Archived Groups', async () => {
  await startWithGroups(['Brisbane', 'Tokyo', 'Paris']);
  await archiveByAction('Brisbane');
  await archiveByAction('Tokyo');

  await tapTab('Settings');

  await waitFor(() => expect(rowCounts()).toEqual(['2']));
  expect(accessibleName(archivedGroupsRow())).toBe('Archived groups, 2');
});

test('[GROUPS-51.1] counts one fewer once a group is restored', async () => {
  await startWithGroups(['Brisbane', 'Tokyo']);
  await archiveByAction('Brisbane');
  await archiveByAction('Tokyo');
  await openArchivedGroups();
  await pressRestore('Tokyo');
  await waitFor(() => expect(archivedCardNames()).toEqual(['Open Brisbane']));

  await goBackFrom('Archived Groups');

  await waitFor(() => expect(rowCounts()).toEqual(['1']));
  expect(accessibleName(archivedGroupsRow())).toBe('Archived groups, 1');
});

test('[GROUPS-51.1] shows no count next to Archived Groups while the stored groups load', async () => {
  const first = await startWithGroups(['Brisbane']);
  await archiveByAction('Brisbane');
  await first.unmount();
  await settle();
  const reads = holdReads();

  await startGroupsApp();
  await tapTab('Settings');
  await settle();

  expect(rowCounts()).toEqual([]);
  expect(accessibleName(archivedGroupsRow())).toBe('Archived groups');
  await reads.release();
  await waitFor(() => expect(rowCounts()).toEqual(['1']));
  expect(accessibleName(archivedGroupsRow())).toBe('Archived groups, 1');
});

// Archived Groups

test('[GROUPS-52.1] says there are no archived groups when none is', async () => {
  await startWithGroups(['Brisbane']);

  await openArchivedGroups();

  await waitFor(() =>
    expect(textsOn('Archived Groups')).toEqual([NO_ARCHIVED]),
  );
  expect(archivedCardNames()).toEqual([]);
});

test('[GROUPS-52.1] lists only the archived groups, in the order they were created', async () => {
  await startWithGroups(['Tokyo', 'Brisbane', 'Lisbon', 'Paris']);
  // A minute apart, so a list in the order they were archived, oldest or newest
  // first, differs, and so does a list in the order of their names.
  await archiveByAction('Brisbane');
  await wait(60_000);
  await archiveByAction('Tokyo');
  await wait(60_000);
  await archiveByAction('Paris');

  await openArchivedGroups();

  await waitFor(() =>
    expect(archivedCardNames()).toEqual([
      'Open Tokyo',
      'Open Brisbane',
      'Open Paris',
    ]),
  );
  expect(textsOn('Archived Groups')).not.toContain(NO_ARCHIVED);
});

test('[GROUPS-52.1] never says there are no archived groups while the stored groups load', async () => {
  await startWithGroups(['Brisbane']);
  await archiveByAction('Brisbane');
  const reads = holdReads();

  await openArchivedGroups();
  await settle();

  expect(screen.queryByText(NO_ARCHIVED)).toBeNull();
  await reads.release();
  await waitFor(() => expect(archivedCardNames()).toEqual(['Open Brisbane']));
  expect(screen.queryByText(NO_ARCHIVED)).toBeNull();
});

test('[GROUPS-53.2] shows the name and Archived group on the card of an archived group, with a Restore button of its own', async () => {
  await startWithGroups(['Brisbane']);
  await archiveByAction('Brisbane');

  await openArchivedGroups();

  await waitFor(() => expect(archivedCardNames()).toEqual(['Open Brisbane']));
  const shown = archivedCard('Brisbane');
  expect(textsIn(shown)).toEqual(['Brisbane', ARCHIVED_STATUS]);
  const restore = restoreButton('Brisbane');
  expect(textsIn(restore)).toEqual(['Restore']);
  // Outside the card, so a screen reader reaches the card and Restore one at a time.
  expect(shown.queryAll((view) => view === restore)).toEqual([]);
});

test('[GROUPS-53.2] shows a long name on one line of its archived card, cut off at the end', async () => {
  const name = 'a'.repeat(300);
  await startWithGroups([name]);
  await archiveByAction(name);

  await openArchivedGroups();

  await waitFor(() => expect(archivedCardNames()).toEqual([`Open ${name}`]));
  // Jest lays nothing out, so the test reads what the card asks the native text for.
  const shown = within(archivedCard(name)).getByText(name);
  expect(shown.props.numberOfLines).toBe(1);
  expect(shown.props.ellipsizeMode).toBe('clip');
  expect(accessibleName(restoreButton(name))).toBe(`Restore ${name}`);
});

// An archived group's screen on the Settings tab

test("[GROUPS-54.1] pushes an archived group's screen onto the Settings tab when its card is pressed", async () => {
  const app = await startWithGroups(['Brisbane']);
  const [brisbane] = await storedGroups(file);

  await openArchived('Brisbane');

  expect(selectedTab()).toBe('Settings');
  expect(navigationBarTitles(tab('Settings'))).toEqual([
    'Settings',
    'Archived Groups',
    'Brisbane',
  ]);
  expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups']);
  expect(app.getPathname()).toBe(`/settings/archived-groups/${brisbane.id}`);
});

test("[GROUPS-54.1] goes back from an archived group's screen to Archived Groups", async () => {
  await startWithGroups(['Brisbane']);
  await openArchived('Brisbane');

  await goBackFrom('Brisbane');

  await waitFor(() =>
    expect(navigationBarTitles(tab('Settings'))).toEqual([
      'Settings',
      'Archived Groups',
    ]),
  );
  expect(selectedTab()).toBe('Settings');
});

test("[GROUPS-54.1] opens Members over an archived group's screen on the Settings tab", async () => {
  await startWithGroups(['Brisbane']);
  await openArchived('Brisbane');

  await openMembers('Brisbane');

  expect(navigationBarTitles(tab('Settings'))).toEqual([
    'Settings',
    'Archived Groups',
    'Brisbane',
    'Members',
  ]);
  expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups']);
  expect(selectedTab()).toBe('Settings');
});

test("[GROUPS-54.1] keeps Members' name field, Rename Member and Rename Group on the Settings tab once the group is restored there", async () => {
  await startWithGroups(['Brisbane']);
  await openArchived('Brisbane');
  await pressRestoreGroup('Brisbane');
  await waitFor(() => expect(textsOn('Brisbane')).not.toContain(READ_ONLY));

  await openMembers('Brisbane');
  const adding = await startAddingMember();
  expect(navigationBarTitles(tab('Settings'))).toEqual([
    'Settings',
    'Archived Groups',
    'Brisbane',
    'Members',
    ...(adding.inForm ? ['Add Member'] : []),
  ]);
  await stopAddingMember(adding);
  await addMember('Blake');
  await openRenameMember('Blake');
  expect(navigationBarTitles(tab('Settings'))).toEqual([
    'Settings',
    'Archived Groups',
    'Brisbane',
    'Members',
    'Rename Member',
  ]);
  await fireEvent.changeText(memberNameField(), 'Casey');
  await pressOnBar('Rename Member', 'Save');
  await expectClosed('Rename Member');
  await waitFor(() => expect(membersShown()).toContain('Casey'));
  await pressOnBar('Members', 'Close');
  await expectClosed('Members');
  await chooseGroupAction('Brisbane', 'Rename Group');
  await expectOpen('Rename Group');
  expect(navigationBarTitles(tab('Settings'))).toEqual([
    'Settings',
    'Archived Groups',
    'Brisbane',
    'Rename Group',
  ]);
  await fireEvent.changeText(groupNameField(), 'Tokyo');
  await pressOnBar('Rename Group', 'Save');

  await expectClosed('Rename Group');
  await waitFor(() =>
    expect(navigationBarTitles(tab('Settings'))).toEqual([
      'Settings',
      'Archived Groups',
      'Tokyo',
    ]),
  );
  expect(selectedTab()).toBe('Settings');
  expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups']);
  expect(await storedMemberNames(file, 'Tokyo')).toEqual(['Taylor', 'Casey']);
});

// An archived group's screen

test('[GROUPS-55.1] says an archived group is read-only, above Restore Group, at the top of its screen', async () => {
  await startWithGroups(['Brisbane']);

  await openArchived('Brisbane');

  await waitFor(() =>
    expect(textsOn('Brisbane')).toEqual([
      READ_ONLY,
      'Restore Group',
      NO_EXPENSES,
    ]),
  );
  expect(contentButton('Brisbane', 'Restore Group')).toBeOnTheScreen();
});

test("[GROUPS-55.1] says the same on an archived group's screen opened at its URL on the Groups tab", async () => {
  const first = await startWithGroups(['Brisbane']);
  const [brisbane] = await storedGroups(file);
  await archiveByAction('Brisbane');
  await first.unmount();

  await startGroupsApp(`/groups/${brisbane.id}`);

  await expectOpen('Brisbane');
  expect(selectedTab()).toBe('Groups');
  await waitFor(() =>
    expect(textsOn('Brisbane')).toEqual([
      READ_ONLY,
      'Restore Group',
      NO_EXPENSES,
    ]),
  );
});

test("[GROUPS-40.3] opens no Rename Group when an archived group's large title is long pressed", async () => {
  await startWithGroups(['Brisbane']);
  await openArchived('Brisbane');
  await waitFor(() => expect(largeTitle('Brisbane')).toBeDefined());

  await longPressLargeTitle('Brisbane');

  expect(isOpen('Rename Group')).toBe(false);
});

test("[GROUPS-77.1] opens and closes an archived group's full name too", async () => {
  await startWithGroups(['Brisbane']);
  await openArchived('Brisbane');
  await waitFor(() => expect(largeTitle('Brisbane')).toBeDefined());

  await fireEvent.press(largeTitle('Brisbane')!);

  expect(largeTitle('Brisbane')!.props.accessibilityState.expanded).toBe(true);
});

test('[GROUPS-79.1] opens a read-only Group Categories from an archived group', async () => {
  await startWithGroups(['Brisbane']);
  await openArchived('Brisbane');
  await waitFor(() => expect(textsOn('Brisbane')).toContain(READ_ONLY));

  await chooseGroupAction('Brisbane', 'Categories');

  await expectOpen('Group Categories');
  await waitFor(() =>
    expect(textsOn('Group Categories')).toContain('Food & Dining'),
  );
  expect(() => barAction('Group Categories', 'Add category')).toThrow();
});

test('[GROUPS-55.1] shows neither on the screen of a group that is not archived', async () => {
  await startWithGroups(['Brisbane', 'Tokyo']);
  await archiveByAction('Brisbane');

  await openGroup('Tokyo');

  await waitFor(() => expect(textsOn('Tokyo')).toEqual([NO_EXPENSES]));
  expect(contentButtons('Tokyo').map(accessibleName)).not.toContain(
    'Restore Group',
  );
});

test("[GROUPS-22.3] lists Members and Categories in an archived group's Group actions menu", async () => {
  await startWithGroups(['Brisbane']);

  await openArchived('Brisbane');

  await waitFor(() =>
    expect(barItems('Brisbane').right).toEqual([
      {
        menu: 'Group actions',
        icon: 'ellipsis.circle',
        items: ['Members', 'Categories'],
      },
    ]),
  );
});

// An archived group's Members

test("[GROUPS-56.1] lists an archived group's members in Members, none of them a button, and no Add Member", async () => {
  await startWithGroups(['Brisbane']);
  // Not in alphabetical order, so a list sorted by name fails.
  await addMembers('Brisbane', ['Casey', 'Blake']);
  await openArchived('Brisbane');

  await openMembers('Brisbane');

  await waitFor(() =>
    expect(textsOn('Members')).toEqual(['Taylor (You)', 'Casey', 'Blake']),
  );
  expect(contentButtons('Members')).toEqual([]);
});

test('[GROUPS-56.1] opens no menu when a member of an archived group is tapped', async () => {
  await startWithGroups(['Brisbane']);
  await addMembers('Brisbane', ['Blake']);
  await openArchived('Brisbane');
  await openMembers('Brisbane');
  await waitFor(() => expect(textsOn('Members')).toContain('Blake'));

  for (const row of ['Blake', 'Taylor (You)']) {
    await fireEvent.press(within(screenOf('Members')).getByText(row));
    await settle();
  }

  expect(actionSheets()).toEqual([]);
  expect(alertsShown()).toEqual([]);
  expect(isOpen('Members')).toBe(true);
});

test('[GROUPS-56.1] makes the members buttons again, with Add Member, once the group is restored', async () => {
  await startWithGroups(['Brisbane']);
  await addMembers('Brisbane', ['Blake']);
  await openArchived('Brisbane');

  await pressRestoreGroup('Brisbane');
  await openMembers('Brisbane');

  await expectMembers(['Taylor (You)', 'Blake', 'Add Member']);
});

// Restoring

test('[GROUPS-57.1] restores a group from Archived Groups to its place on the Groups root', async () => {
  await startWithGroups(['Brisbane', 'Tokyo', 'Paris']);
  await archiveByAction('Tokyo');
  await createGroup('Rome');
  await openArchivedGroups();

  await pressRestore('Tokyo');

  expect(alertsShown()).toEqual([]);
  expect(actionSheets()).toEqual([]);
  await waitFor(() =>
    expect(textsOn('Archived Groups')).toEqual([NO_ARCHIVED]),
  );
  await tapTab('Groups');
  await waitFor(() =>
    expect(cardNames()).toEqual([
      'Open Brisbane',
      'Open Tokyo',
      'Open Paris',
      'Open Rome',
    ]),
  );
});

test("[GROUPS-57.1] restores a group from its screen, which then is a group's screen like any other", async () => {
  await startWithGroups(['Brisbane', 'Tokyo']);
  await openArchived('Tokyo');

  await pressRestoreGroup('Tokyo');

  expect(alertsShown()).toEqual([]);
  await waitFor(() => expect(textsOn('Tokyo')).toEqual([NO_EXPENSES]));
  expect(barItems('Tokyo').right).toEqual([
    {
      menu: 'Group actions',
      icon: 'ellipsis.circle',
      items: ['Members', 'Rename Group', 'Categories'],
    },
  ]);
  await goBackFrom('Tokyo');
  await waitFor(() =>
    expect(textsOn('Archived Groups')).toEqual([NO_ARCHIVED]),
  );
  await tapTab('Groups');
  await waitFor(() =>
    expect(cardNames()).toEqual(['Open Brisbane', 'Open Tokyo']),
  );
});

test('[GROUPS-57.1] leaves the local data as it was before the archive once the group is restored', async () => {
  await startWithGroups(['Brisbane']);
  await openWithMembers('Brisbane', ['Blake', 'Casey']);
  await removeMember('Casey');
  await waitFor(() => expect(membersShown()).not.toContain('Casey'));
  await pressOnBar('Members', 'Close');
  await expectClosed('Members');
  await goBackFrom('Brisbane');
  const before = localData(file);
  await archiveByAction('Brisbane');
  await openArchivedGroups();

  await pressRestore('Brisbane');

  await waitFor(() =>
    expect(textsOn('Archived Groups')).toEqual([NO_ARCHIVED]),
  );
  expect(localData(file)).toEqual(before);
});

test('[GROUPS-57.1] restores a group opened at its URL on the Groups tab, back in its place', async () => {
  const first = await startWithGroups(['Brisbane', 'Tokyo', 'Paris']);
  const [, tokyo] = await storedGroups(file);
  await archiveByAction('Tokyo');
  await first.unmount();
  await startGroupsApp(`/groups/${tokyo.id}`);
  await expectOpen('Tokyo');
  await waitFor(() => expect(textsOn('Tokyo')).toContain(READ_ONLY));

  await pressRestoreGroup('Tokyo');

  await waitFor(() => expect(textsOn('Tokyo')).toEqual([NO_EXPENSES]));
  await goBackFrom('Tokyo');
  await waitFor(() =>
    expect(cardNames()).toEqual(['Open Brisbane', 'Open Tokyo', 'Open Paris']),
  );
});

// When the restore is not saved

test('[GROUPS-58.1] says the group could not be restored, and keeps it archived, when the write fails on Archived Groups', async () => {
  await startWithGroups(['Brisbane']);
  await archiveByAction('Brisbane');
  await openArchivedGroups();
  await waitFor(() => expect(archivedCardNames()).toEqual(['Open Brisbane']));
  const before = localData(file);
  failWrites();

  await pressRestore('Brisbane');

  expect(alertsShown()).toEqual([RESTORE_FAILED]);
  expect(archivedCardNames()).toEqual(['Open Brisbane']);
  expect(localData(file)).toEqual(before);
});

test("[GROUPS-58.1] keeps an archived group's screen read-only when restoring it from there fails", async () => {
  await startWithGroups(['Brisbane']);
  await openArchived('Brisbane');
  await waitFor(() => expect(textsOn('Brisbane')).toContain(READ_ONLY));
  const before = localData(file);
  failWrites();

  await pressRestoreGroup('Brisbane');

  expect(alertsShown()).toEqual([RESTORE_FAILED]);
  expect(textsOn('Brisbane')).toEqual([
    READ_ONLY,
    'Restore Group',
    NO_EXPENSES,
  ]);
  expect(localData(file)).toEqual(before);
});

test('[GROUPS-58.1] keeps the group archived whichever write of the restore fails', async () => {
  await startWithGroups(['Brisbane']);
  await archiveByAction('Brisbane');
  await openArchivedGroups();
  await waitFor(() => expect(archivedCardNames()).toEqual(['Open Brisbane']));
  const before = localData(file);

  let writesThrough = 0;
  for (; writesThrough < 20; writesThrough += 1) {
    clearAlerts();
    failWritesAfter(writesThrough);
    await pressRestore('Brisbane');
    if (alertsShown().length === 0) break;
    expect(alertsShown()).toEqual([RESTORE_FAILED]);
    expect(localData(file)).toEqual(before);
  }

  expect(writesThrough).toBeGreaterThan(0);
  await waitFor(() =>
    expect(textsOn('Archived Groups')).toEqual([NO_ARCHIVED]),
  );
});

test('[GROUPS-58.1] restores the group when Restore is pressed again after writes recover', async () => {
  await startWithGroups(['Brisbane']);
  await archiveByAction('Brisbane');
  await openArchivedGroups();
  failWrites();
  await pressRestore('Brisbane');
  allowWrites();

  await pressRestore('Brisbane');

  await waitFor(() =>
    expect(textsOn('Archived Groups')).toEqual([NO_ARCHIVED]),
  );
  await tapTab('Groups');
  await waitFor(() => expect(cardNames()).toEqual(['Open Brisbane']));
});

// Archiving or restoring once

test('[GROUPS-59.1] archives a group once when its Archive group action is used again before the save', async () => {
  await startWithGroups(['Brisbane', 'Tokyo']);
  const writes = holdWrites();
  await archiveByAction('Brisbane');

  // The card may stop offering the action while the archive is saved.
  await archiveByAction('Brisbane', { ifOffered: true });
  await writes.release();
  await settle();

  await waitFor(() => expect(cardNames()).toEqual(['Open Tokyo']));
  expect(alertsShown()).toEqual([]);
  expect(announcements()).toEqual([NOTICE]);
});

test('[GROUPS-59.1] disables Restore while the group is restored', async () => {
  await startWithGroups(['Brisbane']);
  await archiveByAction('Brisbane');
  await openArchivedGroups();
  const writes = holdWrites();

  await pressRestore('Brisbane');

  expect(isDisabled(restoreButton('Brisbane'))).toBe(true);
  await fireEvent.press(restoreButton('Brisbane'));
  await writes.release();
  await settle();
  await waitFor(() =>
    expect(textsOn('Archived Groups')).toEqual([NO_ARCHIVED]),
  );
  expect(alertsShown()).toEqual([]);
});

test('[GROUPS-59.1] disables Restore Group while the group is restored from its screen', async () => {
  await startWithGroups(['Brisbane']);
  await openArchived('Brisbane');
  await waitFor(() => expect(textsOn('Brisbane')).toContain(READ_ONLY));
  const writes = holdWrites();

  await pressRestoreGroup('Brisbane');

  expect(isDisabled(contentButton('Brisbane', 'Restore Group'))).toBe(true);
  await fireEvent.press(contentButton('Brisbane', 'Restore Group'));
  await writes.release();
  await settle();
  await waitFor(() => expect(textsOn('Brisbane')).toEqual([NO_EXPENSES]));
  expect(alertsShown()).toEqual([]);
});

test('[GROUPS-59.1] lets Restore and Restore Group be pressed again once restoring fails', async () => {
  await startWithGroups(['Brisbane']);
  await archiveByAction('Brisbane');
  await openArchivedGroups();
  failWrites();

  await pressRestore('Brisbane');
  expect(isDisabled(restoreButton('Brisbane'))).toBe(false);
  await openArchivedGroup('Brisbane');
  await pressRestoreGroup('Brisbane');

  expect(alertsShown()).toEqual([RESTORE_FAILED, RESTORE_FAILED]);
  expect(isDisabled(contentButton('Brisbane', 'Restore Group'))).toBe(false);
});

// After a restart

test('[GROUPS-60.1] keeps a group archived after a restart', async () => {
  const app = await startWithGroups(['Brisbane', 'Tokyo', 'Paris']);
  await archiveByAction('Tokyo');
  await app.unmount();

  await startGroupsApp();

  await waitFor(() =>
    expect(cardNames()).toEqual(['Open Brisbane', 'Open Paris']),
  );
  await openArchivedGroups();
  await waitFor(() => expect(archivedCardNames()).toEqual(['Open Tokyo']));
});

test('[GROUPS-60.1] keeps a restored group on the Groups root after a restart', async () => {
  const app = await startWithGroups(['Brisbane', 'Tokyo', 'Paris']);
  await archiveByAction('Tokyo');
  await openArchivedGroups();
  await pressRestore('Tokyo');
  await waitFor(() =>
    expect(textsOn('Archived Groups')).toEqual([NO_ARCHIVED]),
  );
  await app.unmount();

  await startGroupsApp();

  await waitFor(() =>
    expect(cardNames()).toEqual(['Open Brisbane', 'Open Tokyo', 'Open Paris']),
  );
  await openArchivedGroups();
  await waitFor(() =>
    expect(textsOn('Archived Groups')).toEqual([NO_ARCHIVED]),
  );
});

// Appearance

// The notice is checked on the Groups root, the only place GROUPS-49.1 shows it.

test('[SHELL-34.1] uses colors that follow the appearance on the archive notice', async () => {
  await startWithGroups(['Brisbane']);
  await archiveByAction('Brisbane');
  expect(noticeShown()).toBe(true);

  const light = { colors: fixedColors(), uncolored: textsWithoutColor() };
  await switchPhoneTo('dark');
  expect(noticeShown()).toBe(true);
  const dark = { colors: fixedColors(), uncolored: textsWithoutColor() };

  expect(colorsInBoth(light.colors, dark.colors)).toEqual([]);
  expect([...light.uncolored, ...dark.uncolored]).toEqual([]);
});

test("[SHELL-34.1] uses colors that follow the appearance on Archived Groups and an archived group's screen", async () => {
  await startWithGroups(['Brisbane']);
  await archiveByAction('Brisbane');
  await openArchivedGroups();
  await waitFor(() => expect(archivedCardNames()).toEqual(['Open Brisbane']));
  await openArchivedGroup('Brisbane');
  await waitFor(() => expect(textsOn('Brisbane')).toContain(READ_ONLY));

  const light = { colors: fixedColors(), uncolored: textsWithoutColor() };
  await switchPhoneTo('dark');
  const dark = { colors: fixedColors(), uncolored: textsWithoutColor() };

  expect(colorsInBoth(light.colors, dark.colors)).toEqual([]);
  expect([...light.uncolored, ...dark.uncolored]).toEqual([]);
});

test('[SHELL-36.1] adds no blur or glass of its own to the archive notice while Reduce Transparency is on', async () => {
  fakeReduceTransparency(true);
  await startWithGroups(['Brisbane']);

  await archiveByAction('Brisbane');

  expect(noticeShown()).toBe(true);
  expect(translucentViews()).toEqual([]);
});

test("[SHELL-36.1] adds no blur or glass of its own to Archived Groups or an archived group's screen while Reduce Transparency is on", async () => {
  fakeReduceTransparency(true);
  await startWithGroups(['Brisbane']);

  await archiveByAction('Brisbane');
  await openArchivedGroups();
  await waitFor(() => expect(archivedCardNames()).toEqual(['Open Brisbane']));
  await openArchivedGroup('Brisbane');
  await waitFor(() => expect(textsOn('Brisbane')).toContain(READ_ONLY));

  expect(translucentViews()).toEqual([]);
});
