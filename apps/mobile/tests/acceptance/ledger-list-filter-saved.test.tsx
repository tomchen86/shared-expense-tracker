import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ActionSheetIOS } from 'react-native';
import { waitFor } from '@testing-library/react-native';
import {
  addExpense,
  editCategory,
  resetPhone,
  restart,
  startExpenses,
  watchAlerts,
} from './ledger-expense-app';
import {
  allowReads,
  cardTitles,
  expensesRoot,
  phoneDatabaseWithReads,
} from './ledger-expense-list-app';
import { chooseSort, sortName } from './ledger-list-find-app';
import {
  CLEAR_FILTERS,
  FILTER_SAVED,
  SAVE_FILTER,
  amountTexts,
  applySaved,
  applySavedFrom,
  capsuleOf,
  capsuleRow,
  capsuleTexts,
  choose,
  clearInFilters,
  conditionRow,
  deletableFilters,
  filtersButton,
  filtersButtonEnabled,
  hasSavedSection,
  inOrder,
  paidByMeCapsuleSelected,
  paidByMeOn,
  pressDeleteSaved,
  pressInFilters,
  pressInRow,
  rowView,
  savedFilterNames,
  savedFilters,
  setAmounts,
  setPaidByMe,
  turnPaidByMe,
  typeAmount,
  watchPrompts,
} from './ledger-list-filter-app';
import {
  choosePeriod,
  closeFilters,
  filtersOpen,
  openFilters,
  periodName,
} from './ledger-list-period-app';
import {
  addGroupExpense,
  groupCardTitles,
  startWithGroups,
} from './ledger-group-expense-app';
import { goBackFrom, screenOf } from './group-details-app';
import { showGroup } from './group-balances-app';
import { deleteByAction } from './ledger-trash-app';
import { allowWrites, failWrites } from './shell-appearance-app';
import { tapTab } from './shell-tabs-app';
import type { Database } from '../../src/storage';

// Runs on iOS, as ledger-list-filter.test.tsx does. A filter is named in a system prompt
// (LEDGER-143.1): the tests answer it as the system reports the button pressed and the text in
// its field (ledger-list-filter-app).

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

const BRISBANE = { Brisbane: ['Casey', 'Blake'] };
const FOOD = 'Food & Dining';

let directory: string;
let alerts: ReturnType<typeof watchAlerts>;
let prompts: ReturnType<typeof watchPrompts>;

beforeEach(() => {
  jest.clearAllMocks();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'list-filter-saved-'));
  const file = path.join(directory, 'app.db');
  mockOpen = async () => phoneDatabaseWithReads(file);
  allowWrites();
  allowReads();
  resetPhone();
  alerts = watchAlerts();
  prompts = watchPrompts();
  jest
    .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
    .mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});

/** Adds a personal expense titled `title`: 8.75 of Food & Dining today unless told otherwise. */
const spend = (
  title: string,
  { date = '2026-10-30', amount = '8.75', category = FOOD } = {},
) => addExpense({ title, date, amount, category });

/** Shoes and Hat of Shopping, 20.00 and 5.00, Train of Travel and Coffee run of Food & Dining, all today. */
async function startWithShopping() {
  const app = await startExpenses();
  await spend('Shoes', { amount: '20.00', category: 'Shopping' });
  await spend('Hat', { amount: '5.00', category: 'Shopping' });
  await spend('Train', { amount: '30.00', category: 'Travel' });
  await spend('Coffee run');
  return app;
}

/** Presses Save Current Filter… in the open Filters and answers the prompt with Save and `name`. */
async function saveAs(name: string) {
  await pressInFilters(SAVE_FILTER);
  await prompts.answer('Save', name);
}

/** Sets the expense list's filter to Shopping of 10 or more and saves it as Big shopping; leaves Filters open. */
async function saveBigShopping() {
  await choose('Expenses', 'Category', 'Shopping');
  await setAmounts('Expenses', '10');
  await openFilters('Expenses');
  await saveAs('Big shopping');
}

// Saving the filter a list has

test('[LEDGER-143.1] asks for a name in a system prompt titled Save Filter, starting from the texts of the capsules that are on', async () => {
  await startWithShopping();
  await choose('Expenses', 'Category', 'Shopping');
  await turnPaidByMe(true);
  await setAmounts('Expenses', '10');
  await openFilters('Expenses');
  expect(filtersButtonEnabled(SAVE_FILTER)).toBe(true);

  await pressInFilters(SAVE_FILTER);

  expect(prompts.count()).toBe(1);
  expect(prompts.shown()).toEqual([
    'Save Filter',
    'Name this filter to use it again later.',
  ]);
  expect(prompts.buttons()).toEqual(['Cancel', 'Save']);
  expect(prompts.suggested()).toBe('Shopping, Paid by Me, 10 or more');
});

test('[LEDGER-143.1] [LEDGER-144.1] saves the conditions under the name given, without the spaces around it, and then reads Filter Saved', async () => {
  await startWithShopping();
  await choose('Expenses', 'Category', 'Shopping');
  await setAmounts('Expenses', '10');
  await openFilters('Expenses');
  expect(hasSavedSection()).toBe(false);

  await saveAs(' Big shopping ');

  expect(filtersOpen()).toBe(true);
  expect(hasSavedSection()).toBe(true);
  expect(savedFilters()).toEqual([['Big shopping', true]]);
  expect(filtersButton(SAVE_FILTER)).toBeUndefined();
  expect(filtersButton(FILTER_SAVED)).toBeDefined();
  expect(filtersButtonEnabled(FILTER_SAVED)).toBe(false);
});

test('[LEDGER-143.1] offers to save again once a condition differs from every saved filter', async () => {
  await startWithShopping();
  await saveBigShopping();
  expect(filtersButton(FILTER_SAVED)).toBeDefined();

  await typeAmount('Lowest amount', '20');

  expect(filtersButton(FILTER_SAVED)).toBeUndefined();
  expect(filtersButtonEnabled(SAVE_FILTER)).toBe(true);
  expect(savedFilters()).toEqual([['Big shopping', false]]);
});

test('[LEDGER-143.1] [LEDGER-144.1] takes an amount written another way for the same condition while its value is the same', async () => {
  await startWithShopping();
  await setAmounts('Expenses', '10');
  await openFilters('Expenses');
  await saveAs('Ten up');
  expect(savedFilters()).toEqual([['Ten up', true]]);

  await typeAmount('Lowest amount', '10.0');

  expect(filtersButton(SAVE_FILTER)).toBeUndefined();
  expect(filtersButtonEnabled(FILTER_SAVED)).toBe(false);
  expect(filtersButton(FILTER_SAVED)).toBeDefined();
  expect(savedFilters()).toEqual([['Ten up', true]]);

  await typeAmount('Lowest amount', '10.5');
  expect(filtersButtonEnabled(SAVE_FILTER)).toBe(true);
  expect(savedFilters()).toEqual([['Ten up', false]]);
});

test('[LEDGER-143.1] [LEDGER-144.1] replaces the saved filter of the same name, which then comes last', async () => {
  await startWithShopping();
  await saveBigShopping();
  await pressInFilters(CLEAR_FILTERS);
  await typeAmount('Highest amount', '90');
  await saveAs('Cheap');
  expect(savedFilterNames()).toEqual(['Big shopping', 'Cheap']);

  await pressInFilters(CLEAR_FILTERS);
  await pressInRow('Category', 'Travel');
  await saveAs('Big shopping');

  expect(savedFilterNames()).toEqual(['Cheap', 'Big shopping']);
  await pressInFilters(CLEAR_FILTERS);
  await applySaved('Big shopping');
  expect(capsuleOf(expensesRoot(), 'Category')).toBe('Travel');
  expect(capsuleOf(expensesRoot(), 'Amount')).toBe('Amount');
  expect(cardTitles()).toEqual(['Train']);
});

test.each(['', '   '])(
  '[LEDGER-143.1] saves nothing under the name %p',
  async (name) => {
    await startWithShopping();
    await setAmounts('Expenses', '1');
    await openFilters('Expenses');

    await saveAs(name);

    expect(savedFilterNames()).toEqual([]);
    expect(hasSavedSection()).toBe(false);
    expect(filtersButtonEnabled(SAVE_FILTER)).toBe(true);
  },
);

test('[LEDGER-143.1] saves nothing when the prompt is answered with Cancel', async () => {
  await startWithShopping();
  await setAmounts('Expenses', '1');
  await openFilters('Expenses');

  await pressInFilters(SAVE_FILTER);
  await prompts.answer('Cancel', 'Mine');

  expect(savedFilterNames()).toEqual([]);
  expect(amountTexts()).toEqual(['1', '']);
});

test('[LEDGER-143.1] [LEDGER-140.1] says the settings could not be saved when a filter cannot be stored under a name, and saves nothing', async () => {
  const alerts = watchAlerts();
  await startWithShopping();
  await choose('Expenses', 'Category', 'Shopping');
  await openFilters('Expenses');
  failWrites();

  await saveAs('Shopping');

  await waitFor(() =>
    expect(alerts.shown()).toEqual([
      [
        'Unable to Save Settings',
        'Your settings could not be saved. Please try again.',
      ],
    ]),
  );
  expect(hasSavedSection()).toBe(false);
  expect(filtersButtonEnabled(SAVE_FILTER)).toBe(true);
  expect(capsuleOf(expensesRoot(), 'Category')).toBe('Shopping');
});

test("[LEDGER-143.1] keeps the saved filters of the expense list and of each group's screen apart, and names a group's from its own capsules", async () => {
  await startWithGroups({ Brisbane: ['Casey', 'Blake'], Tokyo: ['Casey'] });
  await spend('Coffee run');
  for (const group of ['Brisbane', 'Tokyo'])
    await addGroupExpense({
      group,
      payer: 'Casey',
      sharers: ['Taylor (You)', 'Casey'],
      title: 'Taxi',
      amount: '25.00',
    });
  await showGroup('Brisbane');
  await choose('Brisbane', 'Paid by', 'Casey');
  await setAmounts('Brisbane', '1');
  await openFilters('Brisbane');

  await pressInFilters(SAVE_FILTER);
  expect(prompts.suggested()).toBe('Paid by Casey, 1 or more');
  await prompts.answer('Save', 'Casey paid');
  expect(savedFilterNames()).toEqual(['Casey paid']);
  await closeFilters();
  await goBackFrom('Brisbane');

  await tapTab('Expenses');
  await openFilters('Expenses');
  expect(savedFilterNames()).toEqual([]);
  await closeFilters();

  await showGroup('Tokyo');
  await openFilters('Tokyo');
  expect(savedFilterNames()).toEqual([]);
});

// Using the saved filters

test('[LEDGER-144.1] lists the saved filters in the order they were saved, under SAVED FILTERS and above Date, each with a way to delete it', async () => {
  await startWithShopping();
  await saveBigShopping();
  await pressInFilters(CLEAR_FILTERS);
  await typeAmount('Highest amount', '90');
  await saveAs('Cheap');

  expect(hasSavedSection()).toBe(true);
  expect(savedFilterNames()).toEqual(['Big shopping', 'Cheap']);
  expect(deletableFilters()).toEqual(['Big shopping', 'Cheap']);
  expect(
    inOrder(
      filtersButton('Apply saved filter Big shopping'),
      filtersButton('Delete saved filter Big shopping'),
      filtersButton('Apply saved filter Cheap'),
      filtersButton('Delete saved filter Cheap'),
      rowView('Date'),
      rowView('Category'),
    ),
  ).toBe(true);
});

test('[LEDGER-144.1] shows no SAVED FILTERS while the list has no saved filter, with Date as the first row', async () => {
  await startWithShopping();

  await openFilters('Expenses');

  expect(hasSavedSection()).toBe(false);
  expect(savedFilterNames()).toEqual([]);
  expect(rowView('Date')).toBeDefined();
});

test('[LEDGER-144.1] [LEDGER-143.1] applies a saved filter, closes Filters, and keeps the period and the order of the list', async () => {
  await startExpenses();
  await spend('Shoes', {
    date: '2026-09-12',
    amount: '20.00',
    category: 'Shopping',
  });
  await spend('Hat', {
    date: '2026-09-13',
    amount: '40.00',
    category: 'Shopping',
  });
  await spend('Socks', {
    date: '2026-09-14',
    amount: '5.00',
    category: 'Shopping',
  });
  await spend('Coffee run');
  await saveBigShopping();
  await pressInFilters(CLEAR_FILTERS);
  await closeFilters();
  await choosePeriod('Expenses', 'Last Month');
  await chooseSort(expensesRoot(), 'Oldest First');
  expect(capsuleRow(expensesRoot())).toBeUndefined();

  await applySavedFrom('Expenses', 'Big shopping');

  expect(filtersOpen()).toBe(false);
  expect(capsuleOf(expensesRoot(), 'Category')).toBe('Shopping');
  expect(capsuleOf(expensesRoot(), 'Amount')).toBe('10 or more');
  expect(periodName(expensesRoot())).toBe('September 2026');
  expect(sortName(expensesRoot())).toBe('Sort By, Oldest First');
  expect(cardTitles()).toEqual(['Shoes', 'Hat']);
});

test('[LEDGER-144.1] puts the saved conditions in place of the ones that were on, and keeps none of those', async () => {
  await startWithShopping();
  await saveBigShopping();
  await pressInFilters(CLEAR_FILTERS);
  await pressInRow('Category', 'Travel');
  await typeAmount('Highest amount', '90');
  await closeFilters();
  expect(cardTitles()).toEqual(['Train']);

  await applySavedFrom('Expenses', 'Big shopping');

  expect(capsuleOf(expensesRoot(), 'Category')).toBe('Shopping');
  expect(capsuleOf(expensesRoot(), 'Amount')).toBe('10 or more');
  expect(cardTitles()).toEqual(['Shoes']);
});

test('[LEDGER-144.1] turns Paid by Me off when the saved filter applied does not have it on', async () => {
  await startWithShopping();
  await saveBigShopping();
  await pressInFilters(CLEAR_FILTERS);
  await setPaidByMe(true);
  await closeFilters();
  expect(paidByMeCapsuleSelected(expensesRoot())).toBe(true);

  await applySavedFrom('Expenses', 'Big shopping');

  expect(paidByMeCapsuleSelected(expensesRoot())).toBe(false);
  await openFilters('Expenses');
  expect(paidByMeOn()).toBe(false);
});

test('[LEDGER-144.1] marks the saved filter whose conditions the list has now, and no other', async () => {
  await startWithShopping();
  await saveBigShopping();
  await pressInFilters(CLEAR_FILTERS);
  await typeAmount('Highest amount', '90');
  await saveAs('Cheap');
  expect(savedFilters()).toEqual([
    ['Big shopping', false],
    ['Cheap', true],
  ]);

  await applySaved('Big shopping');
  await openFilters('Expenses');
  expect(savedFilters()).toEqual([
    ['Big shopping', true],
    ['Cheap', false],
  ]);

  await typeAmount('Lowest amount', '20');
  expect(savedFilters()).toEqual([
    ['Big shopping', false],
    ['Cheap', false],
  ]);
});

test("[LEDGER-144.1] asks before it deletes a saved filter, and leaves the list's filter as it is", async () => {
  await startWithShopping();
  await saveBigShopping();

  await pressDeleteSaved('Big shopping');

  const [title, message] = alerts.shown().at(-1) ?? [];
  expect(title).toBe('Delete “Big shopping”?');
  expect(message ?? '').toBe('');
  expect(alerts.buttons()).toEqual([
    ['Cancel', 'cancel'],
    ['Delete', 'destructive'],
  ]);
  expect(savedFilterNames()).toEqual(['Big shopping']);

  await alerts.choose('Delete');

  expect(savedFilterNames()).toEqual([]);
  expect(hasSavedSection()).toBe(false);
  expect(conditionRow('Category')).toBe('Category, Shopping');
  expect(filtersButtonEnabled(SAVE_FILTER)).toBe(true);
  await closeFilters();
  expect(cardTitles()).toEqual(['Shoes']);
});

test('[LEDGER-144.1] keeps the saved filter when the question is answered with Cancel', async () => {
  await startWithShopping();
  await saveBigShopping();

  await pressDeleteSaved('Big shopping');
  await alerts.choose('Cancel');

  expect(savedFilterNames()).toEqual(['Big shopping']);
});

test('[LEDGER-144.1] [LEDGER-140.1] keeps the saved filters over a restart', async () => {
  const app = await startWithShopping();
  await saveBigShopping();
  await pressInFilters(CLEAR_FILTERS);
  await closeFilters();

  await restart(app);

  expect(capsuleRow(expensesRoot())).toBeUndefined();
  await openFilters('Expenses');
  expect(savedFilters()).toEqual([['Big shopping', false]]);
  await applySaved('Big shopping');
  expect(cardTitles()).toEqual(['Shoes']);
});

test("[LEDGER-144.1] applies a saved filter of a group's screen to that screen only", async () => {
  await startWithGroups(BRISBANE);
  await spend('Coffee run');
  await addGroupExpense({
    group: 'Brisbane',
    payer: 'Casey',
    sharers: ['Taylor (You)', 'Casey'],
    title: 'Taxi',
  });
  await addGroupExpense({
    group: 'Brisbane',
    payer: 'Taylor (You)',
    sharers: ['Taylor (You)', 'Casey'],
    title: 'Dinner',
  });
  await showGroup('Brisbane');
  await choose('Brisbane', 'Paid by', 'Casey');
  await openFilters('Brisbane');
  await saveAs('Casey paid');
  await pressInFilters(CLEAR_FILTERS);
  await closeFilters();
  expect(groupCardTitles('Brisbane')).toEqual(['Dinner', 'Taxi']);

  await applySavedFrom('Brisbane', 'Casey paid');

  expect(capsuleTexts(screenOf('Brisbane'))).toContain('Paid by Casey');
  expect(groupCardTitles('Brisbane')).toEqual(['Taxi']);
  await tapTab('Expenses');
  expect(capsuleRow(expensesRoot())).toBeUndefined();
});

// A saved filter with a category that no longer exists

test('[LEDGER-141.1] [LEDGER-144.1] drops from a saved filter a category that no longer exists, and keeps a saved filter left with no condition, which takes every condition off', async () => {
  await startWithShopping();
  await saveBigShopping();
  await pressInFilters(CLEAR_FILTERS);
  await pressInRow('Category', 'Shopping');
  await saveAs('Only shopping');
  await pressInFilters(CLEAR_FILTERS);
  await closeFilters();

  await editCategory('Shopping', 'Groceries');
  await openFilters('Expenses');

  expect(savedFilters()).toEqual([
    ['Big shopping', false],
    ['Only shopping', false],
  ]);
  expect(filtersButton(SAVE_FILTER)).toBeDefined();
  expect(filtersButtonEnabled(SAVE_FILTER)).toBe(false);
  expect(filtersButton(FILTER_SAVED)).toBeUndefined();

  await applySaved('Big shopping');

  expect(capsuleOf(expensesRoot(), 'Category')).toBe('Category');
  expect(capsuleOf(expensesRoot(), 'Amount')).toBe('10 or more');
  expect(cardTitles()).toEqual(['Train', 'Shoes']);

  await applySavedFrom('Expenses', 'Only shopping');

  expect(capsuleRow(expensesRoot())).toBeUndefined();
  expect(cardTitles()).toEqual(['Coffee run', 'Train', 'Hat', 'Shoes']);
});

test('[LEDGER-141.1] keeps the category of a saved filter once its last expenses are in the Trash', async () => {
  await startExpenses();
  await spend('Shoes', { amount: '20.00', category: 'Shopping' });
  await spend('Coffee run');
  await choose('Expenses', 'Category', 'Shopping');
  await openFilters('Expenses');
  await saveAs('Only shopping');
  await pressInFilters(CLEAR_FILTERS);
  await closeFilters();

  await deleteByAction('Shoes');
  await applySavedFrom('Expenses', 'Only shopping');

  expect(capsuleOf(expensesRoot(), 'Category')).toBe('Shopping');
  expect(cardTitles()).toEqual([]);
});

test('[LEDGER-141.1] does not bring the category back into a saved filter when the name returns', async () => {
  await startWithShopping();
  await saveBigShopping();
  await clearInFilters('Expenses');

  await editCategory('Shopping', 'Groceries');
  await editCategory('Groceries', 'Shopping');
  await applySavedFrom('Expenses', 'Big shopping');

  expect(capsuleOf(expensesRoot(), 'Category')).toBe('Category');
  expect(capsuleOf(expensesRoot(), 'Amount')).toBe('10 or more');
});
