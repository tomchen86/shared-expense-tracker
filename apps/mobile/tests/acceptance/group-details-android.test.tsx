import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Alert, BackHandler, DeviceEventEmitter } from 'react-native';
import { act, fireEvent, waitFor, within } from '@testing-library/react-native';
import type { Database } from '../../src/storage';
import {
  navigationBarTitles,
  selectedTab,
  tab,
  tapTab,
} from './shell-tabs-app';
import { createGroup, saveName, startGroupsApp } from './groups-app';
import {
  allowWrites,
  colorsInBoth,
  fakePhoneAppearance,
  fixedColors,
  holdWrites,
  settle,
  switchPhoneTo,
  testDatabase,
  textsWithoutColor,
  translucentViews,
} from './shell-appearance-app';
import {
  ALREADY_EXISTS,
  NOT_FOUND,
  RETAINED,
  addBackAlert,
  alertsShown,
  barTitled,
  dismissLastAlert,
  expectClosed,
  expectOpen,
  groupNameField,
  headerButtons,
  isOpen,
  lastAlertButtons,
  lastAlertCancelable,
  memberField,
  memberNameField,
  membersButton,
  membersShown,
  openMemberField,
  openGroup,
  openMembers,
  openRenameGroup,
  openRenameMember,
  openWithMembers,
  pressOnBar,
  pressReturn,
  removeMember,
  screenOf,
  startAddingMember,
  stopAddingMember,
  storedMemberNames,
  tapMember,
  textsOn,
  chooseGroupAction,
  largeTitle,
  longPressLargeTitle,
} from './group-details-app';

// Runs on Android only (apps/mobile/jest.config.cjs). Both platforms share the
// group details screens (ADR-0002), so group-details.test.tsx checks their rules on
// iOS; this file checks what Android shows differently and its system back button.

let mockOpen: () => Promise<Database>;

jest.mock('../../src/storage/expo', () => ({
  openPhoneDatabase: () => mockOpen(),
}));
// Material Symbols drawn as images come from the symbol font on the phone. Here
// each image is named after its symbol instead, as in the tab bar's tests.
jest.mock('expo-symbols', () => ({
  ...jest.requireActual('expo-symbols'),
  unstable_getMaterialSymbolSourceAsync: async (symbol: string) => ({
    uri: `material-symbol:${symbol}`,
  }),
}));

/** The ways Android shows a screen rising from the bottom. */
const FROM_THE_BOTTOM = ['slide_from_bottom', 'fade_from_bottom'];
const NO_GROUP = '/groups/00000000-0000-4000-8000-000000000000';

let directory: string;
let file: string;
// React Native leaves the app through exitApp when nothing handles a back press.
let exitApp: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'group-details-'));
  file = path.join(directory, 'app.db');
  mockOpen = async () => testDatabase(file);
  allowWrites();
  fakePhoneAppearance('light');
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  exitApp = jest.spyOn(BackHandler, 'exitApp');
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});

/** Presses the system back button, delivered the way React Native delivers it. */
async function pressBack() {
  await act(async () => {
    DeviceEventEmitter.emit('hardwareBackPress');
  });
  await settle();
}

async function startWithName(name = 'Taylor') {
  const app = await startGroupsApp();
  await saveName(name);
  return app;
}

async function startInMembers(members: string[] = []) {
  const app = await startWithName();
  await createGroup('Brisbane');
  await openWithMembers('Brisbane', members);
  return app;
}

/** Whether the screen or sheet titled `title` rises from the bottom with a title bar of its own. */
function risesFromTheBottom(title: string) {
  const sheet = screenOf(title);
  expect(FROM_THE_BOTTOM).toContain(sheet.props.stackAnimation);
  // Android draws no title bar on a form sheet (react-native-screens), which would
  // leave the sheet without its title bar actions.
  expect(sheet.props.stackPresentation).not.toBe('formSheet');
}

test('[GROUPS-21.1] shows no Group actions for an ID that is no group on Android', async () => {
  await startGroupsApp(NO_GROUP);

  await expectOpen('Group Details');
  await waitFor(() => expect(textsOn('Group Details')).toEqual([NOT_FOUND]));
  expect(headerButtons('Group Details').right).toEqual([]);
});

test('[GROUPS-22.3] lists Members, Rename Group, Categories and Cancel in the Group actions dialog on Android', async () => {
  await startWithName();
  await createGroup('Brisbane');
  await openGroup('Brisbane');

  await fireEvent.press(
    within(barTitled('Brisbane')!).getByRole('button', {
      name: 'Group actions',
    }),
  );
  await settle();

  expect(alertsShown()).toEqual([['Group actions', undefined]]);
  expect(lastAlertButtons()).toEqual([
    'Members',
    'Rename Group',
    'Categories',
    'Cancel',
  ]);
});

test('[GROUPS-23.2] opens Members rising from the bottom with only Close on Android', async () => {
  await startWithName();
  await createGroup('Brisbane');
  await openGroup('Brisbane');

  await openMembers('Brisbane');

  risesFromTheBottom('Members');
  expect(navigationBarTitles(tab('Groups'))).toEqual([
    'Groups',
    'Brisbane',
    'Members',
  ]);
  expect(headerButtons('Members')).toEqual({ left: ['Close'], right: [] });
});

test("[GROUPS-23.2] closes Members with Back, back on the group's screen", async () => {
  await startInMembers();

  await pressBack();

  await expectClosed('Members');
  expect(selectedTab()).toBe('Groups');
  expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups', 'Brisbane']);
  expect(exitApp).not.toHaveBeenCalled();
});

test("[GROUPS-25.2] opens a dialog titled with the member's name when their row is tapped on Android", async () => {
  await startInMembers(['Blake']);

  const menu = await tapMember('Blake');

  // Android's dialog ignores a button's style, so there is no destructive one to check.
  expect(menu).toMatchObject({
    title: 'Blake',
    message: RETAINED,
    items: ['Rename', 'Remove from Group', 'Cancel'],
    cancel: 'Cancel',
  });
});

test('[GROUPS-25.2] opens your own dialog, titled with your member name and offering only Rename, when your row is tapped on Android', async () => {
  await startInMembers(['Blake']);

  const menu = await tapMember('Taylor (You)');

  expect(menu).toMatchObject({
    title: 'Taylor',
    items: ['Rename', 'Cancel'],
    cancel: 'Cancel',
    cancelable: true,
  });
  expect(menu?.message ?? '').toBe('');
});

test("[GROUPS-25.2] lets Back or a tap outside close a member's dialog without changing anything", async () => {
  await startInMembers(['Blake']);
  const menu = await tapMember('Blake');
  expect(menu?.cancelable).toBe(true);

  await menu?.dismiss();

  expect(membersShown()).toEqual(['Taylor (You)', 'Blake', 'Add Member']);
  expect(isOpen('Rename Member')).toBe(false);
  expect(await storedMemberNames(file, 'Brisbane')).toEqual([
    'Taylor',
    'Blake',
  ]);
});

test('[GROUPS-27.2] keeps Members open when Back is pressed while a member is removed', async () => {
  await startInMembers(['Blake']);
  const writes = holdWrites();
  await removeMember('Blake');

  await pressBack();

  expect(isOpen('Members')).toBe(true);
  await writes.release();
  await settle();
  await waitFor(() =>
    expect(membersShown()).toEqual(['Taylor (You)', 'Add Member']),
  );
  expect(isOpen('Members')).toBe(true);
  expect(exitApp).not.toHaveBeenCalled();
});

test('[GROUPS-34.2] keeps the name in the field when Back or a tap outside closes the alert that asks to add a former member back', async () => {
  await startInMembers(['Blake']);
  await removeMember('Blake');
  await waitFor(() => expect(membersShown()).not.toContain('Blake'));
  await openMemberField();
  await fireEvent.changeText(memberField()!, 'blake');
  await pressReturn(memberField()!);
  expect(alertsShown().at(-1)).toEqual(addBackAlert('Blake'));
  expect(lastAlertCancelable()).toBe(true);

  await dismissLastAlert();

  expect(memberField()).toHaveDisplayValue('blake');
  expect(memberField()).not.toBeDisabled();
  expect(await storedMemberNames(file, 'Brisbane')).toEqual(['Taylor']);
});

test('[GROUPS-29.2] adds a name field to Members, without opening a new screen, on Android', async () => {
  await startInMembers();

  await fireEvent.press(membersButton('Add Member'));
  await settle();

  expect(isOpen('Add Member')).toBe(false);
  await waitFor(() => expect(memberField()).toBeDefined());
  expect(navigationBarTitles(tab('Groups'))).toEqual([
    'Groups',
    'Brisbane',
    'Members',
  ]);
});

test('[GROUPS-29.2] closes Members with Back without adding the name left in the field', async () => {
  await startInMembers();
  await openMemberField();
  await fireEvent.changeText(memberField()!, 'Blake');

  await pressBack();

  await expectClosed('Members');
  expect(await storedMemberNames(file, 'Brisbane')).toEqual(['Taylor']);
  expect(exitApp).not.toHaveBeenCalled();
});

test('[GROUPS-36.1] opens Rename Member rising from the bottom with Cancel on the left and Save on the right on Android', async () => {
  await startInMembers(['Blake']);

  await openRenameMember('Blake');

  risesFromTheBottom('Rename Member');
  expect(headerButtons('Rename Member')).toEqual({
    left: ['Cancel'],
    right: ['Save'],
  });
});

test('[GROUPS-79.1] shows the name as a large title button under the bar on Android', async () => {
  await startWithName();
  await createGroup('Brisbane');

  await openGroup('Brisbane');

  await waitFor(() => expect(largeTitle('Brisbane')).toBeDefined());
  expect(barTitled('Brisbane')?.props.title).toBeFalsy();
  expect(largeTitle('Brisbane')!.props.accessibilityState.expanded).toBe(false);
});

test('[GROUPS-81.1] closes Group Categories with Back on Android', async () => {
  await startWithName();
  await createGroup('Brisbane');
  await openGroup('Brisbane');
  await chooseGroupAction('Brisbane', 'Categories');
  await expectOpen('Group Categories');

  await pressBack();

  await expectClosed('Group Categories');
  expect(isOpen('Brisbane')).toBe(true);
});

test("[GROUPS-40.3] opens Rename Group when the group's large title is long pressed on Android", async () => {
  await startWithName();
  await createGroup('Brisbane');
  await openGroup('Brisbane');
  await waitFor(() => expect(largeTitle('Brisbane')).toBeDefined());

  await longPressLargeTitle('Brisbane');

  await expectOpen('Rename Group');
  risesFromTheBottom('Rename Group');
  await waitFor(() =>
    expect(groupNameField().props.value ?? '').toBe('Brisbane'),
  );
});

test('[GROUPS-40.3] opens Rename Group rising from the bottom with Cancel on the left and Save on the right on Android', async () => {
  await startWithName();
  await createGroup('Brisbane');
  await openGroup('Brisbane');

  await openRenameGroup('Brisbane');

  risesFromTheBottom('Rename Group');
  expect(headerButtons('Rename Group')).toEqual({
    left: ['Cancel'],
    right: ['Save'],
  });
});

// On Android the forms are in the Groups tab's stack, so the tab bar stays
// reachable while one saves.

test('[GROUPS-31.2] adds the member once it is saved, even when Settings was selected while it saved', async () => {
  await startInMembers();
  await openMemberField();
  await fireEvent.changeText(memberField()!, 'Blake');
  const writes = holdWrites();
  await pressReturn(memberField()!);
  await tapTab('Settings');

  await writes.release();
  await settle();
  await tapTab('Groups');

  await waitFor(() =>
    expect(membersShown()).toEqual(['Taylor (You)', 'Blake']),
  );
  expect(memberField()).toHaveDisplayValue('');
});

test("[GROUPS-38.1] closes Rename Member once the member's new name is saved, even when Settings was selected while it saved", async () => {
  await startInMembers(['Blak']);
  await openRenameMember('Blak');
  await fireEvent.changeText(memberNameField(), 'Blake');
  const writes = holdWrites();
  await pressOnBar('Rename Member', 'Save');
  await tapTab('Settings');

  await writes.release();
  await settle();
  await tapTab('Groups');

  await expectClosed('Rename Member');
  await waitFor(() =>
    expect(membersShown()).toEqual(['Taylor (You)', 'Blake', 'Add Member']),
  );
});

test("[GROUPS-41.1] closes Rename Group once the group's new name is saved, even when Settings was selected while it saved", async () => {
  await startWithName();
  await createGroup('Trip');
  await openGroup('Trip');
  await openRenameGroup('Trip');
  await fireEvent.changeText(groupNameField(), 'Tokyo');
  const writes = holdWrites();
  await pressOnBar('Rename Group', 'Save');
  await tapTab('Settings');

  await writes.release();
  await settle();
  await tapTab('Groups');

  await expectClosed('Rename Group');
  await waitFor(() =>
    expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups', 'Tokyo']),
  );
});

test('[GROUPS-43.2] closes each name form with Back without saving', async () => {
  await startInMembers(['Blake']);

  await openRenameMember('Blake');
  await fireEvent.changeText(memberNameField(), 'Blake K.');
  await pressBack();
  await expectClosed('Rename Member');
  expect(isOpen('Members')).toBe(true);

  await pressBack();
  await expectClosed('Members');
  await openRenameGroup('Brisbane');
  await fireEvent.changeText(groupNameField(), 'Tokyo');
  await pressBack();
  await expectClosed('Rename Group');

  expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups', 'Brisbane']);
  expect(await storedMemberNames(file, 'Brisbane')).toEqual([
    'Taylor',
    'Blake',
  ]);
  expect(exitApp).not.toHaveBeenCalled();
});

test('[GROUPS-44.2] keeps Members open when Back is pressed while the new member is saved', async () => {
  await startInMembers();
  await openMemberField();
  await fireEvent.changeText(memberField()!, 'Blake');
  const writes = holdWrites();
  await pressReturn(memberField()!);

  await pressBack();

  expect(isOpen('Members')).toBe(true);
  await writes.release();
  await settle();
  expect(isOpen('Members')).toBe(true);
  expect(await storedMemberNames(file, 'Brisbane')).toEqual([
    'Taylor',
    'Blake',
  ]);
  expect(exitApp).not.toHaveBeenCalled();
});

test('[GROUPS-44.2] keeps Rename Member open when Back is pressed while it saves', async () => {
  await startInMembers(['Blak']);
  await openRenameMember('Blak');
  await fireEvent.changeText(memberNameField(), 'Blake');
  const writes = holdWrites();
  await pressOnBar('Rename Member', 'Save');

  await pressBack();

  expect(isOpen('Rename Member')).toBe(true);
  await writes.release();
  await settle();
  await expectClosed('Rename Member');
  expect(isOpen('Members')).toBe(true);
  expect(await storedMemberNames(file, 'Brisbane')).toEqual([
    'Taylor',
    'Blake',
  ]);
  expect(exitApp).not.toHaveBeenCalled();
});

test('[GROUPS-44.2] keeps Rename Group open when Back is pressed while it saves', async () => {
  await startWithName();
  await createGroup('Trip');
  await openGroup('Trip');
  await openRenameGroup('Trip');
  await fireEvent.changeText(groupNameField(), 'Tokyo');
  const writes = holdWrites();
  await pressOnBar('Rename Group', 'Save');

  await pressBack();

  expect(isOpen('Rename Group')).toBe(true);
  await writes.release();
  await settle();
  await expectClosed('Rename Group');
  expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups', 'Tokyo']);
  expect(exitApp).not.toHaveBeenCalled();
});

test("[SHELL-34.1] uses colors that follow the appearance on a group's screen, Members and the name forms on Android", async () => {
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
  expect(textsOn(adding.inForm ? 'Add Member' : 'Members')).toContain(
    ALREADY_EXISTS,
  );
  await compare();
  await stopAddingMember(adding);
  await openRenameMember('Blake');
  await compare();
  await pressBack();
  await expectClosed('Rename Member');
  await pressBack();
  await expectClosed('Members');
  await openRenameGroup('Brisbane');
  await compare();
});

test("[SHELL-38.1] adds no blur or glass of its own to a group's screen, Members or the name forms on Android", async () => {
  await startInMembers(['Blake']);

  expect(translucentViews()).toEqual([]);
  const adding = await startAddingMember();
  expect(translucentViews()).toEqual([]);
  await stopAddingMember(adding);
  await openRenameMember('Blake');
  expect(translucentViews()).toEqual([]);
  await pressBack();
  await expectClosed('Rename Member');
  await pressBack();
  await expectClosed('Members');
  await openRenameGroup('Brisbane');
  expect(translucentViews()).toEqual([]);
});
