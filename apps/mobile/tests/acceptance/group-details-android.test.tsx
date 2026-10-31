import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Alert, BackHandler, DeviceEventEmitter } from 'react-native';
import { act, fireEvent, waitFor, within } from '@testing-library/react-native';
import type { Database } from '../../src/storage';
import { navigationBarTitles, selectedTab, tab } from './shell-tabs-app';
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
  alertsShown,
  barTitled,
  expectClosed,
  expectOpen,
  groupNameField,
  headerButtons,
  isOpen,
  lastAlertButtons,
  memberNameField,
  membersShown,
  openAddMember,
  openGroup,
  openMembers,
  openRenameGroup,
  openRenameMember,
  openWithMembers,
  pressOnBar,
  removeMember,
  screenOf,
  storedMemberNames,
  tapMember,
  textsOn,
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

test('[GROUPS-22.1] lists Members, Rename Group and Cancel in the Group actions dialog on Android', async () => {
  await startWithName();
  await createGroup('Brisbane');
  await openGroup('Brisbane');

  fireEvent.press(
    within(barTitled('Brisbane')!).getByRole('button', {
      name: 'Group actions',
    }),
  );
  await settle();

  expect(alertsShown()).toEqual([['Group actions', undefined]]);
  expect(lastAlertButtons()).toEqual(['Members', 'Rename Group', 'Cancel']);
});

test('[GROUPS-23.1] opens Members rising from the bottom with only Close on Android', async () => {
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

test("[GROUPS-23.1] closes Members with Back, back on the group's screen", async () => {
  await startInMembers();

  await pressBack();

  await expectClosed('Members');
  expect(selectedTab()).toBe('Groups');
  expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups', 'Brisbane']);
  expect(exitApp).not.toHaveBeenCalled();
});

test("[GROUPS-25.1] opens a dialog titled with the member's name when their row is tapped on Android", async () => {
  await startInMembers(['Blake']);

  const menu = await tapMember('Blake');

  expect(menu).toMatchObject({
    title: 'Blake',
    message: RETAINED,
    items: ['Rename', 'Remove from Group', 'Cancel'],
    destructive: ['Remove from Group'],
    cancel: 'Cancel',
  });
});

test('[GROUPS-27.1] keeps Members open when Back is pressed while a member is removed', async () => {
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

test('[GROUPS-29.1] opens Add Member rising from the bottom with Cancel on the left and Add on the right on Android', async () => {
  await startInMembers();

  await openAddMember();

  risesFromTheBottom('Add Member');
  expect(headerButtons('Add Member')).toEqual({
    left: ['Cancel'],
    right: ['Add'],
  });
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

test('[GROUPS-40.1] opens Rename Group rising from the bottom with Cancel on the left and Save on the right on Android', async () => {
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

test('[GROUPS-43.1] closes each name form with Back without saving', async () => {
  await startInMembers(['Blake']);

  await openAddMember();
  fireEvent.changeText(memberNameField(), 'Casey');
  await pressBack();
  await expectClosed('Add Member');
  expect(isOpen('Members')).toBe(true);

  await openRenameMember('Blake');
  fireEvent.changeText(memberNameField(), 'Blake K.');
  await pressBack();
  await expectClosed('Rename Member');
  expect(isOpen('Members')).toBe(true);

  await pressBack();
  await expectClosed('Members');
  await openRenameGroup('Brisbane');
  fireEvent.changeText(groupNameField(), 'Tokyo');
  await pressBack();
  await expectClosed('Rename Group');

  expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups', 'Brisbane']);
  expect(await storedMemberNames(file, 'Brisbane')).toEqual([
    'Taylor',
    'Blake',
  ]);
  expect(exitApp).not.toHaveBeenCalled();
});

test('[GROUPS-44.1] keeps a name form open when Back is pressed while it saves', async () => {
  await startInMembers();
  await openAddMember();
  fireEvent.changeText(memberNameField(), 'Blake');
  const writes = holdWrites();
  await pressOnBar('Add Member', 'Add');

  await pressBack();

  expect(isOpen('Add Member')).toBe(true);
  await writes.release();
  await settle();
  await expectClosed('Add Member');
  expect(isOpen('Members')).toBe(true);
  expect(await storedMemberNames(file, 'Brisbane')).toEqual([
    'Taylor',
    'Blake',
  ]);
  expect(exitApp).not.toHaveBeenCalled();
});

test("[SHELL-34.1] uses colors that follow the appearance on a group's screen, Members and the name forms on Android", async () => {
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
  expect(textsOn('Add Member')).toContain(ALREADY_EXISTS);
  compare();
  await pressBack();
  await expectClosed('Add Member');
  await openRenameMember('Blake');
  compare();
  await pressBack();
  await expectClosed('Rename Member');
  await pressBack();
  await expectClosed('Members');
  await openRenameGroup('Brisbane');
  compare();
});

test("[SHELL-38.1] adds no blur or glass of its own to a group's screen, Members or the name forms on Android", async () => {
  await startInMembers(['Blake']);

  expect(translucentViews()).toEqual([]);
  await openAddMember();
  expect(translucentViews()).toEqual([]);
  await pressBack();
  await expectClosed('Add Member');
  await openRenameMember('Blake');
  expect(translucentViews()).toEqual([]);
  await pressBack();
  await expectClosed('Rename Member');
  await pressBack();
  await expectClosed('Members');
  await openRenameGroup('Brisbane');
  expect(translucentViews()).toEqual([]);
});
