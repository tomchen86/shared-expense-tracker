import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ActionSheetIOS } from 'react-native';
import { fireEvent, waitFor, within } from '@testing-library/react-native';
import {
  addCategory,
  addExpense,
  archiveCategory,
  chooseCategory,
  editCategory,
  expectForm,
  expectFormClosed,
  fillForm,
  nameOf,
  press,
  resetPhone,
  setPhoneLanguage,
  setRegionCurrency,
  storedExpenses,
  watchAlerts,
  type ExpenseInput,
} from './ledger-expense-app';
import {
  allowReads,
  asRead,
  cardTitles,
  card,
  colorDots,
  expensesRoot,
  failReads,
  holdReads,
  isUnread,
  linesIn,
  phoneDatabaseWithReads,
  shownInOrder,
  startExpensesAt,
} from './ledger-expense-list-app';
import { chooseSort, hasSearch, sortName } from './ledger-list-find-app';
import { chooseRangeDate, rangeDates } from './ledger-list-period-app';
import {
  actionLabels,
  chooseExpenseAction,
  hasExpenseActions,
  noticeShown,
  pressUndo,
} from './ledger-trash-app';
import {
  SHARED_HISTORY,
  addGroupExpense,
  archiveGroup,
  choosePayer,
  chooseSharers,
  detailBarsOn,
  detailLinesOn,
  editOn,
  expectDetailsOn,
  groupAddButton,
  groupCardTitles,
  startWithGroups,
  storedGroup,
} from './ledger-group-expense-app';
import { showGroup } from './group-balances-app';
import { screenOf } from './group-details-app';
import {
  currentAggregation,
  expectInsights,
  expectPeriod,
  insightsBars,
  insightsScreen,
  openGroupInsights,
  openInsights,
  rowViews,
  rows,
  rowsRead,
  selectedPeriod,
} from './insights-app';
import {
  ROW_HINT,
  categoryBarActions,
  categoryBars,
  categoryCard,
  categoryCardLines,
  categoryCardTitles,
  categoryCards,
  categoryDates,
  categoryLines,
  categoryRow,
  categoryScreen,
  expectCategory,
  expectCategorySummary,
  goBackFromCategory,
  goBackFromDetailsOn,
  openCategory,
  pressCategoryRow,
} from './insights-category-app';
import { allowWrites, settle } from './shell-appearance-app';
import {
  navigationBarTitles,
  push,
  selectedTab,
  tab,
  tapTab,
} from './shell-tabs-app';
import type { Database } from '../../src/storage';

// Runs on iOS. Each test starts the app as the Insights tests do (insights.test.tsx), in
// Taipei on 2026-10-30, in a region whose currency is USD, opens Insights and presses a
// category row. The screen that opens is read as insights-category-app describes. Both
// platforms share it, so this file checks its rules; insights-category-android.test.tsx
// checks the Back button on Android, and the flow e2e/insights-category.yaml the two
// gestures only a phone makes (INSIGHTS-53.1, INSIGHTS-54.1).

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

const FOOD = 'Food & Dining';

const READ_ERROR = [
  'Unable to Load Local Data',
  'Your data was not changed.',
  'Try Again',
];

let directory: string;
let file: string;

beforeEach(() => {
  jest.clearAllMocks();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'insights-category-'));
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

/** Adds a personal expense of Food & Dining in USD unless told otherwise. */
async function spend(
  date: string,
  amount: string,
  title: string,
  category = FOOD,
  currency = 'USD',
) {
  setRegionCurrency(currency);
  await addExpense({ date, amount, category, title });
  setRegionCurrency('USD');
}

/** Opens the personal Insights on the Expenses tab at /insights with `query`, as a link in the app would. */
async function openInsightsAt(query: string) {
  await tapTab('Expenses');
  await push(`/insights${query}`);
  await expectInsights();
}

/** Starts the app, adds personal expenses as [date, amount, title, category?] and opens the personal Insights at /insights with `query`. */
async function insightsAt(
  query: string,
  ...expenses: [string, string, string, string?][]
) {
  const app = await startExpensesAt('/');
  for (const [date, amount, title, category] of expenses)
    await spend(date, amount, title, category);
  await openInsightsAt(query);
  return app;
}

/** 6.00 and 2.50 of Food & Dining and 2.00 of Transportation, all in January 2025. */
const JANUARY: [string, string, string, string?][] = [
  ['2025-01-10', '6.00', 'Lunch'],
  ['2025-01-12', '2.50', 'Snack'],
  ['2025-01-11', '2.00', 'Bus', 'Transportation'],
];

/** Brisbane's Dinner on 2026-10-30: Casey pays 60.00, split evenly between Taylor, Casey and Blake. */
const addDinner = (input: ExpenseInput = {}) =>
  addGroupExpense({
    group: 'Brisbane',
    payer: 'Casey',
    sharers: ['Taylor (You)', 'Casey', 'Blake'],
    amount: '60.00',
    title: 'Dinner',
    category: FOOD,
    ...input,
  });

/**
 * Starts the app with Taylor's Brisbane, your Coffee run of 8.75 on 2026-10-29 and Brisbane's
 * Dinner of 60.00 on 2026-10-30, both Food & Dining; ends on the Expenses tab.
 */
async function startWithCoffeeAndDinner() {
  const app = await startWithGroups(BRISBANE);
  await spend('2026-10-29', '8.75', 'Coffee run');
  await addDinner();
  return app;
}

const groupId = async (name: string) => (await storedGroup(file, name)).id;

const expenseId = async (title: string) => {
  const found = (await storedExpenses()).find(
    (expense) => expense.title === title,
  );
  if (found === undefined) throw new Error(`No expense titled ${title}`);
  return found.id;
};

/** Opens the Insights of the archived group `name` on the Settings tab, as a link in the app would. */
async function openArchivedGroupInsights(name: string) {
  const id = await groupId(name);
  await tapTab('Settings');
  await push(`/settings/archived-groups/insights?groupId=${id}`);
  await expectInsights('Settings');
}

/** Opens the details of the card titled `title` on the category's expenses. */
async function openCardDetails(name: string, title: string, on = 'Expenses') {
  await fireEvent.press(categoryCard(name, title, on));
  await expectDetailsOn(on, title);
}

/** Changes the expense whose details are open on the Expenses tab through Edit, then goes back from the details. */
async function editFromDetails(input: ExpenseInput) {
  await editOn('Expenses')?.press();
  await expectForm('Edit Expense');
  await fillForm(input);
  await press('Save');
  await expectFormClosed();
  await goBackFromDetailsOn('Expenses');
}

// The rows of Insights

test('[INSIGHTS-23.4] makes each category row a button with a › at its right and the hint Shows these expenses, and reads neither the dot nor the ›', async () => {
  await insightsAt('', ...JANUARY);

  expect(rows()).toEqual([
    [FOOD, '$8.50 · 81.0%'],
    ['Transportation', '$2.00 · 19.0%'],
  ]);
  expect(rowsRead()).toEqual([
    'Food & Dining, $8.50, 81.0 percent',
    'Transportation, $2.00, 19.0 percent',
  ]);
  const buttons = within(insightsScreen()).queryAllByRole('button', {
    name: / percent$/,
  });
  expect(buttons.map((button) => asRead(nameOf(button)))).toEqual(rowsRead());
  for (const row of rowViews()) {
    expect(row.props.accessibilityHint).toBe(ROW_HINT);
    expect(linesIn(row).at(-1)).toBe('›');
    expect(asRead(nameOf(row))).not.toContain('›');
    for (const dot of colorDots(row)) expect(isUnread(dot)).toBe(true);
  }
});

// Opening a category's expenses

test("[INSIGHTS-47.1] pushes the category's expenses onto the Expenses tab, over the personal Insights, titled with the category's name", async () => {
  await insightsAt('', ...JANUARY);

  await openCategory(FOOD);

  expect(selectedTab()).toBe('Expenses');
  expect(navigationBarTitles(tab('Expenses'))).toEqual([
    'Expenses',
    'Insights',
    FOOD,
  ]);
});

test("[INSIGHTS-47.1] pushes the category's expenses onto the Groups tab over a group's Insights", async () => {
  await startWithCoffeeAndDinner();
  await openGroupInsights(await groupId('Brisbane'));

  await openCategory(FOOD, 'Groups');

  expect(selectedTab()).toBe('Groups');
  expect(navigationBarTitles(tab('Groups')).slice(-2)).toEqual([
    'Insights',
    FOOD,
  ]);
});

test("[INSIGHTS-47.1] pushes the category's expenses onto the Settings tab over an archived group's Insights", async () => {
  await startWithCoffeeAndDinner();
  await archiveGroup('Brisbane');
  await openArchivedGroupInsights('Brisbane');

  await openCategory(FOOD, 'Settings');

  expect(selectedTab()).toBe('Settings');
  expect(navigationBarTitles(tab('Settings')).slice(-2)).toEqual([
    'Insights',
    FOOD,
  ]);
});

test('[INSIGHTS-47.1] pushes one screen when a category row is pressed twice, and goes back to Insights from it', async () => {
  await insightsAt('', ...JANUARY);

  const row = categoryRow(FOOD);
  await fireEvent.press(row);
  await fireEvent.press(row);
  await expectCategory(FOOD);

  expect(navigationBarTitles(tab('Expenses'))).toEqual([
    'Expenses',
    'Insights',
    FOOD,
  ]);
  await goBackFromCategory(FOOD);
  expect(navigationBarTitles(tab('Expenses'))).toEqual([
    'Expenses',
    'Insights',
  ]);
});

test('[INSIGHTS-47.1] goes back to Insights on the year it was on', async () => {
  await insightsAt(
    '?period=2024',
    ['2024-12-31', '1.00', 'Supper'],
    ['2025-01-10', '6.00', 'Lunch'],
  );
  expect(currentAggregation()).toBe('Year');
  expect(selectedPeriod()).toBe('2024');
  await openCategory(FOOD);

  await goBackFromCategory(FOOD);

  expect(categoryBars(FOOD)).toHaveLength(0);
  expect(insightsBars()).toHaveLength(1);
  expect(currentAggregation()).toBe('Year');
  expect(selectedPeriod()).toBe('2024');
});

test('[INSIGHTS-47.1] goes back to Insights on the custom dates it was on', async () => {
  await insightsAt('?from=2025-01-01&to=2025-01-31', ...JANUARY);
  await openCategory(FOOD);

  await goBackFromCategory(FOOD);

  expect(currentAggregation()).toBe('Custom');
  expect(rangeDates(insightsScreen())).toMatchObject({
    from: '2025-01-01',
    to: '2025-01-31',
  });
  expect(rows()).toEqual([
    [FOOD, '$8.50 · 81.0%'],
    ['Transportation', '$2.00 · 19.0%'],
  ]);
});

// The period, the amount and the count

test("[INSIGHTS-48.1] shows the month, the category's amount and its count above the cards", async () => {
  await insightsAt('?period=2025-01', ...JANUARY);

  await openCategory(FOOD);

  await expectCategorySummary(['January 2025', '$8.50', '2 expenses'], FOOD);
  const lines = categoryLines(FOOD);
  expect(lines.indexOf('2 expenses')).toBeLessThan(lines.indexOf('Snack'));
});

test("[INSIGHTS-48.1] shows the year above a category's expenses opened on Year", async () => {
  await insightsAt(
    '?period=2025',
    ['2025-01-10', '6.00', 'Lunch'],
    ['2025-03-10', '6.00', 'Brunch'],
    ['2024-12-31', '1.00', 'Supper'],
  );

  await openCategory(FOOD);

  await expectCategorySummary(['2025', '$12.00', '2 expenses'], FOOD);
});

test('[INSIGHTS-48.1] shows the first and last day of a custom range, and 1 expense for one', async () => {
  await insightsAt(
    '?from=2025-01-01&to=2025-01-31',
    ['2025-01-10', '6.00', 'Lunch'],
    ['2025-03-10', '6.00', 'Brunch'],
  );

  await openCategory(FOOD);

  await expectCategorySummary(
    ['Jan 1, 2025 – Jan 31, 2025', '$6.00', '1 expense'],
    FOOD,
  );
});

test('[INSIGHTS-48.1] shows the earlier date first when From is the later one', async () => {
  await insightsAt(
    '?from=2025-01-01&to=2025-03-31',
    ['2025-01-10', '6.00', 'Lunch'],
    ['2025-03-10', '6.00', 'Brunch'],
  );
  await chooseRangeDate(insightsScreen(), 'From', '2025-03-31');
  await chooseRangeDate(insightsScreen(), 'To', '2025-01-01');

  await openCategory(FOOD);

  await expectCategorySummary(
    ['Jan 1, 2025 – Mar 31, 2025', '$12.00', '2 expenses'],
    FOOD,
  );
});

test('[INSIGHTS-48.1] shows the same day twice for a range of one day', async () => {
  await insightsAt(
    '?from=2025-01-10&to=2025-01-10',
    ['2025-01-10', '6.00', 'Lunch'],
    ['2025-01-11', '2.00', 'Snack'],
  );

  await openCategory(FOOD);

  await expectCategorySummary(
    ['Jan 10, 2025 – Jan 10, 2025', '$6.00', '1 expense'],
    FOOD,
  );
});

test('[INSIGHTS-48.1] shows the dates and the amount in English with the region of a phone in French in Australia', async () => {
  setPhoneLanguage('fr-AU');
  await startExpensesAt('/');
  await spend('2025-01-10', '6.00', 'Lunch', FOOD, 'AUD');
  await openInsightsAt('?from=2025-01-01&to=2025-01-31');

  await openCategory(FOOD);

  await expectCategorySummary(
    ['1 Jan 2025 – 31 Jan 2025', '$6.00', '1 expense'],
    FOOD,
  );
});

test("[INSIGHTS-48.1] shows no amount and no count before the category's expenses have read the expenses", async () => {
  await insightsAt('?period=2025-01', ...JANUARY);
  const reads = holdReads();

  await pressCategoryRow(FOOD);
  await waitFor(() => expect(categoryBars(FOOD)).toHaveLength(1));
  await settle();

  const before = categoryLines(FOOD);
  expect(before.filter((line) => / expenses?$/.test(line))).toEqual([]);
  expect(before.filter((line) => line.includes('$'))).toEqual([]);
  await reads.release();
  await expectCategorySummary(['January 2025', '$8.50', '2 expenses'], FOOD);
});

// The cards

test('[INSIGHTS-49.1] lists what the personal Insights counts under the category, newest first under their dates, a group expense at your share', async () => {
  await startWithCoffeeAndDinner();
  await openInsights();
  expect(rows()).toEqual([[FOOD, '$28.75 · 100.0%']]);

  await openCategory(FOOD);

  await expectCategorySummary(['October 2026', '$28.75', '2 expenses'], FOOD);
  expect(categoryCardTitles(FOOD)).toEqual(['Dinner', 'Coffee run']);
  expect(categoryDates(FOOD)).toEqual(['Oct 30, 2026', 'Oct 29, 2026']);
  const shown = [
    'October 2026',
    '$28.75',
    '2 expenses',
    'Oct 30, 2026',
    'Dinner',
    '$20.00',
    FOOD,
    'Brisbane',
    'Oct 29, 2026',
    'Coffee run',
    '$8.75',
    FOOD,
  ];
  expect(shownInOrder(categoryLines(FOOD), shown)).toEqual(shown);
  const [dinner, coffee] = categoryCardLines(FOOD);
  expect(dinner).not.toContain('Paid by Casey');
  expect(coffee).not.toContain('Brisbane');
  const read = ['Dinner', '$20.00', FOOD, 'Brisbane', 'Oct 30, 2026'];
  expect(
    shownInOrder([asRead(nameOf(categoryCard(FOOD, 'Dinner')))], read),
  ).toEqual(read);
});

test("[INSIGHTS-49.1] lists what a group's Insights counts under the category at the whole amount, with who paid", async () => {
  await startWithCoffeeAndDinner();
  await openGroupInsights(await groupId('Brisbane'));

  await openCategory(FOOD, 'Groups');

  await expectCategorySummary(
    ['October 2026', '$60.00', '1 expense'],
    FOOD,
    'Groups',
  );
  expect(categoryCardTitles(FOOD, 'Groups')).toEqual(['Dinner']);
  const expected = ['Dinner', '$60.00', FOOD, 'Paid by Casey'];
  const [dinner] = categoryCardLines(FOOD, 'Groups');
  expect(shownInOrder(dinner, expected)).toEqual(expected);
  expect(dinner).not.toContain('Brisbane');
});

test("[INSIGHTS-49.1] leaves out a group expense you have no share of, which the group's own list has", async () => {
  await startWithCoffeeAndDinner();
  await addGroupExpense({
    group: 'Brisbane',
    payer: 'Casey',
    sharers: ['Blake'],
    amount: '9.00',
    title: 'Taxi',
    category: FOOD,
  });
  await addGroupExpense({
    group: 'Brisbane',
    payer: 'Taylor (You)',
    sharers: ['Casey', 'Blake'],
    amount: '12.00',
    title: 'Snacks',
    category: FOOD,
  });
  // The expense list has the one you only paid, at $0.00 (LEDGER-64.4, LEDGER-65.4).
  await tapTab('Expenses');
  await waitFor(() => expect(cardTitles()).toContain('Snacks'));

  await openInsights();
  await openCategory(FOOD);

  await expectCategorySummary(['October 2026', '$28.75', '2 expenses'], FOOD);
  expect(categoryCardTitles(FOOD)).toEqual(['Dinner', 'Coffee run']);

  await openGroupInsights(await groupId('Brisbane'));
  await openCategory(FOOD, 'Groups');

  await expectCategorySummary(
    ['October 2026', '$81.00', '3 expenses'],
    FOOD,
    'Groups',
  );
  expect(categoryCardTitles(FOOD, 'Groups')).toEqual([
    'Snacks',
    'Taxi',
    'Dinner',
  ]);
});

test("[INSIGHTS-49.1] keeps the cards newest first when the expense list and the group's screen are in another order", async () => {
  await startWithCoffeeAndDinner();
  await addGroupExpense({
    group: 'Brisbane',
    payer: 'Casey',
    sharers: ['Taylor (You)', 'Casey'],
    amount: '30.00',
    title: 'Lunch',
    category: FOOD,
  });
  await chooseSort(expensesRoot(), 'Oldest First');
  expect(cardTitles()).toEqual(['Coffee run', 'Dinner', 'Lunch']);
  await showGroup('Brisbane');
  await chooseSort(screenOf('Brisbane'), 'Oldest First');
  expect(groupCardTitles('Brisbane')).toEqual(['Dinner', 'Lunch']);

  await openInsights();
  await openCategory(FOOD);

  await expectCategorySummary(['October 2026', '$43.75', '3 expenses'], FOOD);
  expect(categoryCardTitles(FOOD)).toEqual(['Lunch', 'Dinner', 'Coffee run']);

  await openGroupInsights(await groupId('Brisbane'));
  await openCategory(FOOD, 'Groups');

  await expectCategorySummary(
    ['October 2026', '$90.00', '2 expenses'],
    FOOD,
    'Groups',
  );
  expect(categoryCardTitles(FOOD, 'Groups')).toEqual(['Lunch', 'Dinner']);
});

test('[INSIGHTS-49.1] leaves out the other categories and the other periods', async () => {
  await insightsAt(
    '?period=2025-01',
    ['2025-01-10', '6.00', 'Lunch'],
    ['2025-01-11', '2.00', 'Bus', 'Transportation'],
    ['2025-03-10', '4.00', 'Brunch'],
    ['2024-12-31', '1.00', 'Supper'],
  );

  await openCategory(FOOD);

  await expectCategorySummary(['January 2025', '$6.00', '1 expense'], FOOD);
  expect(categoryCardTitles(FOOD)).toEqual(['Lunch']);
});

test('[INSIGHTS-49.1] lists only the expenses in the currency of the row that was pressed', async () => {
  await startExpensesAt('/');
  await spend('2025-01-10', '6.00', 'Lunch');
  await spend('2025-01-11', '2000', 'Ramen', FOOD, 'JPY');
  await openInsightsAt('?period=2025-01');
  expect(rows()).toEqual([
    [FOOD, '¥2,000 · 100.0%'],
    [FOOD, '$6.00 · 100.0%'],
  ]);

  await openCategory(FOOD, 'Expenses', 1);

  await expectCategorySummary(['January 2025', '$6.00', '1 expense'], FOOD);
  expect(categoryCardTitles(FOOD)).toEqual(['Lunch']);

  await goBackFromCategory(FOOD);
  await openCategory(FOOD, 'Expenses', 0);

  await expectCategorySummary(['January 2025', '¥2,000', '1 expense'], FOOD);
  expect(categoryCardTitles(FOOD)).toEqual(['Ramen']);
});

test('[INSIGHTS-49.1] lists the expenses of the first and the last day of a custom range, and none outside it', async () => {
  await insightsAt(
    '?from=2025-01-10&to=2025-01-20',
    ['2025-01-09', '1.00', 'Day 9'],
    ['2025-01-10', '2.00', 'Day 10'],
    ['2025-01-20', '4.00', 'Day 20'],
    ['2025-01-21', '8.00', 'Day 21'],
  );

  await openCategory(FOOD);

  await expectCategorySummary(
    ['Jan 10, 2025 – Jan 20, 2025', '$6.00', '2 expenses'],
    FOOD,
  );
  expect(categoryCardTitles(FOOD)).toEqual(['Day 20', 'Day 10']);
});

test('[INSIGHTS-49.1] lists the expenses of one day under its date once, the one added last first', async () => {
  await insightsAt(
    '?period=2025-01',
    ['2025-01-10', '1.00', 'E'],
    ['2025-01-10', '1.00', 'F'],
    ['2025-01-10', '1.00', 'D'],
  );

  await openCategory(FOOD);

  await waitFor(() =>
    expect(categoryCardTitles(FOOD)).toEqual(['D', 'F', 'E']),
  );
  expect(categoryDates(FOOD)).toEqual(['Jan 10, 2025']);
});

test("[INSIGHTS-49.1] lists under each row what Insights counts there after a personal category is renamed away from a group's", async () => {
  await startWithCoffeeAndDinner();
  await editCategory(FOOD, 'Meals');
  await openInsights();
  expect(rows()).toEqual([
    [FOOD, '$20.00 · 69.6%'],
    ['Meals', '$8.75 · 30.4%'],
  ]);

  await openCategory('Meals');

  await expectCategorySummary(['October 2026', '$8.75', '1 expense'], 'Meals');
  expect(categoryCardTitles('Meals')).toEqual(['Coffee run']);

  await goBackFromCategory('Meals');
  await openCategory(FOOD);

  await expectCategorySummary(['October 2026', '$20.00', '1 expense'], FOOD);
  expect(categoryCardTitles(FOOD)).toEqual(['Dinner']);
});

test("[INSIGHTS-49.1] lists the expenses of every category merged into the row, also those whose category's name differs from the row's by case", async () => {
  // Tokyo is created first, so the row takes its name, flights (INSIGHTS-17.1).
  await startWithGroups({ Tokyo: [], Brisbane: [] });
  await addCategory('flights', await groupId('Tokyo'));
  await addCategory('Flights', await groupId('Brisbane'));
  await addGroupExpense({
    group: 'Brisbane',
    payer: 'Taylor (You)',
    sharers: ['Taylor (You)'],
    amount: '3.00',
    title: 'To Brisbane',
    category: 'Flights',
  });
  await addGroupExpense({
    group: 'Tokyo',
    payer: 'Taylor (You)',
    sharers: ['Taylor (You)'],
    amount: '2.00',
    title: 'To Tokyo',
    category: 'flights',
  });
  await openInsights();
  expect(rows()).toEqual([['flights', '$5.00 · 100.0%']]);

  await openCategory('flights');

  await expectCategorySummary(
    ['October 2026', '$5.00', '2 expenses'],
    'flights',
  );
  expect(categoryCardTitles('flights')).toEqual(['To Tokyo', 'To Brisbane']);
  const expected = ['To Brisbane', '$3.00', 'Flights', 'Brisbane'];
  const [, toBrisbane] = categoryCardLines('flights');
  expect(shownInOrder(toBrisbane, expected)).toEqual(expected);
});

test("[INSIGHTS-49.1] titles the screen with the archived category's name alone, and marks it Archived on the card", async () => {
  await startExpensesAt('/');
  await addExpense({ amount: '8.75', category: 'Shopping', title: 'Shoes' });
  await archiveCategory('Shopping');
  await openInsights();

  await openCategory('Shopping');

  await expectCategorySummary(
    ['October 2026', '$8.75', '1 expense'],
    'Shopping',
  );
  const expected = ['Shoes', '$8.75', 'Shopping (Archived)'];
  const [shoes] = categoryCardLines('Shopping');
  expect(shownInOrder(shoes, expected)).toEqual(expected);
});

test("[INSIGHTS-49.1] lists an archived group's expenses under the category, at the whole amount, with who paid", async () => {
  await startWithCoffeeAndDinner();
  await archiveGroup('Brisbane');
  await openArchivedGroupInsights('Brisbane');

  await openCategory(FOOD, 'Settings');

  await expectCategorySummary(
    ['October 2026', '$60.00', '1 expense'],
    FOOD,
    'Settings',
  );
  const expected = ['Dinner', '$60.00', FOOD, 'Paid by Casey'];
  const [dinner] = categoryCardLines(FOOD, 'Settings');
  expect(shownInOrder(dinner, expected)).toEqual(expected);
});

// The details

test('[INSIGHTS-50.1] pushes the details of the card pressed onto the Expenses tab at /expenses/<id>, with Edit and Expense actions', async () => {
  const app = await startWithCoffeeAndDinner();
  const dinner = await expenseId('Dinner');
  await openInsights();
  await openCategory(FOOD);

  await openCardDetails(FOOD, 'Dinner');

  expect(selectedTab()).toBe('Expenses');
  expect(navigationBarTitles(tab('Expenses')).slice(-3)).toEqual([
    'Insights',
    FOOD,
    'Expense',
  ]);
  expect(app.getPathname()).toBe(`/expenses/${dinner}`);
  expect(detailLinesOn('Expenses')).toContain('YOUR POSITION');
  expect(editOn('Expenses')?.disabled).toBe(false);
  expect(hasExpenseActions('Expenses')).toBe(true);
});

test("[INSIGHTS-50.1] pushes the details onto the Groups tab at /groups/expenses/<id> from a group's category", async () => {
  const app = await startWithCoffeeAndDinner();
  const dinner = await expenseId('Dinner');
  await openGroupInsights(await groupId('Brisbane'));
  await openCategory(FOOD, 'Groups');

  await openCardDetails(FOOD, 'Dinner', 'Groups');

  expect(selectedTab()).toBe('Groups');
  expect(navigationBarTitles(tab('Groups')).slice(-3)).toEqual([
    'Insights',
    FOOD,
    'Expense',
  ]);
  expect(app.getPathname()).toBe(`/groups/expenses/${dinner}`);
});

test("[INSIGHTS-50.1] pushes the read-only details onto the Settings tab from an archived group's category", async () => {
  const app = await startWithCoffeeAndDinner();
  const dinner = await expenseId('Dinner');
  await archiveGroup('Brisbane');
  await openArchivedGroupInsights('Brisbane');
  await openCategory(FOOD, 'Settings');

  await openCardDetails(FOOD, 'Dinner', 'Settings');

  expect(selectedTab()).toBe('Settings');
  expect(app.getPathname()).toBe(
    `/settings/archived-groups/expenses/${dinner}`,
  );
  expect(detailLinesOn('Settings')).toContain(SHARED_HISTORY);
  expect(editOn('Settings')?.disabled).toBe(true);
});

test("[INSIGHTS-50.1] pushes one details when a card is pressed twice, and goes back to the category's expenses as they were", async () => {
  await startWithCoffeeAndDinner();
  await openInsights();
  await openCategory(FOOD);
  await expectCategorySummary(['October 2026', '$28.75', '2 expenses'], FOOD);
  const before = categoryLines(FOOD);

  const pressed = categoryCard(FOOD, 'Coffee run');
  await fireEvent.press(pressed);
  await fireEvent.press(pressed);
  await expectDetailsOn('Expenses', 'Coffee run');

  await goBackFromDetailsOn('Expenses');
  await waitFor(() => expect(detailBarsOn('Expenses')).toHaveLength(0));
  expect(navigationBarTitles(tab('Expenses'))).toEqual([
    'Expenses',
    'Insights',
    FOOD,
  ]);
  expect(categoryLines(FOOD)).toEqual(before);
});

// Read-only

test('[INSIGHTS-51.1] offers no Delete expense action on the cards of a personal category, no + button, no sort button, no search and no action in its bar', async () => {
  await startWithCoffeeAndDinner();
  // On the expense list the same two cards can be deleted (LEDGER-71.3), and the list has a
  // sort button and a search (LEDGER-122.1, LEDGER-128.1).
  await tapTab('Expenses');
  await waitFor(() => expect(cardTitles()).toEqual(['Dinner', 'Coffee run']));
  for (const title of ['Dinner', 'Coffee run'])
    expect(actionLabels(card(title))).toContain('Delete expense');
  expect(sortName(expensesRoot())).toBe('Sort By, Newest First');
  expect(hasSearch('Expenses')).toBe(true);
  await openInsights();

  await openCategory(FOOD);

  await waitFor(() =>
    expect(categoryCardTitles(FOOD)).toEqual(['Dinner', 'Coffee run']),
  );
  for (const shown of categoryCards(FOOD))
    expect(actionLabels(shown)).not.toContain('Delete expense');
  expect(categoryCards(FOOD).map(nameOf)).not.toContain('Add expense');
  expect(sortName(categoryScreen(FOOD))).toBeUndefined();
  expect(categoryBarActions(FOOD)).toEqual([]);
  expect(hasSearch(FOOD)).toBe(false);
});

test("[INSIGHTS-51.1] offers no Delete expense action on the cards of a group's category, no + button, no sort button and no search", async () => {
  await startWithCoffeeAndDinner();
  await openGroupInsights(await groupId('Brisbane'));

  await openCategory(FOOD, 'Groups');

  await waitFor(() =>
    expect(categoryCardTitles(FOOD, 'Groups')).toEqual(['Dinner']),
  );
  for (const shown of categoryCards(FOOD, 'Groups'))
    expect(actionLabels(shown)).not.toContain('Delete expense');
  expect(categoryCards(FOOD, 'Groups').map(nameOf)).not.toContain(
    'Add expense',
  );
  expect(sortName(categoryScreen(FOOD, 'Groups'))).toBeUndefined();
  expect(categoryBarActions(FOOD, 'Groups')).toEqual([]);
  expect(hasSearch(FOOD)).toBe(false);
});

// Following the stored expenses

test("[INSIGHTS-52.1] shows the new amount of an expense edited from its details, in the card and in the category's amount", async () => {
  await startWithCoffeeAndDinner();
  await openInsights();
  await openCategory(FOOD);
  await openCardDetails(FOOD, 'Coffee run');

  await editFromDetails({ amount: '10.00' });

  await expectCategorySummary(['October 2026', '$30.00', '2 expenses'], FOOD);
  const expected = ['Coffee run', '$10.00', FOOD];
  expect(shownInOrder(categoryCardLines(FOOD)[1], expected)).toEqual(expected);
});

test('[INSIGHTS-52.1] drops an expense moved to another category from its details, and keeps the title', async () => {
  await startWithCoffeeAndDinner();
  await openInsights();
  await openCategory(FOOD);
  await openCardDetails(FOOD, 'Coffee run');

  await editFromDetails({ category: 'Transportation' });

  await expectCategorySummary(['October 2026', '$20.00', '1 expense'], FOOD);
  expect(categoryCardTitles(FOOD)).toEqual(['Dinner']);
  expect(navigationBarTitles(tab('Expenses'))).toEqual([
    'Expenses',
    'Insights',
    FOOD,
  ]);
});

test('[INSIGHTS-52.1] drops an expense whose date is moved out of the period, and keeps the period', async () => {
  await startWithCoffeeAndDinner();
  await openInsights();
  await openCategory(FOOD);
  await openCardDetails(FOOD, 'Coffee run');

  await editFromDetails({ date: '2026-09-15' });

  await expectCategorySummary(['October 2026', '$20.00', '1 expense'], FOOD);
  expect(categoryCardTitles(FOOD)).toEqual(['Dinner']);
});

test("[INSIGHTS-52.1] goes back to the category's expenses when Delete is chosen on the details, and brings the card back on Undo", async () => {
  await startWithCoffeeAndDinner();
  await openInsights();
  await openCategory(FOOD);
  await openCardDetails(FOOD, 'Coffee run');

  await chooseExpenseAction('Expenses', 'Delete');

  await waitFor(() =>
    expect(navigationBarTitles(tab('Expenses'))).toEqual([
      'Expenses',
      'Insights',
      FOOD,
    ]),
  );
  await expectCategorySummary(['October 2026', '$20.00', '1 expense'], FOOD);
  expect(categoryCardTitles(FOOD)).toEqual(['Dinner']);
  expect(noticeShown()).toBe(true);

  await pressUndo('Coffee run');

  await expectCategorySummary(['October 2026', '$28.75', '2 expenses'], FOOD);
  expect(categoryCardTitles(FOOD)).toEqual(['Dinner', 'Coffee run']);
});

test("[INSIGHTS-52.1] shows an expense added on another tab while the category's expenses are open, and keeps the period", async () => {
  await startWithCoffeeAndDinner();
  await openInsights();
  await openCategory(FOOD);
  await expectCategorySummary(['October 2026', '$28.75', '2 expenses'], FOOD);

  await showGroup('Brisbane');
  const add = groupAddButton('Brisbane');
  expect(add).toBeDefined();
  await fireEvent.press(add!);
  await expectForm('New Expense');
  await fillForm({ amount: '30.00', title: 'Lunch' });
  await choosePayer('Casey');
  await chooseSharers('Taylor (You)', 'Casey');
  await chooseCategory(FOOD);
  await press('Add');
  await expectFormClosed();
  await tapTab('Expenses');

  await expectCategorySummary(['October 2026', '$43.75', '3 expenses'], FOOD);
  expect(categoryCardTitles(FOOD)).toEqual(['Lunch', 'Dinner', 'Coffee run']);
});

test('[INSIGHTS-52.1] shows a zero amount and 0 expenses, and nothing else, once the category has no expense left in the period', async () => {
  await insightsAt(
    '',
    ['2026-10-29', '8.75', 'Coffee run'],
    ['2026-10-28', '2.00', 'Bus', 'Transportation'],
  );
  await openCategory(FOOD);
  await openCardDetails(FOOD, 'Coffee run');

  await chooseExpenseAction('Expenses', 'Delete');

  await waitFor(() =>
    expect(navigationBarTitles(tab('Expenses'))).toEqual([
      'Expenses',
      'Insights',
      FOOD,
    ]),
  );
  await waitFor(() =>
    expect(categoryLines(FOOD)).toEqual([
      'October 2026',
      '$0.00',
      '0 expenses',
    ]),
  );
  expect(categoryCards(FOOD)).toHaveLength(0);

  await goBackFromCategory(FOOD);

  await expectPeriod('October 2026');
  expect(rows()).toEqual([['Transportation', '$2.00 · 100.0%']]);
});

test("[INSIGHTS-47.1] [INSIGHTS-52.1] keeps the month on a category's expenses once the month holds no expense, and goes back to Insights on the latest month that holds one", async () => {
  await insightsAt(
    '',
    ['2026-09-15', '2.00', 'Bus', 'Transportation'],
    ['2026-10-29', '8.75', 'Coffee run'],
  );
  await expectPeriod('October 2026');
  await openCategory(FOOD);
  await openCardDetails(FOOD, 'Coffee run');

  await chooseExpenseAction('Expenses', 'Delete');

  // The category's expenses keep the month they were opened on (INSIGHTS-52.1) ...
  await waitFor(() =>
    expect(categoryLines(FOOD)).toEqual([
      'October 2026',
      '$0.00',
      '0 expenses',
    ]),
  );

  await goBackFromCategory(FOOD);

  // ... and Insights, under them, is on the month INSIGHTS-40.1 selects.
  await expectPeriod('September 2026');
  expect(rows()).toEqual([['Transportation', '$2.00 · 100.0%']]);
});

// Reading fails

test("[SHELL-60.1] shows only the read error on a category's expenses that cannot read the local data, under the category's name", async () => {
  await insightsAt('?period=2025-01', ...JANUARY);
  failReads();

  await pressCategoryRow(FOOD);
  await waitFor(() => expect(categoryBars(FOOD)).toHaveLength(1));
  await settle();

  await waitFor(() => expect(categoryLines(FOOD)).toEqual(READ_ERROR));
  expect(categoryCards(FOOD).map(nameOf)).toEqual(['Try Again']);
  expect(categoryBarActions(FOOD)).toEqual([]);
});
