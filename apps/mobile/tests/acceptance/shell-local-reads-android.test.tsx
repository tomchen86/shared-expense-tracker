import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Alert, BackHandler, DeviceEventEmitter } from 'react-native';
import { act, waitFor } from '@testing-library/react-native';
import type { Database } from '../../src/storage';
import {
  navigationBarTitles,
  push,
  selectedTab,
  startApp,
  tab,
  tapTab,
} from './shell-tabs-app';
import {
  allowWrites,
  fakePhoneAppearance,
  settle,
} from './shell-appearance-app';
import {
  alertsShown,
  expectClosed,
  expectOpen,
  headerButtons,
  textsOn,
} from './group-details-app';
import {
  NO_EXPENSE_ID,
  allowReads,
  failReads,
  phoneDatabaseWithReads,
} from './ledger-expense-list-app';

// Runs on Android only (apps/mobile/jest.config.cjs). Both platforms share the
// screens (ADR-0002), so shell-local-reads.test.tsx checks the rules on iOS; this
// file checks the Android title bar and system back button on a screen that cannot
// read the local data.

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

const READ_ERROR = [
  'Unable to Load Local Data',
  'Your data was not changed.',
  'Try Again',
];
const NO_ID = NO_EXPENSE_ID;

let directory: string;
let file: string;
// React Native leaves the app through exitApp when nothing handles a back press.
let exitApp: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'local-reads-android-'));
  file = path.join(directory, 'app.db');
  mockOpen = async () => phoneDatabaseWithReads(file);
  allowWrites();
  allowReads();
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

async function expectReadError(title: string) {
  await expectOpen(title);
  await waitFor(() => expect(textsOn(title)).toEqual(READ_ERROR));
}

/** Starts the app on the root of `tabUrl`, then opens `url` with every read failing. */
async function openFailing(tabUrl: string, url: string, title: string) {
  await startApp(tabUrl);
  await settle();
  failReads();
  await push(url);
  await expectReadError(title);
}

test.each([
  ['/', '/expenses/new', 'New Expense', ['Cancel']],
  ['/groups', `/groups/members?id=${NO_ID}`, 'Members', ['Close']],
  ['/groups', `/groups/rename?id=${NO_ID}`, 'Rename Group', ['Cancel']],
  ['/groups', `/groups/${NO_ID}`, 'Group Details', []],
  ['/', `/expenses/${NO_ID}`, 'Expense', []],
  ['/', '/insights', 'Insights', []],
])(
  '[SHELL-60.1] on Android, from %s, gives %s, titled %s, only these title bar buttons while it shows the read error: %j',
  async (tabUrl, url, title, buttons) => {
    await openFailing(tabUrl, url, title);

    expect(headerButtons(title)).toEqual({ left: buttons, right: [] });
  },
);

test("[SHELL-63.1] goes back from a group's screen that shows the read error with the system back button", async () => {
  await openFailing('/groups', `/groups/${NO_ID}`, 'Group Details');

  await pressBack();

  expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups']);
  expect(exitApp).not.toHaveBeenCalled();
});

test.each([
  ['/', '/expenses/new', 'New Expense'],
  ['/groups', `/groups/members?id=${NO_ID}`, 'Members'],
  ['/groups', `/groups/balances?id=${NO_ID}`, 'Balances'],
  ['/', '/manage-categories', 'Manage Categories'],
])(
  '[SHELL-63.1] from %s, closes %s, titled %s, with the system back button while it shows the read error, asking nothing',
  async (tabUrl, url, title) => {
    await openFailing(tabUrl, url, title);

    await pressBack();

    await expectClosed(title);
    expect(alertsShown()).toEqual([]);
    expect(exitApp).not.toHaveBeenCalled();
  },
);

test('[SHELL-63.1] switches to Expenses with the system back button from the Groups root that shows the read error', async () => {
  await startApp();
  await settle();
  failReads();
  await tapTab('Groups');
  await expectReadError('Groups');

  await pressBack();

  expect(selectedTab()).toBe('Expenses');
  expect(exitApp).not.toHaveBeenCalled();
});
