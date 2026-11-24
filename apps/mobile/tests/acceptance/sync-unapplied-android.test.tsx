import { BackHandler } from 'react-native';
import { pressBack } from './ledger-expense-app';
import { showGroup } from './group-balances-app';
import { expectClosed, screenOf } from './group-details-app';
import { iconNames } from './shell-actions-app';
import { navigationBarTitles, selectedTab, tab } from './shell-tabs-app';
import { eachTestGetsAPhone, groupId, startShared } from './sync-app';
import { MARK_ICON, addDinner } from './sync-conflict-app';
import {
  SHEET,
  expectNotApplied,
  notAppliedButton,
  openSheet,
  refuseOwn,
} from './sync-unapplied-app';

// Runs on Android only (apps/mobile/jest.config.cjs), as sync-unapplied.test.tsx does on
// iOS: Brisbane is a shared ledger, and the event that added Dinner came back refused by
// every phone.

jest.mock('../../src/storage/expo', () => ({
  openPhoneDatabase: async () =>
    jest.requireActual<typeof import('./sync-app')>('./sync-app').openPhone(),
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

eachTestGetsAPhone('sync-unapplied-android-');

let exitApp: jest.SpyInstance;

beforeEach(() => {
  exitApp = jest.spyOn(BackHandler, 'exitApp');
});

test("[GROUPS-170.2] [GROUPS-171.1] draws the Material warning symbol on Android, on the group's button and on the block, and closes Changes Not Applied with Back", async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  await addDinner();
  await refuseOwn(brisbane);

  await expectNotApplied('Brisbane', 1);
  expect(iconNames(notAppliedButton('Brisbane')!, 'android')).toEqual([
    MARK_ICON.android,
  ]);

  await showGroup('Brisbane');
  await openSheet('Brisbane');

  expect(iconNames(screenOf(SHEET), 'android')).toContain(MARK_ICON.android);

  await pressBack();

  await expectClosed(SHEET);
  expect(selectedTab()).toBe('Groups');
  expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups', 'Brisbane']);
  expect(exitApp).not.toHaveBeenCalled();
});
