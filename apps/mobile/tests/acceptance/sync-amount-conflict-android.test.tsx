import { fireEvent, waitFor } from '@testing-library/react-native';
import { editExpense } from './ledger-expense-app';
import {
  detailScreenOn,
  expectDetailsOn,
  groupCard,
} from './ledger-group-expense-app';
import { showGroup } from './group-balances-app';
import { iconNames } from './shell-actions-app';
import {
  LATER,
  MINUTE,
  at,
  changed,
  eachTestGetsAPhone,
  expenseTitled,
  groupId,
  receive,
  stamped,
  startShared,
} from './sync-app';
import {
  MARK_ICON,
  addDinner,
  expectBlockOn,
  markedOn,
  moneyOf,
  needsReview,
  reviewButton,
  reviewCount,
} from './sync-conflict-app';

// Runs on Android only (apps/mobile/jest.config.cjs), as sync-amount-conflict.test.tsx
// does on iOS: Brisbane is a shared ledger, and Dinner, whose amount you changed, has been
// overridden by another phone's change that had not seen yours.

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

eachTestGetsAPhone('sync-conflict-android-');

test('[LEDGER-151.1] [LEDGER-152.1] [GROUPS-107.2] draws the mark with the Material warning symbol on Android: on the card, on the number to review and on the details', async () => {
  await startShared();
  const brisbane = await groupId('Brisbane');
  await addDinner();
  const dinner = await expenseTitled('Dinner');
  await editExpense(dinner.id, { amount: '120.00' });
  await receive(
    brisbane,
    changed(
      'expense',
      dinner.id,
      at(LATER + MINUTE),
      { money: await moneyOf(9000) },
      { money: stamped(0) },
    ),
  );

  await showGroup('Brisbane');

  await waitFor(() => expect(markedOn('Brisbane')).toEqual(['Dinner']));
  expect(iconNames(groupCard('Brisbane', 'Dinner'), 'android')).toEqual([
    MARK_ICON.android,
  ]);
  expect(reviewCount('Brisbane')).toBe(needsReview(1));
  expect(iconNames(reviewButton('Brisbane')!, 'android')).toEqual([
    MARK_ICON.android,
  ]);

  await fireEvent.press(groupCard('Brisbane', 'Dinner'));
  await expectDetailsOn('Groups', 'Dinner');

  await expectBlockOn('Groups');
  expect(iconNames(detailScreenOn('Groups'), 'android')).toContain(
    MARK_ICON.android,
  );
});
