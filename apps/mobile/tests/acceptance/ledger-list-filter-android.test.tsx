import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Alert } from 'react-native';
import { fireEvent, renderHook } from '@testing-library/react-native';
import {
  addExpense,
  phoneDatabase,
  resetPhone,
  setRegionCurrency,
  startExpenses,
} from './ledger-expense-app';
import { cardTitles, expensesRoot, linesIn } from './ledger-expense-list-app';
import {
  CLEAR_FILTERS,
  NO_MATCHES_HINT,
  NO_MATCHES_TITLE,
  SAVE_FILTER,
  amountField,
  applySavedFrom,
  canSaveName,
  capsuleButtonNames,
  capsuleRow,
  capsuleTexts,
  choose,
  clearFiltersButton,
  closeList,
  conditionRow,
  filterNameField,
  filtersAction,
  isColor,
  listButtons,
  listOpen,
  noMatchesTitle,
  openList,
  openSaveSheet,
  paidByMeCapsuleSelected,
  pressCapsule,
  pressClearFilters,
  pressDeleteSaved,
  pressInFilters,
  pressInList,
  pressOnSaveSheet,
  rowOptions,
  saveSheet,
  saveSheetButton,
  savedFilterNames,
  setAmounts,
  turnPaidByMe,
} from './ledger-list-filter-app';
import {
  closeFilters,
  expectFilters,
  filtersOpen,
  openFilters,
} from './ledger-list-period-app';
import {
  addGroupExpense,
  groupCardTitles,
  startWithGroups,
} from './ledger-group-expense-app';
import { alertsShown, pressAlertButton, screenOf } from './group-details-app';
import { showGroup } from './group-balances-app';
import { allowWrites } from './shell-appearance-app';
import { useThemeColors } from '../../src/ui/theme';
import type { Database } from '../../src/storage';

// Runs on Android only (apps/mobile/jest.config.cjs). Both platforms share the rules of the
// filters, so ledger-list-filter.test.tsx and ledger-list-filter-saved.test.tsx check them on
// iOS; this file checks what Android shows differently until its Material components come: the
// lists of Filters are sheets, every capsule is a button, a press on a capsule opens Filters
// (LEDGER-136.1), and a filter is named in a sheet (LEDGER-143.1).

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
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'list-filter-android-'));
  const file = path.join(directory, 'app.db');
  mockOpen = async () => phoneDatabase(file);
  allowWrites();
  resetPhone();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});

/** Adds a personal expense titled `title`: 8.75 of Food & Dining today unless told otherwise. */
const spend = (title: string, { amount = '8.75', category = FOOD } = {}) =>
  addExpense({ title, date: '2026-10-30', amount, category });

/** Coffee run of Food & Dining, and Shoes and Train of Shopping and Travel, 20.00 and 30.00. */
async function startWithThree() {
  await startExpenses();
  await spend('Coffee run');
  await spend('Shoes', { amount: '20.00', category: 'Shopping' });
  await spend('Train', { amount: '30.00', category: 'Travel' });
}

// The lists of Filters

test('[LEDGER-131.1] opens the categories in a sheet titled Category with Done on Android, keeps it open at a press, and marks what is chosen', async () => {
  await startWithThree();
  await openFilters('Expenses');
  expect(conditionRow('Category')).toBe('Category, Any');

  await openList('Category');
  expect(listButtons('Category').filter((name) => name !== 'Done')).toEqual([
    FOOD,
    'Shopping',
    'Travel',
  ]);
  expect(listButtons('Category')).toContain('Done');
  expect(listButtons('Category')).not.toContain('Cancel');

  await pressInList('Category', 'Shopping');
  expect(listOpen('Category')).toBe(true);
  await pressInList('Category', 'Travel');
  expect(listOpen('Category')).toBe(true);

  await closeList('Category');
  expect(filtersOpen()).toBe(true);
  expect(conditionRow('Category')).toBe('Category, 2 Categories');
  expect(await rowOptions('Category')).toEqual([
    [FOOD, false],
    ['Shopping', true],
    ['Travel', true],
  ]);

  await closeFilters();
  expect(cardTitles()).toEqual(['Train', 'Shoes']);
});

test('[LEDGER-131.1] opens the currencies in a sheet titled Currency with Cancel on Android, which closes once a currency is chosen', async () => {
  await startExpenses();
  await spend('Coffee run');
  setRegionCurrency('JPY');
  await addExpense({ title: 'Ramen', amount: '500' });
  setRegionCurrency('USD');
  await openFilters('Expenses');

  await openList('Currency');
  expect(listButtons('Currency')).toContain('Cancel');
  expect(listButtons('Currency')).not.toContain('Done');
  await closeList('Currency');
  expect(conditionRow('Currency')).toBe('Currency, All');

  await openList('Currency');
  await pressInList('Currency', 'JPY');
  expect(listOpen('Currency')).toBe(false);
  expect(conditionRow('Currency')).toBe('Currency, JPY');

  await closeFilters();
  expect(cardTitles()).toEqual(['Ramen']);
});

test("[LEDGER-131.1] [GROUPS-61.6] opens the payers in a sheet titled Paid by on Android, and lists what the ones chosen paid on the group's screen", async () => {
  await startWithGroups({ Brisbane: ['Casey'] });
  await addGroupExpense({
    group: 'Brisbane',
    payer: 'Taylor (You)',
    sharers: ['Taylor (You)', 'Casey'],
    title: 'Dinner',
  });
  await addGroupExpense({
    group: 'Brisbane',
    payer: 'Casey',
    sharers: ['Taylor (You)', 'Casey'],
    title: 'Taxi',
  });
  await showGroup('Brisbane');
  await openFilters('Brisbane');
  expect(conditionRow('Paid by')).toBe('Paid by, Anyone');

  await openList('Paid by');
  expect(listButtons('Paid by')).toContain('Done');
  await pressInList('Paid by', 'Casey');
  await closeList('Paid by');
  expect(conditionRow('Paid by')).toBe('Paid by, Casey');
  await closeFilters();

  expect(groupCardTitles('Brisbane')).toEqual(['Taxi']);
  expect(capsuleButtonNames(screenOf('Brisbane'))).toEqual([
    'Category',
    'Paid by, Casey',
    'Amount',
  ]);
});

// The capsule row

test('[LEDGER-133.1] [LEDGER-136.1] shows each capsule as a button named after its condition and its value on Android', async () => {
  await startWithThree();
  await choose('Expenses', 'Category', 'Shopping');
  await setAmounts('Expenses', '10', '50');
  await turnPaidByMe(true);

  expect(capsuleTexts(expensesRoot())).toEqual([
    'Shopping',
    'Ledger',
    'Paid by Me',
    '10 – 50',
  ]);
  expect(capsuleButtonNames(expensesRoot())).toEqual([
    'Category, Shopping',
    'Ledger',
    'Paid by Me',
    'Amount, 10 – 50',
  ]);
  expect(paidByMeCapsuleSelected(expensesRoot())).toBe(true);
});

test('[LEDGER-136.1] opens Filters at a press on the Category capsule on Android, where the condition is changed', async () => {
  await startWithThree();
  await turnPaidByMe(true);

  await pressCapsule(expensesRoot(), 'Category');
  await expectFilters();
  await openList('Category');
  await pressInList('Category', 'Shopping');
  await closeList('Category');
  await closeFilters();

  expect(capsuleButtonNames(expensesRoot())[0]).toBe('Category, Shopping');
  expect(cardTitles()).toEqual(['Shoes']);
});

test('[LEDGER-136.1] opens Filters at a press on the Ledger and the Amount capsule on Android', async () => {
  await startWithThree();
  await turnPaidByMe(true);

  await pressCapsule(expensesRoot(), 'Ledger');
  await expectFilters();
  expect(conditionRow('Ledger')).toBe('Ledger, All');
  await closeFilters();

  await pressCapsule(expensesRoot(), 'Amount');
  await expectFilters();
  expect(amountField('Lowest amount')).toBeDefined();
  expect(amountField('Highest amount')).toBeDefined();
});

test('[LEDGER-136.1] [LEDGER-133.1] turns Paid by Me off at a press on its capsule on Android, without opening Filters', async () => {
  await startWithThree();
  await turnPaidByMe(true);

  await pressCapsule(expensesRoot(), 'Paid by Me');

  expect(filtersOpen()).toBe(false);
  expect(capsuleRow(expensesRoot())).toBeUndefined();
  expect(cardTitles()).toEqual(['Train', 'Shoes', 'Coffee run']);
});

// The Filters action in the header

test('[LEDGER-132.1] [SHELL-72.2] draws the Filters icon in the accent color and reads it as Filters, on while the list has a filter on Android', async () => {
  const { accent } = (await renderHook(() => useThemeColors())).result.current;
  await startWithThree();
  expect(filtersAction('Expenses').name).toBe('Filters');
  expect(isColor(filtersAction('Expenses').tint, accent)).toBe(false);

  await turnPaidByMe(true);
  expect(filtersAction('Expenses').name).toBe('Filters, on');
  expect(isColor(filtersAction('Expenses').tint, accent)).toBe(true);

  await pressCapsule(expensesRoot(), 'Paid by Me');
  expect(filtersAction('Expenses').name).toBe('Filters');
  expect(isColor(filtersAction('Expenses').tint, accent)).toBe(false);
});

// A filter that leaves no expense

test('[LEDGER-138.1] says the expenses are still there, with Clear Filters, on Android', async () => {
  await startWithThree();

  await setAmounts('Expenses', '100');

  expect(cardTitles()).toEqual([]);
  expect(noMatchesTitle(expensesRoot())).toBe(NO_MATCHES_TITLE);
  expect(linesIn(expensesRoot())).toContain(NO_MATCHES_HINT);
  expect(clearFiltersButton(expensesRoot())).toBeDefined();

  await pressClearFilters(expensesRoot());
  expect(cardTitles()).toEqual(['Train', 'Shoes', 'Coffee run']);
});

// Saving a filter

test('[LEDGER-143.1] asks for the name of a filter in a sheet titled Save Filter on Android, with Save disabled while the name is empty', async () => {
  await startWithThree();
  await turnPaidByMe(true);
  await openFilters('Expenses');

  await openSaveSheet();

  expect(saveSheetButton('Cancel')).toBeDefined();
  expect(filterNameField().props.value).toBe('Paid by Me');
  expect(canSaveName()).toBe(true);

  await fireEvent.changeText(filterNameField(), '   ');
  expect(canSaveName()).toBe(false);

  await pressOnSaveSheet('Cancel');
  expect(saveSheet()).toBeUndefined();
  expect(filtersOpen()).toBe(true);
  expect(savedFilterNames()).toEqual([]);
});

test('[LEDGER-143.1] [LEDGER-144.1] saves a filter under the name typed, applies it and deletes it on Android', async () => {
  await startWithThree();
  await choose('Expenses', 'Category', 'Shopping');
  await openFilters('Expenses');

  await openSaveSheet();
  expect(filterNameField().props.value).toBe('Shopping');
  await fireEvent.changeText(filterNameField(), ' Shop ');
  await pressOnSaveSheet('Save');

  expect(savedFilterNames()).toEqual(['Shop']);
  await pressInFilters(CLEAR_FILTERS);
  await closeFilters();
  expect(capsuleRow(expensesRoot())).toBeUndefined();

  await applySavedFrom('Expenses', 'Shop');
  expect(filtersOpen()).toBe(false);
  expect(cardTitles()).toEqual(['Shoes']);

  await openFilters('Expenses');
  await pressDeleteSaved('Shop');
  expect(alertsShown().at(-1)?.[0]).toBe('Delete “Shop”?');
  await pressAlertButton('Delete');
  expect(savedFilterNames()).toEqual([]);
  expect(conditionRow('Category')).toBe('Category, Shopping');
});

test('[LEDGER-143.1] offers Save Current Filter… only while the list has a filter on Android', async () => {
  await startWithThree();
  await openFilters('Expenses');

  await pressInFilters(SAVE_FILTER);

  expect(saveSheet()).toBeUndefined();
});
