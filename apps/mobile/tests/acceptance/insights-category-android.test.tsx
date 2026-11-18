import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Alert } from 'react-native';
import { fireEvent, waitFor, within } from '@testing-library/react-native';
import {
  addExpense,
  nameOf,
  pressBack,
  resetPhone,
} from './ledger-expense-app';
import {
  allowReads,
  phoneDatabaseWithReads,
  startExpensesAt,
} from './ledger-expense-list-app';
import { actionLabels } from './ledger-trash-app';
import { detailBarsOn, expectDetailsOn } from './ledger-group-expense-app';
import {
  checkedAggregation,
  expectInsights,
  insightsBars,
  insightsScreen,
  rowViews,
  selectedPeriod,
} from './insights-app';
import {
  ROW_HINT,
  categoryBarActions,
  categoryBars,
  categoryCard,
  categoryCardTitles,
  categoryCards,
  categoryDates,
  expectCategorySummary,
  openCategory,
} from './insights-category-app';
import { allowWrites } from './shell-appearance-app';
import {
  navigationBarTitles,
  push,
  selectedTab,
  tab,
  tapTab,
} from './shell-tabs-app';
import type { Database } from '../../src/storage';

// Runs on Android only (apps/mobile/jest.config.cjs). insights-category.test.tsx checks the
// rules of a category's expenses on iOS; this file checks that Android shows the same screen
// from the same row, and its Back button.

let mockOpen: () => Promise<Database>;

jest.mock('../../src/storage/expo', () => ({
  openPhoneDatabase: () => mockOpen(),
}));

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

// Material Symbols drawn as images come from the symbol font on the phone. Here
// each image is named after its symbol instead, as in the tab bar's tests.
jest.mock('expo-symbols', () => ({
  ...jest.requireActual('expo-symbols'),
  unstable_getMaterialSymbolSourceAsync: async (symbol: string) => ({
    uri: `material-symbol:${symbol}`,
  }),
}));

const FOOD = 'Food & Dining';

let directory: string;

beforeEach(() => {
  jest.clearAllMocks();
  directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'insights-category-android-'),
  );
  const file = path.join(directory, 'app.db');
  mockOpen = async () => phoneDatabaseWithReads(file);
  allowWrites();
  allowReads();
  resetPhone();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});

/**
 * Starts the app with Supper of 1.00 on 2024-12-31 and Lunch of 6.00 and Snack of 2.50 in
 * January 2025, all Food & Dining, and opens the personal Insights at /insights with `query`.
 */
async function insightsAt(query: string) {
  await startExpensesAt('/');
  for (const [date, amount, title] of [
    ['2024-12-31', '1.00', 'Supper'],
    ['2025-01-10', '6.00', 'Lunch'],
    ['2025-01-12', '2.50', 'Snack'],
  ])
    await addExpense({ date, amount, title, category: FOOD });
  await tapTab('Expenses');
  await push(`/insights${query}`);
  await expectInsights();
}

test('[INSIGHTS-23.4] makes each category row a button with the hint Shows these expenses on Android', async () => {
  await insightsAt('?period=2025-01');

  const [row] = rowViews();
  expect(nameOf(row)).toBe('Food & Dining, $8.50, 100.0 percent');
  expect(
    within(insightsScreen())
      .queryAllByRole('button', { name: / percent$/ })
      .map(nameOf),
  ).toEqual(['Food & Dining, $8.50, 100.0 percent']);
  expect(row.props.accessibilityHint).toBe(ROW_HINT);
});

test("[INSIGHTS-47.1] [INSIGHTS-48.1] [INSIGHTS-49.1] opens the category's expenses on Android, with the period, amount and count over the cards under their dates", async () => {
  await insightsAt('?period=2025-01');

  await openCategory(FOOD);

  expect(selectedTab()).toBe('Expenses');
  expect(navigationBarTitles(tab('Expenses'))).toEqual([
    'Expenses',
    'Insights',
    FOOD,
  ]);
  await expectCategorySummary(['January 2025', '$8.50', '2 expenses'], FOOD);
  expect(categoryCardTitles(FOOD)).toEqual(['Snack', 'Lunch']);
  expect(categoryDates(FOOD)).toEqual(['Jan 12, 2025', 'Jan 10, 2025']);
});

test("[INSIGHTS-47.1] goes back from the category's expenses to Insights on the year it was on with Back", async () => {
  await insightsAt('?period=2024');
  await openCategory(FOOD);
  await expectCategorySummary(['2024', '$1.00', '1 expense'], FOOD);

  await pressBack();

  await waitFor(() => expect(categoryBars(FOOD)).toHaveLength(0));
  expect(insightsBars()).toHaveLength(1);
  expect(checkedAggregation()).toEqual(['Year']);
  expect(selectedPeriod()).toBe('2024');
});

test("[INSIGHTS-50.1] opens the details from a card on Android, and goes back to the category's expenses with Back", async () => {
  await insightsAt('?period=2025-01');
  await openCategory(FOOD);

  await fireEvent.press(categoryCard(FOOD, 'Lunch'));
  await expectDetailsOn('Expenses', 'Lunch');
  await pressBack();

  await waitFor(() => expect(detailBarsOn('Expenses')).toHaveLength(0));
  expect(navigationBarTitles(tab('Expenses'))).toEqual([
    'Expenses',
    'Insights',
    FOOD,
  ]);
  expect(categoryCardTitles(FOOD)).toEqual(['Snack', 'Lunch']);
});

test("[INSIGHTS-51.1] offers no Delete expense action, no + button and no header action on a category's expenses on Android", async () => {
  await insightsAt('?period=2025-01');

  await openCategory(FOOD);

  await waitFor(() =>
    expect(categoryCardTitles(FOOD)).toEqual(['Snack', 'Lunch']),
  );
  for (const shown of categoryCards(FOOD))
    expect(actionLabels(shown)).not.toContain('Delete expense');
  expect(categoryCards(FOOD).map(nameOf)).not.toContain('Add expense');
  expect(categoryBarActions(FOOD)).toEqual([]);
});
