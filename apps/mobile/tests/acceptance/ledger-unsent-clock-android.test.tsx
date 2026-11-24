import { waitFor } from '@testing-library/react-native';
import { groupCard } from './ledger-group-expense-app';
import { showGroup } from './group-balances-app';
import { iconNames } from './shell-actions-app';
import { eachTestGetsAPhone, startShared, unsent } from './sync-app';
import { addDinner } from './sync-conflict-app';
import { CLOCK_ICON } from './sync-status-app';

// Runs on Android only (apps/mobile/jest.config.cjs), as ledger-unsent-clock.test.tsx does
// on iOS. Brisbane is a shared ledger in a build that names no API (sync-app), so nothing
// is uploaded: Dinner's event stays unsent (SYNC-93.1).

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

eachTestGetsAPhone('ledger-unsent-clock-android-');

test('[LEDGER-240.1] draws the clock with the Material schedule symbol on Android', async () => {
  await startShared();
  await addDinner();
  expect(await unsent()).toHaveLength(1);

  await showGroup('Brisbane');

  await waitFor(() =>
    expect(iconNames(groupCard('Brisbane', 'Dinner'), 'android')).toEqual([
      CLOCK_ICON.android,
    ]),
  );
  expect(CLOCK_ICON.android).toBe('schedule');
});
