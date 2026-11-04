import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Alert, BackHandler, DeviceEventEmitter } from 'react-native';
import { act, fireEvent, waitFor, within } from '@testing-library/react-native';
import type { Database } from '../../src/storage';
import { navigationBarTitles, selectedTab, tab } from './shell-tabs-app';
import { cardNames, createGroup, saveName, startGroupsApp } from './groups-app';
import {
  allowWrites,
  fakePhoneAppearance,
  settle,
  testDatabase,
  translucentViews,
} from './shell-appearance-app';
import {
  alertsShown,
  barTitled,
  lastAlertButtons,
  textsOn,
} from './group-details-app';
import {
  READ_ONLY,
  archiveByAction,
  archivedCardNames,
  noticeShown,
  openArchivedGroup,
  openArchivedGroups,
} from './group-archive-app';

// Runs on Android only (apps/mobile/jest.config.cjs). Both platforms share the
// archive screens (ADR-0002), so group-archive.test.tsx checks their rules on iOS;
// this file checks what Android shows differently and its system back button.

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

let directory: string;
let file: string;
// React Native leaves the app through exitApp when nothing handles a back press.
let exitApp: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'group-archive-'));
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

/** Starts the app on Groups with Taylor saved as your name, and creates `groups` in order. */
async function startWithGroups(groups: string[]) {
  const app = await startGroupsApp();
  await saveName('Taylor');
  for (const group of groups) await createGroup(group);
  return app;
}

/** Archives the group named `group` and opens its screen from Archived Groups. */
async function openArchived(group: string) {
  await archiveByAction(group);
  await openArchivedGroups();
  await openArchivedGroup(group);
}

test('[GROUPS-48.1] archives a group from its card on Android', async () => {
  await startWithGroups(['Brisbane', 'Tokyo']);

  await archiveByAction('Brisbane');

  await waitFor(() => expect(cardNames()).toEqual(['Open Tokyo']));
  expect(noticeShown()).toBe(true);
  expect(alertsShown()).toEqual([]);
});

test("[GROUPS-22.3] lists only Members, Balances and Cancel in an archived group's Group actions dialog on Android", async () => {
  await startWithGroups(['Brisbane']);
  await openArchived('Brisbane');
  await waitFor(() => expect(textsOn('Brisbane')).toContain(READ_ONLY));

  await fireEvent.press(
    within(barTitled('Brisbane')!).getByRole('button', {
      name: 'Group actions',
    }),
  );
  await settle();

  expect(alertsShown()).toEqual([['Group actions', undefined]]);
  expect(lastAlertButtons()).toEqual(['Members', 'Balances', 'Cancel']);
});

test("[GROUPS-54.1] goes back from an archived group's screen to Archived Groups with Back", async () => {
  await startWithGroups(['Brisbane']);
  await openArchived('Brisbane');

  await pressBack();

  await waitFor(() =>
    expect(navigationBarTitles(tab('Settings'))).toEqual([
      'Settings',
      'Archived Groups',
    ]),
  );
  expect(selectedTab()).toBe('Settings');
  expect(exitApp).not.toHaveBeenCalled();
});

test('[SHELL-38.1] adds no blur or glass to the archive notice on Android', async () => {
  await startWithGroups(['Brisbane']);

  await archiveByAction('Brisbane');

  expect(noticeShown()).toBe(true);
  expect(translucentViews()).toEqual([]);
});

test("[SHELL-38.1] adds no blur or glass to Archived Groups or an archived group's screen on Android", async () => {
  await startWithGroups(['Brisbane']);

  await archiveByAction('Brisbane');
  await openArchivedGroups();
  await waitFor(() => expect(archivedCardNames()).toEqual(['Open Brisbane']));
  await openArchivedGroup('Brisbane');
  await waitFor(() => expect(textsOn('Brisbane')).toContain(READ_ONLY));

  expect(translucentViews()).toEqual([]);
});
