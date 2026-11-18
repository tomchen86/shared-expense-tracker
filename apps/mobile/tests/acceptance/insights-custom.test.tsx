import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ActionSheetIOS } from 'react-native';
import { waitFor } from '@testing-library/react-native';
import {
  addExpense,
  resetPhone,
  setRegionCurrency,
  watchAlerts,
} from './ledger-expense-app';
import {
  allowReads,
  phoneDatabaseWithReads,
  startExpensesAt,
} from './ledger-expense-list-app';
import { chooseRangeDate, rangeDates } from './ledger-list-period-app';
import {
  addGroupExpense,
  startWithGroups,
  storedGroup,
} from './ledger-group-expense-app';
import {
  aggregationNames,
  chartKinds,
  chartMenu,
  currentAggregation,
  expectInsights,
  expectPeriod,
  expectTotals,
  headings,
  insightsLines,
  insightsScreen,
  nextButton,
  periodButton,
  previousButton,
  rows,
  selectAggregation,
  selectedPeriod,
  totalCards,
  totals,
} from './insights-app';
import { allowWrites, settle } from './shell-appearance-app';
import { push, tapTab } from './shell-tabs-app';
import type { Database } from '../../src/storage';

// Runs on iOS. Each test starts the app as the Insights tests do (insights.test.tsx), in Taipei
// on 2026-10-30, and opens Insights at a URL that names a period, or changes Period aggregation
// as the ui/ SegmentedControl reports a choice (insights-app); pressing the system's segmented
// control is the E2E flow's (INSIGHTS-30.2). The dates of a custom range are the ui/ DateField,
// read and set as on the lists (ledger-list-period-app).

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

/** Brisbane, with Casey and Blake added after you. */
const BRISBANE = { Brisbane: ['Casey', 'Blake'] };

const NO_EXPENSES_IN_DATES = [
  'No Expenses in These Dates',
  'Choose other dates to see spending insights.',
];

let directory: string;
let file: string;

beforeEach(() => {
  jest.clearAllMocks();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'insights-custom-'));
  file = path.join(directory, 'app.db');
  mockOpen = async () => phoneDatabaseWithReads(file);
  allowWrites();
  allowReads();
  resetPhone();
  watchAlerts();
  jest
    .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
    .mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});

/** Adds a personal expense in USD unless `currency` says otherwise. */
async function spend(
  date: string,
  amount: string,
  category = 'Food & Dining',
  currency = 'USD',
) {
  setRegionCurrency(currency);
  await addExpense({
    date,
    amount,
    category,
    title: `${category} on ${date}`,
  });
  setRegionCurrency('USD');
}

/** Opens the personal Insights on the Expenses tab at /insights with `query`, as a link in the app would. */
async function openInsightsAt(query: string) {
  await tapTab('Expenses');
  await push(`/insights${query}`);
  await expectInsights();
}

/** Starts the app, adds `expenses` as [date, amount, category?] and opens the personal Insights at /insights with `query`. */
async function insightsAt(
  query: string,
  ...expenses: [string, string, string?][]
) {
  const app = await startExpensesAt('/');
  for (const [date, amount, category] of expenses)
    await spend(date, amount, category);
  await openInsightsAt(query);
  return app;
}

/** 1.00 on December 31, 2024, 2.00 on January 20, 2025 and 3.00 on March 10, 2025. */
const THREE_MONTHS: [string, string][] = [
  ['2024-12-31', '1.00'],
  ['2025-01-20', '2.00'],
  ['2025-03-10', '3.00'],
];

/** The From and To of the custom range Insights shows, as YYYY-MM-DD. */
const range = (on = 'Expenses') => {
  const dates = rangeDates(insightsScreen(on));
  return dates && [dates.from, dates.to];
};

const groupId = async (name: string) => (await storedGroup(file, name)).id;

// The period a URL names

test('[INSIGHTS-45.1] opens on the month the URL names, not on the latest one', async () => {
  await insightsAt('?period=2025-01', ...THREE_MONTHS);

  expect(currentAggregation()).toBe('Month');
  expect(selectedPeriod()).toBe('January 2025');
  expect(totals()).toEqual(['$2.00']);
});

test('[INSIGHTS-45.1] opens on the year the URL names, on Year', async () => {
  await insightsAt('?period=2024', ...THREE_MONTHS);

  expect(currentAggregation()).toBe('Year');
  expect(selectedPeriod()).toBe('2024');
  expect(totals()).toEqual(['$1.00']);
});

test.each([
  ['the latest month of its year', '?period=2025-02'],
  ['the latest month when its year has none', '?period=2026-10'],
])(
  '[INSIGHTS-45.1] opens on %s when the month the URL names has no expenses',
  async (_what, query) => {
    await insightsAt(query, ...THREE_MONTHS);

    expect(currentAggregation()).toBe('Month');
    expect(selectedPeriod()).toBe('March 2025');
  },
);

test('[INSIGHTS-45.1] opens on the latest year when the year the URL names has no expenses', async () => {
  await insightsAt('?period=2023', ...THREE_MONTHS);

  expect(currentAggregation()).toBe('Year');
  expect(selectedPeriod()).toBe('2025');
});

test('[INSIGHTS-45.1] opens on Custom with the dates the URL names', async () => {
  await insightsAt('?from=2025-01-01&to=2025-01-31', ...THREE_MONTHS);

  expect(currentAggregation()).toBe('Custom');
  expect(range()).toEqual(['2025-01-01', '2025-01-31']);
  expect(totals()).toEqual(['$2.00']);
});

test.each([
  ['a To after today', '?from=2026-10-01&to=2026-10-31', '2026-10-01'],
  ['both dates after today', '?from=2026-11-05&to=2026-11-20', '2026-10-30'],
])(
  '[INSIGHTS-45.1] opens with today in place of %s',
  async (_what, query, from) => {
    await insightsAt(query, ...THREE_MONTHS);

    expect(currentAggregation()).toBe('Custom');
    expect(range()).toEqual([from, '2026-10-30']);
  },
);

test('[INSIGHTS-45.1] opens on the dates when the URL names a period too', async () => {
  await insightsAt(
    '?period=2024-12&from=2025-01-01&to=2025-01-31',
    ...THREE_MONTHS,
  );

  expect(currentAggregation()).toBe('Custom');
  expect(range()).toEqual(['2025-01-01', '2025-01-31']);
});

test.each([
  '?period=2025-13',
  '?period=2025-1',
  '?period=abc',
  '?from=2025-01-01',
  '?to=2025-01-31',
  '?from=2025-02-30&to=2025-03-10',
])(
  '[INSIGHTS-45.1] opens on the latest month when the URL names no valid period: %s',
  async (query) => {
    await insightsAt(query, ...THREE_MONTHS);

    expect(currentAggregation()).toBe('Month');
    expect(selectedPeriod()).toBe('March 2025');
    expect(totals()).toEqual(['$3.00']);
  },
);

test('[INSIGHTS-45.1] opens on the named month when the app starts at the URL', async () => {
  const first = await startExpensesAt('/');
  for (const [date, amount] of THREE_MONTHS) await spend(date, amount);
  await first.unmount();
  await settle();

  await startExpensesAt('/insights?period=2025-01');
  await expectInsights();

  await expectPeriod('January 2025');
  expect(currentAggregation()).toBe('Month');
});

test("[INSIGHTS-45.1] opens a group's Insights on the month the URL names", async () => {
  await startWithGroups(BRISBANE);
  const dinner = (date: string, amount: string) =>
    addGroupExpense({
      group: 'Brisbane',
      payer: 'Casey',
      sharers: ['Taylor (You)', 'Casey', 'Blake'],
      title: `Dinner on ${date}`,
      date,
      amount,
    });
  await dinner('2026-09-30', '25.00');
  await dinner('2026-10-29', '60.00');
  const id = await groupId('Brisbane');

  await tapTab('Groups');
  await push(`/groups/insights?groupId=${id}&period=2026-09`);
  await expectInsights('Groups');

  expect(selectedPeriod('Groups')).toBe('September 2026');
  await expectTotals(['$25.00'], 'Groups');
});

// Custom

test('[INSIGHTS-28.2] offers Month, Year and Custom, and shows From and To in place of the period row on Custom', async () => {
  await insightsAt('', ...THREE_MONTHS);
  expect(aggregationNames()).toEqual(['Month', 'Year', 'Custom']);
  expect(currentAggregation()).toBe('Month');
  expect(range()).toBeUndefined();

  await selectAggregation('Custom');

  expect(currentAggregation()).toBe('Custom');
  expect(range()).toBeDefined();
  expect(previousButton()).toBeNull();
  expect(nextButton()).toBeNull();
  expect(periodButton()).toBeNull();
  expect(selectedPeriod()).toBeUndefined();
});

test('[INSIGHTS-46.1] starts Custom on the first and last day of the month that was selected, with no comparison', async () => {
  await insightsAt('', ...THREE_MONTHS);
  expect(selectedPeriod()).toBe('March 2025');

  await selectAggregation('Custom');

  expect(rangeDates(insightsScreen())).toEqual({
    from: '2025-03-01',
    to: '2025-03-31',
    latest: ['2026-10-30', '2026-10-30'],
  });
  expect(insightsLines()).toContain('–');
  // The total alone: March 2025 compares with January 2025 on Month.
  expect(totalCards()).toEqual([['$3.00']]);
});

test('[INSIGHTS-46.1] starts Custom no later than today from this month and from this year', async () => {
  await insightsAt('', ['2026-10-05', '4.00']);
  expect(selectedPeriod()).toBe('October 2026');

  await selectAggregation('Custom');
  expect(range()).toEqual(['2026-10-01', '2026-10-30']);

  await selectAggregation('Year');
  await selectAggregation('Custom');
  expect(range()).toEqual(['2026-01-01', '2026-10-30']);
});

test('[INSIGHTS-46.1] totals the expenses from From to To as soon as a date is chosen, with their categories and chart', async () => {
  await insightsAt(
    '?from=2025-01-01&to=2025-01-31',
    ['2025-01-20', '8.00', 'Food & Dining'],
    ['2025-03-10', '12.00', 'Transportation'],
  );
  expect(totals()).toEqual(['$8.00']);

  await chooseRangeDate(insightsScreen(), 'To', '2025-03-31');

  expect(totalCards()).toEqual([['$20.00']]);
  expect(headings()).toContain('USD categories');
  expect(rows()).toEqual([
    ['Transportation', '$12.00 · 60.0%'],
    ['Food & Dining', '$8.00 · 40.0%'],
  ]);
  expect(chartKinds()).toEqual(['donut']);
  expect(chartMenu()).toBeDefined();
});

test('[INSIGHTS-46.1] counts both the first and the last day of the range', async () => {
  await insightsAt(
    '?from=2025-01-10&to=2025-01-20',
    ['2025-01-09', '1.00'],
    ['2025-01-10', '2.00'],
    ['2025-01-20', '4.00'],
    ['2025-01-21', '8.00'],
  );

  expect(totals()).toEqual(['$6.00']);
});

test('[INSIGHTS-46.1] totals the days from To to From when From is the later one', async () => {
  await insightsAt(
    '?from=2025-01-01&to=2025-03-31',
    ['2025-01-20', '8.00'],
    ['2025-03-10', '12.00'],
  );

  await chooseRangeDate(insightsScreen(), 'From', '2025-03-31');
  await chooseRangeDate(insightsScreen(), 'To', '2025-01-01');

  expect(range()).toEqual(['2025-03-31', '2025-01-01']);
  expect(totals()).toEqual(['$20.00']);
});

test('[INSIGHTS-46.1] says the dates hold no expenses under From and To, without totals or the chart menu', async () => {
  await insightsAt('?from=2025-02-01&to=2025-02-28', ...THREE_MONTHS);

  expect(headings()).toContain(NO_EXPENSES_IN_DATES[0]);
  expect(insightsLines()).toEqual(expect.arrayContaining(NO_EXPENSES_IN_DATES));
  expect(totalCards()).toEqual([]);
  expect(chartMenu()).toBeUndefined();
  // What changes the dates stays.
  expect(aggregationNames()).toEqual(['Month', 'Year', 'Custom']);
  expect(range()).toEqual(['2025-02-01', '2025-02-28']);

  await chooseRangeDate(insightsScreen(), 'To', '2025-03-31');

  await waitFor(() => expect(totals()).toEqual(['$3.00']));
  expect(insightsLines()).not.toContain(NO_EXPENSES_IN_DATES[0]);
});

test("[INSIGHTS-46.1] shows your share under the total of a group's custom range", async () => {
  await startWithGroups(BRISBANE);
  await addGroupExpense({
    group: 'Brisbane',
    payer: 'Casey',
    sharers: ['Taylor (You)', 'Casey', 'Blake'],
    title: 'Dinner',
    date: '2025-01-20',
    amount: '60.00',
  });
  const id = await groupId('Brisbane');

  await tapTab('Groups');
  await push(`/groups/insights?groupId=${id}&from=2025-01-01&to=2025-01-31`);
  await expectInsights('Groups');

  await waitFor(() =>
    expect(totalCards('Groups')).toEqual([['$60.00', 'Your share: $20.00']]),
  );
});

test('[INSIGHTS-46.1] goes back to the month or the year the range ends in', async () => {
  await insightsAt('?from=2025-01-01&to=2025-03-31', ...THREE_MONTHS);

  await selectAggregation('Month');
  await expectPeriod('March 2025');
  expect(range()).toBeUndefined();

  await selectAggregation('Custom');
  await chooseRangeDate(insightsScreen(), 'From', '2024-12-01');
  await chooseRangeDate(insightsScreen(), 'To', '2024-12-31');
  await selectAggregation('Year');
  await expectPeriod('2024');
});

test('[INSIGHTS-46.1] goes back to the latest month of the year when the month the range ends in has no expenses', async () => {
  await insightsAt('?from=2025-01-01&to=2025-02-28', ...THREE_MONTHS);

  await selectAggregation('Month');

  await expectPeriod('March 2025');
});
