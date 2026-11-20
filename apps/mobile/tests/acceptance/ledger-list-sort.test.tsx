import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ActionSheetIOS } from 'react-native';
import { renderHook, waitFor, within } from '@testing-library/react-native';
import {
  addExpense,
  editCategory,
  editExpense,
  inTreeOrder,
  nameOf,
  resetPhone,
  restart,
  setPhoneClock,
  setRegionCurrency,
  startExpenses,
  storedExpenses,
  watchAlerts,
} from './ledger-expense-app';
import {
  allowReads,
  card,
  cardTitles,
  expensesRoot,
  inContentOf,
  linesIn,
  listTotal,
  listTotalButton,
  phoneDatabaseWithReads,
  scrollViewTheTitleFollows,
  shownInOrder,
} from './ledger-expense-list-app';
import {
  SORT_ORDERS,
  chooseSort,
  dateHeadings,
  expectSort,
  listCount,
  sortArrows,
  sortName,
  sortOptions,
  sortView,
} from './ledger-list-find-app';
import {
  choosePeriod,
  closeFilters,
  expectPeriod,
  filtersRoot,
  openFilters,
  periodName,
  pressPreviousPeriod,
} from './ledger-list-period-app';
import {
  addGroupExpense,
  groupCard,
  groupCardTitles,
  startWithGroups,
} from './ledger-group-expense-app';
import { goBackFrom, screenOf } from './group-details-app';
import { balanceButtons, showGroup } from './group-balances-app';
import {
  deleteByAction,
  moveCategoryExpenses,
  pressUndo,
  restoreFromTrash,
} from './ledger-trash-app';
import { allowWrites, failWrites, settle } from './shell-appearance-app';
import { tapTab } from './shell-tabs-app';
import { useThemeColors } from '../../src/ui/theme';
import type { Database } from '../../src/storage';

// Runs on iOS. Each test starts the app on a phone database file of its own, in Taipei on
// 2026-10-30, in a region whose currency is USD, and adds its expenses through New Expense, dated
// in October 2026 unless it says otherwise, so the expense list, which opens on this month, shows
// them all. It reads the sort button and chooses an order as the system menu would
// (ledger-list-find-app). The phone's clock stands still unless a test moves it, so a test about
// the time an expense was last changed moves the clock before each change.

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

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
    Heavy: 'heavy',
    Soft: 'soft',
    Rigid: 'rigid',
  },
  NotificationFeedbackType: {
    Success: 'success',
    Warning: 'warning',
    Error: 'error',
  },
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
}));

/** Brisbane, with Casey and Blake added after you. */
const BRISBANE = { Brisbane: ['Casey', 'Blake'] };

let directory: string;

beforeEach(() => {
  jest.clearAllMocks();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'list-sort-'));
  const file = path.join(directory, 'app.db');
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

/** Adds a personal expense titled `title`, dated `date`, of `amount`. */
const spend = (title: string, date = '2026-10-30', amount = '8.75') =>
  addExpense({ title, date, amount });

/** Adds a personal expense of today in the currency of a region, then moves the phone back to USD. */
async function spendIn(currency: string, title: string, amount: string) {
  setRegionCurrency(currency);
  await addExpense({ title, amount });
  setRegionCurrency('USD');
}

/** Adds an expense of Brisbane dated today that Casey pays, split between Taylor, Casey and Blake. */
const brisbaneSpends = (title: string, amount = '60.00') =>
  addGroupExpense({
    group: 'Brisbane',
    payer: 'Casey',
    sharers: ['Taylor (You)', 'Casey', 'Blake'],
    title,
    amount,
  });

/** The screen of Brisbane, on whichever tab shows it. */
const brisbane = () => screenOf('Brisbane');

/** Puts the phone's clock `minutes` after the moment the app started at. */
const afterMinutes = (minutes: number) =>
  setPhoneClock(
    'Asia/Taipei',
    new Date(Date.parse('2026-10-30T04:00:00Z') + minutes * 60_000)
      .toISOString()
      .replace('.000Z', 'Z'),
  );

async function expenseTitled(title: string) {
  const expense = (await storedExpenses()).find(
    (candidate) => candidate.title === title,
  );
  if (expense === undefined) throw new Error(`No expense titled ${title}`);
  return expense;
}

/** The heading over the first cards of the expense list that reads `date`. */
const dateHeading = (date: string) =>
  within(expensesRoot())
    .getAllByRole('header')
    .filter(
      (view) => inContentOf(expensesRoot(), view) && nameOf(view) === date,
    )[0];

// The line above the cards

test('[LEDGER-122.2] [LEDGER-35.6] shows no count beside the sort button on All Time, whose total is a number of items', async () => {
  await startExpenses();
  await spend('Coffee run');
  await spend('Lunch');

  await choosePeriod('Expenses', 'All Time');

  expect(listTotal()).toEqual(['2 items']);
  expect(listCount(expensesRoot())).toBeUndefined();
  expect(sortName(expensesRoot())).toBe('Sort By, Newest First');
});

test('[LEDGER-122.2] shows only the sort button on the line above the cards, under the total and over the first date, read as Sort By, Newest First', async () => {
  await startExpenses();
  await spend('Coffee run');

  expect(sortName(expensesRoot())).toBe('Sort By, Newest First');
  expect(listCount(expensesRoot())).toBeUndefined();
  expect(sortArrows(expensesRoot()).map(({ name }) => name)).toEqual([
    'arrow.up.arrow.down',
  ]);
  expect(
    inTreeOrder(
      listTotalButton(),
      sortView(expensesRoot())!,
      dateHeading('Oct 30, 2026'),
      card('Coffee run'),
    ),
  ).toBe(true);
  // The line scrolls with the cards: it is inside the scroll view the large title follows.
  expect(
    scrollViewTheTitleFollows()?.queryAll(
      (view) => view === sortView(expensesRoot()),
    ),
  ).toHaveLength(1);
});

test('[LEDGER-122.2] lists the five orders, marks only the current one, and sorts the cards by the one chosen at once', async () => {
  await startExpenses();
  await spend('A', '2026-10-30', '5.00');
  await spend('B', '2026-10-30', '50.00');

  expect(await sortOptions(expensesRoot())).toEqual(
    SORT_ORDERS.map((name) => [name, name === 'Newest First']),
  );

  await chooseSort(expensesRoot(), 'Lowest Amount');

  expect(sortName(expensesRoot())).toBe('Sort By, Lowest Amount');
  expect(cardTitles()).toEqual(['A', 'B']);
  expect(await sortOptions(expensesRoot())).toEqual(
    SORT_ORDERS.map((name) => [name, name === 'Lowest Amount']),
  );
});

test('[LEDGER-122.2] draws the arrows in the accent color while the order is not Newest First', async () => {
  // Before the app starts: a hook's render becomes what `screen` queries.
  const { accent, textMuted } = (await renderHook(() => useThemeColors()))
    .result.current;
  await startExpenses();
  await spend('Coffee run');

  expect(sortArrows(expensesRoot()).map(({ color }) => color)).toEqual([
    textMuted,
  ]);

  for (const order of SORT_ORDERS.slice(1)) {
    await chooseSort(expensesRoot(), order);
    expect(sortArrows(expensesRoot()).map(({ color }) => color)).toEqual([
      accent,
    ]);
  }

  await chooseSort(expensesRoot(), 'Newest First');
  expect(sortArrows(expensesRoot()).map(({ color }) => color)).toEqual([
    textMuted,
  ]);
});

test('[LEDGER-122.2] shows no sort button while the expense list has no card: with no expense, and on a period with none', async () => {
  await startExpenses();

  expect(sortName(expensesRoot())).toBeUndefined();
  expect(sortArrows(expensesRoot())).toEqual([]);

  await spend('Lunch', '2026-09-30');
  expect(sortName(expensesRoot())).toBe('Sort By, Newest First');

  await choosePeriod('Expenses', 'This Month');
  await expectPeriod(expensesRoot, 'October 2026');
  expect(cardTitles()).toEqual([]);
  expect(sortName(expensesRoot())).toBeUndefined();
});

test("[LEDGER-122.2] [GROUPS-69.4] shows the sort button on a group's screen under your net balance, and none on a group with no expense", async () => {
  await startWithGroups(BRISBANE);
  await showGroup('Brisbane');
  expect(sortName(brisbane())).toBeUndefined();

  await brisbaneSpends('Dinner');
  await showGroup('Brisbane');

  expect(sortName(brisbane())).toBe('Sort By, Newest First');
  expect(listCount(brisbane())).toBeUndefined();
  expect(
    inTreeOrder(
      balanceButtons('Brisbane')[0],
      sortView(brisbane())!,
      groupCard('Brisbane', 'Dinner'),
    ),
  ).toBe(true);
});

test('[LEDGER-122.2] keeps sorting out of Filters', async () => {
  await startExpenses();
  await spend('Coffee run');
  await chooseSort(expensesRoot(), 'Highest Amount');

  await openFilters('Expenses');

  expect(linesIn(filtersRoot()).join(' ')).not.toMatch(
    /Sort|Highest Amount|Newest First/,
  );
  await closeFilters();
  expect(sortName(expensesRoot())).toBe('Sort By, Highest Amount');
});

// The five orders

test('[LEDGER-121.1] lists the cards newest first until an order is chosen, on the expense list and on a new group', async () => {
  await startWithGroups(BRISBANE);
  await brisbaneSpends('Dinner');
  await spend('Coffee run');

  expect(sortName(expensesRoot())).toBe('Sort By, Newest First');
  expect(cardTitles()).toEqual(['Coffee run', 'Dinner']);

  await showGroup('Brisbane');
  expect(sortName(brisbane())).toBe('Sort By, Newest First');
});

test('[LEDGER-121.1] [LEDGER-31.5] lists the oldest first as the exact reverse of newest first', async () => {
  await startExpenses();
  await spend('A', '2026-10-01');
  await spend('B', '2026-10-03');
  await spend('C', '2026-10-02');
  await spend('D', '2026-10-02');
  expect(cardTitles()).toEqual(['B', 'D', 'C', 'A']);

  await chooseSort(expensesRoot(), 'Oldest First');

  expect(cardTitles()).toEqual(['A', 'C', 'D', 'B']);
});

test('[LEDGER-121.1] sorts by amount, highest or lowest first, and leaves equal amounts newest first', async () => {
  await startExpenses();
  await spend('A', '2026-10-30', '12.00');
  await spend('B', '2026-10-30', '3.50');
  await spend('C', '2026-10-30', '12.00');
  await spend('D', '2026-10-30', '100.00');

  await chooseSort(expensesRoot(), 'Highest Amount');
  expect(cardTitles()).toEqual(['D', 'C', 'A', 'B']);

  await chooseSort(expensesRoot(), 'Lowest Amount');
  expect(cardTitles()).toEqual(['B', 'C', 'A', 'D']);
});

test('[LEDGER-121.1] leaves equal amounts of different days newest first in both amount orders', async () => {
  await startExpenses();
  await spend('Old', '2026-10-01', '12.00');
  await spend('New', '2026-10-20', '12.00');
  await spend('Small', '2026-10-10', '1.00');

  await chooseSort(expensesRoot(), 'Highest Amount');
  expect(cardTitles()).toEqual(['New', 'Old', 'Small']);

  await chooseSort(expensesRoot(), 'Lowest Amount');
  expect(cardTitles()).toEqual(['Small', 'New', 'Old']);
});

test('[LEDGER-121.1] compares amounts of different currencies by the number on the card, without converting', async () => {
  await startExpenses();
  await spendIn('AUD', 'A', '0.30');
  await spendIn('USD', 'B', '8.75');
  await spendIn('JPY', 'C', '500');
  expect(linesIn(card('C'))).toContain('¥500');

  await chooseSort(expensesRoot(), 'Highest Amount');
  expect(cardTitles()).toEqual(['C', 'B', 'A']);

  await chooseSort(expensesRoot(), 'Lowest Amount');
  expect(cardTitles()).toEqual(['A', 'B', 'C']);
});

test("[LEDGER-121.1] [LEDGER-64.5] sorts the expense list by your share of a group expense, and a group's screen by the whole amount", async () => {
  await startWithGroups(BRISBANE);
  await brisbaneSpends('Dinner', '60.00');
  await spend('Lunch', '2026-10-30', '25.00');
  await brisbaneSpends('Taxi', '45.00');

  await chooseSort(expensesRoot(), 'Highest Amount');
  expect(cardTitles()).toEqual(['Lunch', 'Dinner', 'Taxi']);
  expect(linesIn(card('Dinner'))).toContain('$20.00');

  await showGroup('Brisbane');
  await chooseSort(brisbane(), 'Lowest Amount');
  expect(groupCardTitles('Brisbane')).toEqual(['Taxi', 'Dinner']);
});

test("[GROUPS-61.6] [LEDGER-121.1] lists a group's cards in the order chosen on its screen", async () => {
  await startWithGroups(BRISBANE);
  await brisbaneSpends('Dinner', '60.00');
  await brisbaneSpends('Taxi', '25.00');
  await brisbaneSpends('Hotel', '90.00');
  await showGroup('Brisbane');
  expect(groupCardTitles('Brisbane')).toEqual(['Hotel', 'Taxi', 'Dinner']);

  await chooseSort(brisbane(), 'Oldest First');
  expect(groupCardTitles('Brisbane')).toEqual(['Dinner', 'Taxi', 'Hotel']);

  await chooseSort(brisbane(), 'Lowest Amount');
  expect(groupCardTitles('Brisbane')).toEqual(['Taxi', 'Dinner', 'Hotel']);
});

test('[LEDGER-102.1] [LEDGER-121.1] shows a date over each run of cards of one day when the order is not by date', async () => {
  await startExpenses();
  await spend('A', '2026-10-30', '5.00');
  await spend('B', '2026-10-29', '20.00');
  await spend('C', '2026-10-30', '50.00');

  await chooseSort(expensesRoot(), 'Lowest Amount');

  const byAmount = [
    'Oct 30, 2026',
    'A',
    'Oct 29, 2026',
    'B',
    'Oct 30, 2026',
    'C',
  ];
  expect(cardTitles()).toEqual(['A', 'B', 'C']);
  expect(dateHeadings(expensesRoot())).toEqual([
    'Oct 30, 2026',
    'Oct 29, 2026',
    'Oct 30, 2026',
  ]);
  expect(shownInOrder(linesIn(expensesRoot()), byAmount)).toEqual(byAmount);

  await chooseSort(expensesRoot(), 'Oldest First');

  expect(cardTitles()).toEqual(['B', 'A', 'C']);
  expect(dateHeadings(expensesRoot())).toEqual([
    'Oct 29, 2026',
    'Oct 30, 2026',
  ]);
});

test('[LEDGER-75.5] [LEDGER-121.1] puts an expense back where the order of the list has it when Undo is pressed', async () => {
  await startExpenses();
  await spend('E', '2026-10-01');
  await spend('F', '2026-10-01');
  await spend('D', '2026-10-01');
  await chooseSort(expensesRoot(), 'Oldest First');
  expect(cardTitles()).toEqual(['E', 'F', 'D']);

  await deleteByAction('F');
  expect(cardTitles()).toEqual(['E', 'D']);
  await pressUndo('F');
  await settle();

  expect(cardTitles()).toEqual(['E', 'F', 'D']);
});

// The time an expense was last changed

test('[LEDGER-120.1] [LEDGER-121.1] lists what was added or changed last first, whatever its date', async () => {
  await startExpenses();
  afterMinutes(1);
  await spend('A', '2026-10-03');
  afterMinutes(2);
  await spend('B', '2026-10-01');
  afterMinutes(3);
  await spend('C', '2026-10-02');

  await chooseSort(expensesRoot(), 'Recently Edited');
  expect(cardTitles()).toEqual(['C', 'B', 'A']);

  afterMinutes(4);
  await editExpense((await expenseTitled('A')).id, { title: 'A2' });
  await settle();

  expect(cardTitles()).toEqual(['A2', 'C', 'B']);
});

test('[LEDGER-120.1] counts a change of amount, date or note as a change, and leaves an expense that was not changed below them', async () => {
  await startExpenses();
  afterMinutes(1);
  await spend('A');
  afterMinutes(2);
  await spend('B');
  afterMinutes(3);
  await spend('C');
  afterMinutes(4);
  await spend('D');
  await chooseSort(expensesRoot(), 'Recently Edited');
  expect(cardTitles()).toEqual(['D', 'C', 'B', 'A']);

  afterMinutes(5);
  await editExpense((await expenseTitled('A')).id, { amount: '9.00' });
  afterMinutes(6);
  await editExpense((await expenseTitled('B')).id, { date: '2026-10-02' });
  afterMinutes(7);
  await editExpense((await expenseTitled('C')).id, { note: 'Window seat' });
  await settle();

  expect(cardTitles()).toEqual(['C', 'B', 'A', 'D']);
});

test('[LEDGER-120.1] counts moving an expense to the Trash and back as a change', async () => {
  await startExpenses();
  afterMinutes(1);
  await spend('A');
  afterMinutes(2);
  await spend('B');
  afterMinutes(3);
  await spend('C');
  await chooseSort(expensesRoot(), 'Recently Edited');

  afterMinutes(4);
  await deleteByAction('A');
  afterMinutes(5);
  await pressUndo('A');
  await settle();

  expect(cardTitles()).toEqual(['A', 'C', 'B']);
});

test('[LEDGER-79.5] [LEDGER-120.1] lists an expense restored from Trash first in Recently Edited', async () => {
  await startExpenses();
  afterMinutes(1);
  await spend('A');
  afterMinutes(2);
  await spend('B');
  await chooseSort(expensesRoot(), 'Recently Edited');
  afterMinutes(3);
  await deleteByAction('A');
  // Added after A moved to the Trash, so only the restore puts A above it.
  afterMinutes(4);
  await spend('C');
  expect(cardTitles()).toEqual(['C', 'B']);

  afterMinutes(5);
  await restoreFromTrash('A');
  await tapTab('Expenses');
  await settle();

  expect(cardTitles()).toEqual(['A', 'C', 'B']);
});

test('[LEDGER-120.1] records the time a group expense is added on this phone', async () => {
  await startWithGroups(BRISBANE);
  afterMinutes(1);
  await spend('A');
  afterMinutes(2);
  await brisbaneSpends('Dinner');
  afterMinutes(3);
  await spend('B');

  await chooseSort(expensesRoot(), 'Recently Edited');

  // With no time of its own, Dinner would come last.
  expect(cardTitles()).toEqual(['B', 'Dinner', 'A']);
});

test('[LEDGER-120.1] counts moving the expenses of a category to another as a change of each, and renaming a category as none', async () => {
  await startExpenses();
  afterMinutes(1);
  await addExpense({ title: 'A', category: 'Shopping' });
  afterMinutes(2);
  await addExpense({ title: 'B', category: 'Food & Dining' });
  afterMinutes(3);
  await addExpense({ title: 'C', category: 'Shopping' });
  afterMinutes(4);
  await addExpense({ title: 'D', category: 'Travel' });
  await chooseSort(expensesRoot(), 'Recently Edited');

  afterMinutes(5);
  await editCategory('Travel', 'Trips');
  await settle();
  expect(cardTitles()).toEqual(['D', 'C', 'B', 'A']);

  afterMinutes(6);
  await moveCategoryExpenses('Shopping', 'Other');
  await goBackFrom('Manage Categories');
  await tapTab('Expenses');
  await settle();

  // Both were changed at the same moment, so the one added later comes first.
  expect(cardTitles()).toEqual(['C', 'A', 'D', 'B']);
});

// Remembering the order

test('[LEDGER-124.1] keeps the order of the expense list when the app starts again', async () => {
  const app = await startExpenses();
  await spend('A', '2026-10-01');
  await spend('B', '2026-10-03');
  await chooseSort(expensesRoot(), 'Oldest First');

  await restart(app);

  await expectSort(expensesRoot, 'Oldest First');
  expect(cardTitles()).toEqual(['A', 'B']);
});

test('[LEDGER-124.1] says the settings could not be saved when the order cannot be stored, and puts the list back in the order it was in', async () => {
  const alerts = watchAlerts();
  const app = await startExpenses();
  await spend('Coffee run', '2026-10-01');
  await spend('Lunch', '2026-10-02');
  expect(cardTitles()).toEqual(['Lunch', 'Coffee run']);
  failWrites();

  await chooseSort(expensesRoot(), 'Oldest First');

  await waitFor(() =>
    expect(alerts.shown()).toEqual([
      [
        'Unable to Save Settings',
        'Your settings could not be saved. Please try again.',
      ],
    ]),
  );
  expect(sortName(expensesRoot())).toBe('Sort By, Newest First');
  expect(cardTitles()).toEqual(['Lunch', 'Coffee run']);

  // Nothing was stored: the list is newest first when the app starts again too.
  allowWrites();
  await restart(app);

  await expectSort(expensesRoot, 'Newest First');
  expect(cardTitles()).toEqual(['Lunch', 'Coffee run']);
});

test('[LEDGER-124.1] keeps an order for each group and one for the expense list, apart from each other', async () => {
  await startWithGroups({ ...BRISBANE, Tokyo: ['Dana'] });
  await brisbaneSpends('Dinner');
  await addGroupExpense({
    group: 'Tokyo',
    payer: 'Dana',
    sharers: ['Taylor (You)', 'Dana'],
    title: 'Sushi',
  });
  await showGroup('Brisbane');

  await chooseSort(brisbane(), 'Highest Amount');

  expect(sortName(brisbane())).toBe('Sort By, Highest Amount');
  await goBackFrom('Brisbane');
  await showGroup('Tokyo');
  expect(sortName(screenOf('Tokyo'))).toBe('Sort By, Newest First');
  await tapTab('Expenses');
  expect(sortName(expensesRoot())).toBe('Sort By, Newest First');
});

test("[LEDGER-124.1] keeps a group's order when its screen is opened again and when the app starts again, while its period starts over", async () => {
  const app = await startWithGroups(BRISBANE);
  await brisbaneSpends('Dinner', '60.00');
  await brisbaneSpends('Taxi', '25.00');
  await showGroup('Brisbane');
  await chooseSort(brisbane(), 'Lowest Amount');
  await choosePeriod('Brisbane', 'This Month');
  await expectPeriod(brisbane, 'October 2026');

  await goBackFrom('Brisbane');
  await showGroup('Brisbane');

  expect(sortName(brisbane())).toBe('Sort By, Lowest Amount');
  expect(periodName(brisbane())).toBe('Group Total');
  expect(groupCardTitles('Brisbane')).toEqual(['Taxi', 'Dinner']);

  await restart(app);
  await showGroup('Brisbane');

  await expectSort(brisbane, 'Lowest Amount');
  expect(groupCardTitles('Brisbane')).toEqual(['Taxi', 'Dinner']);
});

test('[LEDGER-124.1] keeps the order when the period changes and when an expense is added', async () => {
  await startExpenses();
  await spend('A', '2026-10-01');
  await spend('B', '2026-10-03');
  await spend('Earlier', '2026-09-12');
  await spend('Earliest', '2026-09-02');
  await chooseSort(expensesRoot(), 'Oldest First');
  expect(cardTitles()).toEqual(['Earliest', 'Earlier']);

  await choosePeriod('Expenses', 'This Month');
  await expectPeriod(expensesRoot, 'October 2026');

  expect(sortName(expensesRoot())).toBe('Sort By, Oldest First');
  expect(cardTitles()).toEqual(['A', 'B']);

  await pressPreviousPeriod(expensesRoot());
  await expectPeriod(expensesRoot, 'September 2026');
  expect(sortName(expensesRoot())).toBe('Sort By, Oldest First');

  await spend('Latest', '2026-09-20');
  expect(sortName(expensesRoot())).toBe('Sort By, Oldest First');
  expect(cardTitles()).toEqual(['Earliest', 'Earlier', 'Latest']);
});
