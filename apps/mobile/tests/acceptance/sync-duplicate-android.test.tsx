import { fireEvent, waitFor } from '@testing-library/react-native';
import {
  detailScreenOn,
  expectDetailsOn,
  groupCard,
} from './ledger-group-expense-app';
import { showGroup } from './group-balances-app';
import { iconNames } from './shell-actions-app';
import {
  eachTestGetsAPhone,
  expenseTitled,
  groupId,
  receive,
  startShared,
} from './sync-app';
import {
  MARK_ICON,
  addDinner,
  needsReview,
  reviewButton,
  reviewCount,
} from './sync-conflict-app';
import {
  alikeCreated,
  duplicatesOn,
  expectDuplicateBlockOn,
} from './sync-duplicate-app';

// Runs on Android. The mark of a possible duplicate (sync-duplicate.test.tsx) is drawn
// with the Material symbol there.

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

eachTestGetsAPhone('sync-duplicate-android-');

test('[LEDGER-156.1] [LEDGER-157.1] [GROUPS-107.2] draws the mark of a possible duplicate with the Material warning symbol on Android: on the card, on the number to review and on the details', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  await addDinner();
  await receive(brisbane, await alikeCreated());
  await expenseTitled('Supper');

  await showGroup('Brisbane');

  await waitFor(() => expect(duplicatesOn('Brisbane')).toEqual(['Supper']));
  expect(iconNames(groupCard('Brisbane', 'Supper'), 'android')).toEqual([
    MARK_ICON.android,
  ]);
  expect(iconNames(groupCard('Brisbane', 'Dinner'), 'android')).toEqual([]);
  expect(reviewCount('Brisbane')).toBe(needsReview(1));
  expect(iconNames(reviewButton('Brisbane')!, 'android')).toEqual([
    MARK_ICON.android,
  ]);

  await fireEvent.press(groupCard('Brisbane', 'Supper'));
  await expectDetailsOn('Groups', 'Supper');

  await expectDuplicateBlockOn('Groups');
  expect(iconNames(detailScreenOn('Groups'), 'android')).toContain(
    MARK_ICON.android,
  );
});
