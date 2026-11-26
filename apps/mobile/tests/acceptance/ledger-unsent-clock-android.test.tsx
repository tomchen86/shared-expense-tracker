import { waitFor } from '@testing-library/react-native';
import { addGroupExpense, groupCard } from './ledger-group-expense-app';
import { showGroup } from './group-balances-app';
import { goOffline, mistakes, removeWorld, resetWorld } from './sharing-app';
import { iconNames } from './shell-actions-app';
import { YOU, eachTestGetsAPhone, unsent } from './sync-app';
import { startEventApi, startSynced } from './sync-screens-app';
import { CLOCK_ICON, startHolding } from './sync-status-app';

// Runs on Android only (apps/mobile/jest.config.cjs), as ledger-unsent-clock.test.tsx does
// on iOS: Brisbane is a shared ledger of a phone with a device identity and an API
// (sync-screens-app), and the phone has no network when Dinner is added.

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

jest.mock(
  'expo-secure-store',
  () =>
    jest.requireActual<typeof import('./sharing-app')>('./sharing-app')
      .secureStore,
  { virtual: true },
);

jest.mock(
  'expo-crypto',
  () =>
    jest.requireActual<typeof import('./sharing-app')>('./sharing-app')
      .randomSource,
  { virtual: true },
);

jest.mock('../../src/sharing/api-address', () => ({
  apiUrl: () =>
    jest
      .requireActual<typeof import('./sync-screens-app')>('./sync-screens-app')
      .builtApiUrl(),
}));

// Material Symbols drawn as images come from the symbol font on the phone. Here
// each image is named after its symbol instead, as in the tab bar's tests.
jest.mock('expo-symbols', () => ({
  ...jest.requireActual('expo-symbols'),
  unstable_getMaterialSymbolSourceAsync: async (symbol: string) => ({
    uri: `material-symbol:${symbol}`,
  }),
}));

eachTestGetsAPhone('ledger-unsent-clock-android-');

beforeEach(() => {
  resetWorld();
  startEventApi();
  startHolding();
});

afterEach(async () => {
  const wrong = mistakes();
  await removeWorld();
  expect(wrong).toEqual([]);
});

test('[LEDGER-240.1] draws the clock with the Material schedule symbol on Android', async () => {
  await startSynced();
  goOffline();
  await addGroupExpense({
    group: 'Brisbane',
    title: 'Dinner',
    payer: 'Casey',
    sharers: ['Blake', YOU, 'Casey'],
  });
  expect(await unsent()).toHaveLength(1);

  await showGroup('Brisbane');

  await waitFor(() =>
    expect(iconNames(groupCard('Brisbane', 'Dinner'), 'android')).toEqual([
      CLOCK_ICON.android,
    ]),
  );
  expect(CLOCK_ICON.android).toBe('schedule');
});
