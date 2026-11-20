import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fireEvent, waitFor, within } from '@testing-library/react-native';
import {
  buildCategoryExpenses,
  buildInsights,
  buildRangeInsights,
} from '@shared-expense/domain';
import { addExpense, resetPhone } from './ledger-expense-app';
import {
  allowReads,
  phoneDatabaseWithReads,
  startExpensesAt,
} from './ledger-expense-list-app';
import {
  TOO_LARGE,
  aggregationNames,
  chartMenu,
  expectInsights,
  headings,
  insightsLines,
  insightsScreen,
  openInsights,
  totals,
} from './insights-app';
import {
  categoryBars,
  categoryCard,
  categoryCards,
  categoryLines,
  expectCategorySummary,
  openCategory,
} from './insights-category-app';
import { expectDetailsOn } from './ledger-group-expense-app';
import { chooseExpenseAction } from './ledger-trash-app';
import { chooseRangeDate, rangeDates } from './ledger-list-period-app';
import { allowWrites } from './shell-appearance-app';
import { push, tapTab } from './shell-tabs-app';
import type { Database } from '../../src/storage';

// Runs on iOS. The domain package refuses totals above the largest safe integer
// (INSIGHTS-12.1), which takes some 9,008 expenses of the largest amount in one
// year. Instead of adding them, this file has the domain package refuse the
// totals of the expenses it gets, as it does for those.

jest.mock('@shared-expense/domain', () => {
  const actual = jest.requireActual<typeof import('@shared-expense/domain')>(
    '@shared-expense/domain',
  );
  return {
    ...actual,
    buildInsights: jest.fn(actual.buildInsights),
    buildRangeInsights: jest.fn(actual.buildRangeInsights),
    buildCategoryExpenses: jest.fn(actual.buildCategoryExpenses),
  };
});

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

let directory: string;

beforeEach(() => {
  jest.clearAllMocks();
  // What a test has these two return would stay for the tests after it: clearAllMocks keeps
  // it, and restoreAllMocks puts back only what jest.spyOn replaced.
  const domain = jest.requireActual<typeof import('@shared-expense/domain')>(
    '@shared-expense/domain',
  );
  jest.mocked(buildInsights).mockImplementation(domain.buildInsights);
  jest.mocked(buildRangeInsights).mockImplementation(domain.buildRangeInsights);
  jest
    .mocked(buildCategoryExpenses)
    .mockImplementation(domain.buildCategoryExpenses);
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'insights-overflow-'));
  const file = path.join(directory, 'app.db');
  mockOpen = async () => phoneDatabaseWithReads(file);
  allowWrites();
  allowReads();
  resetPhone();
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});

test('[INSIGHTS-20.1] shows only Totals Too Large and its hint when the domain package refuses the totals', async () => {
  await startExpensesAt('/');
  await addExpense({ amount: '9999999999.99' });
  jest.mocked(buildInsights).mockReturnValue(undefined);

  await openInsights();

  await waitFor(() => expect(insightsLines()).toEqual(TOO_LARGE));
  expect(jest.mocked(buildInsights)).toHaveBeenCalled();
  expect(headings()).toEqual(['Totals Too Large']);
  expect(chartMenu()).toBeUndefined();
  expect(within(insightsScreen()).queryAllByRole('button')).toEqual([]);
});

test('[INSIGHTS-46.1] [INSIGHTS-20.1] shows only Totals Too Large, without From and To, when the domain package refuses the months and years, whatever dates the URL names', async () => {
  await startExpensesAt('/');
  await addExpense({ amount: '8.75', date: '2025-01-20' });
  jest.mocked(buildInsights).mockReturnValue(undefined);

  await tapTab('Expenses');
  await push('/insights?from=2025-01-01&to=2025-01-31');
  await expectInsights();

  await waitFor(() => expect(insightsLines()).toEqual(TOO_LARGE));
  expect(jest.mocked(buildInsights)).toHaveBeenCalled();
  expect(headings()).toEqual(['Totals Too Large']);
  expect(chartMenu()).toBeUndefined();
  expect(rangeDates(insightsScreen())).toBeUndefined();
  expect(within(insightsScreen()).queryAllByRole('button')).toEqual([]);
});

test('[INSIGHTS-46.1] shows Totals Too Large under From and To when the domain package refuses the range, and the totals again for dates it does not refuse', async () => {
  await startExpensesAt('/');
  await addExpense({ amount: '8.75', date: '2025-01-20' });
  // Refused while the range ends on March 31, as a range whose total is too large is.
  jest
    .mocked(buildRangeInsights)
    .mockImplementation((input) =>
      input.to === '2025-03-31'
        ? undefined
        : jest
            .requireActual<typeof import('@shared-expense/domain')>(
              '@shared-expense/domain',
            )
            .buildRangeInsights(input),
    );

  await tapTab('Expenses');
  await push('/insights?from=2025-01-01&to=2025-03-31');
  await expectInsights();

  await waitFor(() =>
    expect(insightsLines()).toEqual(expect.arrayContaining(TOO_LARGE)),
  );
  expect(jest.mocked(buildRangeInsights)).toHaveBeenCalled();
  expect(headings()).toContain('Totals Too Large');
  expect(chartMenu()).toBeUndefined();
  expect(totals()).toEqual([]);
  // What changes the dates stays.
  expect(aggregationNames()).toEqual(['Month', 'Year', 'Custom']);
  expect(rangeDates(insightsScreen())).toMatchObject({
    from: '2025-01-01',
    to: '2025-03-31',
  });

  await chooseRangeDate(insightsScreen(), 'To', '2025-01-31');

  await waitFor(() => expect(totals()).toEqual(['$8.75']));
  expect(insightsLines()).not.toContain('Totals Too Large');
});

test("[INSIGHTS-57.1] shows only Totals Too Large on a category's expenses, under the category's name, when the domain package refuses its period after the expenses change", async () => {
  await startExpensesAt('/');
  await addExpense({
    amount: '8.75',
    title: 'Coffee run',
    category: 'Food & Dining',
    date: '2026-10-29',
  });
  await addExpense({
    amount: '6.00',
    title: 'Lunch',
    category: 'Food & Dining',
    date: '2026-10-28',
  });
  await openInsights();
  await openCategory('Food & Dining');
  await expectCategorySummary(
    ['October 2026', '$14.75', '2 expenses'],
    'Food & Dining',
  );
  jest.mocked(buildCategoryExpenses).mockReturnValue(undefined);

  await fireEvent.press(categoryCard('Food & Dining', 'Lunch'));
  await expectDetailsOn('Expenses', 'Lunch');
  await chooseExpenseAction('Expenses', 'Delete');

  await waitFor(() =>
    expect(categoryLines('Food & Dining')).toEqual(TOO_LARGE),
  );
  expect(jest.mocked(buildCategoryExpenses)).toHaveBeenCalled();
  expect(categoryBars('Food & Dining')).toHaveLength(1);
  expect(categoryCards('Food & Dining')).toEqual([]);
});
