import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { BackHandler } from 'react-native';
import {
  phoneDatabase,
  pressBack,
  resetPhone,
  watchAlerts,
} from './ledger-expense-app';
import { allowWrites } from './shell-appearance-app';
import { navigationBarTitles, selectedTab, tab } from './shell-tabs-app';
import { expectClosed, headerButtons } from './group-details-app';
import { startWithGroups } from './ledger-group-expense-app';
import { openBalances, showGroup } from './group-balances-app';
import type { Database } from '../../src/storage';

// Runs on Android only (apps/mobile/jest.config.cjs), as group-balances.test.tsx
// does on iOS: a phone database file of its own, in Taipei on 2026-10-30, in a
// region whose currency is USD, with Taylor saved as your name.

let mockOpen: () => Promise<Database>;

jest.mock('../../src/storage/expo', () => ({
  openPhoneDatabase: () => mockOpen(),
}));

// Not virtual, as in the iOS file.
jest.mock('expo-localization', () => {
  const phone = () =>
    jest.requireActual<typeof import('./ledger-expense-app')>(
      './ledger-expense-app',
    );
  return {
    ...jest.requireActual<object>('expo-localization'),
    getLocales: () => phone().phoneLocales(),
    getCalendars: () => phone().phoneCalendars(),
    useLocales: () => phone().phoneLocales(),
    useCalendars: () => phone().phoneCalendars(),
  };
});

// Material Symbols drawn as images come from the symbol font on the phone. Here
// each image is named after its symbol instead, as in the tab bar's tests.
jest.mock('expo-symbols', () => ({
  ...jest.requireActual('expo-symbols'),
  unstable_getMaterialSymbolSourceAsync: async (symbol: string) => ({
    uri: `material-symbol:${symbol}`,
  }),
}));

let directory: string;
// React Native leaves the app through exitApp when nothing handles a back press.
let exitApp: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'group-balances-android-'));
  const file = path.join(directory, 'app.db');
  mockOpen = async () => phoneDatabase(file);
  allowWrites();
  resetPhone();
  watchAlerts();
  exitApp = jest.spyOn(BackHandler, 'exitApp');
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});

test("[GROUPS-70.1] opens Balances from the Group actions dialog over the group's screen, with only Close, on Android", async () => {
  await startWithGroups({ Brisbane: ['Casey'] });
  await showGroup('Brisbane');

  await openBalances('Brisbane');

  expect(navigationBarTitles(tab('Groups'))).toEqual([
    'Groups',
    'Brisbane',
    'Balances',
  ]);
  expect(headerButtons('Balances')).toEqual({ left: ['Close'], right: [] });
});

test("[GROUPS-70.1] closes Balances with Back, back on the group's screen", async () => {
  await startWithGroups({ Brisbane: ['Casey'] });
  await showGroup('Brisbane');
  await openBalances('Brisbane');

  await pressBack();

  await expectClosed('Balances');
  expect(selectedTab()).toBe('Groups');
  expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups', 'Brisbane']);
  expect(exitApp).not.toHaveBeenCalled();
});
