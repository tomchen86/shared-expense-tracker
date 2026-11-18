import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ActionSheetIOS } from 'react-native';
import { fireEvent, renderHook } from '@testing-library/react-native';
import {
  addCategory,
  addExpense,
  archiveCategory,
  editCategory,
  editExpense,
  expectFormClosed,
  openEditExpense,
  press,
  resetPhone,
  restart,
  setRegionCurrency,
  startExpenses,
  storedExpenses,
  watchAlerts,
} from './ledger-expense-app';
import {
  EMPTY_LIST,
  allowReads,
  card,
  cardTitles,
  expensesRoot,
  inOneRow,
  linesIn,
  listTotal,
  phoneDatabaseWithReads,
} from './ledger-expense-list-app';
import {
  NO_RESULTS_HINT,
  chooseSort,
  countView,
  endSearch,
  listCount,
  noResultsTitle,
  sortName,
  sortView,
  typeSearch,
} from './ledger-list-find-app';
import {
  CLEAR_FILTERS,
  NO_MATCHES_HINT,
  NO_MATCHES_TITLE,
  NO_RESULTS_FILTERED_HINT,
  SAVE_FILTER,
  amountField,
  amountTexts,
  capsuleName,
  capsuleOf,
  capsuleOptions,
  capsuleRow,
  capsuleTakesSeveral,
  capsuleTexts,
  capsules,
  capsulesOn,
  choose,
  clearFiltersButton,
  clearInFilters,
  conditionRow,
  filtersAction,
  filtersButton,
  filtersButtonEnabled,
  inFilters,
  inOrder,
  isColor,
  isWhite,
  noMatchesTitle,
  paidByMeCapsule,
  paidByMeCapsuleSelected,
  paidByMeOn,
  paidByMeSwitch,
  pressClearFilters,
  pressInCapsule,
  pressInFilters,
  pressInRow,
  pressPaidByMeCapsule,
  rowOptionNames,
  rowOptions,
  rowTakesSeveral,
  rowView,
  sameColor,
  setAmounts,
  setPaidByMe,
  turnPaidByMe,
  typeAmount,
} from './ledger-list-filter-app';
import {
  choosePeriod,
  chooseRangeDate,
  closeFilters,
  dateRow,
  emptyPeriodTitle,
  expectPeriod,
  filtersOpen,
  filtersRoot,
  openFilters,
  periodName,
  pressPreviousPeriod,
  pressTotal,
  rangeDates,
  showEarlierButton,
  totalButtons,
  totalRead,
} from './ledger-list-period-app';
import {
  addGroupExpense,
  archiveGroup,
  choosePayer,
  groupCardTitles,
  groupLines,
  removeFromGroup,
  renameInGroup,
  startWithGroups,
} from './ledger-group-expense-app';
import {
  NO_EXPENSES,
  expectClosed,
  goBackFrom,
  groupNameField,
  openGroup,
  openRenameGroup,
  pressOnBar,
  screenOf,
} from './group-details-app';
import {
  balanceButtons,
  balanceLines,
  groupTotals,
  showGroup,
} from './group-balances-app';
import {
  deleteByAction,
  moveCategoryExpenses,
  pressUndo,
  restoreFromTrash,
} from './ledger-trash-app';
import { expectInsights, expectTotals, selectedPeriod } from './insights-app';
import { allowWrites, settle } from './shell-appearance-app';
import { tapTab } from './shell-tabs-app';
import { useThemeColors } from '../../src/ui/theme';
import type { Database } from '../../src/storage';

// Runs on iOS. Each test starts the app on a phone database file of its own, in Taipei on
// 2026-10-30, in a region whose currency is USD, and adds its expenses through New Expense. It
// sets the filters in Filters, whose rows it reads and presses as the form's rows are, and on
// the capsules that are system menus through what the list gives them (ledger-list-filter-app).
// Adding an expense that a filter would hide takes the filter off (LEDGER-142.1), so a test adds
// its expenses before it sets a filter, unless that rule is what it is about.

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

const FOOD = 'Food & Dining';

let directory: string;

beforeEach(() => {
  jest.clearAllMocks();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'list-filter-'));
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

interface Spent {
  date?: string;
  amount?: string;
  category?: string;
}

/** Adds a personal expense titled `title`: 8.75 of Food & Dining today unless told otherwise. */
const spend = (
  title: string,
  { date = '2026-10-30', amount = '8.75', category = FOOD }: Spent = {},
) => addExpense({ title, date, amount, category });

/** Adds a personal expense in `currency`, then puts the phone's region back on USD. */
async function spendIn(currency: string, title: string, amount: string) {
  setRegionCurrency(currency);
  await addExpense({ title, amount });
  setRegionCurrency('USD');
}

/** Adds an expense of `group` that Taylor pays: 60.00 split between Taylor and Casey unless told otherwise. */
const groupSpends = (
  group: string,
  title: string,
  {
    date = '2026-10-30',
    amount = '60.00',
    category = FOOD,
    payer = 'Taylor (You)',
    sharers = ['Taylor (You)', 'Casey'],
  }: Spent & { payer?: string; sharers?: string[] } = {},
) => addGroupExpense({ group, payer, sharers, title, date, amount, category });

const brisbaneSpends = (
  title: string,
  input: Parameters<typeof groupSpends>[2] = {},
) => groupSpends('Brisbane', title, input);

/** The screen of Brisbane, on whichever tab shows it. */
const brisbane = () => screenOf('Brisbane');

/** The ID of the stored expense titled `title`. */
async function idOf(title: string) {
  const found = (await storedExpenses()).find(
    (expense) => expense.title === title,
  );
  if (found === undefined) throw new Error(`No expense titled ${title}`);
  return found.id;
}

/** Changes who paid the group expense titled `title`, in its Edit Expense. */
async function changePayer(title: string, payer: string) {
  await openEditExpense(await idOf(title));
  await choosePayer(payer);
  await press('Save');
  await expectFormClosed();
}

/** Renames the group from its Rename Group, then goes back to the Groups root. */
async function renameGroup(from: string, to: string) {
  await tapTab('Groups');
  await openGroup(from);
  await openRenameGroup(from);
  await fireEvent.changeText(groupNameField(), to);
  await pressOnBar('Rename Group', 'Save');
  await expectClosed('Rename Group');
  await goBackFrom(to);
}

/** The theme's colors. Call it before the app starts: a hook's render becomes what `screen` queries. */
const themeColors = async () =>
  (await renderHook(() => useThemeColors())).result.current;

// What each condition lets through

test('[LEDGER-129.1] [LEDGER-31.5] lists only the expenses of the categories chosen', async () => {
  await startExpenses();
  await spend('Coffee run');
  await spend('Shoes', { category: 'Shopping' });
  await spend('Train', { category: 'Travel' });

  await choose('Expenses', 'Category', 'Shopping');
  expect(cardTitles()).toEqual(['Shoes']);

  await choose('Expenses', 'Category', 'Travel');
  expect(cardTitles()).toEqual(['Train', 'Shoes']);
});

test('[LEDGER-129.1] [LEDGER-64.5] counts categories of the same name in different ledgers as one on the expense list', async () => {
  await startWithGroups(BRISBANE);
  await spend('Coffee run');
  await brisbaneSpends('Dinner');
  await brisbaneSpends('Taxi', { category: 'Transportation' });

  await openFilters('Expenses');
  expect(await rowOptionNames('Category')).toEqual([FOOD, 'Transportation']);
  await pressInRow('Category', FOOD);
  await closeFilters();

  expect(cardTitles()).toEqual(['Dinner', 'Coffee run']);
});

test('[LEDGER-129.1] matches an archived category by its name, without (Archived)', async () => {
  await startExpenses();
  await spend('Shoes', { category: 'Shopping' });
  await spend('Coffee run');
  await archiveCategory('Shopping');

  await openFilters('Expenses');
  expect(await rowOptionNames('Category')).toEqual([FOOD, 'Shopping']);
  await pressInRow('Category', 'Shopping');
  await closeFilters();

  expect(cardTitles()).toEqual(['Shoes']);
  expect(linesIn(card('Shoes'))).toContain('Shopping (Archived)');
});

test('[LEDGER-129.1] [LEDGER-64.5] lists only the expenses of the ledgers chosen on the expense list', async () => {
  await startWithGroups({ Brisbane: ['Casey'], Tokyo: ['Casey'] });
  await spend('Coffee run');
  await brisbaneSpends('Dinner');
  await groupSpends('Tokyo', 'Sushi');

  await choose('Expenses', 'Ledger', 'Personal');
  expect(cardTitles()).toEqual(['Coffee run']);

  await choose('Expenses', 'Ledger', 'Tokyo');
  expect(cardTitles()).toEqual(['Sushi', 'Coffee run']);
});

test("[LEDGER-129.1] [GROUPS-61.6] lists only the expenses the payers chosen paid on a group's screen", async () => {
  await startWithGroups(BRISBANE);
  await brisbaneSpends('Dinner');
  await brisbaneSpends('Taxi', { payer: 'Casey' });
  await brisbaneSpends('Hotel', { payer: 'Blake' });
  await showGroup('Brisbane');

  await choose('Brisbane', 'Paid by', 'Casey');
  expect(groupCardTitles('Brisbane')).toEqual(['Taxi']);
  expect(groupLines('Brisbane')).not.toContain(NO_EXPENSES);

  await choose('Brisbane', 'Paid by', 'You');
  expect(groupCardTitles('Brisbane')).toEqual(['Taxi', 'Dinner']);
});

test('[LEDGER-129.1] [LEDGER-64.5] lists only what you paid while Paid by Me is on: personal expenses and the group expenses you paid', async () => {
  await startWithGroups(BRISBANE);
  await spend('Coffee run');
  await brisbaneSpends('Dinner');
  await brisbaneSpends('Taxi', { payer: 'Casey' });
  expect(cardTitles()).toEqual(['Taxi', 'Dinner', 'Coffee run']);

  await turnPaidByMe(true);

  expect(cardTitles()).toEqual(['Dinner', 'Coffee run']);
});

test('[LEDGER-129.1] keeps the expenses whose amount is from Min to Max, both included, and limits one side only when the other is empty', async () => {
  await startExpenses();
  await spend('A', { amount: '8.75' });
  await spend('B', { amount: '10.00' });
  await spend('C', { amount: '50.00' });
  await spend('D', { amount: '50.01' });

  await setAmounts('Expenses', '10', '50');
  expect(cardTitles()).toEqual(['C', 'B']);

  await setAmounts('Expenses', undefined, '');
  expect(cardTitles()).toEqual(['D', 'C', 'B']);

  await setAmounts('Expenses', '', '10');
  expect(cardTitles()).toEqual(['B', 'A']);
});

test('[LEDGER-129.1] compares only the number on the card, whatever its currency', async () => {
  await startExpenses();
  await spendIn('JPY', 'Ramen', '500');
  await spendIn('USD', 'Coffee run', '8.75');
  await spendIn('AUD', 'Gum', '0.30');

  await setAmounts('Expenses', '100');
  expect(cardTitles()).toEqual(['Ramen']);

  await setAmounts('Expenses', '', '8.75');
  expect(cardTitles()).toEqual(['Gum', 'Coffee run']);
});

test("[LEDGER-129.1] compares your share on the expense list and the whole amount on a group's screen", async () => {
  await startWithGroups(BRISBANE);
  await spend('Coffee run');
  await brisbaneSpends('Dinner', {
    payer: 'Casey',
    sharers: ['Taylor (You)', 'Casey', 'Blake'],
  });
  expect(linesIn(card('Dinner'))).toContain('$20.00');

  await setAmounts('Expenses', '50');
  expect(cardTitles()).toEqual([]);

  await setAmounts('Expenses', '20');
  expect(cardTitles()).toEqual(['Dinner']);

  await showGroup('Brisbane');
  await setAmounts('Brisbane', '50');
  expect(groupCardTitles('Brisbane')).toEqual(['Dinner']);
});

test('[LEDGER-129.1] lists nothing while Min is greater than Max', async () => {
  await startExpenses();
  await spend('A', { amount: '8.75' });
  await spend('B', { amount: '50.00' });

  await setAmounts('Expenses', '50', '10');

  expect(cardTitles()).toEqual([]);
});

test('[LEDGER-129.1] lists only the expenses in the currency chosen', async () => {
  await startExpenses();
  await spendIn('JPY', 'Ramen', '500');
  await spendIn('USD', 'Coffee run', '8.75');

  await choose('Expenses', 'Currency', 'JPY');

  expect(cardTitles()).toEqual(['Ramen']);
});

test('[LEDGER-129.1] lists only what meets every condition that is on', async () => {
  await startExpenses();
  await spend('Coffee run');
  await spend('Dinner', { amount: '60.00' });
  await spend('Socks', { amount: '5.00', category: 'Shopping' });

  await choose('Expenses', 'Category', FOOD);
  await setAmounts('Expenses', '', '10');

  expect(cardTitles()).toEqual(['Coffee run']);
});

test('[LEDGER-129.1] [LEDGER-31.5] applies the filter together with the period, and keeps it when the period changes', async () => {
  await startExpenses();
  await spend('Shoes', { date: '2026-10-01', category: 'Shopping' });
  await spend('Hat', { date: '2026-09-30', category: 'Shopping' });
  await spend('Lunch', { date: '2026-10-02' });
  await expectPeriod(expensesRoot, 'October 2026');

  await choose('Expenses', 'Category', 'Shopping');
  expect(cardTitles()).toEqual(['Shoes']);

  await pressPreviousPeriod(expensesRoot());
  expect(periodName(expensesRoot())).toBe('September 2026');
  expect(cardTitles()).toEqual(['Hat']);
  expect(capsuleName(expensesRoot(), 'Category')).toBe('Category, Shopping');
});

test("[LEDGER-129.1] keeps a filter of its own for the expense list and for each group's screen", async () => {
  await startWithGroups(BRISBANE);
  await spend('Shoes', { category: 'Shopping' });
  await brisbaneSpends('Dinner');

  await choose('Expenses', 'Category', 'Shopping');
  await showGroup('Brisbane');

  expect(capsuleRow(brisbane())).toBeUndefined();
  expect(groupCardTitles('Brisbane')).toEqual(['Dinner']);

  await tapTab('Expenses');
  expect(capsuleName(expensesRoot(), 'Category')).toBe('Category, Shopping');
  expect(cardTitles()).toEqual(['Shoes']);
});

// An edit that makes an expense fail the filter

test('[LEDGER-31.5] takes an expense off the expense list once an edit makes it fail the filter, and keeps the filter', async () => {
  await startExpenses();
  await spend('Shoes', { category: 'Shopping' });
  await spend('Hat', { category: 'Shopping' });
  await spend('Coffee run');
  await choose('Expenses', 'Category', 'Shopping');
  expect(cardTitles()).toEqual(['Hat', 'Shoes']);

  await editExpense(await idOf('Shoes'), { category: FOOD });

  expect(cardTitles()).toEqual(['Hat']);
  expect(capsuleName(expensesRoot(), 'Category')).toBe('Category, Shopping');

  await clearInFilters('Expenses');
  expect(cardTitles()).toEqual(['Coffee run', 'Hat', 'Shoes']);
});

test('[LEDGER-64.5] takes a group expense off the expense list once an edit makes it fail the filter, and keeps the filter', async () => {
  await startWithGroups(BRISBANE);
  await spend('Coffee run');
  await brisbaneSpends('Dinner');
  await turnPaidByMe(true);
  expect(cardTitles()).toEqual(['Dinner', 'Coffee run']);

  await changePayer('Dinner', 'Casey');

  expect(cardTitles()).toEqual(['Coffee run']);
  expect(paidByMeCapsuleSelected(expensesRoot())).toBe(true);
});

test("[GROUPS-61.6] takes an expense off a group's screen once an edit makes it fail the filter, and keeps the filter", async () => {
  await startWithGroups(BRISBANE);
  await brisbaneSpends('Dinner');
  await brisbaneSpends('Taxi', { payer: 'Casey' });
  await brisbaneSpends('Hotel', { payer: 'Casey' });
  await showGroup('Brisbane');
  await choose('Brisbane', 'Paid by', 'Casey');
  expect(groupCardTitles('Brisbane')).toEqual(['Hotel', 'Taxi']);

  await changePayer('Taxi', 'Taylor (You)');
  await showGroup('Brisbane');

  expect(groupCardTitles('Brisbane')).toEqual(['Hotel']);
  expect(capsuleTexts(brisbane())).toContain('Paid by Casey');
});

// The options of each condition

test("[LEDGER-130.1] offers the categories the list's expenses use, by name, whatever the period", async () => {
  await startExpenses();
  await spend('Train', { date: '2026-09-12', category: 'Travel' });
  await spend('Shoes', { category: 'Shopping' });
  await spend('Coffee run');
  await expectPeriod(expensesRoot, 'October 2026');

  await openFilters('Expenses');

  expect(await rowOptions('Category')).toEqual([
    [FOOD, false],
    ['Shopping', false],
    ['Travel', false],
  ]);
});

test('[LEDGER-130.1] orders the categories by name without regard to case', async () => {
  await startExpenses();
  await addCategory('apples');
  await addCategory('Zoo');
  await spend('A', { category: 'Zoo' });
  await spend('B', { category: 'apples' });
  await spend('C', { category: 'Shopping' });

  await openFilters('Expenses');

  expect(await rowOptionNames('Category')).toEqual([
    'apples',
    'Shopping',
    'Zoo',
  ]);
});

test('[LEDGER-130.1] offers Personal first, then the groups with an expense that concerns you, by name, archived ones too', async () => {
  await startWithGroups({
    Tokyo: ['Casey'],
    Brisbane: ['Casey'],
    Osaka: ['Casey', 'Blake'],
  });
  await spend('Coffee run');
  await groupSpends('Tokyo', 'Sushi');
  await brisbaneSpends('Dinner');
  await groupSpends('Osaka', 'Bus', { payer: 'Casey', sharers: ['Blake'] });

  await openFilters('Expenses');
  expect(await rowOptionNames('Ledger')).toEqual([
    'Personal',
    'Brisbane',
    'Tokyo',
  ]);
  await closeFilters();

  await archiveGroup('Tokyo');
  await tapTab('Expenses');
  await openFilters('Expenses');
  expect(await rowOptionNames('Ledger')).toEqual([
    'Personal',
    'Brisbane',
    'Tokyo',
  ]);
});

test('[LEDGER-130.1] offers no Personal while the list has no personal expense', async () => {
  await startWithGroups(BRISBANE);
  await brisbaneSpends('Dinner');

  await openFilters('Expenses');

  expect(await rowOptionNames('Ledger')).toEqual(['Brisbane']);
});

test("[LEDGER-130.1] offers You first, then the others who paid one of the group's expenses, by name, a former member too", async () => {
  await startWithGroups({ Brisbane: ['Casey', 'Blake', 'Avery'] });
  await brisbaneSpends('Taxi', { payer: 'Casey' });
  await brisbaneSpends('Dinner');
  await brisbaneSpends('Hotel', { payer: 'Blake' });
  await showGroup('Brisbane');

  await openFilters('Brisbane');
  expect(await rowOptionNames('Paid by')).toEqual(['You', 'Blake', 'Casey']);
  await closeFilters();

  await goBackFrom('Brisbane');
  await removeFromGroup('Brisbane', 'Casey');
  await showGroup('Brisbane');
  await openFilters('Brisbane');
  expect(await rowOptionNames('Paid by')).toEqual(['You', 'Blake', 'Casey']);
});

test("[LEDGER-130.1] offers All and then the currencies the list's expenses use, by code, with All marked while none is chosen", async () => {
  await startExpenses();
  await spendIn('USD', 'Coffee run', '8.75');
  await spendIn('JPY', 'Ramen', '500');
  await spendIn('AUD', 'Gum', '0.30');

  await openFilters('Expenses');

  expect(await rowOptions('Currency')).toEqual([
    ['All', true],
    ['AUD', false],
    ['JPY', false],
    ['USD', false],
  ]);
});

test("[LEDGER-130.1] has no Currency condition while the list's expenses use fewer than two currencies, those in the Trash not counted", async () => {
  await startExpenses();
  await spend('Coffee run');
  await setAmounts('Expenses', '1');

  await openFilters('Expenses');
  expect(conditionRow('Currency')).toBeUndefined();
  await closeFilters();
  expect(capsuleTexts(expensesRoot())).not.toContain('Currency');

  await spendIn('JPY', 'Ramen', '500');
  await openFilters('Expenses');
  expect(conditionRow('Currency')).toBe('Currency, All');
  await closeFilters();
  expect(capsuleTexts(expensesRoot())).toContain('Currency');

  await deleteByAction('Ramen');
  expect(capsuleTexts(expensesRoot())).not.toContain('Currency');
  await openFilters('Expenses');
  expect(conditionRow('Currency')).toBeUndefined();
});

// The rows of Filters

test('[LEDGER-131.1] [LEDGER-109.2] lists the conditions of the expense list in Filters under Date, then Save Current Filter… and Clear Filters', async () => {
  await startWithGroups(BRISBANE);
  await spend('Coffee run');
  await brisbaneSpends('Dinner');

  await openFilters('Expenses');

  expect(dateRow()).toBe('Date, This Month');
  expect(conditionRow('Category')).toBe('Category, Any');
  expect(conditionRow('Ledger')).toBe('Ledger, All');
  expect(paidByMeOn()).toBe(false);
  expect(amountTexts()).toEqual(['', '']);
  expect(conditionRow('Currency')).toBeUndefined();
  expect(conditionRow('Paid by')).toBeUndefined();
  expect(
    inOrder(
      rowView('Date'),
      rowView('Category'),
      rowView('Ledger'),
      paidByMeSwitch(),
      amountField('Lowest amount'),
      amountField('Highest amount'),
      filtersButton(SAVE_FILTER),
      filtersButton(CLEAR_FILTERS),
    ),
  ).toBe(true);
});

test("[LEDGER-131.1] lists Paid by in place of Ledger and Paid by Me in the Filters of a group's screen", async () => {
  await startWithGroups(BRISBANE);
  await brisbaneSpends('Dinner');
  await showGroup('Brisbane');

  await openFilters('Brisbane');

  expect(dateRow()).toBe('Date, All Time');
  expect(conditionRow('Category')).toBe('Category, Any');
  expect(conditionRow('Paid by')).toBe('Paid by, Anyone');
  expect(conditionRow('Ledger')).toBeUndefined();
  expect(paidByMeSwitch()).toBeUndefined();
  expect(
    inOrder(
      rowView('Date'),
      rowView('Category'),
      rowView('Paid by'),
      amountField('Lowest amount'),
      amountField('Highest amount'),
    ),
  ).toBe(true);
});

test('[LEDGER-131.1] puts the Currency row last among the conditions once the list holds two currencies', async () => {
  await startExpenses();
  await spendIn('USD', 'Coffee run', '8.75');
  await spendIn('JPY', 'Ramen', '500');

  await openFilters('Expenses');

  expect(conditionRow('Currency')).toBe('Currency, All');
  expect(
    inOrder(
      amountField('Highest amount'),
      rowView('Currency'),
      filtersButton(SAVE_FILTER),
    ),
  ).toBe(true);
});

test('[LEDGER-131.1] keeps the Category list open at a press, marks what is chosen, names one choice and counts several', async () => {
  await startExpenses();
  await spend('Coffee run');
  await spend('Shoes', { category: 'Shopping' });
  await spend('Train', { category: 'Travel' });
  await openFilters('Expenses');
  expect(rowTakesSeveral('Category')).toBe(true);

  await pressInRow('Category', 'Shopping');
  expect(conditionRow('Category')).toBe('Category, Shopping');
  expect(await rowOptions('Category')).toEqual([
    [FOOD, false],
    ['Shopping', true],
    ['Travel', false],
  ]);
  // The list behind Filters follows at once.
  expect(filtersOpen()).toBe(true);
  expect(linesIn(expensesRoot())).toContain('Shoes');
  expect(linesIn(expensesRoot())).not.toContain('Coffee run');

  await pressInRow('Category', 'Travel');
  expect(conditionRow('Category')).toBe('Category, 2 Categories');

  await pressInRow('Category', 'Shopping');
  expect(conditionRow('Category')).toBe('Category, Travel');
  expect(await rowOptions('Category')).toEqual([
    [FOOD, false],
    ['Shopping', false],
    ['Travel', true],
  ]);
});

test('[LEDGER-131.1] names one ledger and counts several in the Ledger row', async () => {
  await startWithGroups(BRISBANE);
  await spend('Coffee run');
  await brisbaneSpends('Dinner');
  await openFilters('Expenses');
  expect(rowTakesSeveral('Ledger')).toBe(true);

  await pressInRow('Ledger', 'Brisbane');
  expect(conditionRow('Ledger')).toBe('Ledger, Brisbane');

  await pressInRow('Ledger', 'Personal');
  expect(conditionRow('Ledger')).toBe('Ledger, 2 Ledgers');
});

test('[LEDGER-131.1] names one payer and counts several in the Paid by row', async () => {
  await startWithGroups(BRISBANE);
  await brisbaneSpends('Dinner');
  await brisbaneSpends('Taxi', { payer: 'Casey' });
  await showGroup('Brisbane');
  await openFilters('Brisbane');
  expect(rowTakesSeveral('Paid by')).toBe(true);

  await pressInRow('Paid by', 'Casey');
  expect(conditionRow('Paid by')).toBe('Paid by, Casey');

  await pressInRow('Paid by', 'You');
  expect(conditionRow('Paid by')).toBe('Paid by, 2 Payers');

  await pressInRow('Paid by', 'Casey');
  expect(conditionRow('Paid by')).toBe('Paid by, You');
});

test('[LEDGER-131.1] turns Paid by Me on with its switch in Filters, and the list follows at once', async () => {
  await startWithGroups(BRISBANE);
  await spend('Coffee run');
  await brisbaneSpends('Taxi', { payer: 'Casey' });
  await openFilters('Expenses');

  await setPaidByMe(true);

  expect(paidByMeOn()).toBe(true);
  expect(filtersOpen()).toBe(true);
  expect(linesIn(expensesRoot())).toContain('Coffee run');
  expect(linesIn(expensesRoot())).not.toContain('Taxi');
});

test('[LEDGER-131.1] shows the two amount fields with Min and Max as their prompts and a decimal pad', async () => {
  await startExpenses();
  await spend('Coffee run');

  await openFilters('Expenses');

  for (const [name, prompt] of [
    ['Lowest amount', 'Min'],
    ['Highest amount', 'Max'],
  ] as const) {
    expect(amountField(name)?.props.placeholder).toBe(prompt);
    expect(amountField(name)?.props.keyboardType).toBe('decimal-pad');
  }
  expect(linesIn(filtersRoot())).toContain('Amount');
});

test('[LEDGER-131.1] applies each change of an amount field at once, while Filters stays open', async () => {
  await startExpenses();
  await spend('Coffee run');
  await spend('Dinner', { amount: '60.00' });
  await openFilters('Expenses');

  await typeAmount('Lowest amount', '1');
  expect(linesIn(expensesRoot())).toEqual(
    expect.arrayContaining(['Coffee run', 'Dinner']),
  );

  await typeAmount('Lowest amount', '10');
  expect(filtersOpen()).toBe(true);
  expect(linesIn(expensesRoot())).toContain('Dinner');
  expect(linesIn(expensesRoot())).not.toContain('Coffee run');
});

test('[LEDGER-131.1] reads full-width digits and a comma in an amount field as the amount field of the form does', async () => {
  await startExpenses();
  await spend('A', { amount: '12.00' });
  await spend('B', { amount: '13.00' });

  await setAmounts('Expenses', '１２，５');

  expect(cardTitles()).toEqual(['B']);
  expect(capsuleTexts(expensesRoot())).toContain('12.5 or more');
});

test.each(['1.2.3', '.', 'abc', '-5', ' '])(
  '[LEDGER-131.1] takes an amount field that holds %p for no number, so no filter is on',
  async (text) => {
    await startExpenses();
    await spend('A', { amount: '1.00' });
    await spend('B', { amount: '13.00' });
    await setAmounts('Expenses', '5');
    expect(cardTitles()).toEqual(['B']);

    await setAmounts('Expenses', text);

    expect(cardTitles()).toEqual(['B', 'A']);
    expect(capsuleRow(expensesRoot())).toBeUndefined();
  },
);

test('[LEDGER-131.1] takes a number with or without digits on either side of its point', async () => {
  await startExpenses();
  await spend('A', { amount: '0.40' });
  await spend('B', { amount: '0.60' });
  await spend('C', { amount: '13.00' });

  await setAmounts('Expenses', '.5', '13.');

  expect(cardTitles()).toEqual(['C', 'B']);
});

test('[LEDGER-131.1] chooses one currency at a time in the Currency row, and All for none', async () => {
  await startExpenses();
  await spendIn('USD', 'Coffee run', '8.75');
  await spendIn('JPY', 'Ramen', '500');
  await openFilters('Expenses');
  expect(rowTakesSeveral('Currency')).toBe(false);

  await pressInRow('Currency', 'JPY');
  expect(conditionRow('Currency')).toBe('Currency, JPY');
  expect(await rowOptions('Currency')).toEqual([
    ['All', false],
    ['JPY', true],
    ['USD', false],
  ]);

  await pressInRow('Currency', 'USD');
  expect(conditionRow('Currency')).toBe('Currency, USD');
  expect(await rowOptions('Currency')).toEqual([
    ['All', false],
    ['JPY', false],
    ['USD', true],
  ]);

  await pressInRow('Currency', 'All');
  expect(conditionRow('Currency')).toBe('Currency, All');
  await closeFilters();
  expect(cardTitles()).toEqual(['Ramen', 'Coffee run']);
  expect(capsuleRow(expensesRoot())).toBeUndefined();
});

// The Filters action in the title bar

test('[LEDGER-132.1] [SHELL-72.2] draws the Filters action in the accent color and reads it as Filters, on while the list has a filter', async () => {
  const { accent } = await themeColors();
  await startExpenses();
  await spend('Coffee run');
  expect(filtersAction('Expenses').name).toBe('Filters');
  expect(isColor(filtersAction('Expenses').tint, accent)).toBe(false);

  await setAmounts('Expenses', '1');
  expect(filtersAction('Expenses').name).toBe('Filters, on');
  expect(isColor(filtersAction('Expenses').tint, accent)).toBe(true);

  await clearInFilters('Expenses');
  expect(filtersAction('Expenses').name).toBe('Filters');
  expect(isColor(filtersAction('Expenses').tint, accent)).toBe(false);
});

test('[LEDGER-132.1] leaves the Filters action as it is for a period, an order and a search', async () => {
  const { accent } = await themeColors();
  await startExpenses();
  await spend('Coffee run');

  await choosePeriod('Expenses', 'All Time');
  await chooseSort(expensesRoot(), 'Oldest First');
  await typeSearch('Expenses', 'coffee');

  expect(filtersAction('Expenses').name).toBe('Filters');
  expect(isColor(filtersAction('Expenses').tint, accent)).toBe(false);
  // Guards the check above: the list does show its sort button, so the screen is the new one.
  expect(sortName(expensesRoot())).toBe('Sort By, Oldest First');
});

test('[LEDGER-132.1] [LEDGER-109.2] opens Filters from the action while it reads Filters, on', async () => {
  await startExpenses();
  await spend('Coffee run');
  await setAmounts('Expenses', '1');
  expect(filtersAction('Expenses').name).toBe('Filters, on');

  await openFilters('Expenses');

  expect(amountTexts()).toEqual(['1', '']);
});

test('[LEDGER-132.1] marks the action of the screen that has the filter, and not that of another screen', async () => {
  await startWithGroups(BRISBANE);
  await spend('Coffee run');
  await brisbaneSpends('Dinner');
  await setAmounts('Expenses', '1');

  await showGroup('Brisbane');
  expect(filtersAction('Brisbane').name).toBe('Filters');

  await setAmounts('Brisbane', '1');
  expect(filtersAction('Brisbane').name).toBe('Filters, on');
});

// The capsule row

test('[LEDGER-133.1] shows no capsule row while the list has no filter', async () => {
  await startExpenses();
  await spend('Coffee run');

  expect(capsuleRow(expensesRoot())).toBeUndefined();
  // Guards the check above: the list is the one that has a sort button.
  expect(sortName(expensesRoot())).toBe('Sort By, Newest First');
});

test('[LEDGER-133.1] shows a capsule per condition under the total and above the sort button, with the ones that are on in the accent color and white text', async () => {
  const { accent, text } = await themeColors();
  await startWithGroups(BRISBANE);
  await spend('Coffee run');
  await brisbaneSpends('Dinner');

  await turnPaidByMe(true);

  const shown = capsules(expensesRoot());
  expect(shown.map((capsule) => capsule.text)).toEqual([
    'Category',
    'Ledger',
    'Paid by Me',
    'Amount',
  ]);
  expect(capsulesOn(expensesRoot(), accent)).toEqual(['Paid by Me']);
  expect(isWhite(shown[2].ink)).toBe(true);
  for (const off of [shown[0], shown[1], shown[3]]) {
    expect(off.fill).toBeDefined();
    expect(off.fill).toEqual(shown[0].fill);
    expect(sameColor(off.fill, accent)).toBe(false);
    expect(off.ink).toEqual(text);
  }
  expect(paidByMeCapsuleSelected(expensesRoot())).toBe(true);
  expect(capsuleName(expensesRoot(), 'Category')).toBe('Category');
  expect(capsuleName(expensesRoot(), 'Ledger')).toBe('Ledger');
  expect(
    inOrder(
      totalButtons(expensesRoot())[0],
      capsuleRow(expensesRoot()),
      sortView(expensesRoot()),
    ),
  ).toBe(true);
});

test('[LEDGER-133.1] shows the category chosen on the Category capsule, or how many, and keeps the capsule first', async () => {
  const { accent } = await themeColors();
  await startExpenses();
  await spend('Coffee run');
  await spend('Shoes', { category: 'Shopping' });
  await spend('Train', { category: 'Travel' });

  await choose('Expenses', 'Category', 'Shopping');
  expect(capsuleTexts(expensesRoot())[0]).toBe('Shopping');
  expect(capsuleTexts(expensesRoot()).slice(1)).toEqual(
    expect.arrayContaining(['Ledger', 'Amount']),
  );
  expect(capsulesOn(expensesRoot(), accent)).toEqual(['Shopping']);
  expect(capsuleName(expensesRoot(), 'Category')).toBe('Category, Shopping');

  await choose('Expenses', 'Category', 'Travel');
  expect(capsuleTexts(expensesRoot())[0]).toBe('2 Categories');
  expect(capsuleName(expensesRoot(), 'Category')).toBe(
    'Category, 2 Categories',
  );
});

test('[LEDGER-133.1] shows the ledger chosen on the Ledger capsule, or how many', async () => {
  await startWithGroups(BRISBANE);
  await spend('Coffee run');
  await brisbaneSpends('Dinner');

  await choose('Expenses', 'Ledger', 'Brisbane');
  expect(capsuleTexts(expensesRoot())[1]).toBe('Brisbane');
  expect(capsuleName(expensesRoot(), 'Ledger')).toBe('Ledger, Brisbane');

  await choose('Expenses', 'Ledger', 'Personal');
  expect(capsuleTexts(expensesRoot())[1]).toBe('2 Ledgers');
  expect(capsuleName(expensesRoot(), 'Ledger')).toBe('Ledger, 2 Ledgers');
});

test('[LEDGER-133.1] shows the amounts on the Amount capsule: both, the lowest alone, or the highest alone', async () => {
  const { accent } = await themeColors();
  await startExpenses();
  await spend('Coffee run');

  await setAmounts('Expenses', '10', '50');
  expect(capsuleOf(expensesRoot(), 'Amount')).toBe('10 – 50');
  expect(capsuleTexts(expensesRoot()).at(-1)).toBe('10 – 50');
  expect(capsulesOn(expensesRoot(), accent)).toEqual(['10 – 50']);

  await setAmounts('Expenses', undefined, '');
  expect(capsuleOf(expensesRoot(), 'Amount')).toBe('10 or more');

  await setAmounts('Expenses', '', '50');
  expect(capsuleOf(expensesRoot(), 'Amount')).toBe('50 or less');
});

test('[LEDGER-133.1] [LEDGER-130.1] shows the Currency capsule last, with the code chosen, and hides the row when All is chosen again', async () => {
  const { accent } = await themeColors();
  await startExpenses();
  await spendIn('USD', 'Coffee run', '8.75');
  await spendIn('JPY', 'Ramen', '500');

  await choose('Expenses', 'Currency', 'JPY');
  expect(capsuleTexts(expensesRoot())).toEqual([
    'Category',
    'Ledger',
    'Paid by Me',
    'Amount',
    'JPY',
  ]);
  expect(capsulesOn(expensesRoot(), accent)).toEqual(['JPY']);
  expect(capsuleName(expensesRoot(), 'Currency')).toBe('Currency, JPY');

  await choose('Expenses', 'Currency', 'All');
  expect(capsuleRow(expensesRoot())).toBeUndefined();
});

test("[LEDGER-133.1] [GROUPS-69.4] shows the capsule row of a group's screen under your net balance, with Paid by in place of Ledger and Paid by Me", async () => {
  await startWithGroups(BRISBANE);
  await brisbaneSpends('Dinner');
  await brisbaneSpends('Taxi', { payer: 'Casey' });
  await showGroup('Brisbane');

  await choose('Brisbane', 'Paid by', 'Casey');
  expect(capsuleTexts(brisbane())).toEqual([
    'Category',
    'Paid by Casey',
    'Amount',
  ]);
  expect(capsuleName(brisbane(), 'Paid by')).toBe('Paid by, Casey');
  expect(paidByMeCapsule(brisbane())).toBeUndefined();
  expect(
    inOrder(
      balanceButtons('Brisbane')[0],
      capsuleRow(brisbane()),
      sortView(brisbane()),
    ),
  ).toBe(true);

  await choose('Brisbane', 'Paid by', 'You');
  expect(capsuleTexts(brisbane())[1]).toBe('2 Payers');
  expect(capsuleName(brisbane(), 'Paid by')).toBe('Paid by, 2 Payers');

  await choose('Brisbane', 'Paid by', 'Casey');
  expect(capsuleTexts(brisbane())[1]).toBe('Paid by You');
  expect(capsuleName(brisbane(), 'Paid by')).toBe('Paid by, You');
});

test('[LEDGER-133.1] turns Paid by Me off and on at a press on its capsule, which stays in its place', async () => {
  const { accent } = await themeColors();
  await startWithGroups(BRISBANE);
  await spend('Shoes', { category: 'Shopping' });
  await brisbaneSpends('Hat', { payer: 'Casey', category: 'Shopping' });
  await spend('Coffee run');
  await turnPaidByMe(true);
  await choose('Expenses', 'Category', 'Shopping');
  expect(cardTitles()).toEqual(['Shoes']);

  await pressPaidByMeCapsule(expensesRoot());
  expect(cardTitles()).toEqual(['Hat', 'Shoes']);
  expect(capsuleTexts(expensesRoot())).toEqual([
    'Shopping',
    'Ledger',
    'Paid by Me',
    'Amount',
  ]);
  expect(capsulesOn(expensesRoot(), accent)).toEqual(['Shopping']);
  expect(paidByMeCapsuleSelected(expensesRoot())).toBe(false);

  await pressPaidByMeCapsule(expensesRoot());
  expect(cardTitles()).toEqual(['Shoes']);
  expect(capsulesOn(expensesRoot(), accent)).toEqual([
    'Shopping',
    'Paid by Me',
  ]);
});

test('[LEDGER-133.1] hides the capsule row once the last condition is taken off', async () => {
  await startWithGroups(BRISBANE);
  await spend('Coffee run');
  await brisbaneSpends('Taxi', { payer: 'Casey' });
  await turnPaidByMe(true);
  expect(cardTitles()).toEqual(['Coffee run']);

  await pressPaidByMeCapsule(expensesRoot());

  expect(capsuleRow(expensesRoot())).toBeUndefined();
  expect(cardTitles()).toEqual(['Taxi', 'Coffee run']);
});

test('[LEDGER-133.1] hides the capsule row once the amount fields are emptied', async () => {
  await startExpenses();
  await spend('Coffee run');
  await setAmounts('Expenses', '1', '90');
  expect(capsuleOf(expensesRoot(), 'Amount')).toBe('1 – 90');

  await setAmounts('Expenses', '');
  expect(capsuleOf(expensesRoot(), 'Amount')).toBe('90 or less');

  await setAmounts('Expenses', undefined, '');
  expect(capsuleRow(expensesRoot())).toBeUndefined();
  expect(cardTitles()).toEqual(['Coffee run']);
});

test('[LEDGER-133.1] changes Category, Ledger and Currency from the menus of their capsules on iOS, several choices for the first two and one for Currency', async () => {
  await startWithGroups(BRISBANE);
  await spendIn('USD', 'Coffee run', '8.75');
  await spendIn('JPY', 'Ramen', '500');
  await brisbaneSpends('Shoes', { category: 'Shopping' });
  await turnPaidByMe(true);
  expect(capsuleTakesSeveral(expensesRoot(), 'Category')).toBe(true);
  expect(capsuleTakesSeveral(expensesRoot(), 'Ledger')).toBe(true);
  expect(capsuleTakesSeveral(expensesRoot(), 'Currency')).toBe(false);
  expect(capsuleOptions(expensesRoot(), 'Category')).toEqual([
    [FOOD, false],
    ['Shopping', false],
  ]);
  expect(capsuleOptions(expensesRoot(), 'Ledger')).toEqual([
    ['Personal', false],
    ['Brisbane', false],
  ]);
  expect(capsuleOptions(expensesRoot(), 'Currency')).toEqual([
    ['All', true],
    ['JPY', false],
    ['USD', false],
  ]);

  await pressInCapsule(expensesRoot, 'Category', 'Shopping');
  expect(cardTitles()).toEqual(['Shoes']);
  expect(capsuleOptions(expensesRoot(), 'Category')).toEqual([
    [FOOD, false],
    ['Shopping', true],
  ]);
  expect(capsuleName(expensesRoot(), 'Category')).toBe('Category, Shopping');

  await pressInCapsule(expensesRoot, 'Category', 'Shopping');
  await pressInCapsule(expensesRoot, 'Ledger', 'Personal');
  expect(cardTitles()).toEqual(['Ramen', 'Coffee run']);

  await pressInCapsule(expensesRoot, 'Currency', 'JPY');
  expect(cardTitles()).toEqual(['Ramen']);
  expect(capsuleOptions(expensesRoot(), 'Currency')).toEqual([
    ['All', false],
    ['JPY', true],
    ['USD', false],
  ]);

  // What a capsule's menu changed is what Filters shows.
  await openFilters('Expenses');
  expect(conditionRow('Ledger')).toBe('Ledger, Personal');
  expect(conditionRow('Currency')).toBe('Currency, JPY');
});

test("[LEDGER-133.1] changes Paid by from the menu of its capsule on a group's screen on iOS", async () => {
  await startWithGroups(BRISBANE);
  await brisbaneSpends('Dinner');
  await brisbaneSpends('Taxi', { payer: 'Casey' });
  await showGroup('Brisbane');
  await setAmounts('Brisbane', '1');
  expect(capsuleOptions(brisbane(), 'Paid by')).toEqual([
    ['You', false],
    ['Casey', false],
  ]);

  await pressInCapsule(brisbane, 'Paid by', 'Casey');

  expect(groupCardTitles('Brisbane')).toEqual(['Taxi']);
  expect(capsuleTexts(brisbane())).toEqual([
    'Category',
    'Paid by Casey',
    '1 or more',
  ]);
});

test('[LEDGER-133.1] [LEDGER-126.2] keeps the capsule row on top during a search, above the count and the sort button', async () => {
  await startExpenses();
  await spend('Shoes', { category: 'Shopping' });
  await spend('Coffee run');
  await choose('Expenses', 'Category', 'Shopping');

  await typeSearch('Expenses', 'shoes');

  expect(capsuleTexts(expensesRoot())[0]).toBe('Shopping');
  expect(periodName(expensesRoot())).toBeUndefined();
  expect(totalButtons(expensesRoot())).toEqual([]);
  expect(listCount(expensesRoot())).toBe('1 item');
  expect(
    inOrder(
      capsuleRow(expensesRoot()),
      countView(expensesRoot()),
      sortView(expensesRoot()),
    ),
  ).toBe(true);
});

// The count on the line above the cards

test('[LEDGER-137.1] [LEDGER-122.1] shows how many expenses the filter leaves, at the left of the sort button, and no count without a filter', async () => {
  await startExpenses();
  await spend('Shoes', { category: 'Shopping' });
  await spend('Hat', { category: 'Shopping' });
  await spend('Coffee run');
  expect(listCount(expensesRoot())).toBeUndefined();

  await choose('Expenses', 'Category', 'Shopping');
  expect(listCount(expensesRoot())).toBe('2 items');
  expect(inOneRow(countView(expensesRoot())!, sortView(expensesRoot())!)).toBe(
    true,
  );
  expect(
    inOrder(
      capsuleRow(expensesRoot()),
      countView(expensesRoot()),
      sortView(expensesRoot()),
    ),
  ).toBe(true);

  await deleteByAction('Hat');
  expect(listCount(expensesRoot())).toBe('1 item');

  await clearInFilters('Expenses');
  expect(listCount(expensesRoot())).toBeUndefined();
  expect(sortName(expensesRoot())).toBe('Sort By, Newest First');
});

test('[LEDGER-137.1] [LEDGER-35.6] counts the expenses of the period that pass, and shows their sum on All Time in place of the count of expenses', async () => {
  await startExpenses();
  await spend('Shoes', { date: '2026-10-01', category: 'Shopping' });
  await spend('Hat', { date: '2026-09-30', category: 'Shopping' });
  await spend('Lunch', { date: '2026-10-02' });
  await choose('Expenses', 'Category', 'Shopping');
  expect(listCount(expensesRoot())).toBe('1 item');
  expect(listTotal()).toEqual(['$8.75']);

  await choosePeriod('Expenses', 'All Time');

  expect(listCount(expensesRoot())).toBe('2 items');
  expect(listTotal()).toEqual(['$17.50']);
  expect(totalRead(expensesRoot())).toEqual([
    'View expense insights. Spent in All Time $17.50.',
  ]);

  await clearInFilters('Expenses');
  expect(listTotal()).toEqual(['3 expenses']);
  expect(listCount(expensesRoot())).toBeUndefined();
});

test("[LEDGER-137.1] counts the expenses the filter leaves on a group's screen", async () => {
  await startWithGroups(BRISBANE);
  await brisbaneSpends('Dinner');
  await brisbaneSpends('Taxi', { payer: 'Casey' });
  await brisbaneSpends('Hotel', { payer: 'Casey' });
  await showGroup('Brisbane');

  await choose('Brisbane', 'Paid by', 'Casey');

  expect(listCount(brisbane())).toBe('2 items');
  expect(inOneRow(countView(brisbane())!, sortView(brisbane())!)).toBe(true);
});

// A filter that leaves no expense

test('[LEDGER-138.1] [LEDGER-35.6] says the expenses are still there when the filter leaves none, with Clear Filters under it', async () => {
  await startExpenses();
  await spend('Coffee run');

  await setAmounts('Expenses', '100');

  expect(cardTitles()).toEqual([]);
  expect(noMatchesTitle(expensesRoot())).toBe(NO_MATCHES_TITLE);
  expect(linesIn(expensesRoot())).toContain(NO_MATCHES_HINT);
  expect(clearFiltersButton(expensesRoot())).toBeDefined();
  expect(sortView(expensesRoot())).toBeUndefined();
  expect(listCount(expensesRoot())).toBeUndefined();
  expect(listTotal()).toEqual(['—']);
  expect(totalRead(expensesRoot())).toEqual([
    'View expense insights. Nothing spent in October 2026.',
  ]);
  expect(capsuleOf(expensesRoot(), 'Amount')).toBe('100 or more');
  expect(
    inOrder(
      totalButtons(expensesRoot())[0],
      capsuleRow(expensesRoot()),
      clearFiltersButton(expensesRoot()),
    ),
  ).toBe(true);

  await pressClearFilters(expensesRoot());

  expect(noMatchesTitle(expensesRoot())).toBeUndefined();
  expect(capsuleRow(expensesRoot())).toBeUndefined();
  expect(cardTitles()).toEqual(['Coffee run']);
  expect(periodName(expensesRoot())).toBe('October 2026');
});

test("[LEDGER-138.1] [LEDGER-116.3] shows the filter's notice, not the empty period's, while a filter is on, and the empty period's once it is cleared", async () => {
  await startExpenses();
  await spend('Lunch', { date: '2026-08-15' });
  await choosePeriod('Expenses', 'This Month');
  expect(emptyPeriodTitle(expensesRoot())).toBe('No Expenses in October 2026');

  await setAmounts('Expenses', '1');

  expect(noMatchesTitle(expensesRoot())).toBe(NO_MATCHES_TITLE);
  expect(emptyPeriodTitle(expensesRoot())).toBeUndefined();
  expect(showEarlierButton(expensesRoot())).toBeUndefined();

  await pressClearFilters(expensesRoot());

  expect(noMatchesTitle(expensesRoot())).toBeUndefined();
  expect(emptyPeriodTitle(expensesRoot())).toBe('No Expenses in October 2026');
  expect(showEarlierButton(expensesRoot())).toBeDefined();
});

test('[LEDGER-138.1] [LEDGER-35.6] shows the notice and a dash for the total on All Time as well', async () => {
  await startExpenses();
  await spend('Coffee run');
  await choosePeriod('Expenses', 'All Time');

  await setAmounts('Expenses', '100');

  expect(noMatchesTitle(expensesRoot())).toBe(NO_MATCHES_TITLE);
  expect(listTotal()).toEqual(['—']);
  expect(totalRead(expensesRoot())).toEqual([
    'View expense insights. Nothing spent in All Time.',
  ]);
});

test("[LEDGER-138.1] [GROUPS-68.6] [GROUPS-69.4] shows the notice on a group's screen under the total, your net balance and the capsule row", async () => {
  await startWithGroups(BRISBANE);
  await brisbaneSpends('Dinner', {
    sharers: ['Taylor (You)', 'Casey', 'Blake'],
  });
  await showGroup('Brisbane');

  await setAmounts('Brisbane', '100');

  expect(groupCardTitles('Brisbane')).toEqual([]);
  expect(periodName(brisbane())).toBe('Group Total');
  expect(groupTotals('Brisbane')).toEqual(['Group Total: nothing']);
  expect(balanceLines('Brisbane')).toEqual(["You're owed: $40.00"]);
  expect(noMatchesTitle(brisbane())).toBe(NO_MATCHES_TITLE);
  expect(groupLines('Brisbane')).toContain(NO_MATCHES_HINT);
  expect(groupLines('Brisbane')).not.toContain(NO_EXPENSES);
  expect(
    inOrder(
      balanceButtons('Brisbane')[0],
      capsuleRow(brisbane()),
      clearFiltersButton(brisbane()),
    ),
  ).toBe(true);

  await pressClearFilters(brisbane());
  expect(groupCardTitles('Brisbane')).toEqual(['Dinner']);
  expect(groupTotals('Brisbane')).toEqual(['Group Total: $60.00']);
});

test('[LEDGER-138.1] keeps the usual words of a list with no expense at all while a filter is on', async () => {
  await startExpenses();

  await setAmounts('Expenses', '1');

  expect(linesIn(expensesRoot())).toContain(EMPTY_LIST);
  expect(noMatchesTitle(expensesRoot())).toBeUndefined();
  expect(clearFiltersButton(expensesRoot())).toBeUndefined();
  expect(capsuleOf(expensesRoot(), 'Amount')).toBe('1 or more');
});

// The total above the cards

test('[LEDGER-35.6] totals only the cards the filter leaves, and reads that total for a screen reader', async () => {
  await startExpenses();
  await spend('Coffee run');
  await spend('Shoes', { amount: '12.50', category: 'Shopping' });
  expect(listTotal()).toEqual(['$21.25']);

  await choose('Expenses', 'Category', 'Shopping');

  expect(listTotal()).toEqual(['$12.50']);
  expect(totalRead(expensesRoot())).toEqual([
    'View expense insights. Spent in October 2026 $12.50.',
  ]);
});

test('[LEDGER-35.6] opens Insights on the whole period while a filter is on', async () => {
  await startExpenses();
  await spend('Coffee run');
  await spend('Shoes', { amount: '12.50', category: 'Shopping' });
  await choose('Expenses', 'Category', 'Shopping');
  expect(listTotal()).toEqual(['$12.50']);

  await pressTotal(expensesRoot());
  await expectInsights();

  expect(selectedPeriod()).toBe('October 2026');
  await expectTotals(['$21.25']);
});

test("[GROUPS-68.6] totals only the cards the filter leaves on a group's screen, under the same period name", async () => {
  await startWithGroups(BRISBANE);
  await brisbaneSpends('Dinner', { amount: '100.01' });
  await brisbaneSpends('Taxi', { amount: '25.00', payer: 'Casey' });
  await showGroup('Brisbane');
  expect(groupTotals('Brisbane')).toEqual(['Group Total: $125.01']);

  await choose('Brisbane', 'Paid by', 'Casey');

  expect(periodName(brisbane())).toBe('Group Total');
  expect(groupTotals('Brisbane')).toEqual(['Group Total: $25.00']);
});

test('[GROUPS-69.4] keeps your net balance that of every expense of the group while a filter is on', async () => {
  await startWithGroups(BRISBANE);
  await brisbaneSpends('Dinner', {
    sharers: ['Taylor (You)', 'Casey', 'Blake'],
  });
  await brisbaneSpends('Taxi', {
    amount: '25.00',
    payer: 'Casey',
    sharers: ['Blake'],
  });
  await showGroup('Brisbane');
  expect(balanceLines('Brisbane')).toEqual(["You're owed: $40.00"]);

  await choose('Brisbane', 'Paid by', 'Casey');

  expect(groupTotals('Brisbane')).toEqual(['Group Total: $25.00']);
  expect(balanceLines('Brisbane')).toEqual(["You're owed: $40.00"]);
});

// Clear Filters

test('[LEDGER-139.1] disables Clear Filters and Save Current Filter… in Filters while the list has no filter', async () => {
  await startExpenses();
  await spend('Coffee run');

  await openFilters('Expenses');

  expect(filtersButton(CLEAR_FILTERS)).toBeDefined();
  expect(filtersButtonEnabled(CLEAR_FILTERS)).toBe(false);
  expect(filtersButtonEnabled(SAVE_FILTER)).toBe(false);

  await typeAmount('Lowest amount', '1');
  expect(filtersButtonEnabled(CLEAR_FILTERS)).toBe(true);
  expect(filtersButtonEnabled(SAVE_FILTER)).toBe(true);
});

test('[LEDGER-139.1] [LEDGER-124.1] takes off every condition and keeps the period, the order and Filters open', async () => {
  await startWithGroups(BRISBANE);
  await spend('Shoes', {
    date: '2026-09-12',
    amount: '20.00',
    category: 'Shopping',
  });
  await spend('Coffee run', { date: '2026-09-13' });
  await brisbaneSpends('Dinner', { date: '2026-09-14' });
  await choosePeriod('Expenses', 'Last Month');
  await chooseSort(expensesRoot(), 'Oldest First');
  await choose('Expenses', 'Category', 'Shopping');
  await choose('Expenses', 'Ledger', 'Personal');
  await setAmounts('Expenses', '10', '90');
  await turnPaidByMe(true);
  expect(cardTitles()).toEqual(['Shoes']);

  await openFilters('Expenses');
  await pressInFilters(CLEAR_FILTERS);

  expect(filtersOpen()).toBe(true);
  expect(dateRow()).toBe('Date, Last Month');
  expect(conditionRow('Category')).toBe('Category, Any');
  expect(conditionRow('Ledger')).toBe('Ledger, All');
  expect(paidByMeOn()).toBe(false);
  expect(amountTexts()).toEqual(['', '']);
  expect(filtersButtonEnabled(CLEAR_FILTERS)).toBe(false);

  await closeFilters();
  expect(capsuleRow(expensesRoot())).toBeUndefined();
  expect(periodName(expensesRoot())).toBe('September 2026');
  expect(sortName(expensesRoot())).toBe('Sort By, Oldest First');
  expect(cardTitles()).toEqual(['Shoes', 'Coffee run', 'Dinner']);
});

test('[LEDGER-139.1] keeps the dates of a custom range', async () => {
  await startExpenses();
  await spend('Coffee run', { date: '2026-09-12' });
  await choosePeriod('Expenses', 'Custom Range');
  await chooseRangeDate(expensesRoot(), 'From', '2026-09-10');
  await chooseRangeDate(expensesRoot(), 'To', '2026-09-20');
  await setAmounts('Expenses', '1');

  await clearInFilters('Expenses');

  expect(periodName(expensesRoot())).toBe('Custom Range');
  expect(rangeDates(expensesRoot())).toMatchObject({
    from: '2026-09-10',
    to: '2026-09-20',
  });
  expect(capsuleRow(expensesRoot())).toBeUndefined();
});

test("[LEDGER-139.1] clears the filter of a group's screen only, and keeps its order", async () => {
  await startWithGroups(BRISBANE);
  await spend('Coffee run');
  await brisbaneSpends('Dinner');
  await brisbaneSpends('Taxi', { amount: '25.00', payer: 'Casey' });
  await setAmounts('Expenses', '1');
  await showGroup('Brisbane');
  await chooseSort(brisbane(), 'Highest Amount');
  await choose('Brisbane', 'Paid by', 'Casey');

  await openFilters('Brisbane');
  await pressInFilters(CLEAR_FILTERS);
  expect(conditionRow('Paid by')).toBe('Paid by, Anyone');
  await closeFilters();

  expect(sortName(brisbane())).toBe('Sort By, Highest Amount');
  expect(groupCardTitles('Brisbane')).toEqual(['Dinner', 'Taxi']);

  await tapTab('Expenses');
  expect(capsuleOf(expensesRoot(), 'Amount')).toBe('1 or more');
});

// Remembering the filter of each list

test('[LEDGER-140.1] keeps the filter of the expense list over a restart, and not its period', async () => {
  const app = await startExpenses();
  await spend('Shoes', {
    date: '2026-09-12',
    amount: '20.00',
    category: 'Shopping',
  });
  await spend('Hat', { amount: '30.00', category: 'Shopping' });
  await spend('Socks', { amount: '5.00', category: 'Shopping' });
  await spend('Coffee run', { amount: '40.00' });
  await choose('Expenses', 'Category', 'Shopping');
  await setAmounts('Expenses', '10');
  await choosePeriod('Expenses', 'Last Month');
  expect(cardTitles()).toEqual(['Shoes']);

  await restart(app);

  expect(periodName(expensesRoot())).toBe('October 2026');
  expect(capsuleOf(expensesRoot(), 'Category')).toBe('Shopping');
  expect(capsuleOf(expensesRoot(), 'Amount')).toBe('10 or more');
  expect(cardTitles()).toEqual(['Hat']);
  expect(filtersAction('Expenses').name).toBe('Filters, on');

  await openFilters('Expenses');
  expect(conditionRow('Category')).toBe('Category, Shopping');
  expect(amountTexts()).toEqual(['10', '']);
});

test('[LEDGER-140.1] keeps Paid by Me and the currency chosen over a restart', async () => {
  const app = await startExpenses();
  await spendIn('USD', 'Coffee run', '8.75');
  await spendIn('JPY', 'Ramen', '500');
  await turnPaidByMe(true);
  await choose('Expenses', 'Currency', 'JPY');

  await restart(app);

  expect(paidByMeCapsuleSelected(expensesRoot())).toBe(true);
  expect(capsuleName(expensesRoot(), 'Currency')).toBe('Currency, JPY');
  expect(cardTitles()).toEqual(['Ramen']);
});

test("[LEDGER-140.1] keeps the filter of a group's screen when it is opened again and over a restart, each list its own", async () => {
  const app = await startWithGroups({
    Brisbane: ['Casey', 'Blake'],
    Tokyo: ['Casey'],
  });
  await spend('Coffee run');
  await brisbaneSpends('Dinner');
  await brisbaneSpends('Taxi', { payer: 'Casey' });
  await groupSpends('Tokyo', 'Sushi', { payer: 'Casey' });
  await showGroup('Brisbane');
  await choose('Brisbane', 'Paid by', 'Casey');
  await choosePeriod('Brisbane', 'This Month');

  await goBackFrom('Brisbane');
  await showGroup('Brisbane');
  expect(capsuleTexts(brisbane())).toContain('Paid by Casey');
  expect(periodName(brisbane())).toBe('Group Total');
  expect(groupCardTitles('Brisbane')).toEqual(['Taxi']);

  await goBackFrom('Brisbane');
  await showGroup('Tokyo');
  expect(capsuleRow(screenOf('Tokyo'))).toBeUndefined();
  await tapTab('Expenses');
  expect(capsuleRow(expensesRoot())).toBeUndefined();

  await restart(app);
  await showGroup('Brisbane');
  expect(capsuleTexts(brisbane())).toContain('Paid by Casey');
  expect(groupCardTitles('Brisbane')).toEqual(['Taxi']);
});

// A choice that is no longer an option

test('[LEDGER-141.1] drops a category from the filter once it is renamed, and does not bring it back when the name returns', async () => {
  await startExpenses();
  await spend('Shoes', { category: 'Shopping' });
  await spend('Coffee run');
  await choose('Expenses', 'Category', 'Shopping');
  expect(cardTitles()).toEqual(['Shoes']);

  await editCategory('Shopping', 'Groceries');

  expect(capsuleRow(expensesRoot())).toBeUndefined();
  expect(cardTitles()).toEqual(['Coffee run', 'Shoes']);
  expect(filtersAction('Expenses').name).toBe('Filters');
  await openFilters('Expenses');
  expect(await rowOptions('Category')).toEqual([
    [FOOD, false],
    ['Groceries', false],
  ]);
  await closeFilters();

  await editCategory('Groceries', 'Shopping');

  expect(capsuleRow(expensesRoot())).toBeUndefined();
  expect(cardTitles()).toEqual(['Coffee run', 'Shoes']);
});

test('[LEDGER-141.1] keeps the other choices and conditions when one choice is dropped', async () => {
  await startExpenses();
  await spend('Shoes', { category: 'Shopping' });
  await spend('Train', { category: 'Travel' });
  await spend('Coffee run');
  await choose('Expenses', 'Category', 'Shopping', 'Travel');
  await setAmounts('Expenses', '5');
  expect(capsuleTexts(expensesRoot())[0]).toBe('2 Categories');

  await editCategory('Shopping', 'Groceries');

  expect(capsuleOf(expensesRoot(), 'Category')).toBe('Travel');
  expect(capsuleOf(expensesRoot(), 'Amount')).toBe('5 or more');
  expect(cardTitles()).toEqual(['Train']);

  await editCategory('Travel', 'Trips');

  expect(capsuleOf(expensesRoot(), 'Category')).toBe('Category');
  expect(capsuleOf(expensesRoot(), 'Amount')).toBe('5 or more');
  expect(cardTitles()).toEqual(['Coffee run', 'Train', 'Shoes']);
});

test('[LEDGER-141.1] keeps a category in the filter while another ledger still has an expense under that name', async () => {
  await startWithGroups(BRISBANE);
  await spend('Coffee run');
  await brisbaneSpends('Dinner');
  await choose('Expenses', 'Category', FOOD);
  expect(cardTitles()).toEqual(['Dinner', 'Coffee run']);

  await editCategory(FOOD, 'Meals');

  expect(capsuleName(expensesRoot(), 'Category')).toBe(`Category, ${FOOD}`);
  expect(cardTitles()).toEqual(['Dinner']);
});

test('[LEDGER-141.1] drops a category from the filter once its expenses are moved to another category', async () => {
  await startExpenses();
  await spend('Shoes', { category: 'Shopping' });
  await spend('Coffee run');
  await choose('Expenses', 'Category', 'Shopping');

  await moveCategoryExpenses('Shopping', 'Other');
  await tapTab('Expenses');
  await settle();

  expect(capsuleRow(expensesRoot())).toBeUndefined();
  expect(cardTitles()).toEqual(['Coffee run', 'Shoes']);
  expect(linesIn(card('Shoes'))).toContain('Other');
});

test('[LEDGER-141.1] drops a category from the filter once its last expense is in the Trash, and Undo does not bring the filter back', async () => {
  await startExpenses();
  await spend('Shoes', { category: 'Shopping' });
  await spend('Coffee run');
  await choose('Expenses', 'Category', 'Shopping');
  expect(cardTitles()).toEqual(['Shoes']);

  await deleteByAction('Shoes');

  expect(capsuleRow(expensesRoot())).toBeUndefined();
  expect(cardTitles()).toEqual(['Coffee run']);

  await pressUndo('Shoes');

  expect(cardTitles()).toEqual(['Coffee run', 'Shoes']);
  expect(capsuleRow(expensesRoot())).toBeUndefined();
});

test('[LEDGER-141.1] [LEDGER-130.1] drops the currency chosen once the list is left with one currency', async () => {
  await startExpenses();
  await spendIn('USD', 'Coffee run', '8.75');
  await spendIn('JPY', 'Ramen', '500');
  await choose('Expenses', 'Currency', 'JPY');
  expect(cardTitles()).toEqual(['Ramen']);

  await clearInFilters('Expenses');
  await deleteByAction('Coffee run');
  expect(cardTitles()).toEqual(['Ramen']);
  await pressUndo('Coffee run');
  await choose('Expenses', 'Currency', 'USD');
  expect(cardTitles()).toEqual(['Coffee run']);

  await deleteByAction('Coffee run');

  expect(capsuleRow(expensesRoot())).toBeUndefined();
  expect(cardTitles()).toEqual(['Ramen']);
});

test('[LEDGER-141.1] keeps a payer and a ledger that are renamed, under their new names', async () => {
  await startWithGroups(BRISBANE);
  await spend('Coffee run');
  await brisbaneSpends('Dinner');
  await brisbaneSpends('Taxi', { payer: 'Casey' });
  await choose('Expenses', 'Ledger', 'Brisbane');
  await showGroup('Brisbane');
  await choose('Brisbane', 'Paid by', 'Casey');
  await goBackFrom('Brisbane');

  await renameInGroup('Brisbane', 'Casey', 'Kay');
  await renameGroup('Brisbane', 'Sydney');

  await showGroup('Sydney');
  expect(capsuleTexts(screenOf('Sydney'))).toContain('Paid by Kay');
  expect(groupCardTitles('Sydney')).toEqual(['Taxi']);
  await tapTab('Expenses');
  expect(capsuleName(expensesRoot(), 'Ledger')).toBe('Ledger, Sydney');
  expect(cardTitles()).toEqual(['Taxi', 'Dinner']);
});

// An expense added while a filter would hide it

test('[LEDGER-142.1] takes the filter off when the expense just added does not pass it', async () => {
  await startExpenses();
  await spend('Shoes', { category: 'Shopping' });
  await choose('Expenses', 'Category', 'Shopping');

  await spend('Lunch');

  expect(capsuleRow(expensesRoot())).toBeUndefined();
  expect(filtersAction('Expenses').name).toBe('Filters');
  expect(cardTitles()).toEqual(['Lunch', 'Shoes']);
});

test('[LEDGER-142.1] keeps the filter when the expense just added passes it', async () => {
  await startExpenses();
  await spend('Shoes', { category: 'Shopping' });
  await spend('Coffee run');
  await choose('Expenses', 'Category', 'Shopping');

  await spend('Hat', { category: 'Shopping' });

  expect(capsuleName(expensesRoot(), 'Category')).toBe('Category, Shopping');
  expect(cardTitles()).toEqual(['Hat', 'Shoes']);
});

test('[LEDGER-142.1] takes off every condition, also those the new expense passes, when one of them hides it', async () => {
  await startExpenses();
  await spend('Dinner', { amount: '60.00' });
  await choose('Expenses', 'Category', FOOD);
  await setAmounts('Expenses', '10');

  await spend('Tea', { amount: '5.00' });

  expect(capsuleRow(expensesRoot())).toBeUndefined();
  expect(cardTitles()).toEqual(['Tea', 'Dinner']);
});

test('[LEDGER-142.1] [LEDGER-117.1] moves the list to the month of the new expense and takes the filter off, when both would hide it', async () => {
  await startExpenses();
  await spend('Shoes', { category: 'Shopping' });
  await choose('Expenses', 'Category', 'Shopping');

  await spend('Lunch', { date: '2026-09-12' });

  expect(periodName(expensesRoot())).toBe('September 2026');
  expect(capsuleRow(expensesRoot())).toBeUndefined();
  expect(cardTitles()).toEqual(['Lunch']);
});

test('[LEDGER-142.1] [LEDGER-124.1] keeps the order of the list when the filter is taken off', async () => {
  await startExpenses();
  await spend('Shoes', { category: 'Shopping' });
  await chooseSort(expensesRoot(), 'Oldest First');
  await choose('Expenses', 'Category', 'Shopping');

  await spend('Lunch');

  expect(sortName(expensesRoot())).toBe('Sort By, Oldest First');
  expect(cardTitles()).toEqual(['Shoes', 'Lunch']);
});

test("[LEDGER-142.1] takes off the filter of each screen that lists the new expense and would hide it: a group's screen and the expense list", async () => {
  await startWithGroups(BRISBANE);
  await spend('Coffee run');
  await brisbaneSpends('Taxi', { payer: 'Casey' });
  await choose('Expenses', 'Ledger', 'Personal');
  await showGroup('Brisbane');
  await choose('Brisbane', 'Paid by', 'Casey');

  await brisbaneSpends('Dinner');

  expect(capsuleRow(expensesRoot())).toBeUndefined();
  expect(cardTitles()).toEqual(['Dinner', 'Taxi', 'Coffee run']);
  await showGroup('Brisbane');
  expect(capsuleRow(brisbane())).toBeUndefined();
  expect(groupCardTitles('Brisbane')).toEqual(['Dinner', 'Taxi']);
});

test('[LEDGER-142.1] keeps the filter of the expense list when the new expense is a group expense that does not concern you', async () => {
  await startWithGroups(BRISBANE);
  await spend('Coffee run');
  await brisbaneSpends('Dinner');
  await choose('Expenses', 'Ledger', 'Personal');

  await brisbaneSpends('Taxi', { payer: 'Casey', sharers: ['Blake'] });

  expect(capsuleName(expensesRoot(), 'Ledger')).toBe('Ledger, Personal');
  expect(cardTitles()).toEqual(['Coffee run']);
});

test('[LEDGER-142.1] keeps the filter when an expense that does not pass it is restored from the Trash', async () => {
  await startExpenses();
  await spend('Shoes', { category: 'Shopping' });
  await spend('Lunch');
  await spend('Coffee run');
  await deleteByAction('Lunch');
  await choose('Expenses', 'Category', 'Shopping');

  await restoreFromTrash('Lunch');
  await tapTab('Expenses');
  await settle();

  expect(capsuleName(expensesRoot(), 'Category')).toBe('Category, Shopping');
  expect(cardTitles()).toEqual(['Shoes']);
});

test('[LEDGER-142.1] [LEDGER-125.2] keeps a search going when an expense is added during it, and takes off the filter that would hide the expense', async () => {
  await startExpenses();
  await spend('Coffee run');
  await choose('Expenses', 'Category', FOOD);
  await typeSearch('Expenses', 'coffee');

  await spend('Shoes', { category: 'Shopping' });

  expect(capsuleRow(expensesRoot())).toBeUndefined();
  expect(cardTitles()).toEqual(['Coffee run']);
  expect(listCount(expensesRoot())).toBe('1 item');

  await endSearch('Expenses');
  expect(cardTitles()).toEqual(['Shoes', 'Coffee run']);
});

// A search under a filter

test('[LEDGER-125.2] lists only the expenses that match the search and pass the filter, on every date, with the capsule row above them', async () => {
  await startExpenses();
  await spend('Coffee beans', { date: '2025-10-15' });
  await spend('Coffee run');
  await spend('Coffee mug', { category: 'Shopping' });
  await expectPeriod(expensesRoot, 'October 2026');
  await choose('Expenses', 'Category', FOOD);

  await typeSearch('Expenses', 'coffee');

  expect(cardTitles()).toEqual(['Coffee run', 'Coffee beans']);
  expect(capsuleTexts(expensesRoot())[0]).toBe(FOOD);
});

test('[LEDGER-125.2] follows a change of the filter during a search, and keeps the text of the search', async () => {
  await startExpenses();
  await spend('Coffee run');
  await spend('Coffee mug', { category: 'Shopping' });
  await spend('Tea', { category: 'Shopping' });
  await choose('Expenses', 'Category', FOOD);
  await typeSearch('Expenses', 'coffee');
  expect(cardTitles()).toEqual(['Coffee run']);

  await choose('Expenses', 'Category', FOOD);

  expect(capsuleRow(expensesRoot())).toBeUndefined();
  expect(cardTitles()).toEqual(['Coffee mug', 'Coffee run']);

  await choose('Expenses', 'Category', 'Shopping');
  expect(cardTitles()).toEqual(['Coffee mug']);
});

test("[LEDGER-125.2] [GROUPS-61.6] applies the filter of a group's screen to its search", async () => {
  await startWithGroups(BRISBANE);
  await brisbaneSpends('Dinner');
  await brisbaneSpends('Dinner for two', { payer: 'Casey' });
  await brisbaneSpends('Taxi', { payer: 'Casey' });
  await showGroup('Brisbane');
  await choose('Brisbane', 'Paid by', 'Casey');

  await typeSearch('Brisbane', 'dinner');

  expect(groupCardTitles('Brisbane')).toEqual(['Dinner for two']);
  expect(capsuleTexts(brisbane())).toContain('Paid by Casey');
});

test('[LEDGER-126.2] counts the expenses a search lists under the filter, with no period row and no total', async () => {
  await startExpenses();
  await spend('Coffee beans', { date: '2025-10-15' });
  await spend('Coffee run');
  await spend('Coffee mug', { category: 'Shopping' });
  await choose('Expenses', 'Category', FOOD);

  await typeSearch('Expenses', 'coffee');

  expect(listCount(expensesRoot())).toBe('2 items');
  expect(periodName(expensesRoot())).toBeUndefined();
  expect(totalButtons(expensesRoot())).toEqual([]);
  expect(
    inOrder(
      capsuleRow(expensesRoot()),
      countView(expensesRoot()),
      sortView(expensesRoot()),
    ),
  ).toBe(true);
});

test('[LEDGER-127.2] says the filters are on too when a search finds nothing under a filter, and clears them from there while the search stays', async () => {
  await startExpenses();
  await spend('Coffee run');
  await spend('Shoes', { category: 'Shopping' });
  await choose('Expenses', 'Category', 'Shopping');

  await typeSearch('Expenses', 'coffee');

  expect(cardTitles()).toEqual([]);
  expect(noResultsTitle(expensesRoot())).toBe('No Results for “coffee”');
  expect(linesIn(expensesRoot())).toContain(NO_RESULTS_FILTERED_HINT);
  expect(linesIn(expensesRoot())).not.toContain(NO_RESULTS_HINT);
  expect(noMatchesTitle(expensesRoot())).toBeUndefined();
  expect(capsuleTexts(expensesRoot())[0]).toBe('Shopping');
  expect(
    inOrder(capsuleRow(expensesRoot()), clearFiltersButton(expensesRoot())),
  ).toBe(true);

  await pressClearFilters(expensesRoot());

  expect(capsuleRow(expensesRoot())).toBeUndefined();
  expect(noResultsTitle(expensesRoot())).toBeUndefined();
  expect(cardTitles()).toEqual(['Coffee run']);
  expect(listCount(expensesRoot())).toBe('1 item');
});

test('[LEDGER-127.2] goes back to the usual words, with no Clear Filters, once the filters are cleared and the text still finds nothing', async () => {
  await startExpenses();
  await spend('Coffee run');
  await spend('Shoes', { category: 'Shopping' });
  await choose('Expenses', 'Category', 'Shopping');
  await typeSearch('Expenses', 'pizza');
  expect(linesIn(expensesRoot())).toContain(NO_RESULTS_FILTERED_HINT);

  await pressClearFilters(expensesRoot());

  expect(noResultsTitle(expensesRoot())).toBe('No Results for “pizza”');
  expect(linesIn(expensesRoot())).toContain(NO_RESULTS_HINT);
  expect(linesIn(expensesRoot())).not.toContain(NO_RESULTS_FILTERED_HINT);
  expect(clearFiltersButton(expensesRoot())).toBeUndefined();
});

test("[LEDGER-127.2] says the filters are on too on a group's screen", async () => {
  await startWithGroups(BRISBANE);
  await brisbaneSpends('Dinner');
  await brisbaneSpends('Taxi', { payer: 'Casey' });
  await showGroup('Brisbane');
  await choose('Brisbane', 'Paid by', 'Casey');

  await typeSearch('Brisbane', 'dinner');

  expect(noResultsTitle(brisbane())).toBe('No Results for “dinner”');
  expect(groupLines('Brisbane')).toContain(NO_RESULTS_FILTERED_HINT);
  expect(clearFiltersButton(brisbane())).toBeDefined();
});

// Filters, as a whole

test('[LEDGER-109.2] keeps the changes of a filter made in Filters when Filters is closed with Done', async () => {
  await startExpenses();
  await spend('Coffee run');
  await spend('Shoes', { category: 'Shopping' });

  await inFilters('Expenses', async () => {
    await pressInRow('Category', 'Shopping');
    await typeAmount('Lowest amount', '5');
  });

  expect(filtersOpen()).toBe(false);
  expect(cardTitles()).toEqual(['Shoes']);
  expect(capsuleOf(expensesRoot(), 'Category')).toBe('Shopping');
  expect(capsuleOf(expensesRoot(), 'Amount')).toBe('5 or more');
});
