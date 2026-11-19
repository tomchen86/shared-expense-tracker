import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ActionSheetIOS } from 'react-native';
import { within } from '@testing-library/react-native';
import {
  addExpense,
  archiveCategory,
  inTreeOrder,
  resetPhone,
  restart,
  startExpenses,
  watchAlerts,
} from './ledger-expense-app';
import {
  EMPTY_LIST,
  allowReads,
  card,
  cardTitles,
  expensesRoot,
  goBackFromDetails,
  inOneRow,
  linesIn,
  listTotal,
  openDetails,
  phoneDatabaseWithReads,
  startExpensesAt,
} from './ledger-expense-list-app';
import {
  NO_RESULTS_HINT,
  chooseSort,
  countView,
  endSearch,
  hasSearch,
  listCount,
  noResultsTitle,
  searchField,
  sortName,
  sortView,
  typeSearch,
} from './ledger-list-find-app';
import {
  choosePeriod,
  chooseRangeDate,
  emptyPeriodTitle,
  expectPeriod,
  nextPeriod,
  periodName,
  previousPeriod,
  rangeDates,
  showEarlierButton,
  totalButtons,
} from './ledger-list-period-app';
import {
  NO_GROUP_ID,
  addGroupExpense,
  archiveGroup,
  groupCard,
  groupCardTitles,
  groupLines,
  startWithGroups,
} from './ledger-group-expense-app';
import {
  NO_EXPENSES,
  goBackFrom,
  isLargeTitle,
  screenOf,
} from './group-details-app';
import {
  balanceButtons,
  balanceLines,
  groupTotals,
  showGroup,
} from './group-balances-app';
import {
  READ_ONLY,
  contentButton,
  openArchivedGroup,
  openArchivedGroups,
} from './group-archive-app';
import {
  deleteByAction,
  pressUndo,
  restoreFromTrash,
} from './ledger-trash-app';
import { allowWrites, settle } from './shell-appearance-app';
import { tapTab } from './shell-tabs-app';
import type { Database } from '../../src/storage';

// Runs on iOS. Each test starts the app on a phone database file of its own, in Taipei on
// 2026-10-30, in a region whose currency is USD, and adds its expenses through New Expense. It
// types into the system search field of a list's navigation bar by reporting the text as that
// field does, and ends a search as the field reports its cancel button (ledger-list-find-app).
// Adding an expense dated outside the period a list shows moves that list to the expense's month
// (LEDGER-117.2), so a test chooses the period it is about after it has added its expenses.

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
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'list-search-'));
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

/** Adds an expense of Brisbane that Taylor pays: 60.00 split between Taylor, Casey and Blake unless told otherwise. */
const brisbaneSpends = (
  title: string,
  {
    date = '2026-10-30',
    amount = '60.00',
    payer = 'Taylor (You)',
    sharers = ['Taylor (You)', 'Casey', 'Blake'],
  } = {},
) =>
  addGroupExpense({
    group: 'Brisbane',
    payer,
    sharers,
    title,
    date,
    amount,
  });

/** The screen of Brisbane, on whichever tab shows it. */
const brisbane = () => screenOf('Brisbane');

/** Types `text` into the search field of the expense list. */
const search = (text: string) => typeSearch('Expenses', text);

// The search field

test('[SHELL-73.1] [LEDGER-125.1] puts the system search field in the bar of the expense list, as a button on the bar, with the prompt Search', async () => {
  await startExpenses();

  const field = searchField('Expenses');
  expect(field).toBeDefined();
  expect(field?.props.placeholder).toBe('Search');
  expect(field?.props.placement).toBe('integratedButton');
});

test('[SHELL-73.1] puts no search field in the bars of Settings and of the details of an expense', async () => {
  await startExpenses();
  await spend('Coffee run');
  expect(hasSearch('Expenses')).toBe(true);

  await openDetails('Coffee run');
  expect(hasSearch('Expense')).toBe(false);
  await goBackFromDetails();

  await tapTab('Settings');
  expect(hasSearch('Settings')).toBe(false);
});

test("[LEDGER-125.1] offers search on a group's screen, also on one with no expense and on an archived one", async () => {
  await startWithGroups(BRISBANE);
  await showGroup('Brisbane');

  expect(searchField('Brisbane')?.props.placeholder).toBe('Search');

  await goBackFrom('Brisbane');
  await archiveGroup('Brisbane');
  await openArchivedGroups();
  await openArchivedGroup('Brisbane');

  expect(searchField('Brisbane')?.props.placeholder).toBe('Search');
});

test('[LEDGER-125.1] offers no search for a group that is not found', async () => {
  await startExpensesAt(`/groups/${NO_GROUP_ID}`);

  expect(hasSearch('Group Details')).toBe(false);
});

// What a search matches

test('[LEDGER-125.1] [SHELL-73.1] lists the expenses whose title holds the text, at each change of the text', async () => {
  await startExpenses();
  await spend('Coffee run');
  await spend('Lunch');
  await spend('Cocoa');

  await search('c');
  expect(cardTitles()).toEqual(['Cocoa', 'Lunch', 'Coffee run']);

  await search('co');
  expect(cardTitles()).toEqual(['Cocoa', 'Coffee run']);

  await search('cof');
  expect(cardTitles()).toEqual(['Coffee run']);
});

test('[LEDGER-125.1] matches the note, which the card does not show', async () => {
  await startExpenses();
  await spend('Coffee run');
  await addExpense({ title: 'Lunch', note: 'Window seat' });

  await search('window');

  expect(cardTitles()).toEqual(['Lunch']);
});

test('[LEDGER-125.1] matches the name of the category, and not the word Archived after it', async () => {
  await startExpenses();
  await addExpense({ title: 'Coffee run', category: 'Food & Dining' });
  await addExpense({ title: 'Lunch', category: 'Shopping' });

  await search('shop');
  expect(cardTitles()).toEqual(['Lunch']);

  await endSearch('Expenses');
  await archiveCategory('Shopping');
  expect(linesIn(card('Lunch'))).toContain('Shopping (Archived)');

  await search('shopping');
  expect(cardTitles()).toEqual(['Lunch']);

  await search('archived');
  expect(cardTitles()).toEqual([]);
});

test('[LEDGER-125.1] [LEDGER-64.4] matches the name of the group of a group expense on the expense list', async () => {
  await startWithGroups(BRISBANE);
  await spend('Coffee run');
  await brisbaneSpends('Dinner');
  await brisbaneSpends('Taxi');

  await search('bris');

  expect(cardTitles()).toEqual(['Taxi', 'Dinner']);
});

test("[LEDGER-125.1] [GROUPS-61.5] searches a group's own expenses on its screen, where the group's name matches them all", async () => {
  await startWithGroups(BRISBANE);
  await spend('Taxi home');
  await brisbaneSpends('Dinner');
  await brisbaneSpends('Taxi');
  await showGroup('Brisbane');

  await typeSearch('Brisbane', 'taxi');
  expect(groupCardTitles('Brisbane')).toEqual(['Taxi']);
  expect(linesIn(groupCard('Brisbane', 'Taxi'))).toContain('Paid by You');

  await typeSearch('Brisbane', 'brisbane');
  expect(groupCardTitles('Brisbane')).toEqual(['Taxi', 'Dinner']);
});

test('[LEDGER-125.1] ignores the case of letters, and tells a letter with an accent from one without', async () => {
  await startExpenses();
  await spend('Coffee run');
  await spend('CAFÉ latte');

  await search('COFFEE');
  expect(cardTitles()).toEqual(['Coffee run']);

  await search('café');
  expect(cardTitles()).toEqual(['CAFÉ latte']);

  await search('cafe');
  expect(cardTitles()).toEqual([]);
});

test('[LEDGER-125.1] matches the text as one run, not word by word', async () => {
  await startExpenses();
  await spend('Coffee run');

  await search('coffee run');
  expect(cardTitles()).toEqual(['Coffee run']);

  await search('run coffee');
  expect(cardTitles()).toEqual([]);
});

test('[LEDGER-125.1] leaves the spaces around the text out, and does not search for spaces alone', async () => {
  await startExpenses();
  await spend('Coffee run');
  await spend('Lunch');

  await search('  coffee ');
  expect(cardTitles()).toEqual(['Coffee run']);

  await search('   ');
  expect(cardTitles()).toEqual(['Lunch', 'Coffee run']);
  expect(periodName(expensesRoot())).toBe('October 2026');
  expect(listCount(expensesRoot())).toBeUndefined();
});

test('[LEDGER-125.1] does not match amounts', async () => {
  await startExpenses();
  await spend('Coffee run', '2026-10-30', '8.75');
  await spend('Table 875', '2026-10-30', '12.00');

  await search('8.75');
  expect(cardTitles()).toEqual([]);

  await search('875');
  expect(cardTitles()).toEqual(['Table 875']);
});

test('[LEDGER-125.1] does not match the payer or the date', async () => {
  await startWithGroups(BRISBANE);
  await brisbaneSpends('Dinner', { payer: 'Casey' });
  await showGroup('Brisbane');
  expect(linesIn(groupCard('Brisbane', 'Dinner'))).toContain('Paid by Casey');

  await typeSearch('Brisbane', 'casey');
  expect(groupCardTitles('Brisbane')).toEqual([]);

  await typeSearch('Brisbane', 'oct');
  expect(groupCardTitles('Brisbane')).toEqual([]);
});

test('[LEDGER-125.1] [LEDGER-31.4] [LEDGER-107.2] looks through every date whatever the period, in the order of the list', async () => {
  await startExpenses();
  await spend('Coffee run', '2026-10-01');
  await spend('Lunch', '2026-10-02');
  await spend('Coffee beans', '2025-10-15');
  await choosePeriod('Expenses', 'This Month');
  expect(cardTitles()).toEqual(['Lunch', 'Coffee run']);

  await search('coffee');
  expect(cardTitles()).toEqual(['Coffee run', 'Coffee beans']);

  await chooseSort(expensesRoot(), 'Oldest First');
  expect(cardTitles()).toEqual(['Coffee beans', 'Coffee run']);
});

test("[LEDGER-64.4] leaves a group expense that does not involve you out of a search of the expense list, and finds it on the group's screen", async () => {
  await startWithGroups(BRISBANE);
  await brisbaneSpends('Taxi', { payer: 'Casey', sharers: ['Blake'] });
  await brisbaneSpends('Taxi home');

  await search('taxi');
  expect(cardTitles()).toEqual(['Taxi home']);

  await showGroup('Brisbane');
  await typeSearch('Brisbane', 'taxi');
  expect(groupCardTitles('Brisbane')).toEqual(['Taxi home', 'Taxi']);
});

test('[LEDGER-125.1] leaves expenses in the Trash out of a search', async () => {
  await startExpenses();
  await spend('Coffee run');
  await spend('Coffee beans');
  await deleteByAction('Coffee run');

  await search('coffee');

  expect(cardTitles()).toEqual(['Coffee beans']);
});

// Ending a search

test('[LEDGER-125.1] [LEDGER-107.2] [SHELL-73.1] goes back to the period the list was on when the search ends', async () => {
  await startExpenses();
  await spend('Lunch', '2026-09-12');
  await spend('Lunch box', '2026-08-03');
  await spend('Dinner', '2026-09-20');
  await choosePeriod('Expenses', 'Last Month');
  await expectPeriod(expensesRoot, 'September 2026');

  await search('lunch');
  expect(cardTitles()).toEqual(['Lunch', 'Lunch box']);

  await endSearch('Expenses');

  expect(periodName(expensesRoot())).toBe('September 2026');
  expect(cardTitles()).toEqual(['Dinner', 'Lunch']);
});

test('[LEDGER-125.1] stops searching when the text is cleared', async () => {
  await startExpenses();
  await spend('Coffee run');
  await spend('Lunch');
  await search('coffee');
  expect(cardTitles()).toEqual(['Coffee run']);

  await search('');

  expect(cardTitles()).toEqual(['Lunch', 'Coffee run']);
  expect(periodName(expensesRoot())).toBe('October 2026');
});

test('[LEDGER-125.1] [LEDGER-117.2] keeps the search when an expense is added during it: lists the new expense if it matches, and otherwise once the search ends, in its month', async () => {
  await startExpenses();
  await spend('Coffee run');
  await search('coffee');

  await spend('Coffee beans', '2025-12-20');

  expect(cardTitles()).toEqual(['Coffee run', 'Coffee beans']);
  expect(listCount(expensesRoot())).toBe('2 items');

  await spend('Lunch', '2026-09-12');

  expect(periodName(expensesRoot())).toBeUndefined();
  expect(cardTitles()).toEqual(['Coffee run', 'Coffee beans']);
  expect(listCount(expensesRoot())).toBe('2 items');

  await endSearch('Expenses');

  await expectPeriod(expensesRoot, 'September 2026');
  expect(cardTitles()).toEqual(['Lunch']);
});

test('[LEDGER-125.1] [LEDGER-117.2] [LEDGER-75.5] keeps the search when Undo puts back an expense that matches, lists it, and shows its month once the search ends', async () => {
  await startExpenses();
  await spend('Coffee run');
  await spend('Coffee beans', '2025-12-20');
  await choosePeriod('Expenses', 'This Month');
  await search('coffee');
  await deleteByAction('Coffee beans');
  expect(cardTitles()).toEqual(['Coffee run']);
  expect(listCount(expensesRoot())).toBe('1 item');

  await pressUndo('Coffee beans');

  expect(periodName(expensesRoot())).toBeUndefined();
  expect(cardTitles()).toEqual(['Coffee run', 'Coffee beans']);
  expect(listCount(expensesRoot())).toBe('2 items');

  await endSearch('Expenses');

  await expectPeriod(expensesRoot, 'December 2025');
  expect(cardTitles()).toEqual(['Coffee beans']);
});

test('[LEDGER-125.1] [LEDGER-117.2] [LEDGER-79.5] keeps the search when Restore puts back an expense that does not match, and lists it once the search ends, in its month', async () => {
  await startExpenses();
  await spend('Coffee run');
  await spend('Lunch', '2026-09-12');
  await deleteByAction('Lunch');
  await choosePeriod('Expenses', 'This Month');
  await search('coffee');

  await restoreFromTrash('Lunch');
  await tapTab('Expenses');
  await settle();

  expect(periodName(expensesRoot())).toBeUndefined();
  expect(cardTitles()).toEqual(['Coffee run']);
  expect(listCount(expensesRoot())).toBe('1 item');

  await endSearch('Expenses');

  await expectPeriod(expensesRoot, 'September 2026');
  expect(cardTitles()).toEqual(['Lunch']);
});

test('[LEDGER-125.1] keeps searching after the details of a card are opened and closed', async () => {
  await startExpenses();
  await spend('Coffee run');
  await spend('Lunch');
  await search('coffee');

  await openDetails('Coffee run');
  await goBackFromDetails();
  await settle();

  expect(cardTitles()).toEqual(['Coffee run']);
  expect(listCount(expensesRoot())).toBe('1 item');
});

test("[LEDGER-125.1] keeps the search of the expense list and of a group's screen apart", async () => {
  await startWithGroups(BRISBANE);
  await spend('Coffee run');
  await brisbaneSpends('Dinner');
  await brisbaneSpends('Coffee');

  await search('coffee');
  expect(cardTitles()).toEqual(['Coffee', 'Coffee run']);

  await showGroup('Brisbane');
  expect(groupCardTitles('Brisbane')).toEqual(['Coffee', 'Dinner']);
  expect(periodName(brisbane())).toBe('Group Total');

  await typeSearch('Brisbane', 'dinner');
  await tapTab('Expenses');
  expect(cardTitles()).toEqual(['Coffee', 'Coffee run']);
});

test("[LEDGER-125.1] does not keep a search when the app starts again or a group's screen is opened again", async () => {
  const app = await startWithGroups(BRISBANE);
  await spend('Coffee run');
  await brisbaneSpends('Dinner');
  await brisbaneSpends('Taxi');
  await search('coffee');
  await showGroup('Brisbane');
  await typeSearch('Brisbane', 'taxi');
  expect(groupCardTitles('Brisbane')).toEqual(['Taxi']);

  await goBackFrom('Brisbane');
  await showGroup('Brisbane');
  expect(groupCardTitles('Brisbane')).toEqual(['Taxi', 'Dinner']);

  await restart(app);
  expect(cardTitles()).toEqual(['Taxi', 'Dinner', 'Coffee run']);
  expect(listCount(expensesRoot())).toBeUndefined();
});

// What gives way while searching

test('[LEDGER-126.1] [LEDGER-108.2] [LEDGER-35.5] hides the period row and the total while searching, and says how many expenses match to the left of the sort button', async () => {
  await startExpenses();
  await spend('Coffee run', '2026-10-30', '8.75');
  await spend('Lunch', '2026-10-30', '12.50');
  await spend('Coffee beans', '2025-10-15', '3.00');
  await choosePeriod('Expenses', 'This Month');
  expect(listTotal()).toEqual(['$21.25']);

  await search('coffee');

  expect(periodName(expensesRoot())).toBeUndefined();
  expect(previousPeriod(expensesRoot())).toBeUndefined();
  expect(nextPeriod(expensesRoot())).toBeUndefined();
  expect(listTotal()).toEqual([]);
  expect(totalButtons(expensesRoot())).toEqual([]);
  expect(listCount(expensesRoot())).toBe('2 items');
  expect(sortName(expensesRoot())).toBe('Sort By, Newest First');
  const count = countView(expensesRoot())!;
  const sort = sortView(expensesRoot())!;
  expect(inOneRow(count, sort)).toBe(true);
  expect(inTreeOrder(count, sort, card('Coffee run'))).toBe(true);

  await search('lunch');
  expect(listCount(expensesRoot())).toBe('1 item');

  await endSearch('Expenses');

  expect(periodName(expensesRoot())).toBe('October 2026');
  expect(listTotal()).toEqual(['$21.25']);
  expect(listCount(expensesRoot())).toBeUndefined();
  expect(sortName(expensesRoot())).toBe('Sort By, Newest First');
});

test('[LEDGER-126.1] [LEDGER-112.2] hides the dates of a custom range while searching, and shows them as they were afterwards', async () => {
  await startExpenses();
  await spend('Coffee run', '2026-09-15');
  await choosePeriod('Expenses', 'Custom Range');
  await chooseRangeDate(expensesRoot(), 'From', '2026-09-10');
  await chooseRangeDate(expensesRoot(), 'To', '2026-09-20');

  await search('coffee');

  expect(rangeDates(expensesRoot())).toBeUndefined();
  expect(periodName(expensesRoot())).toBeUndefined();
  expect(cardTitles()).toEqual(['Coffee run']);

  await endSearch('Expenses');

  expect(periodName(expensesRoot())).toBe('Custom Range');
  expect(rangeDates(expensesRoot())).toMatchObject({
    from: '2026-09-10',
    to: '2026-09-20',
  });
});

test('[LEDGER-116.2] [LEDGER-126.1] shows no empty period text while searching', async () => {
  await startExpenses();
  await spend('Lunch', '2026-08-15');
  await choosePeriod('Expenses', 'This Month');
  expect(emptyPeriodTitle(expensesRoot())).toBe('No Expenses in October 2026');

  await search('lunch');
  expect(cardTitles()).toEqual(['Lunch']);
  expect(emptyPeriodTitle(expensesRoot())).toBeUndefined();
  expect(showEarlierButton(expensesRoot())).toBeUndefined();

  await search('dinner');
  expect(noResultsTitle(expensesRoot())).toBe('No Results for “dinner”');
  expect(emptyPeriodTitle(expensesRoot())).toBeUndefined();
  expect(showEarlierButton(expensesRoot())).toBeUndefined();

  await endSearch('Expenses');
  expect(emptyPeriodTitle(expensesRoot())).toBe('No Expenses in October 2026');
});

test("[LEDGER-126.1] [GROUPS-68.5] [GROUPS-69.4] hides the period row, the total and your net balance on a group's screen while searching", async () => {
  await startWithGroups(BRISBANE);
  await brisbaneSpends('Dinner', { amount: '60.00' });
  await brisbaneSpends('Taxi', {
    amount: '25.00',
    payer: 'Casey',
    sharers: ['Blake'],
  });
  await showGroup('Brisbane');
  expect(groupTotals('Brisbane')).toEqual(['Group Total: $85.00']);
  expect(balanceLines('Brisbane')).toEqual(["You're owed: $40.00"]);

  await typeSearch('Brisbane', 'dinner');

  expect(periodName(brisbane())).toBeUndefined();
  expect(groupTotals('Brisbane')).toEqual([]);
  expect(balanceLines('Brisbane')).toEqual([]);
  expect(balanceButtons('Brisbane')).toEqual([]);
  expect(listCount(brisbane())).toBe('1 item');
  expect(sortName(brisbane())).toBe('Sort By, Newest First');
  expect(groupCardTitles('Brisbane')).toEqual(['Dinner']);
  expect(
    within(brisbane())
      .queryAllByRole('button')
      .some((button) => isLargeTitle(button)),
  ).toBe(true);

  await endSearch('Brisbane');

  expect(periodName(brisbane())).toBe('Group Total');
  expect(groupTotals('Brisbane')).toEqual(['Group Total: $85.00']);
  expect(balanceLines('Brisbane')).toEqual(["You're owed: $40.00"]);
  expect(listCount(brisbane())).toBeUndefined();
});

test('[LEDGER-126.1] keeps the read-only text and Restore Group of an archived group over the count while searching', async () => {
  await startWithGroups(BRISBANE);
  await brisbaneSpends('Dinner');
  await brisbaneSpends('Taxi');
  await archiveGroup('Brisbane');
  await openArchivedGroups();
  await openArchivedGroup('Brisbane');

  await typeSearch('Brisbane', 'dinner');

  expect(groupLines('Brisbane')).toContain(READ_ONLY);
  expect(
    inTreeOrder(
      contentButton('Brisbane', 'Restore Group'),
      countView(brisbane())!,
      groupCard('Brisbane', 'Dinner'),
    ),
  ).toBe(true);
  expect(listCount(brisbane())).toBe('1 item');
  expect(groupCardTitles('Brisbane')).toEqual(['Dinner']);
});

// No results

test('[LEDGER-127.1] says No Results for the text as typed, without the spaces around it, and shows no card, count or sort button', async () => {
  await startExpenses();
  await spend('Coffee run');

  await search('Pizza ');

  expect(noResultsTitle(expensesRoot())).toBe('No Results for “Pizza”');
  expect(linesIn(expensesRoot())).toContain(NO_RESULTS_HINT);
  expect(cardTitles()).toEqual([]);
  expect(listCount(expensesRoot())).toBeUndefined();
  expect(sortName(expensesRoot())).toBeUndefined();
  expect(periodName(expensesRoot())).toBeUndefined();
  expect(listTotal()).toEqual([]);
  expect(linesIn(expensesRoot())).not.toContain(EMPTY_LIST);

  await search('coffee');

  expect(noResultsTitle(expensesRoot())).toBeUndefined();
  expect(linesIn(expensesRoot())).not.toContain(NO_RESULTS_HINT);
  expect(cardTitles()).toEqual(['Coffee run']);
});

test("[LEDGER-127.1] says No Results on a group's screen whose expenses do not match", async () => {
  await startWithGroups(BRISBANE);
  await brisbaneSpends('Dinner');
  await showGroup('Brisbane');

  await typeSearch('Brisbane', 'pizza');

  expect(noResultsTitle(brisbane())).toBe('No Results for “pizza”');
  expect(groupLines('Brisbane')).toContain(NO_RESULTS_HINT);
  expect(groupLines('Brisbane')).not.toContain(NO_EXPENSES);
  expect(groupCardTitles('Brisbane')).toEqual([]);
  expect(sortName(brisbane())).toBeUndefined();
});

test('[LEDGER-127.1] keeps the text of a list with no expense at all while searching, on the expense list and on a group', async () => {
  await startWithGroups(BRISBANE);

  await search('pizza');

  expect(linesIn(expensesRoot())).toContain(EMPTY_LIST);
  expect(noResultsTitle(expensesRoot())).toBeUndefined();
  expect(linesIn(expensesRoot())).not.toContain(NO_RESULTS_HINT);

  await showGroup('Brisbane');
  await typeSearch('Brisbane', 'pizza');

  expect(groupLines('Brisbane')).toContain(NO_EXPENSES);
  expect(noResultsTitle(brisbane())).toBeUndefined();
});
