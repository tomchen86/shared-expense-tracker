import {
  newPhone,
  removePhones,
  resetPhones,
  startOn,
  writeData,
} from './backup-app';
import { resetPhone } from './ledger-expense-app';
import { expectInsights } from './insights-app';
import {
  categoryCardTitles,
  categorySummary,
  openCategory,
} from './insights-category-app';
import {
  fakePhoneAppearance,
  fakeReduceTransparency,
} from './shell-appearance-app';
import { push, tapTab } from './shell-tabs-app';

// Runs on iOS. Starts the app on a phone that already holds 300 expenses of one category,
// written as the screens would write them (backup-app), in Taipei on 2026-11-18, as
// ledger-list-many.test.tsx does for the lists. Jest has no screen, so "on and near the
// screen" is checked as fewer cards than expenses, in order from the top.

jest.mock('../../src/storage/expo', () => ({
  openPhoneDatabase: () =>
    jest
      .requireActual<typeof import('./backup-app')>('./backup-app')
      .openPhoneDatabase(),
}));

jest.mock(
  '../../src/storage/expo-files',
  () =>
    jest.requireActual<typeof import('./backup-app')>('./backup-app')
      .phoneFiles,
);

// Not virtual, as in the expense form tests.
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

beforeEach(() => {
  jest.clearAllMocks();
  resetPhones();
  resetPhone();
  fakePhoneAppearance('light');
  fakeReduceTransparency(false);
});

afterEach(async () => {
  jest.restoreAllMocks();
  await removePhones();
});

const COUNT = 300;
const FOOD = 'Food & Dining';

test("[INSIGHTS-49.1] draws only the first cards of a category's 300 expenses, and counts them all in its amount and count", async () => {
  const phone = newPhone();
  await writeData(phone, {
    expenses: Array.from({ length: COUNT }, (_, index) => ({
      title: `Expense ${index + 1}`,
      amount: '1',
      date: '2026-11-18',
      category: FOOD,
    })),
  });
  await startOn(phone, { url: '/' });
  await tapTab('Expenses');
  await push('/insights');
  await expectInsights();

  await openCategory(FOOD);

  expect(categorySummary(FOOD)).toEqual([
    'November 2026',
    '$300.00',
    '300 expenses',
  ]);
  const titles = categoryCardTitles(FOOD);
  expect(titles.length).toBeGreaterThan(0);
  expect(titles.length).toBeLessThan(COUNT);
  // The one added last first (LEDGER-28.1), with none skipped.
  expect(titles).toEqual(titles.map((_, index) => `Expense ${COUNT - index}`));
});
