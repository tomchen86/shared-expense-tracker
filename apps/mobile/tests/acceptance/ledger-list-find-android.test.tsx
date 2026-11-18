import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Alert } from 'react-native';
import { renderHook, waitFor } from '@testing-library/react-native';
import {
  addExpense,
  phoneDatabase,
  resetPhone,
  startExpenses,
} from './ledger-expense-app';
import { cardTitles, expensesRoot } from './ledger-expense-list-app';
import {
  SORT_ORDERS,
  cancelSortList,
  chooseSort,
  endSearch,
  listCount,
  noResultsTitle,
  openSortList,
  searchField,
  sortArrows,
  sortListButtons,
  sortListOpen,
  sortName,
  sortOptions,
  typeSearch,
} from './ledger-list-find-app';
import { periodName } from './ledger-list-period-app';
import {
  addGroupExpense,
  groupCardTitles,
  startWithGroups,
} from './ledger-group-expense-app';
import { screenOf } from './group-details-app';
import { showGroup } from './group-balances-app';
import { allowWrites } from './shell-appearance-app';
import { useThemeColors } from '../../src/ui/theme';
import type { Database } from '../../src/storage';

// Runs on Android only (apps/mobile/jest.config.cjs). Both platforms share the rules of sorting
// and search, so ledger-list-sort.test.tsx and ledger-list-search.test.tsx check them on iOS;
// this file checks what Android shows differently: the sort button is a swap_vert icon that
// opens a sheet titled Sort By, and the search field reports that it closed where the iOS one
// reports its cancel button.

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

let directory: string;

beforeEach(() => {
  jest.clearAllMocks();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'list-find-android-'));
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

/** Adds a personal expense titled `title`, dated `date`, of `amount`. */
const spend = (title: string, date = '2026-10-30', amount = '8.75') =>
  addExpense({ title, date, amount });

// The sort button

test('[LEDGER-122.1] opens the orders in a sheet titled Sort By with Cancel on Android, marks the current one, and takes the one chosen', async () => {
  await startExpenses();
  await spend('A', '2026-10-01');
  await spend('B', '2026-10-03');

  expect(sortName(expensesRoot())).toBe('Sort By, Newest First');
  await openSortList(expensesRoot());
  expect(sortListButtons()).toEqual(expect.arrayContaining(['Cancel']));
  await cancelSortList();

  expect(await sortOptions(expensesRoot())).toEqual(
    SORT_ORDERS.map((name) => [name, name === 'Newest First']),
  );

  await chooseSort(expensesRoot(), 'Oldest First');

  expect(sortListOpen()).toBe(false);
  expect(sortName(expensesRoot())).toBe('Sort By, Oldest First');
  expect(cardTitles()).toEqual(['A', 'B']);
  expect(await sortOptions(expensesRoot())).toEqual(
    SORT_ORDERS.map((name) => [name, name === 'Oldest First']),
  );
});

test('[LEDGER-122.1] leaves the order as it was when the Sort By sheet is closed with Cancel', async () => {
  await startExpenses();
  await spend('A', '2026-10-01');
  await spend('B', '2026-10-03');
  await chooseSort(expensesRoot(), 'Oldest First');

  await openSortList(expensesRoot());
  await cancelSortList();

  expect(sortName(expensesRoot())).toBe('Sort By, Oldest First');
  expect(cardTitles()).toEqual(['A', 'B']);
});

test('[LEDGER-122.1] draws the sort button as a swap_vert icon on Android, in the accent color while the order is not Newest First', async () => {
  // Before the app starts: a hook's render becomes what `screen` queries.
  const { accent } = (await renderHook(() => useThemeColors())).result.current;
  await startExpenses();
  await spend('Coffee run');

  await waitFor(() =>
    expect(sortArrows(expensesRoot()).map(({ name }) => name)).toEqual([
      'swap_vert',
    ]),
  );
  expect(sortArrows(expensesRoot())[0].color).not.toEqual(accent);
  expect(listCount(expensesRoot())).toBeUndefined();

  await chooseSort(expensesRoot(), 'Recently Edited');

  await waitFor(() =>
    expect(sortArrows(expensesRoot()).map(({ color }) => color)).toEqual([
      accent,
    ]),
  );
});

test("[LEDGER-122.1] [LEDGER-124.1] sorts a group's screen from its own Sort By sheet on Android", async () => {
  await startWithGroups({ Brisbane: ['Casey'] });
  for (const [title, amount] of [
    ['Dinner', '60.00'],
    ['Taxi', '25.00'],
  ])
    await addGroupExpense({
      group: 'Brisbane',
      payer: 'Casey',
      sharers: ['Taylor (You)', 'Casey'],
      title,
      amount,
    });
  await showGroup('Brisbane');

  await chooseSort(screenOf('Brisbane'), 'Highest Amount');

  expect(sortName(screenOf('Brisbane'))).toBe('Sort By, Highest Amount');
  expect(groupCardTitles('Brisbane')).toEqual(['Dinner', 'Taxi']);
});

// Search

test('[SHELL-73.1] puts the system search field in the header of the expense list on Android, with the prompt Search', async () => {
  await startExpenses();

  await waitFor(() => expect(searchField('Expenses')).toBeDefined());
  expect(searchField('Expenses')?.props.placeholder).toBe('Search');
});

test('[LEDGER-125.1] [LEDGER-126.1] [SHELL-73.1] searches at each change of the text on Android, and ends the search when the field closes', async () => {
  await startExpenses();
  await spend('Coffee run');
  await spend('Lunch');
  await spend('Coffee beans', '2025-10-15');
  await typeSearch('Expenses', 'coffee');

  expect(cardTitles()).toEqual(['Coffee run', 'Coffee beans']);
  expect(periodName(expensesRoot())).toBeUndefined();
  expect(listCount(expensesRoot())).toBe('2 items');

  await typeSearch('Expenses', 'coffee b');
  expect(cardTitles()).toEqual(['Coffee beans']);
  expect(listCount(expensesRoot())).toBe('1 item');

  await endSearch('Expenses');

  expect(periodName(expensesRoot())).toBe('October 2025');
  expect(cardTitles()).toEqual(['Coffee beans']);
  expect(listCount(expensesRoot())).toBeUndefined();
});

test('[LEDGER-127.1] says No Results for the text on Android', async () => {
  await startExpenses();
  await spend('Coffee run');

  await typeSearch('Expenses', 'pizza');

  expect(noResultsTitle(expensesRoot())).toBe('No Results for “pizza”');
  expect(cardTitles()).toEqual([]);
  expect(sortName(expensesRoot())).toBeUndefined();
});
