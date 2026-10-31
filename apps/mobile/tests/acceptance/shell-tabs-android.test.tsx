import { BackHandler, DeviceEventEmitter, Linking } from 'react-native';
import { act, screen, waitFor } from '@testing-library/react-native';
import {
  TAB_NAMES,
  launchApp,
  navigationBarTitles,
  push,
  selectedTab,
  startApp,
  tab,
  tabs,
  tapTab,
} from './shell-tabs-app';

// Runs on Android only (apps/mobile/jest.config.cjs).

jest.mock('../../src/storage/expo', () => ({
  openPhoneDatabase: async () =>
    jest
      .requireActual<typeof import('../../src/storage/node')>(
        '../../src/storage/node',
      )
      .openNodeDatabase(':memory:'),
}));
// Material Symbols reach the tab bar as images that expo-symbols draws from the
// symbol font on the phone. Here each image is named after its symbol instead.
jest.mock('expo-symbols', () => ({
  ...jest.requireActual('expo-symbols'),
  unstable_getMaterialSymbolSourceAsync: async (symbol: string) => ({
    uri: `material-symbol:${symbol}`,
  }),
}));

// React Native leaves the app through exitApp when nothing handles a back press.
let exitApp: jest.SpyInstance;
beforeEach(() => {
  exitApp = jest.spyOn(BackHandler, 'exitApp');
});
afterEach(() => {
  jest.restoreAllMocks();
});

/** Presses the system back button, delivered the way React Native delivers it. */
async function pressBack() {
  await act(async () => {
    DeviceEventEmitter.emit('hardwareBackPress');
  });
}

async function pushArchivedGroupsFromSettings() {
  await tapTab('Settings');
  await push('/settings/archived-groups');
  expect(navigationBarTitles(tab('Settings'))).toEqual([
    'Settings',
    'Archived Groups',
  ]);
}

test('[SHELL-6.1] shows the Groups, Expenses and Settings tabs, always labelled, with Expenses selected', async () => {
  await startApp();

  expect(
    tabs().map(({ props }) => [props.title, props.labelVisibilityMode]),
  ).toEqual([
    ['Groups', 'labeled'],
    ['Expenses', 'labeled'],
    ['Settings', 'labeled'],
  ]);
  expect(selectedTab()).toBe('Expenses');
});

test('[SHELL-6.1] selects Expenses when the app is opened from the home screen, without a URL', async () => {
  jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);

  await launchApp();

  expect(selectedTab()).toBe('Expenses');
});

test('[SHELL-8.1] uses the Material Symbols groups, payments and settings for the tab icons, selected or not', async () => {
  await startApp();

  await waitFor(() =>
    expect(
      tabs().map(({ props }) => [
        props.imageIconResource?.uri,
        props.selectedImageIconResource?.uri,
      ]),
    ).toEqual([
      ['material-symbol:groups', 'material-symbol:groups'],
      ['material-symbol:payments', 'material-symbol:payments'],
      ['material-symbol:settings', 'material-symbol:settings'],
    ]),
  );
});

test('[SHELL-9.1] titles each tab root only in its native navigation bar', async () => {
  await startApp();

  expect(navigationBarTitles()).toEqual(TAB_NAMES);
  for (const name of TAB_NAMES) {
    expect(
      screen.queryAllByText(name, { includeHiddenElements: true }),
    ).toEqual([]);
  }
});

test('[SHELL-12.1] goes back from a screen pushed from Settings to the Settings root', async () => {
  await startApp();
  await pushArchivedGroupsFromSettings();

  await pressBack();

  expect(selectedTab()).toBe('Settings');
  expect(navigationBarTitles(tab('Settings'))).toEqual(['Settings']);
  expect(exitApp).not.toHaveBeenCalled();
});

test('[SHELL-15.1] goes back from the Groups root to Expenses without leaving the app', async () => {
  await startApp();
  await tapTab('Groups');

  await pressBack();

  expect(selectedTab()).toBe('Expenses');
  expect(exitApp).not.toHaveBeenCalled();
});

test('[SHELL-15.1] goes back from the Settings root to Expenses, not to the tab selected before it', async () => {
  await startApp();
  await tapTab('Groups');
  await tapTab('Settings');

  await pressBack();

  expect(selectedTab()).toBe('Expenses');
  expect(exitApp).not.toHaveBeenCalled();
});

test('[SHELL-15.1] goes back to Expenses and then leaves the app when opened at /groups', async () => {
  await startApp('/groups');
  expect(selectedTab()).toBe('Groups');

  await pressBack();
  expect(selectedTab()).toBe('Expenses');
  expect(exitApp).not.toHaveBeenCalled();

  await pressBack();
  expect(exitApp).toHaveBeenCalledTimes(1);
});

test('[SHELL-15.1] leaves the app from the Expenses root', async () => {
  await startApp();
  expect(selectedTab()).toBe('Expenses');

  await pressBack();

  expect(exitApp).toHaveBeenCalledTimes(1);
});

test('[SHELL-15.1] leaves a screen pushed from Settings first, then goes back to Expenses', async () => {
  await startApp();
  await pushArchivedGroupsFromSettings();

  await pressBack();
  expect(selectedTab()).toBe('Settings');
  expect(navigationBarTitles(tab('Settings'))).toEqual(['Settings']);

  await pressBack();
  expect(selectedTab()).toBe('Expenses');
  expect(exitApp).not.toHaveBeenCalled();
});
