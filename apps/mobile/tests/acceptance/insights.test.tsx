import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ActionSheetIOS, processColor } from 'react-native';
import {
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';
import {
  addCategory,
  addExpense,
  archiveCategory,
  editCategory,
  editExpense,
  expectFormClosed,
  inTreeOrder,
  nameOf,
  openEditExpense,
  press,
  resetPhone,
  restart,
  setRegionCurrency,
  storedExpenses,
  watchAlerts,
} from './ledger-expense-app';
import {
  allowReads,
  colorDots,
  dotColors,
  holdReads,
  isUnread,
  linesIn,
  phoneDatabaseWithReads,
  startExpensesAt,
  totalShareLines,
} from './ledger-expense-list-app';
import { deleteByAction, restoreFromTrash } from './ledger-trash-app';
import {
  addGroupExpense,
  archiveGroup,
  closeList,
  openRow,
  startWithGroups,
  storedGroup,
  toggleSharers,
  isDisabled,
} from './ledger-group-expense-app';
import {
  GROUP_NOT_FOUND,
  NO_EXPENSES,
  SETTINGS_FAILED,
  chartCategories,
  chartKinds,
  chartMenu,
  chartViews,
  charts,
  chooseChart,
  expectInsights,
  expectPeriod,
  expectTotals,
  goBackFromInsights,
  headings,
  insightsBars,
  insightsLines,
  insightsScreen,
  nextButton,
  openGroupInsights,
  openInsights,
  periodButton,
  pressNext,
  pressPrevious,
  previousButton,
  rowViews,
  rows,
  rowsRead,
  selectedPeriod,
  totalCards,
  totalCardsRead,
  totals,
} from './insights-app';
import {
  allowWrites,
  colorsInBoth,
  fakePhoneAppearance,
  failWrites,
  fixedColors,
  settle,
  switchPhoneTo,
  textsWithoutColor,
} from './shell-appearance-app';
import {
  navigationBarTitles,
  selectedTab,
  tab,
  tapTab,
} from './shell-tabs-app';
import type { Database } from '../../src/storage';

// Runs on iOS. Each test starts the app on a phone database file of its own, in
// Taipei on 2026-10-30, in a region whose currency is USD, and adds its expenses
// through New Expense, its group expenses with Taylor saved as your name. Both
// platforms share Insights, so this file checks its rules; the Month and Year
// control and the period picker differ by platform, so insights-android.test.tsx
// checks them on Android and the flows in e2e/ on iOS.

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

let directory: string;
let file: string;
let alerts: ReturnType<typeof watchAlerts>;

beforeEach(() => {
  jest.clearAllMocks();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'insights-'));
  file = path.join(directory, 'app.db');
  mockOpen = async () => phoneDatabaseWithReads(file);
  allowWrites();
  allowReads();
  resetPhone();
  alerts = watchAlerts();
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
  title = `${category} on ${date}`,
  currency = 'USD',
) {
  setRegionCurrency(currency);
  await addExpense({ date, amount, category, title });
  setRegionCurrency('USD');
}

/** Starts the app, adds `expenses` as [date, amount, category?] and opens the personal Insights. */
async function insightsWith(
  ...expenses: [string, string, string?][]
): Promise<Awaited<ReturnType<typeof startExpensesAt>>> {
  const app = await startExpensesAt('/');
  for (const [date, amount, category] of expenses)
    await spend(date, amount, category);
  await openInsights();
  return app;
}

/** Closes the app and starts it again at `url` on the same data. */
async function restartAt(app: { unmount: () => Promise<void> }, url: string) {
  await app.unmount();
  await settle();
  return startExpensesAt(url);
}

const expenseId = async (title: string) => {
  const found = (await storedExpenses()).find(
    (expense) => expense.title === title,
  );
  if (found === undefined) throw new Error(`No expense titled ${title}`);
  return found.id;
};

const groupId = async (name: string) => (await storedGroup(file, name)).id;

/** Brisbane's Dinner: Casey pays, split evenly between Taylor, Casey and Blake. */
const addDinner = (amount = '60.00', date?: string) =>
  addGroupExpense({
    group: 'Brisbane',
    payer: 'Casey',
    sharers: ['Taylor (You)', 'Casey', 'Blake'],
    amount,
    title: 'Dinner',
    ...(date === undefined ? {} : { date }),
  });

/** The headings of the currencies' categories, top to bottom. */
const currencyHeadings = () =>
  headings().filter((heading) => heading.endsWith(' categories'));

/** Whether screen readers on iOS skip `view` and everything in it. */
const hiddenOnIOS = (view: ReturnType<typeof insightsScreen> | undefined) =>
  view !== undefined &&
  (view.props['aria-hidden'] === true ||
    view.props.accessibilityElementsHidden === true);

// Opening Insights

test('[INSIGHTS-13.1] opens the personal Insights on the Expenses tab at /insights', async () => {
  await startExpensesAt('/insights');
  await expectInsights();

  expect(selectedTab()).toBe('Expenses');
  expect(navigationBarTitles(tab('Expenses'))).toEqual([
    'Expenses',
    'Insights',
  ]);
});

test('[INSIGHTS-13.1] goes back to the expense list', async () => {
  await insightsWith(['2025-01-20', '8.75']);

  await goBackFromInsights();

  await waitFor(() =>
    expect(navigationBarTitles(tab('Expenses'))).toEqual(['Expenses']),
  );
  expect(selectedTab()).toBe('Expenses');
});

test("[INSIGHTS-14.1] opens a group's Insights on the Groups tab at /groups/insights?groupId=<id>", async () => {
  const app = await startWithGroups(BRISBANE);
  await addDinner();
  await addGroupExpense({
    group: 'Brisbane',
    payer: 'Casey',
    sharers: ['Blake'],
    amount: '9.00',
    title: 'Taxi',
  });
  const id = await groupId('Brisbane');

  await restartAt(app, `/groups/insights?groupId=${id}`);
  await expectInsights('Groups');

  expect(selectedTab()).toBe('Groups');
  expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups', 'Insights']);
  await expectTotals(['$69.00'], 'Groups');
});

test("[INSIGHTS-14.1] opens an archived group's Insights on the Settings tab at /settings/archived-groups/insights?groupId=<id>", async () => {
  const app = await startWithGroups(BRISBANE);
  await addDinner('69.00');
  const id = await groupId('Brisbane');
  await archiveGroup('Brisbane');

  await restartAt(app, `/settings/archived-groups/insights?groupId=${id}`);
  await expectInsights('Settings');

  expect(selectedTab()).toBe('Settings');
  expect(navigationBarTitles(tab('Settings'))).toEqual([
    'Settings',
    'Insights',
  ]);
  await expectTotals(['$69.00'], 'Settings');
});

test('[INSIGHTS-15.1] shows only Group not found. for an ID that is no group', async () => {
  await startExpensesAt(
    '/groups/insights?groupId=00000000-0000-4000-8000-000000000000',
  );
  await expectInsights('Groups');

  expect(selectedTab()).toBe('Groups');
  await waitFor(() =>
    expect(insightsLines('Groups')).toEqual([GROUP_NOT_FOUND]),
  );
  expect(chartMenu('Groups')).toBeUndefined();
});

test('[INSIGHTS-15.1] shows only Group not found. without a group ID', async () => {
  await startExpensesAt('/groups/insights');
  await expectInsights('Groups');

  await waitFor(() =>
    expect(insightsLines('Groups')).toEqual([GROUP_NOT_FOUND]),
  );
  expect(chartMenu('Groups')).toBeUndefined();
});

test("[INSIGHTS-15.1] never shows Group not found. while a group's Insights reads its expenses", async () => {
  const app = await startWithGroups(BRISBANE);
  await addDinner();
  const id = await groupId('Brisbane');
  await app.unmount();
  await settle();
  const reads = holdReads();

  await startExpensesAt(`/groups/insights?groupId=${id}`);
  await waitFor(() => expect(insightsBars('Groups')).toHaveLength(1));
  await settle();

  expect(screen.queryByText(GROUP_NOT_FOUND)).toBeNull();
  await reads.release();
  await expectTotals(['$60.00'], 'Groups');
  expect(screen.queryByText(GROUP_NOT_FOUND)).toBeNull();
});

// What Insights counts

test('[INSIGHTS-16.1] counts your share of group expenses in the personal Insights, as Your Total Share does', async () => {
  await startWithGroups(BRISBANE);
  await addExpense({ amount: '8.75' });
  await addDinner();
  await tapTab('Expenses');
  await waitFor(() =>
    expect(totalShareLines()).toEqual(['Your Total Share: $28.75']),
  );

  await openInsights();

  expect(totals()).toEqual(['$28.75']);
});

test("[INSIGHTS-16.1] leaves out group expenses you have no part in, which the group's Insights counts", async () => {
  await startWithGroups(BRISBANE);
  await addExpense({ amount: '8.75' });
  await addDinner();
  await addGroupExpense({
    group: 'Brisbane',
    payer: 'Casey',
    sharers: ['Blake'],
    amount: '9.00',
    title: 'Taxi',
  });

  await openInsights();
  expect(totals()).toEqual(['$28.75']);

  await openGroupInsights(await groupId('Brisbane'));
  expect(totals('Groups')).toEqual(['$69.00']);
});

test("[INSIGHTS-16.1] counts only a group's own expenses in its Insights", async () => {
  await startWithGroups({ ...BRISBANE, Tokyo: [] });
  await addExpense({ amount: '8.75' });
  await addDinner();
  await addGroupExpense({
    group: 'Brisbane',
    payer: 'Casey',
    sharers: ['Blake'],
    amount: '9.00',
    title: 'Taxi',
  });
  await addGroupExpense({
    group: 'Tokyo',
    payer: 'Taylor (You)',
    sharers: ['Taylor (You)'],
    amount: '5.00',
    title: 'Sushi',
  });

  await openGroupInsights(await groupId('Brisbane'));
  expect(totals('Groups')).toEqual(['$69.00']);
  await goBackFromInsights('Groups');
  await openGroupInsights(await groupId('Tokyo'));
  expect(totals('Groups')).toEqual(['$5.00']);
  await openInsights();
  expect(totals()).toEqual(['$33.75']);
});

test("[INSIGHTS-16.1] still counts an archived group's expenses", async () => {
  await startWithGroups(BRISBANE);
  await addExpense({ amount: '8.75' });
  await addDinner();
  await addGroupExpense({
    group: 'Brisbane',
    payer: 'Casey',
    sharers: ['Blake'],
    amount: '9.00',
    title: 'Taxi',
  });
  const id = await groupId('Brisbane');

  await archiveGroup('Brisbane');

  await openInsights();
  expect(totals()).toEqual(['$28.75']);
  await openGroupInsights(id);
  expect(totals('Groups')).toEqual(['$69.00']);
});

test('[INSIGHTS-16.1] leaves out an expense in the trash and counts it again once restored', async () => {
  await startWithGroups(BRISBANE);
  await addExpense({ amount: '8.75' });
  await addDinner();

  await deleteByAction('Coffee run');
  await openInsights();
  expect(totals()).toEqual(['$20.00']);
  await goBackFromInsights();

  await restoreFromTrash('Coffee run');
  await openInsights();
  await expectTotals(['$28.75']);
});

test('[INSIGHTS-16.1] follows an expense changed while Insights is open', async () => {
  await startWithGroups(BRISBANE);
  await addExpense({ amount: '8.75' });
  await addDinner();
  await openInsights();
  expect(totals()).toEqual(['$28.75']);

  await editExpense(await expenseId('Dinner'), { amount: '90.00' });
  await tapTab('Expenses');

  await expectTotals(['$38.75']);
});

test('[INSIGHTS-16.1] shows the same totals after a restart', async () => {
  const app = await startWithGroups(BRISBANE);
  await addExpense({ amount: '8.75' });
  await addDinner();

  await restart(app);
  await openInsights();

  expect(totals()).toEqual(['$28.75']);
});

test("[INSIGHTS-17.1] shows your Food & Dining and a group's as one row in your color, and the group's in its own", async () => {
  await startWithGroups(BRISBANE);
  const id = await groupId('Brisbane');
  await editCategory('Food & Dining', 'Food & Dining', '#43A047', id);
  await addExpense({ amount: '8.75', category: 'Food & Dining' });
  await addGroupExpense({
    group: 'Brisbane',
    payer: 'Casey',
    sharers: ['Taylor (You)', 'Casey', 'Blake'],
    amount: '60.00',
    title: 'Dinner',
    category: 'Food & Dining',
  });

  await openInsights();
  expect(rows()).toEqual([['Food & Dining', '$28.75 · 100.0%']]);
  expect(dotColors(rowViews()[0])).toEqual(['#D81B60']);

  await openGroupInsights(id);
  expect(rows('Groups')).toEqual([['Food & Dining', '$60.00 · 100.0%']]);
  expect(dotColors(rowViews('Groups')[0])).toEqual(['#43A047']);
});

test('[INSIGHTS-17.1] takes the name of the group created first when your space has no category of that name', async () => {
  await startWithGroups({ Brisbane: [], Tokyo: [] });
  await addCategory('Flights', await groupId('Brisbane'));
  await addCategory('flights', await groupId('Tokyo'));
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

  expect(rows()).toEqual([['Flights', '$5.00 · 100.0%']]);
});

test("[INSIGHTS-17.1] keeps a renamed personal category apart from the group's category of the old name", async () => {
  await startWithGroups(BRISBANE);
  await addExpense({ amount: '8.75', category: 'Food & Dining' });
  await addGroupExpense({
    group: 'Brisbane',
    payer: 'Casey',
    sharers: ['Taylor (You)', 'Casey', 'Blake'],
    amount: '60.00',
    title: 'Dinner',
    category: 'Food & Dining',
  });

  await editCategory('Food & Dining', 'Meals');

  await openInsights();
  expect(rows()).toEqual([
    ['Food & Dining', '$20.00 · 69.6%'],
    ['Meals', '$8.75 · 30.4%'],
  ]);
  await openGroupInsights(await groupId('Brisbane'));
  expect(rows('Groups')).toEqual([['Food & Dining', '$60.00 · 100.0%']]);
});

test('[INSIGHTS-17.1] shows an archived category by its name and color, without (Archived)', async () => {
  await startExpensesAt('/');
  await addExpense({ amount: '8.75', category: 'Shopping' });

  await archiveCategory('Shopping');
  await openInsights();

  expect(rows()).toEqual([['Shopping', '$8.75 · 100.0%']]);
  expect(dotColors(rowViews()[0])).toEqual(['#FBC02D']);
  expect(rowsRead()).toEqual(['Shopping, $8.75, 100.0 percent']);
});

// Nothing to show

test('[INSIGHTS-18.1] shows only No expenses yet and its hint on first start', async () => {
  await startExpensesAt('/insights');
  await expectInsights();

  await waitFor(() => expect(insightsLines()).toEqual(NO_EXPENSES));
  expect(headings()).toEqual(['No expenses yet']);
  expect(chartMenu()).toBeUndefined();
  expect(previousButton()).toBeNull();
  expect(nextButton()).toBeNull();
  expect(periodButton()).toBeNull();
  expect(within(insightsScreen()).queryAllByRole('button')).toEqual([]);
});

test('[INSIGHTS-18.1] shows No expenses yet when the only expense is in the trash', async () => {
  await startExpensesAt('/');
  await addExpense();
  await deleteByAction('Coffee run');

  await openInsights();

  await waitFor(() => expect(insightsLines()).toEqual(NO_EXPENSES));
  expect(chartMenu()).toBeUndefined();
});

test("[INSIGHTS-18.1] shows No expenses yet when your share is 0, while the group's Insights shows the expense", async () => {
  await startWithGroups(BRISBANE);
  await addGroupExpense({
    group: 'Brisbane',
    payer: 'Taylor (You)',
    sharers: ['Casey'],
    amount: '9.00',
    title: 'Taxi',
  });

  await openInsights();
  await waitFor(() => expect(insightsLines()).toEqual(NO_EXPENSES));

  await openGroupInsights(await groupId('Brisbane'));
  expect(totals('Groups')).toEqual(['$9.00']);
});

test("[INSIGHTS-18.1] shows No expenses yet on a new group's Insights", async () => {
  await startWithGroups(BRISBANE);

  await openGroupInsights(await groupId('Brisbane'));

  await waitFor(() => expect(insightsLines('Groups')).toEqual(NO_EXPENSES));
  expect(chartMenu('Groups')).toBeUndefined();
});

test('[INSIGHTS-19.1] shows no No expenses yet before Insights has read the expenses', async () => {
  const first = await startExpensesAt('/');
  await addExpense();
  await first.unmount();
  await settle();
  const reads = holdReads();

  await startExpensesAt('/insights');
  await waitFor(() => expect(insightsBars()).toHaveLength(1));
  await settle();

  for (const text of NO_EXPENSES) expect(screen.queryByText(text)).toBeNull();
  await reads.release();
  await expectTotals(['$8.75']);
  for (const text of NO_EXPENSES) expect(screen.queryByText(text)).toBeNull();
});

// Periods

test('[INSIGHTS-21.1] selects the latest month when Insights opens', async () => {
  await insightsWith(
    ['2024-12-31', '1.00'],
    ['2025-01-20', '2.00'],
    ['2025-03-10', '3.00'],
  );

  expect(selectedPeriod()).toBe('March 2025');
  expect(totals()).toEqual(['$3.00']);
});

test('[INSIGHTS-21.1] selects the latest month again when Insights opens again', async () => {
  await insightsWith(
    ['2024-12-31', '1.00'],
    ['2025-01-20', '2.00'],
    ['2025-03-10', '3.00'],
  );
  await pressPrevious();
  await expectPeriod('January 2025');

  await goBackFromInsights();
  await openInsights();

  expect(selectedPeriod()).toBe('March 2025');
});

test('[INSIGHTS-28.1] shows Previous period, the period name and Next period above the total cards', async () => {
  await insightsWith(['2025-01-20', '1.00'], ['2025-03-10', '3.00']);

  const previous = previousButton()!;
  const period = periodButton()!;
  const next = nextButton()!;
  expect(nameOf(period)).toBe('Choose period. March 2025');
  expect(linesIn(period)[0]).toBe('March 2025');
  const [card] = within(insightsScreen()).queryAllByLabelText(/^Total spent /);
  expect(inTreeOrder(previous, period, next, card)).toBe(true);
});

test('[INSIGHTS-32.1] moves to the previous and next months that have expenses, skipping the others', async () => {
  await insightsWith(['2024-10-05', '10.00'], ['2025-01-20', '20.00']);
  expect(selectedPeriod()).toBe('January 2025');

  await pressPrevious();

  await expectPeriod('October 2024');
  expect(totals()).toEqual(['$10.00']);
  expect(rows()).toEqual([['Food & Dining', '$10.00 · 100.0%']]);
  await pressNext();
  await expectPeriod('January 2025');
  expect(totals()).toEqual(['$20.00']);
});

test('[INSIGHTS-32.1] disables Next period on the latest period and Previous period on the earliest', async () => {
  await insightsWith(['2024-10-05', '10.00'], ['2025-01-20', '20.00']);

  expect(isDisabled(nextButton()!)).toBe(true);
  expect(isDisabled(previousButton()!)).toBe(false);
  await fireEvent.press(nextButton()!);
  await settle();
  expect(selectedPeriod()).toBe('January 2025');

  await pressPrevious();
  await expectPeriod('October 2024');
  expect(isDisabled(previousButton()!)).toBe(true);
  expect(isDisabled(nextButton()!)).toBe(false);
  await fireEvent.press(previousButton()!);
  await settle();
  expect(selectedPeriod()).toBe('October 2024');
});

test('[INSIGHTS-34.1] shows the only period as text, without arrows or a button', async () => {
  await insightsWith(['2025-01-20', '8.75']);

  expect(insightsLines()).toContain('January 2025');
  expect(previousButton()).toBeNull();
  expect(nextButton()).toBeNull();
  expect(periodButton()).toBeNull();
  const buttons = within(insightsScreen()).queryAllByRole('button');
  expect(
    buttons.filter((button) => linesIn(button).includes('January 2025')),
  ).toEqual([]);
});

test('[INSIGHTS-40.1] selects the latest month of the same year when the selected month has no expenses left', async () => {
  await startWithGroups(BRISBANE);
  await spend('2024-11-10', '1.00');
  await spend('2025-01-20', '2.00');
  await addDinner('60.00', '2025-03-10');
  await openInsights();
  expect(selectedPeriod()).toBe('March 2025');

  await editExpense(await expenseId('Dinner'), { date: '2024-11-15' });
  await tapTab('Expenses');

  await expectPeriod('January 2025');
  expect(totals()).toEqual(['$2.00']);
});

test('[INSIGHTS-40.1] selects the latest month when the year of the selected month has no expenses left', async () => {
  await startWithGroups(BRISBANE);
  await spend('2024-11-10', '1.00');
  await addDinner('60.00', '2025-03-10');
  await openInsights();
  expect(selectedPeriod()).toBe('March 2025');

  await editExpense(await expenseId('Dinner'), { date: '2024-08-15' });
  await tapTab('Expenses');

  await expectPeriod('November 2024');
});

test('[INSIGHTS-40.1] shows No expenses yet when no period is left', async () => {
  await startWithGroups(BRISBANE);
  await addDinner();
  await openInsights();
  expect(totals()).toEqual(['$20.00']);

  await openEditExpense(await expenseId('Dinner'));
  await openRow('Split between');
  await toggleSharers('Taylor (You)', 'Blake');
  await closeList('Split Between');
  await press('Save');
  await expectFormClosed();
  await tapTab('Expenses');

  await waitFor(() => expect(insightsLines()).toEqual(NO_EXPENSES));
});

test('[INSIGHTS-41.1] lets iOS go back from Insights only from the left edge of the screen', async () => {
  await insightsWith(['2025-01-20', '8.75']);

  // react-native-screens hands both to iOS as 'true', 'false' or 'undefined'; an
  // unset fullScreenSwipeEnabled means iOS 26's swipe from anywhere.
  const shown = insightsScreen();
  expect(String(shown.props.gestureEnabled)).not.toBe('false');
  expect(String(shown.props.fullScreenSwipeEnabled)).toBe('false');
});

// Total cards

test('[INSIGHTS-22.1] shows TOTAL SPENT, the total and how much more than the previous period', async () => {
  await insightsWith(['2024-12-10', '8.00'], ['2025-01-10', '12.00']);

  expect(totalCards()).toEqual([
    ['TOTAL SPENT', '$12.00', '$4.00 more than December 2024, 50.0 percent.'],
  ]);
  expect(totalCardsRead()).toEqual([
    'Total spent $12.00. $4.00 more than December 2024, 50.0 percent.',
  ]);
});

test.each([
  ['12.00', '9.00', '$3.00 less than December 2024, 25.0 percent.'],
  ['10.00', '10.00', 'Same as December 2024.'],
  ['3.00', '5.00', '$2.00 more than December 2024, 66.7 percent.'],
  ['0.01', '12.35', '$12.34 more than December 2024, 123,400.0 percent.'],
])(
  '[INSIGHTS-22.1] compares %s in December with %s in January as %s',
  async (december, january, comparison) => {
    await insightsWith(['2024-12-10', december], ['2025-01-10', january]);

    expect(totalCards()).toEqual([['TOTAL SPENT', `$${january}`, comparison]]);
  },
);

test('[INSIGHTS-22.1] shows a card for each currency by currency code, saying when the previous period had none', async () => {
  await startExpensesAt('/');
  await spend('2024-12-10', '5.00');
  await spend('2025-01-10', '10.00');
  await spend('2025-01-10', '2000', 'Travel', 'Ramen', 'JPY');
  await openInsights();

  expect(totalCards()).toEqual([
    ['TOTAL SPENT', '¥2,000', 'No spending in December 2024.'],
    ['TOTAL SPENT', '$10.00', '$5.00 more than December 2024, 100.0 percent.'],
  ]);
});

test('[INSIGHTS-22.1] shows no comparison for the earliest period', async () => {
  await insightsWith(['2024-12-10', '8.00'], ['2025-01-10', '12.00']);

  await pressPrevious();
  await expectPeriod('December 2024');

  expect(totalCards()).toEqual([['TOTAL SPENT', '$8.00']]);
  expect(totalCardsRead()).toEqual(['Total spent $8.00.']);
});

test('[INSIGHTS-22.1] compares with the latest earlier month that has expenses', async () => {
  await insightsWith(['2024-10-05', '10.00'], ['2025-01-20', '20.00']);

  expect(totalCards()).toEqual([
    ['TOTAL SPENT', '$20.00', '$10.00 more than October 2024, 100.0 percent.'],
  ]);
});

// Categories

test("[INSIGHTS-23.1] lists a currency's categories under its heading, with a color dot, the amount and the percentage", async () => {
  await insightsWith(
    ['2025-01-10', '6.00', 'Food & Dining'],
    ['2025-01-11', '2.00', 'Transportation'],
  );

  expect(currencyHeadings()).toEqual(['USD categories']);
  expect(rows()).toEqual([
    ['Food & Dining', '$6.00 · 75.0%'],
    ['Transportation', '$2.00 · 25.0%'],
  ]);
  expect(rowViews().map(dotColors)).toEqual([['#D81B60'], ['#1E88E5']]);
  for (const row of rowViews()) {
    const [dot] = colorDots(row);
    const name = within(row).getByText(linesIn(row)[0]);
    expect(inTreeOrder(dot, name)).toBe(true);
  }
  const lines = insightsLines();
  expect(lines.indexOf('TOTAL SPENT')).toBeLessThan(
    lines.indexOf('USD categories'),
  );
  expect(lines.indexOf('USD categories')).toBeLessThan(
    lines.indexOf('Food & Dining'),
  );
});

test('[INSIGHTS-23.1] reads the heading as a heading and each row as one item, without its dot', async () => {
  await insightsWith(
    ['2025-01-10', '6.00', 'Food & Dining'],
    ['2025-01-11', '2.00', 'Transportation'],
  );

  expect(currencyHeadings()).toEqual(['USD categories']);
  expect(rowsRead()).toEqual([
    'Food & Dining, $6.00, 75.0 percent',
    'Transportation, $2.00, 25.0 percent',
  ]);
  for (const row of rowViews())
    for (const dot of colorDots(row)) expect(isUnread(dot)).toBe(true);
});

test('[INSIGHTS-23.1] shows each currency under its own heading by currency code', async () => {
  await startExpensesAt('/');
  await spend('2025-01-10', '6.00', 'Food & Dining');
  await spend('2025-01-11', '2000', 'Travel', 'Ramen', 'JPY');
  await openInsights();

  expect(currencyHeadings()).toEqual(['JPY categories', 'USD categories']);
  expect(rows()).toEqual([
    ['Travel', '¥2,000 · 100.0%'],
    ['Food & Dining', '$6.00 · 100.0%'],
  ]);
  const lines = insightsLines();
  expect(lines.indexOf('JPY categories')).toBeLessThan(lines.indexOf('Travel'));
  expect(lines.indexOf('Travel')).toBeLessThan(lines.indexOf('USD categories'));
  expect(lines.indexOf('USD categories')).toBeLessThan(
    lines.indexOf('Food & Dining'),
  );
});

/** Seven categories in January 2025, 7.00 down to 1.00. */
const SEVEN: [string, string, string][] = [
  'Food & Dining',
  'Transportation',
  'Shopping',
  'Entertainment',
  'Bills & Utilities',
  'Health',
  'Travel',
].map((category, index) => ['2025-01-10', `${7 - index}.00`, category]);

test('[INSIGHTS-23.1] lists every category, without Others, under a donut', async () => {
  await insightsWith(...SEVEN);

  await chooseChart('Donut');

  expect(rows().map(([name]) => name)).toEqual(SEVEN.map(([, , name]) => name));
  expect(rowsRead().filter((row) => row.startsWith('Others'))).toEqual([]);
});

test('[INSIGHTS-23.1] rounds percentages to one decimal place', async () => {
  await insightsWith(
    ['2025-01-10', '1.00', 'Food & Dining'],
    ['2025-01-10', '1.00', 'Transportation'],
    ['2025-01-10', '1.00', 'Shopping'],
  );

  expect(rows().map(([, amount]) => amount)).toEqual([
    '$1.00 · 33.3%',
    '$1.00 · 33.3%',
    '$1.00 · 33.3%',
  ]);
});

test('[INSIGHTS-23.1] shows a long name on one line, cut at its end, and reads it in full', async () => {
  const name = 'a'.repeat(50);
  await startExpensesAt('/');
  await addCategory(name);
  await addExpense({ amount: '1.00', category: name });

  await openInsights();

  const [row] = rowViews();
  const shown = within(row).getByText(name);
  expect(shown.props.numberOfLines).toBe(1);
  expect(shown.props.ellipsizeMode ?? 'tail').toBe('tail');
  expect(rowsRead()).toEqual([`${name}, $1.00, 100.0 percent`]);
});

// Charts

test('[INSIGHTS-24.1] draws the chart the domain package chooses for each currency under Auto', async () => {
  await startExpensesAt('/');
  await spend('2025-01-10', '8.00');
  await spend('2025-01-10', '300', 'Food & Dining', 'Sushi', 'JPY');
  await spend('2025-01-10', '100', 'Travel', 'Train', 'JPY');
  for (const [date, amount, category] of SEVEN)
    await spend(date, amount, category, category, 'AUD');
  await openInsights();

  expect(chartKinds()).toEqual(['bar', 'donut', 'progress']);
  expect(chartCategories()).toEqual([
    [
      ['Food & Dining', '#D81B60', 700],
      ['Transportation', '#1E88E5', 600],
      ['Shopping', '#FBC02D', 500],
      ['Entertainment', '#00897B', 400],
      ['Bills & Utilities', '#8E24AA', 300],
      ['Health', '#F4511E', 200],
      ['Travel', '#3949AB', 100],
    ],
    [
      ['Food & Dining', '#D81B60', 300],
      ['Travel', '#3949AB', 100],
    ],
    [['Food & Dining', '#D81B60', 800]],
  ]);
  const [, jpy, usd] = charts();
  expect(jpy.categories.map(({ percent }) => percent)).toEqual([75, 25]);
  expect(usd.categories.map(({ percent }) => percent)).toEqual([100]);
});

test('[INSIGHTS-24.1] draws the five largest categories and Others on a donut', async () => {
  await insightsWith(...SEVEN);

  await chooseChart('Donut');

  expect(chartKinds()).toEqual(['donut']);
  expect(chartCategories()).toEqual([
    [
      ['Food & Dining', '#D81B60', 700],
      ['Transportation', '#1E88E5', 600],
      ['Shopping', '#FBC02D', 500],
      ['Entertainment', '#00897B', 400],
      ['Bills & Utilities', '#8E24AA', 300],
      ['Others', '#808080', 300],
    ],
  ]);
  expect(charts()[0].categories.at(-1)?.percent).toBeCloseTo(
    (300 / 2800) * 100,
    10,
  );
});

test('[INSIGHTS-24.1] hides each chart from screen readers', async () => {
  await startExpensesAt('/');
  await spend('2025-01-10', '8.00');
  await spend('2025-01-10', '300', 'Food & Dining', 'Sushi', 'JPY');
  await spend('2025-01-10', '100', 'Travel', 'Train', 'JPY');
  await openInsights();

  const views = chartViews();
  expect(views).toHaveLength(2);
  for (const view of views) expect(hiddenOnIOS(view)).toBe(true);
});

// The chart menu

test('[INSIGHTS-26.1] puts the chart menu on the navigation bar on iOS, with Auto checked at first', async () => {
  await insightsWith(['2025-01-10', '8.00']);

  expect(chartMenu()).toEqual({
    icon: 'chart.bar.xaxis',
    title: 'Visualization',
    options: ['Auto', 'Donut', 'Bar'],
    checked: ['Auto'],
  });
});

test('[INSIGHTS-26.1] redraws the charts at once and checks the chart type chosen', async () => {
  await insightsWith(...SEVEN);
  expect(chartKinds()).toEqual(['bar']);

  await chooseChart('Donut');

  expect(chartKinds()).toEqual(['donut']);
  expect(chartCategories()[0].map(([name]) => name)).toContain('Others');
  expect(chartMenu()?.checked).toEqual(['Donut']);
});

test('[INSIGHTS-26.1] keeps the chart type chosen after a restart', async () => {
  const app = await insightsWith(
    ['2025-01-10', '8.00', 'Food & Dining'],
    ['2025-01-10', '2.00', 'Transportation'],
  );
  await chooseChart('Bar');
  expect(chartKinds()).toEqual(['bar']);

  await restart(app);
  await openInsights();

  expect(chartMenu()?.checked).toEqual(['Bar']);
  expect(chartKinds()).toEqual(['bar']);
});

test('[INSIGHTS-26.1] uses the chart type chosen in the personal Insights in a group’s Insights too', async () => {
  await startWithGroups(BRISBANE);
  await addExpense({ amount: '8.75' });
  await addDinner();
  await openInsights();

  await chooseChart('Donut');
  await openGroupInsights(await groupId('Brisbane'));

  expect(chartMenu('Groups')?.checked).toEqual(['Donut']);
  expect(chartKinds('Groups')).toEqual(['donut']);
});

test('[INSIGHTS-27.1] says the chart type could not be saved and keeps the one before', async () => {
  const app = await insightsWith(
    ['2025-01-10', '8.00', 'Food & Dining'],
    ['2025-01-10', '2.00', 'Transportation'],
  );
  failWrites();

  await chooseChart('Bar');

  expect(alerts.shown()).toEqual([SETTINGS_FAILED]);
  expect(chartMenu()?.checked).toEqual(['Auto']);
  expect(chartKinds()).toEqual(['donut']);
  allowWrites();
  await restart(app);
  await openInsights();
  expect(chartMenu()?.checked).toEqual(['Auto']);
});

test('[INSIGHTS-27.1] saves the chart type when tried again after the database recovers', async () => {
  const app = await insightsWith(
    ['2025-01-10', '8.00', 'Food & Dining'],
    ['2025-01-10', '2.00', 'Transportation'],
  );
  failWrites();
  await chooseChart('Bar');
  allowWrites();

  await chooseChart('Bar');

  expect(chartMenu()?.checked).toEqual(['Bar']);
  expect(chartKinds()).toEqual(['bar']);
  await restart(app);
  await openInsights();
  expect(chartMenu()?.checked).toEqual(['Bar']);
});

// The shell's rules on Insights

test('[SHELL-13.1] shows only a back arrow named Back on Insights', async () => {
  await insightsWith(['2025-01-10', '8.00']);

  const pushed = insightsBars()[0]?.props;
  // The native stack hides the back title with backButtonDisplayMode on iOS 14
  // and later, and with backTitleVisible when it knows no iOS version, as in Jest.
  expect(pushed).toMatchObject(
    pushed?.backButtonDisplayMode === undefined
      ? { backTitle: 'Back', backTitleVisible: false }
      : { backTitle: 'Back', backButtonDisplayMode: 'minimal' },
  );
});

// SHELL-34.1 leaves out the colors of user data: the palette (CATEGORIES-1.1) and
// the gray the domain package gives Others and unmatched categories.
const USER_COLORS = new Set(
  [
    '#D81B60',
    '#1E88E5',
    '#FBC02D',
    '#00897B',
    '#8E24AA',
    '#F4511E',
    '#3949AB',
    '#6D4C41',
    '#757575',
    '#43A047',
    '#00ACC1',
    '#C62828',
    '#9E9D24',
    '#808080',
  ].map((color) => (processColor(color) as number) >>> 0),
);

function appColors(root: ReturnType<typeof insightsScreen>) {
  return {
    colors: new Map(
      [...fixedColors(root)].filter(([, { color }]) => !USER_COLORS.has(color)),
    ),
    uncolored: textsWithoutColor(root),
  };
}

test('[SHELL-34.1] colors Insights with colors that follow the appearance', async () => {
  fakePhoneAppearance('light');
  await insightsWith(
    ['2024-12-10', '8.00', 'Food & Dining'],
    ['2025-01-10', '6.00', 'Food & Dining'],
    ['2025-01-10', '2.00', 'Transportation'],
  );
  const light = appColors(insightsScreen());

  await switchPhoneTo('dark');
  const dark = appColors(insightsScreen());

  expect(colorsInBoth(light.colors, dark.colors)).toEqual([]);
  expect([...light.uncolored, ...dark.uncolored]).toEqual([]);
});

test('[SHELL-34.1] colors the empty Insights with colors that follow the appearance', async () => {
  fakePhoneAppearance('light');
  await startExpensesAt('/insights');
  await expectInsights();
  await waitFor(() => expect(insightsLines()).toEqual(NO_EXPENSES));
  const light = appColors(insightsScreen());

  await switchPhoneTo('dark');
  const dark = appColors(insightsScreen());

  expect(colorsInBoth(light.colors, dark.colors)).toEqual([]);
  expect([...light.uncolored, ...dark.uncolored]).toEqual([]);
});
