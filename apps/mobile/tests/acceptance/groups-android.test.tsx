import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Alert, BackHandler, DeviceEventEmitter } from 'react-native';
import { act, fireEvent, within } from '@testing-library/react-native';
import type { Database } from '../../src/storage';
import { navigationBarTitles, selectedTab, tab } from './shell-tabs-app';
import {
  cardNames,
  createGroup,
  expectNewGroupClosed,
  expectNewGroupOpen,
  groupsRoot,
  headerButtons,
  newGroupIsOpen,
  newGroupScreen,
  press,
  pressAddGroup,
  saveName,
  startGroupsApp,
  storedGroups,
  typeName,
} from './groups-app';
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

// Runs on Android only (apps/mobile/jest.config.cjs). Both platforms share the
// groups screens (ADR-0002), so groups.test.tsx checks their rules on iOS; this
// file checks what Android shows differently and its system back button.

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

let directory: string;
let file: string;
// React Native leaves the app through exitApp when nothing handles a back press.
let exitApp: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'groups-'));
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

async function openNewGroup() {
  await pressAddGroup();
  await expectNewGroupOpen();
}

test('[GROUPS-5.1] opens New Group rising from the bottom on Android', async () => {
  await startWithName();

  await openNewGroup();

  expect(FROM_THE_BOTTOM).toContain(newGroupScreen().props.stackAnimation);
  expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups', 'New Group']);
});

test("[GROUPS-6.1] puts Cancel on the left and Create on the right of New Group's title bar on Android", async () => {
  await startWithName();

  await openNewGroup();

  expect(headerButtons()).toEqual({ left: ['Cancel'], right: ['Create'] });
  // Android draws no title bar on a form sheet (react-native-screens), which would
  // leave New Group without its title bar actions.
  expect(newGroupScreen().props.stackPresentation).not.toBe('formSheet');
});

test('[GROUPS-11.1] keeps New Group open when Back is pressed while the group is created', async () => {
  await startWithName();
  await openNewGroup();
  typeName('Brisbane');
  const writes = holdWrites();
  await press('Create');

  await pressBack();

  expect(newGroupIsOpen()).toBe(true);
  await writes.release();
  await settle();
  await expectNewGroupClosed();
  expect(selectedTab()).toBe('Groups');
  expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups']);
  expect(cardNames()).toEqual(['Open Brisbane']);
  expect(exitApp).not.toHaveBeenCalled();
});

test('[GROUPS-13.1] closes New Group without creating a group when Back is pressed', async () => {
  await startWithName();
  await openNewGroup();
  typeName('Brisbane');

  await pressBack();

  await expectNewGroupClosed();
  expect(selectedTab()).toBe('Groups');
  expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups']);
  expect(await storedGroups(file)).toEqual([]);
  expect(exitApp).not.toHaveBeenCalled();
});

test("[GROUPS-15.1] goes back from a group's screen to the Groups root with Back", async () => {
  await startWithName();
  await createGroup('Brisbane');
  fireEvent.press(
    within(groupsRoot()).getByRole('button', { name: 'Open Brisbane' }),
  );
  await settle();
  expect(navigationBarTitles(tab('Groups'))).toHaveLength(2);

  await pressBack();

  expect(selectedTab()).toBe('Groups');
  expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups']);
  expect(exitApp).not.toHaveBeenCalled();
});

test('[SHELL-34.1] uses colors that follow the appearance on the Groups list and in New Group on Android', async () => {
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

test('[SHELL-38.1] adds no blur or glass of its own to the Groups list or New Group on Android', async () => {
  await startWithName();
  await createGroup('Brisbane');

  expect(translucentViews()).toEqual([]);
  await openNewGroup();
  expect(translucentViews()).toEqual([]);
});
