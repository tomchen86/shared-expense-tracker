import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Alert } from 'react-native';
import { renderHook } from '@testing-library/react-native';
import {
  addExpense,
  phoneDatabase,
  resetPhone,
  setRegionCurrency,
  startExpenses,
} from './ledger-expense-app';
import { cardTitles, expensesRoot, linesIn } from './ledger-expense-list-app';
import {
  NO_MATCHES_HINT,
  NO_MATCHES_TITLE,
  clearFiltersButton,
  closeList,
  conditionRow,
  filtersAction,
  isColor,
  listButtons,
  listOpen,
  noMatchesTitle,
  openList,
  pressClearFilters,
  pressInList,
  rowOptions,
  setAmounts,
  turnPaidByMe,
} from './ledger-list-filter-app';
import {
  closeFilters,
  filtersOpen,
  openFilters,
} from './ledger-list-period-app';
import {
  addGroupExpense,
  groupCardTitles,
  startWithGroups,
} from './ledger-group-expense-app';
import { showGroup } from './group-balances-app';
import { allowWrites } from './shell-appearance-app';
import { useThemeColors } from '../../src/ui/theme';
import type { Database } from '../../src/storage';

// Runs on Android only (apps/mobile/jest.config.cjs). Both platforms share the rules of the
// filters, so ledger-list-filter.test.tsx and ledger-list-filter-saved.test.tsx check them on
// iOS; this file checks what Android shows differently: the lists of Filters are sheets, and the
// Filters action is a header icon. The capsules and their Material menus (LEDGER-136.2), the
// sheet of the Amount capsule (LEDGER-150.1) and the dialog that names a filter (LEDGER-143.3)
// are native views, which only the E2E flows tagged android open.

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

  await turnPaidByMe(false);
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
