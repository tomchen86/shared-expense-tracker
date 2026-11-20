import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ActionSheetIOS } from 'react-native';
import { fireEvent, waitFor } from '@testing-library/react-native';
import {
  addExpense,
  editExpense,
  expectForm,
  expectFormClosed,
  fillForm,
  inTreeOrder,
  press,
  resetPhone,
  restart,
  setPhoneClock,
  startExpenses,
  storedExpenses,
  watchAlerts,
} from './ledger-expense-app';
import {
  EMPTY_LIST,
  allowReads,
  cardTitles,
  drawnTexts,
  expectOneFadingLine,
  expensesRoot,
  linesIn,
  listTotal,
  phoneDatabaseWithReads,
  shownInOrder,
  startExpensesAt,
} from './ledger-expense-list-app';
import {
  PERIOD_OPTIONS,
  arrows,
  chooseDateOption,
  choosePeriod,
  chooseRangeDate,
  closeFilters,
  dateOptions,
  dateRow,
  emptyPeriodTitle,
  enabledArrows,
  expectPeriod,
  filtersBarButtons,
  filtersOpen,
  filtersRoot,
  hasFilters,
  leaveAndComeBack,
  nextPeriod,
  openFilters,
  periodName,
  pressNextPeriod,
  pressPreviousPeriod,
  pressShowEarlier,
  pressTotal,
  previousPeriod,
  rangeDates,
  rightOfBar,
  showEarlierButton,
  swipeFiltersDown,
  totalLines,
  totalRead,
} from './ledger-list-period-app';
import {
  NO_GROUP_ID,
  addGroupExpense,
  archiveGroup,
  choosePayer,
  chooseSharers,
  deleteFromGroup,
  groupAddButton,
  groupCardTitles,
  groupLines,
  startWithGroups,
} from './ledger-group-expense-app';
import {
  NO_EXPENSES,
  goBackFrom,
  openGroup,
  screenOf,
} from './group-details-app';
import { balanceLines, showGroup } from './group-balances-app';
import { openArchivedGroup, openArchivedGroups } from './group-archive-app';
import {
  deleteByAction,
  pressUndo,
  restoreFromTrash,
} from './ledger-trash-app';
import { expectInsights, expectTotals, selectedPeriod } from './insights-app';
import { allowWrites, settle } from './shell-appearance-app';
import { tapTab } from './shell-tabs-app';
import type { Database } from '../../src/storage';

// Runs on iOS. Each test starts the app on a phone database file of its own, in Taipei on
// 2026-10-30 unless it says otherwise, in a region whose currency is USD, and adds its expenses
// through New Expense. Adding an expense dated outside the period a list shows moves that list
// to the expense's month (LEDGER-117.2), so a test chooses the period it is about after it has
// added its expenses. It chooses a period by name in Filters, and steps to the month or year
// before and after with the arrows of the period row (ledger-list-period-app).

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
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'list-period-'));
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
const spend = (title: string, date: string, amount = '8.75') =>
  addExpense({ title, date, amount });

/** Adds an expense of Brisbane that Casey pays: 60.00 split between Taylor, Casey and Blake unless told otherwise. */
const brisbaneSpends = (
  title: string,
  date: string,
  amount = '60.00',
  sharers = ['Taylor (You)', 'Casey', 'Blake'],
) =>
  addGroupExpense({
    group: 'Brisbane',
    payer: 'Casey',
    sharers,
    title,
    date,
    amount,
  });

/** The screen of Brisbane, on whichever tab shows it. */
const brisbane = () => screenOf('Brisbane');

async function expenseTitled(title: string) {
  const expense = (await storedExpenses()).find(
    (candidate) => candidate.title === title,
  );
  if (expense === undefined) throw new Error(`No expense titled ${title}`);
  return expense;
}

// One period at a time

test('[LEDGER-107.2] opens the expense list on this month', async () => {
  await startExpenses();

  await waitFor(() => expect(periodName(expensesRoot())).toBe('October 2026'));
});

test('[LEDGER-107.2] shows a month from its first day to its last', async () => {
  await startExpenses();
  await spend('Aug 31', '2026-08-31');
  await spend('Sep 1', '2026-09-01');
  await spend('Sep 30', '2026-09-30');
  await spend('Oct 1', '2026-10-01');

  await choosePeriod('Expenses', 'Last Month');

  await expectPeriod(expensesRoot, 'September 2026');
  expect(cardTitles()).toEqual(['Sep 30', 'Sep 1']);
});

test('[LEDGER-107.2] shows a year from January 1 to December 31', async () => {
  await startExpenses();
  await spend('Dec 31, 2024', '2024-12-31');
  await spend('Jan 1, 2025', '2025-01-01');
  await spend('Dec 31, 2025', '2025-12-31');
  await spend('Jan 1, 2026', '2026-01-01');

  await choosePeriod('Expenses', 'This Year');
  await pressPreviousPeriod(expensesRoot());

  await expectPeriod(expensesRoot, '2025');
  expect(cardTitles()).toEqual(['Dec 31, 2025', 'Jan 1, 2025']);
});

test('[LEDGER-107.2] shows the last three months from the first day of the month two months back to today', async () => {
  await startExpenses();
  await spend('Jul 31', '2026-07-31');
  await spend('Aug 1', '2026-08-01');
  await spend('Today', '2026-10-30');

  await choosePeriod('Expenses', 'Last 3 Months');

  await waitFor(() => expect(cardTitles()).toEqual(['Today', 'Aug 1']));
});

test('[LEDGER-107.2] reaches into last year for the last three months in January', async () => {
  await startExpenses('Asia/Taipei', '2026-01-15T04:00:00Z');
  await spend('Oct 31', '2025-10-31');
  await spend('Nov 1', '2025-11-01');

  await choosePeriod('Expenses', 'Last 3 Months');

  await waitFor(() => expect(cardTitles()).toEqual(['Nov 1']));
});

test("[LEDGER-107.2] opens a group's screen on all of its expenses each time it opens", async () => {
  await startWithGroups(BRISBANE);
  await brisbaneSpends('Dinner', '2026-10-29');
  await brisbaneSpends('Taxi', '2026-09-30');
  await showGroup('Brisbane');
  await waitFor(() =>
    expect(groupCardTitles('Brisbane')).toEqual(['Dinner', 'Taxi']),
  );
  expect(periodName(brisbane())).toBe('Group Total');

  await choosePeriod('Brisbane', 'This Month');
  await expectPeriod(brisbane, 'October 2026');
  await goBackFrom('Brisbane');
  await openGroup('Brisbane');

  await waitFor(() =>
    expect(groupCardTitles('Brisbane')).toEqual(['Dinner', 'Taxi']),
  );
  expect(periodName(brisbane())).toBe('Group Total');
});

test("[LEDGER-107.2] keeps the expense list's period apart from a group's", async () => {
  await startWithGroups(BRISBANE);
  await brisbaneSpends('Dinner', '2026-10-29');
  await choosePeriod('Expenses', 'Last Month');
  await expectPeriod(expensesRoot, 'September 2026');

  await showGroup('Brisbane');
  await waitFor(() => expect(periodName(brisbane())).toBe('Group Total'));
  await tapTab('Expenses');

  expect(periodName(expensesRoot())).toBe('September 2026');
});

test('[LEDGER-107.2] opens on this month again after a restart', async () => {
  const app = await startExpenses();
  await spend('Coffee run', '2026-10-01');
  await pressPreviousPeriod(expensesRoot());
  await expectPeriod(expensesRoot, 'September 2026');

  await restart(app);

  await waitFor(() => expect(cardTitles()).toEqual(['Coffee run']));
  expect(periodName(expensesRoot())).toBe('October 2026');
});

// The cards of the period

test('[LEDGER-31.5] lists only the personal expenses dated in the period', async () => {
  await startExpenses();
  await spend('Coffee run', '2026-10-01');
  await spend('Lunch', '2026-09-30');
  await spend('Dinner', '2025-10-15');

  await choosePeriod('Expenses', 'This Month');
  expect(cardTitles()).toEqual(['Coffee run']);

  await pressPreviousPeriod(expensesRoot());
  await expectPeriod(expensesRoot, 'September 2026');
  expect(cardTitles()).toEqual(['Lunch']);

  await choosePeriod('Expenses', 'All Time');
  expect(cardTitles()).toEqual(['Coffee run', 'Lunch', 'Dinner']);
});

test('[LEDGER-31.5] takes the card of an expense whose date is changed to outside the period off the list, and leaves the period', async () => {
  await startExpenses();
  await spend('Coffee run', '2026-10-01');
  await spend('Lunch', '2026-10-02');
  const coffee = await expenseTitled('Coffee run');

  await editExpense(coffee.id, { date: '2026-09-15' });
  await settle();

  expect(periodName(expensesRoot())).toBe('October 2026');
  expect(cardTitles()).toEqual(['Lunch']);
  await pressPreviousPeriod(expensesRoot());
  await expectPeriod(expensesRoot, 'September 2026');
  expect(cardTitles()).toEqual(['Coffee run']);
});

test('[LEDGER-64.5] leaves a group expense dated outside the period off the expense list', async () => {
  await startWithGroups(BRISBANE);
  await brisbaneSpends('Dinner', '2026-09-30');

  await choosePeriod('Expenses', 'This Month');
  expect(cardTitles()).toEqual([]);

  await pressPreviousPeriod(expensesRoot());
  await expectPeriod(expensesRoot, 'September 2026');
  expect(cardTitles()).toEqual(['Dinner']);
});

test('[LEDGER-32.2] shows no empty list text while expenses are only in other periods', async () => {
  await startExpenses();
  await spend('Lunch', '2026-09-30');

  await choosePeriod('Expenses', 'This Month');

  expect(cardTitles()).toEqual([]);
  expect(linesIn(expensesRoot())).not.toContain(EMPTY_LIST);
  expect(emptyPeriodTitle(expensesRoot())).toBe('No Expenses in October 2026');
});

// The period row

test('[LEDGER-108.2] shows Previous period, the month on one line and a disabled Next period above the cards', async () => {
  await startExpenses();
  await spend('Coffee run', '2026-10-30');

  const root = expensesRoot();
  expect(arrows(root)).toEqual(['Previous period', 'Next period']);
  expect(enabledArrows(root)).toEqual(['Previous period']);
  // On iOS the system menu over the name is what a screen reader finds, not this text.
  const drawn = drawnTexts(root, 'October 2026');
  expect(drawn).toHaveLength(1);
  const [name] = drawn;
  expectOneFadingLine(name);
  expect(inTreeOrder(previousPeriod(root)!, name, nextPeriod(root)!)).toBe(
    true,
  );
  const lines = linesIn(root);
  expect(lines.indexOf('October 2026')).toBeLessThan(
    lines.indexOf('Coffee run'),
  );
});

test('[LEDGER-108.2] steps to the month before and back, and not past this month', async () => {
  await startExpenses();

  await pressPreviousPeriod(expensesRoot());
  await expectPeriod(expensesRoot, 'September 2026');
  expect(enabledArrows(expensesRoot())).toEqual([
    'Previous period',
    'Next period',
  ]);

  await pressNextPeriod(expensesRoot());
  await expectPeriod(expensesRoot, 'October 2026');
  expect(enabledArrows(expensesRoot())).toEqual(['Previous period']);

  // The disabled button takes no press.
  await pressNextPeriod(expensesRoot());
  await settle();
  expect(periodName(expensesRoot())).toBe('October 2026');
});

test('[LEDGER-108.2] steps from January to December of the year before', async () => {
  await startExpenses('Asia/Taipei', '2026-01-15T04:00:00Z');
  await waitFor(() => expect(periodName(expensesRoot())).toBe('January 2026'));

  await pressPreviousPeriod(expensesRoot());

  await expectPeriod(expensesRoot, 'December 2025');
});

test('[LEDGER-108.2] steps to months that hold no expense', async () => {
  await startExpenses();
  await spend('Coffee run', '2026-10-01');

  await pressPreviousPeriod(expensesRoot());
  await expectPeriod(expensesRoot, 'September 2026');
  await pressPreviousPeriod(expensesRoot());

  await expectPeriod(expensesRoot, 'August 2026');
  expect(enabledArrows(expensesRoot())).toContain('Previous period');
});

test('[LEDGER-108.2] names a year by its number and steps between years, not past this year', async () => {
  await startExpenses();

  await choosePeriod('Expenses', 'This Year');
  await expectPeriod(expensesRoot, '2026');
  expect(enabledArrows(expensesRoot())).toEqual(['Previous period']);

  await pressPreviousPeriod(expensesRoot());
  await expectPeriod(expensesRoot, '2025');
  expect(enabledArrows(expensesRoot())).toEqual([
    'Previous period',
    'Next period',
  ]);
});

test('[LEDGER-108.2] keeps Next period disabled on the months after this one', async () => {
  // An expense dated after today is in the Trash: it was added while the phone's date was
  // December 5, as one from a phone whose date is ahead would be.
  const app = await startExpenses('Asia/Taipei', '2026-12-05T04:00:00Z');
  await spend('Flights', '2026-12-05');
  await deleteByAction('Flights');
  await restart(app);
  await expectPeriod(expensesRoot, 'October 2026');

  // Putting it back moves the list to its month (LEDGER-117.2).
  await restoreFromTrash('Flights');
  await tapTab('Expenses');

  await expectPeriod(expensesRoot, 'December 2026');
  expect(cardTitles()).toEqual(['Flights']);
  expect(enabledArrows(expensesRoot())).toEqual(['Previous period']);
  // The disabled button takes no press.
  await pressNextPeriod(expensesRoot());
  await settle();
  expect(periodName(expensesRoot())).toBe('December 2026');

  await pressPreviousPeriod(expensesRoot());
  await expectPeriod(expensesRoot, 'November 2026');
  expect(enabledArrows(expensesRoot())).toEqual(['Previous period']);

  await pressPreviousPeriod(expensesRoot());
  await expectPeriod(expensesRoot, 'October 2026');
  expect(enabledArrows(expensesRoot())).toEqual(['Previous period']);

  await pressPreviousPeriod(expensesRoot());
  await expectPeriod(expensesRoot, 'September 2026');
  expect(enabledArrows(expensesRoot())).toEqual([
    'Previous period',
    'Next period',
  ]);
});

test.each([
  ['in October', '2026-10-30T04:00:00Z', 'Aug – Oct 2026'],
  ['in January', '2026-01-15T04:00:00Z', 'Nov 2025 – Jan 2026'],
])(
  '[LEDGER-108.2] names the last three months %s by their first and last month, without arrows',
  async (_when, now, name) => {
    await startExpenses('Asia/Taipei', now);

    await choosePeriod('Expenses', 'Last 3 Months');

    await expectPeriod(expensesRoot, name);
    expect(arrows(expensesRoot())).toEqual([]);
  },
);

test('[LEDGER-108.2] names a custom range Custom Range and all dates All Time, without arrows', async () => {
  await startExpenses();

  await choosePeriod('Expenses', 'Custom Range');
  await expectPeriod(expensesRoot, 'Custom Range');
  expect(arrows(expensesRoot())).toEqual([]);

  await choosePeriod('Expenses', 'All Time');
  await expectPeriod(expensesRoot, 'All Time');
  expect(arrows(expensesRoot())).toEqual([]);
});

test("[LEDGER-108.2] names all dates Group Total on a group's screen, without arrows", async () => {
  await startWithGroups(BRISBANE);
  await brisbaneSpends('Dinner', '2026-10-29');

  await showGroup('Brisbane');

  await waitFor(() => expect(periodName(brisbane())).toBe('Group Total'));
  expect(arrows(brisbane())).toEqual([]);
});

// Filters and its Date row

test('[LEDGER-109.2] opens Filters over the expense list from the title bar, titled Filters with only Done, on Date, This Month', async () => {
  await startExpenses();
  await spend('Coffee run', '2026-10-30');

  await openFilters('Expenses');

  expect(filtersBarButtons()).toEqual(['Done']);
  expect(['formSheet', 'pageSheet', 'modal']).toContain(
    filtersRoot().props.stackPresentation,
  );
  expect(dateRow()).toBe('Date, This Month');
  // The list stays under it.
  expect(cardTitles()).toEqual(['Coffee run']);
});

test('[LEDGER-109.2] lists the six periods in the Date list and marks only the current one', async () => {
  await startExpenses();
  await openFilters('Expenses');

  expect(await dateOptions()).toEqual(
    PERIOD_OPTIONS.map((name) => [name, name === 'This Month']),
  );
});

test('[LEDGER-109.2] changes the period at once when one is chosen, keeps Filters open, and closes on Done', async () => {
  await startExpenses();
  await spend('Coffee run', '2026-10-01');
  await spend('Lunch', '2026-09-30');
  await openFilters('Expenses');
  await chooseDateOption('This Month');

  await chooseDateOption('Last Month');

  expect(filtersOpen()).toBe(true);
  expect(dateRow()).toBe('Date, Last Month');
  expect(await dateOptions()).toEqual(
    PERIOD_OPTIONS.map((name) => [name, name === 'Last Month']),
  );
  // Already, under Filters.
  expect(periodName(expensesRoot())).toBe('September 2026');

  await closeFilters();

  expect(periodName(expensesRoot())).toBe('September 2026');
  expect(cardTitles()).toEqual(['Lunch']);
});

test('[LEDGER-109.2] shows the name of a month the arrows reached on the Date row, with no period marked', async () => {
  await startExpenses();
  await pressPreviousPeriod(expensesRoot());
  await expectPeriod(expensesRoot, 'September 2026');
  await pressPreviousPeriod(expensesRoot());
  await expectPeriod(expensesRoot, 'August 2026');

  await openFilters('Expenses');

  expect(dateRow()).toBe('Date, August 2026');
  expect(await dateOptions()).toEqual(
    PERIOD_OPTIONS.map((name) => [name, false]),
  );
});

test('[LEDGER-109.2] shows From and To under Date for a custom range, the same dates as under the period row', async () => {
  await startExpenses();
  await openFilters('Expenses');
  expect(rangeDates(filtersRoot())).toBeUndefined();

  await chooseDateOption('Custom Range');

  expect(dateRow()).toBe('Date, Custom Range');
  expect(rangeDates(filtersRoot())).toMatchObject({
    from: '2026-10-01',
    to: '2026-10-30',
  });

  await chooseRangeDate(filtersRoot(), 'From', '2026-09-10');
  await chooseRangeDate(filtersRoot(), 'To', '2026-10-20');
  expect(rangeDates(filtersRoot())).toMatchObject({
    from: '2026-09-10',
    to: '2026-10-20',
  });
  await closeFilters();

  expect(rangeDates(expensesRoot())).toMatchObject({
    from: '2026-09-10',
    to: '2026-10-20',
  });
});

test('[LEDGER-109.2] closes Filters when it is swiped down, with the period chosen in it', async () => {
  await startExpenses();
  await openFilters('Expenses');
  await chooseDateOption('This Year');

  await swipeFiltersDown();

  await waitFor(() => expect(filtersOpen()).toBe(false));
  expect(periodName(expensesRoot())).toBe('2026');
});

test("[LEDGER-109.2] changes only the group's period from Filters on a group's screen", async () => {
  await startWithGroups(BRISBANE);
  await brisbaneSpends('Dinner', '2026-10-29');
  await choosePeriod('Expenses', 'Last Month');
  await showGroup('Brisbane');

  await openFilters('Brisbane');
  expect(dateRow()).toBe('Date, All Time');
  await chooseDateOption('This Month');
  await closeFilters();

  expect(periodName(brisbane())).toBe('October 2026');
  await tapTab('Expenses');
  expect(periodName(expensesRoot())).toBe('September 2026');
});

test("[LEDGER-109.2] offers Filters on an archived group's screen", async () => {
  await startWithGroups(BRISBANE);
  await brisbaneSpends('Dinner', '2026-10-29');
  await archiveGroup('Brisbane');
  await openArchivedGroups();

  await openArchivedGroup('Brisbane');

  await waitFor(() => expect(hasFilters('Brisbane')).toBe(true));
});

test('[LEDGER-109.2] offers no Filters when the group is not found', async () => {
  await startExpensesAt(`/groups/${NO_GROUP_ID}`);

  await waitFor(() =>
    expect(linesIn(screenOf('Group Details'))).toContain('Group not found.'),
  );
  expect(hasFilters('Group Details')).toBe(false);
});

test('[SHELL-72.2] puts Filters at the right of the title bar as a plain button with the filter symbol on iOS', async () => {
  await startExpenses();

  await waitFor(() =>
    expect(rightOfBar('Expenses').items).toContainEqual({
      name: 'Filters',
      icon: 'line.3.horizontal.decrease',
      variant: 'plain',
    }),
  );
});

test("[SHELL-72.2] puts a screen's menu to the right of Filters on iOS", async () => {
  await startWithGroups(BRISBANE);

  await showGroup('Brisbane');

  await waitFor(() =>
    expect(rightOfBar('Brisbane').items.map(({ name }) => name)).toEqual([
      'Filters',
      'Group actions',
    ]),
  );
});

// The dates of a custom range

test('[LEDGER-112.2] shows From, the first day of this month, and To, today, under the period row and above the total, with today as the latest date', async () => {
  await startExpenses();
  await spend('Coffee run', '2026-10-01');
  await spend('Lunch', '2026-09-30', '12.50');
  expect(rangeDates(expensesRoot())).toBeUndefined();

  await choosePeriod('Expenses', 'Custom Range');

  expect(rangeDates(expensesRoot())).toEqual({
    from: '2026-10-01',
    to: '2026-10-30',
    latest: ['2026-10-30', '2026-10-30'],
  });
  const expected = ['Custom Range', '–', '$8.75', 'Coffee run'];
  expect(shownInOrder(linesIn(expensesRoot()), expected)).toEqual(expected);
  expect(cardTitles()).toEqual(['Coffee run']);
});

test('[LEDGER-112.2] shows the expenses from From to To, both days included, as soon as a date is chosen', async () => {
  await startExpenses();
  await spend('Sep 9', '2026-09-09', '1.00');
  await spend('Sep 10', '2026-09-10', '2.00');
  await spend('Sep 20', '2026-09-20', '4.00');
  await spend('Sep 21', '2026-09-21', '8.00');
  await choosePeriod('Expenses', 'Custom Range');

  await chooseRangeDate(expensesRoot(), 'From', '2026-09-10');
  await chooseRangeDate(expensesRoot(), 'To', '2026-09-20');

  expect(cardTitles()).toEqual(['Sep 20', 'Sep 10']);
  expect(listTotal()).toEqual(['$6.00']);
});

test('[LEDGER-112.2] shows the days from To to From when From is the later one', async () => {
  await startExpenses();
  await spend('Oct 4', '2026-10-04');
  await spend('Oct 5', '2026-10-05');
  await spend('Oct 20', '2026-10-20');
  await spend('Oct 21', '2026-10-21');
  await choosePeriod('Expenses', 'Custom Range');

  await chooseRangeDate(expensesRoot(), 'From', '2026-10-20');
  await chooseRangeDate(expensesRoot(), 'To', '2026-10-05');

  expect(cardTitles()).toEqual(['Oct 20', 'Oct 5']);
});

test('[LEDGER-112.2] shows no dates on another period, and the same dates when the custom range is chosen again', async () => {
  await startExpenses();
  await choosePeriod('Expenses', 'Custom Range');
  await chooseRangeDate(expensesRoot(), 'From', '2026-09-10');
  await chooseRangeDate(expensesRoot(), 'To', '2026-09-20');

  await choosePeriod('Expenses', 'This Year');
  expect(rangeDates(expensesRoot())).toBeUndefined();
  expect(linesIn(expensesRoot())).not.toContain('–');

  await choosePeriod('Expenses', 'Custom Range');
  expect(rangeDates(expensesRoot())).toMatchObject({
    from: '2026-09-10',
    to: '2026-09-20',
  });
});

test("[LEDGER-112.2] shows the dates of a group's custom range between its period row and its total", async () => {
  await startWithGroups(BRISBANE);
  await brisbaneSpends('Dinner', '2026-10-29');
  await showGroup('Brisbane');

  await choosePeriod('Brisbane', 'Custom Range');

  expect(rangeDates(brisbane())).toMatchObject({
    from: '2026-10-01',
    to: '2026-10-30',
  });
  const expected = ['Custom Range', '–', '$60.00', 'You owe: $20.00', 'Dinner'];
  expect(shownInOrder(groupLines('Brisbane'), expected)).toEqual(expected);
});

test("[LEDGER-112.2] starts a group's custom range on this month again once its screen has been opened again", async () => {
  await startWithGroups(BRISBANE);
  await brisbaneSpends('Dinner', '2026-10-29');
  await showGroup('Brisbane');
  await choosePeriod('Brisbane', 'Custom Range');
  await chooseRangeDate(brisbane(), 'From', '2026-09-10');
  expect(rangeDates(brisbane())).toMatchObject({
    from: '2026-09-10',
    to: '2026-10-30',
  });

  await goBackFrom('Brisbane');
  await openGroup('Brisbane');
  await choosePeriod('Brisbane', 'Custom Range');

  expect(rangeDates(brisbane())).toMatchObject({
    from: '2026-10-01',
    to: '2026-10-30',
  });
});

test('[LEDGER-112.2] starts a custom range on this month again after a restart', async () => {
  const app = await startExpenses();
  await choosePeriod('Expenses', 'Custom Range');
  await chooseRangeDate(expensesRoot(), 'From', '2026-09-10');
  expect(rangeDates(expensesRoot())).toMatchObject({
    from: '2026-09-10',
    to: '2026-10-30',
  });

  await restart(app);
  await choosePeriod('Expenses', 'Custom Range');

  expect(rangeDates(expensesRoot())).toMatchObject({
    from: '2026-10-01',
    to: '2026-10-30',
  });
});

test('[LEDGER-112.2] shows no dates on the screen of a group with no expenses, whose custom range Filters shows', async () => {
  await startWithGroups(BRISBANE);
  await showGroup('Brisbane');
  await waitFor(() => expect(groupLines('Brisbane')).toContain(NO_EXPENSES));

  await openFilters('Brisbane');
  await chooseDateOption('Custom Range');
  expect(rangeDates(filtersRoot())).toMatchObject({
    from: '2026-10-01',
    to: '2026-10-30',
  });
  await closeFilters();

  expect(rangeDates(brisbane())).toBeUndefined();
  expect(groupLines('Brisbane')).not.toContain('Custom Range');
  expect(groupLines('Brisbane')).toContain(NO_EXPENSES);
});

// A period with no expense

test('[LEDGER-116.3] says the month holds no expenses, under a dash for the total, and offers the latest earlier month that holds some', async () => {
  await startExpenses();
  await spend('Flight', '2026-06-01');
  await spend('Hotel', '2026-08-15');

  await choosePeriod('Expenses', 'This Month');

  const root = expensesRoot();
  expect(cardTitles()).toEqual([]);
  expect(emptyPeriodTitle(root)).toBe('No Expenses in October 2026');
  expect(showEarlierButton(root)).toBeDefined();
  const expected = ['—', 'No Expenses in October 2026', 'Show August 2026'];
  expect(shownInOrder(linesIn(root), expected)).toEqual(expected);
});

test('[LEDGER-116.3] moves to that month when Show is pressed', async () => {
  await startExpenses();
  await spend('Flight', '2026-06-01');
  await spend('Hotel', '2026-08-15');
  await choosePeriod('Expenses', 'This Month');

  await pressShowEarlier(expensesRoot());

  await expectPeriod(expensesRoot, 'August 2026');
  expect(cardTitles()).toEqual(['Hotel']);
  expect(emptyPeriodTitle(expensesRoot())).toBeUndefined();
});

test('[LEDGER-116.3] offers the latest earlier year that holds expenses when a year holds none', async () => {
  await startExpenses();
  await spend('Flight', '2024-03-05');

  await choosePeriod('Expenses', 'This Year');

  expect(emptyPeriodTitle(expensesRoot())).toBe('No Expenses in 2026');
  expect(linesIn(expensesRoot())).toContain('Show 2024');

  await pressShowEarlier(expensesRoot());

  await expectPeriod(expensesRoot, '2024');
  expect(cardTitles()).toEqual(['Flight']);
});

test('[LEDGER-116.3] offers the month of the latest earlier expense when the last three months hold none', async () => {
  await startExpenses();
  await spend('Flight', '2026-05-20');

  await choosePeriod('Expenses', 'Last 3 Months');

  expect(emptyPeriodTitle(expensesRoot())).toBe(
    'No Expenses in Aug – Oct 2026',
  );
  expect(linesIn(expensesRoot())).toContain('Show May 2026');

  await pressShowEarlier(expensesRoot());

  await expectPeriod(expensesRoot, 'May 2026');
  expect(cardTitles()).toEqual(['Flight']);
});

test('[LEDGER-116.3] names a custom range that holds no expenses by its first and last day', async () => {
  await startExpenses();
  await spend('Lunch', '2026-09-30');

  await choosePeriod('Expenses', 'Custom Range');

  expect(emptyPeriodTitle(expensesRoot())).toBe(
    'No Expenses in Oct 1, 2026 – Oct 30, 2026',
  );
  expect(linesIn(expensesRoot())).toContain('Show September 2026');
});

test('[LEDGER-116.3] offers no earlier period when every expense is later', async () => {
  await startExpenses();
  await spend('Coffee run', '2026-10-01');

  await pressPreviousPeriod(expensesRoot());
  await expectPeriod(expensesRoot, 'September 2026');
  await pressPreviousPeriod(expensesRoot());
  await expectPeriod(expensesRoot, 'August 2026');

  expect(emptyPeriodTitle(expensesRoot())).toBe('No Expenses in August 2026');
  expect(showEarlierButton(expensesRoot())).toBeUndefined();
});

test('[LEDGER-116.3] says nothing of the period while there are no expenses at all', async () => {
  await startExpenses();

  await pressPreviousPeriod(expensesRoot());
  await expectPeriod(expensesRoot, 'September 2026');

  expect(linesIn(expensesRoot())).toContain(EMPTY_LIST);
  expect(emptyPeriodTitle(expensesRoot())).toBeUndefined();
});

test("[LEDGER-116.3] says a group's period holds no expenses, not that the group has none", async () => {
  await startWithGroups(BRISBANE);
  await brisbaneSpends('Dinner', '2026-09-30');
  await showGroup('Brisbane');

  await choosePeriod('Brisbane', 'This Month');

  expect(groupCardTitles('Brisbane')).toEqual([]);
  expect(emptyPeriodTitle(brisbane())).toBe('No Expenses in October 2026');
  expect(groupLines('Brisbane')).not.toContain(NO_EXPENSES);
  // Where the cards would be: under your net balance, which counts Dinner still (GROUPS-69.4).
  const expected = [
    'You owe: $20.00',
    'No Expenses in October 2026',
    'Show September 2026',
  ];
  expect(shownInOrder(groupLines('Brisbane'), expected)).toEqual(expected);

  await pressShowEarlier(brisbane());

  await expectPeriod(brisbane, 'September 2026');
  expect(groupCardTitles('Brisbane')).toEqual(['Dinner']);
});

// A new expense outside the period

test('[LEDGER-117.2] moves the expense list to the month of an expense added outside the period', async () => {
  await startExpenses();
  await spend('Coffee run', '2026-10-01');

  await spend('Lunch', '2026-09-12');

  await expectPeriod(expensesRoot, 'September 2026');
  expect(cardTitles()).toEqual(['Lunch']);
});

test('[LEDGER-117.2] leaves the period when the new expense is dated in it', async () => {
  await startExpenses();
  await spend('Lunch', '2026-09-12');
  await expectPeriod(expensesRoot, 'September 2026');

  await spend('Dinner', '2026-09-30');

  expect(periodName(expensesRoot())).toBe('September 2026');
  expect(cardTitles()).toEqual(['Dinner', 'Lunch']);
});

test('[LEDGER-117.2] moves from a year to the month of the new expense', async () => {
  await startExpenses();
  await choosePeriod('Expenses', 'This Year');
  await expectPeriod(expensesRoot, '2026');

  await spend('Lunch', '2025-12-20');

  await expectPeriod(expensesRoot, 'December 2025');
  expect(cardTitles()).toEqual(['Lunch']);
});

test('[LEDGER-117.2] stays on All Time, which holds every new expense', async () => {
  await startExpenses();
  await choosePeriod('Expenses', 'All Time');

  await spend('Lunch', '2025-12-20');

  expect(periodName(expensesRoot())).toBe('All Time');
  expect(cardTitles()).toEqual(['Lunch']);
});

test("[LEDGER-117.2] moves a group's screen and the expense list to the month of a group expense added outside their periods", async () => {
  await startWithGroups(BRISBANE);
  await brisbaneSpends('Lunch', '2026-10-29');
  await showGroup('Brisbane');
  await choosePeriod('Brisbane', 'This Month');
  await expectPeriod(brisbane, 'October 2026');

  await fireEvent.press(groupAddButton('Brisbane')!);
  await expectForm('New Expense');
  await fillForm({ amount: '60.00', title: 'Dinner', date: '2026-08-15' });
  await choosePayer('Casey');
  await chooseSharers('Taylor (You)', 'Casey');
  await press('Add');
  await expectFormClosed();

  await expectPeriod(brisbane, 'August 2026');
  expect(groupCardTitles('Brisbane')).toEqual(['Dinner']);
  await tapTab('Expenses');
  await expectPeriod(expensesRoot, 'August 2026');
  expect(cardTitles()).toEqual(['Dinner']);
});

test('[LEDGER-117.2] leaves the expense list where it is when the new group expense has nothing to do with you', async () => {
  await startWithGroups(BRISBANE);
  await spend('Coffee run', '2026-10-01');

  await brisbaneSpends('Taxi', '2026-08-15', '25.00', ['Blake']);

  await settle();
  expect(periodName(expensesRoot())).toBe('October 2026');
  expect(cardTitles()).toEqual(['Coffee run']);
});

// An expense put back from the trash outside the period

test('[LEDGER-117.2] [LEDGER-75.5] moves the expense list back to the month of an expense that Undo puts back', async () => {
  await startExpenses();
  await spend('Lunch', '2026-09-12');
  await expectPeriod(expensesRoot, 'September 2026');
  await deleteByAction('Lunch');
  await pressNextPeriod(expensesRoot());
  await expectPeriod(expensesRoot, 'October 2026');

  await pressUndo('Lunch');

  await expectPeriod(expensesRoot, 'September 2026');
  expect(cardTitles()).toEqual(['Lunch']);
  expect(listTotal()).toEqual(['$8.75']);
});

test('[LEDGER-117.2] [LEDGER-79.5] moves the expense list, while Trash is on screen, to the month of an expense that Restore puts back', async () => {
  await startExpenses();
  await spend('Lunch', '2026-09-12');
  await expectPeriod(expensesRoot, 'September 2026');
  await deleteByAction('Lunch');
  await pressNextPeriod(expensesRoot());
  await expectPeriod(expensesRoot, 'October 2026');

  await restoreFromTrash('Lunch');
  await tapTab('Expenses');

  await expectPeriod(expensesRoot, 'September 2026');
  expect(cardTitles()).toEqual(['Lunch']);
});

test('[LEDGER-117.2] leaves a year and All Time, which hold the expense that Restore puts back', async () => {
  await startExpenses();
  await spend('Lunch', '2026-09-12');
  await deleteByAction('Lunch');
  await choosePeriod('Expenses', 'This Year');
  await expectPeriod(expensesRoot, '2026');

  await restoreFromTrash('Lunch');
  await tapTab('Expenses');

  await waitFor(() => expect(cardTitles()).toEqual(['Lunch']));
  expect(periodName(expensesRoot())).toBe('2026');

  await deleteByAction('Lunch');
  await choosePeriod('Expenses', 'All Time');
  await restoreFromTrash('Lunch');
  await tapTab('Expenses');

  await waitFor(() => expect(cardTitles()).toEqual(['Lunch']));
  expect(periodName(expensesRoot())).toBe('All Time');
});

test("[LEDGER-117.2] [LEDGER-79.5] moves an open group's screen and the expense list to the month of a group expense that Restore puts back", async () => {
  await startWithGroups(BRISBANE);
  await brisbaneSpends('Dinner', '2026-08-15');
  await brisbaneSpends('Lunch', '2026-10-29');
  await showGroup('Brisbane');
  await waitFor(() =>
    expect(groupCardTitles('Brisbane')).toEqual(['Lunch', 'Dinner']),
  );
  await deleteFromGroup('Brisbane', 'Dinner');
  await choosePeriod('Brisbane', 'This Month');
  await expectPeriod(brisbane, 'October 2026');
  await tapTab('Expenses');
  await expectPeriod(expensesRoot, 'October 2026');

  await restoreFromTrash('Dinner');

  // Brisbane's screen stayed open on the Groups tab.
  await tapTab('Groups');
  await expectPeriod(brisbane, 'August 2026');
  expect(groupCardTitles('Brisbane')).toEqual(['Dinner']);
  await tapTab('Expenses');
  await expectPeriod(expensesRoot, 'August 2026');
  expect(cardTitles()).toEqual(['Dinner']);
});

test("[LEDGER-117.2] [LEDGER-75.5] leaves a group's screen on Group Total, which holds the expense that Undo puts back, and moves the expense list to its month", async () => {
  await startWithGroups(BRISBANE);
  await brisbaneSpends('Dinner', '2026-09-12');
  await brisbaneSpends('Lunch', '2026-10-29');
  await showGroup('Brisbane');
  await waitFor(() =>
    expect(groupCardTitles('Brisbane')).toEqual(['Lunch', 'Dinner']),
  );
  await tapTab('Expenses');
  await expectPeriod(expensesRoot, 'October 2026');
  await tapTab('Groups');

  await deleteFromGroup('Brisbane', 'Dinner');
  await pressUndo('Dinner');

  await waitFor(() =>
    expect(groupCardTitles('Brisbane')).toEqual(['Lunch', 'Dinner']),
  );
  expect(periodName(brisbane())).toBe('Group Total');
  await tapTab('Expenses');
  await expectPeriod(expensesRoot, 'September 2026');
  expect(cardTitles()).toEqual(['Dinner']);
});

test('[LEDGER-117.2] leaves the expense list where it is when the group expense that Restore puts back has nothing to do with you', async () => {
  await startWithGroups(BRISBANE);
  await spend('Coffee run', '2026-10-01');
  await brisbaneSpends('Taxi', '2026-08-15', '25.00', ['Blake']);
  await showGroup('Brisbane');
  await waitFor(() => expect(groupCardTitles('Brisbane')).toEqual(['Taxi']));
  await deleteFromGroup('Brisbane', 'Taxi');

  await restoreFromTrash('Taxi');

  await tapTab('Expenses');
  await settle();
  expect(periodName(expensesRoot())).toBe('October 2026');
  expect(cardTitles()).toEqual(['Coffee run']);
});

// A group's screen

// Coming back to the app

/** The user leaves the app and comes back to it on `day`, at noon in Taipei. */
const comeBackOn = (day: string) =>
  leaveAndComeBack(() => setPhoneClock('Asia/Taipei', `${day}T04:00:00Z`));

test('[LEDGER-146.2] moves the expense list to this month when the app comes back in a later month than the one it opened on', async () => {
  await startExpenses();
  await spend('Coffee run', '2026-10-30');
  await expectPeriod(expensesRoot, 'October 2026');

  await comeBackOn('2026-11-02');

  await expectPeriod(expensesRoot, 'November 2026');
  expect(enabledArrows(expensesRoot())).toEqual(['Previous period']);
  expect(cardTitles()).toEqual([]);
  expect(emptyPeriodTitle(expensesRoot())).toBe('No Expenses in November 2026');
  await openFilters('Expenses');
  expect(dateRow()).toBe('Date, This Month');
});

test('[LEDGER-146.2] leaves the expense list on its month when the app comes back in the same month', async () => {
  await startExpenses();
  await spend('Coffee run', '2026-10-30');

  await comeBackOn('2026-10-31');

  expect(periodName(expensesRoot())).toBe('October 2026');
  expect(cardTitles()).toEqual(['Coffee run']);
});

test('[LEDGER-146.2] leaves a month the user stepped to, the next day and in a later month', async () => {
  await startExpenses();
  await pressPreviousPeriod(expensesRoot());
  await expectPeriod(expensesRoot, 'September 2026');

  // The month before this one, which the user chose.
  await comeBackOn('2026-10-31');
  expect(periodName(expensesRoot())).toBe('September 2026');

  await comeBackOn('2026-11-02');
  expect(periodName(expensesRoot())).toBe('September 2026');
});

test('[LEDGER-146.2] follows the calendar again once the user has stepped back to this month', async () => {
  await startExpenses();
  await pressPreviousPeriod(expensesRoot());
  await expectPeriod(expensesRoot, 'September 2026');
  await pressNextPeriod(expensesRoot());
  await expectPeriod(expensesRoot, 'October 2026');

  await comeBackOn('2026-11-02');

  await expectPeriod(expensesRoot, 'November 2026');
});

test('[LEDGER-146.2] moves a list on this year to the new year when the app comes back after New Year', async () => {
  await startExpenses('Asia/Taipei', '2026-12-31T04:00:00Z');
  await choosePeriod('Expenses', 'This Year');
  await expectPeriod(expensesRoot, '2026');

  await comeBackOn('2027-01-02');

  await expectPeriod(expensesRoot, '2027');
  expect(enabledArrows(expensesRoot())).toEqual(['Previous period']);
});

test("[LEDGER-146.2] moves a group's screen on this month and the expense list behind it, and leaves a group's screen on Group Total", async () => {
  await startWithGroups({ ...BRISBANE, Osaka: [] });
  await brisbaneSpends('Dinner', '2026-10-29');
  await addGroupExpense({
    group: 'Osaka',
    payer: 'Taylor (You)',
    sharers: ['Taylor (You)'],
    title: 'Ramen',
    date: '2026-10-29',
    amount: '9.00',
  });
  await showGroup('Brisbane');
  await choosePeriod('Brisbane', 'This Month');
  expect(periodName(brisbane())).toBe('October 2026');

  await comeBackOn('2026-11-02');

  await expectPeriod(brisbane, 'November 2026');
  await goBackFrom('Brisbane');
  await openGroup('Osaka');
  expect(periodName(screenOf('Osaka'))).toBe('Group Total');
  await tapTab('Expenses');
  expect(periodName(expensesRoot())).toBe('November 2026');
});

test("[LEDGER-146.2] leaves a group's screen that is open on Group Total, and the expense list behind it on All Time, when the app comes back in a later month", async () => {
  await startWithGroups(BRISBANE);
  await brisbaneSpends('Dinner', '2026-10-29');
  await tapTab('Expenses');
  await choosePeriod('Expenses', 'All Time');
  expect(periodName(expensesRoot())).toBe('All Time');
  await showGroup('Brisbane');
  expect(periodName(brisbane())).toBe('Group Total');

  await comeBackOn('2026-11-02');

  expect(periodName(brisbane())).toBe('Group Total');
  expect(groupCardTitles('Brisbane')).toEqual(['Dinner']);
  await tapTab('Expenses');
  expect(periodName(expensesRoot())).toBe('All Time');
  expect(cardTitles()).toEqual(['Dinner']);
});

test('[LEDGER-146.2] shows the last three months up to the new today when the app comes back', async () => {
  await startExpenses();
  await choosePeriod('Expenses', 'Last 3 Months');
  await expectPeriod(expensesRoot, 'Aug – Oct 2026');

  await comeBackOn('2026-11-02');

  await expectPeriod(expensesRoot, 'Sep – Nov 2026');
});

test('[LEDGER-146.2] keeps a custom range and its dates when the app comes back in a later month', async () => {
  await startExpenses();
  await choosePeriod('Expenses', 'Custom Range');
  expect(rangeDates(expensesRoot())).toMatchObject({
    from: '2026-10-01',
    to: '2026-10-30',
  });

  await comeBackOn('2026-11-02');

  expect(periodName(expensesRoot())).toBe('Custom Range');
  expect(rangeDates(expensesRoot())).toMatchObject({
    from: '2026-10-01',
    to: '2026-10-30',
  });
});

test('[LEDGER-146.2] leaves the period at midnight while the app stays in front, and moves it when the app next comes back', async () => {
  await startExpenses('Asia/Taipei', '2026-10-31T04:00:00Z');
  await expectPeriod(expensesRoot, 'October 2026');

  // Midnight passes with the app in front.
  setPhoneClock('Asia/Taipei', '2026-11-01T04:00:00Z');
  await openFilters('Expenses');
  expect(dateRow()).toBe('Date, Last Month');
  await closeFilters();
  expect(periodName(expensesRoot())).toBe('October 2026');

  await leaveAndComeBack();

  await expectPeriod(expensesRoot, 'November 2026');
});

test("[GROUPS-61.6] lists only the group's expenses dated in the period", async () => {
  await startWithGroups(BRISBANE);
  await brisbaneSpends('Taxi', '2026-10-29');
  await brisbaneSpends('Dinner', '2026-09-30');
  await showGroup('Brisbane');
  await waitFor(() =>
    expect(groupCardTitles('Brisbane')).toEqual(['Taxi', 'Dinner']),
  );

  await choosePeriod('Brisbane', 'This Month');

  expect(groupCardTitles('Brisbane')).toEqual(['Taxi']);
  expect(groupLines('Brisbane')).not.toContain(NO_EXPENSES);
});

test("[GROUPS-68.6] totals the group's cards of the period shown, and reads the total after the period's name", async () => {
  await startWithGroups(BRISBANE);
  await brisbaneSpends('Dinner', '2026-10-29', '100.01');
  await brisbaneSpends('Taxi', '2026-09-30', '25.00', ['Blake']);
  await showGroup('Brisbane');
  await waitFor(() => expect(totalLines(brisbane())).toEqual(['$125.01']));
  expect(totalRead(brisbane())).toEqual(['Group Total: $125.01']);

  await choosePeriod('Brisbane', 'This Month');

  expect(periodName(brisbane())).toBe('October 2026');
  expect(totalLines(brisbane())).toEqual(['$100.01']);
  expect(totalRead(brisbane())).toEqual(['October 2026: $100.01']);
  expect(groupCardTitles('Brisbane')).toEqual(['Dinner']);
});

test("[GROUPS-68.6] shows a dash for a group's period with no card, read as nothing", async () => {
  await startWithGroups(BRISBANE);
  await brisbaneSpends('Taxi', '2026-09-30', '25.00', ['Blake']);
  await showGroup('Brisbane');

  await choosePeriod('Brisbane', 'This Month');

  expect(totalLines(brisbane())).toEqual(['—']);
  expect(totalRead(brisbane())).toEqual(['October 2026: nothing']);
});

test("[GROUPS-68.6] opens the group's Insights on the month the group's screen shows", async () => {
  await startWithGroups(BRISBANE);
  await brisbaneSpends('Dinner', '2026-10-29', '100.01');
  await brisbaneSpends('Taxi', '2026-09-30', '25.00', ['Blake']);
  await showGroup('Brisbane');
  await choosePeriod('Brisbane', 'Last Month');
  await expectPeriod(brisbane, 'September 2026');

  await pressTotal(brisbane());
  await expectInsights('Groups');

  expect(selectedPeriod('Groups')).toBe('September 2026');
  await expectTotals(['$25.00'], 'Groups');
});

test('[GROUPS-69.4] keeps your net balance that of every expense, whatever the period', async () => {
  await startWithGroups(BRISBANE);
  await addGroupExpense({
    group: 'Brisbane',
    payer: 'Taylor (You)',
    sharers: ['Taylor (You)', 'Casey', 'Blake'],
    amount: '60.00',
    date: '2026-09-30',
  });
  await showGroup('Brisbane');
  await waitFor(() =>
    expect(balanceLines('Brisbane')).toEqual(["You're owed: $40.00"]),
  );

  await choosePeriod('Brisbane', 'This Month');

  expect(totalLines(brisbane())).toEqual(['—']);
  expect(balanceLines('Brisbane')).toEqual(["You're owed: $40.00"]);
  const expected = ['—', "You're owed: $40.00"];
  expect(shownInOrder(groupLines('Brisbane'), expected)).toEqual(expected);
});
