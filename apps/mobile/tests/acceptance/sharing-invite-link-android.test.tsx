import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Alert, BackHandler, DeviceEventEmitter } from 'react-native';
import { act, waitFor } from '@testing-library/react-native';
import type { Database } from '../../src/storage';
import {
  navigationBarTitles,
  selectedTab,
  startApp,
  tab,
} from './shell-tabs-app';
import {
  allowWrites,
  fakePhoneAppearance,
  settle,
  testDatabase,
} from './shell-appearance-app';
import {
  expectClosed,
  expectOpen,
  headerButtons,
  pressOnBar,
  screenOf,
  textsOn,
} from './group-details-app';
import {
  APP_SCHEME_LINK,
  OTHER_SPELLINGS,
  SECOND_LINK,
  TITLE,
  WHOLE_LINK,
  forgetLinks,
  inviteLinksOpen,
  receiveLink,
  startAppFromLink,
} from './sharing-invite-link-app';

// Runs on Android only (apps/mobile/jest.config.cjs). Both platforms share Invite
// Link (ADR-0002), so sharing-invite-link.test.tsx checks its rules on iOS; this
// file checks what Android shows differently, its system back button, and the link
// that starts the app, which Android hands over through React Native's Linking.

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
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'invite-link-'));
  file = path.join(directory, 'app.db');
  mockOpen = async () => testDatabase(file);
  allowWrites();
  fakePhoneAppearance('light');
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  exitApp = jest.spyOn(BackHandler, 'exitApp');
  forgetLinks();
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

/** Starts the app on the Settings root and hands it `link`. */
async function receiveOnSettings(link: string) {
  await startApp('/settings');
  await receiveLink(link);
  await expectOpen(TITLE);
}

async function expectOnSettingsRoot() {
  await expectClosed(TITLE);
  expect(selectedTab()).toBe('Settings');
  expect(navigationBarTitles(tab('Settings'))).toEqual(['Settings']);
}

/** Whether Invite Link rises from the bottom with a title bar of its own. */
function risesFromTheBottom() {
  const sheet = screenOf(TITLE);
  expect(FROM_THE_BOTTOM).toContain(sheet.props.stackAnimation);
  // Android draws no title bar on a form sheet (react-native-screens), which would
  // leave the sheet without its Close.
  expect(sheet.props.stackPresentation).not.toBe('formSheet');
}

test('[SHARING-71.1] opens Invite Link from the bottom over Settings on Android, with only Close and the whole link', async () => {
  await startApp('/settings');

  await receiveLink(WHOLE_LINK);

  await expectOpen(TITLE);
  risesFromTheBottom();
  expect(headerButtons(TITLE)).toEqual({ left: ['Close'], right: [] });
  expect(textsOn(TITLE)).toEqual([WHOLE_LINK]);
  expect(selectedTab()).toBe('Settings');
});

test.each([WHOLE_LINK, APP_SCHEME_LINK, ...OTHER_SPELLINGS])(
  '[SHARING-71.1] opens Invite Link over the Expenses root on Android, with that link, when %s starts the app',
  async (link) => {
    await startAppFromLink(link);

    await expectOpen(TITLE);
    risesFromTheBottom();
    expect(textsOn(TITLE)).toEqual([link]);
    expect(selectedTab()).toBe('Expenses');
    expect(navigationBarTitles(tab('Expenses'))).toEqual(['Expenses']);
  },
);

test('[SHARING-72.1] closes Invite Link with Close on Android and is back on the Settings root', async () => {
  await receiveOnSettings(WHOLE_LINK);

  await pressOnBar(TITLE, 'Close');

  await expectOnSettingsRoot();
});

test('[SHARING-72.1] closes Invite Link with the back button on Android, without leaving the app', async () => {
  await receiveOnSettings(WHOLE_LINK);

  await pressBack();

  await expectOnSettingsRoot();
  expect(exitApp).not.toHaveBeenCalled();
});

test('[SHARING-72.1] closes the Invite Link that a link started the app with on the first back press, and leaves the app on the second', async () => {
  await startAppFromLink(WHOLE_LINK);
  await expectOpen(TITLE);

  await pressBack();

  await expectClosed(TITLE);
  expect(selectedTab()).toBe('Expenses');
  expect(navigationBarTitles(tab('Expenses'))).toEqual(['Expenses']);
  expect(exitApp).not.toHaveBeenCalled();
  await pressBack();
  expect(exitApp).toHaveBeenCalledTimes(1);
});

test('[SHARING-73.1] shows the second link in the one Invite Link on Android, and one back press closes it', async () => {
  await receiveOnSettings(WHOLE_LINK);

  await receiveLink(SECOND_LINK);

  await waitFor(() => expect(textsOn(TITLE)).toEqual([SECOND_LINK]));
  expect(inviteLinksOpen()).toBe(1);
  await pressBack();
  await expectOnSettingsRoot();
  expect(exitApp).not.toHaveBeenCalled();
});

test('[SHARING-74.1] selects Groups, without Invite Link, when shared-expense-tracker://groups starts the app on Android', async () => {
  await startAppFromLink('shared-expense-tracker://groups');

  await waitFor(() => expect(selectedTab()).toBe('Groups'));
  expect(inviteLinksOpen()).toBe(0);
});
