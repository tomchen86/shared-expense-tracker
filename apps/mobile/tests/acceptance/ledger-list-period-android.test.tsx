import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Alert } from 'react-native';
import { fireEvent, waitFor, within } from '@testing-library/react-native';
import {
  addExpense,
  nameOf,
  phoneDatabase,
  resetPhone,
  startExpenses,
} from './ledger-expense-app';
import { cardTitles, expensesRoot } from './ledger-expense-list-app';
import {
  PERIOD_OPTIONS,
  chooseDateOption,
  choosePeriod,
  closeFilters,
  dateOptions,
  dateRow,
  expectFilters,
  expectPeriod,
  filtersBarButtons,
  filtersOpen,
  openFilters,
  periodName,
  pressBackOnFilters,
  pressPreviousPeriod,
  rightOfBar,
} from './ledger-list-period-app';
import { startWithGroups } from './ledger-group-expense-app';
import { showGroup } from './group-balances-app';
import { iconNames, touchSize } from './shell-actions-app';
import { allowWrites } from './shell-appearance-app';
import type { Database } from '../../src/storage';

// Runs on Android only (apps/mobile/jest.config.cjs). Both platforms share the rules of a list's
// period, so ledger-list-period.test.tsx checks them on iOS; this file checks what Android shows
// differently: the name on the period row is a button that opens Filters, the Date list is a
// sheet, the dates of a custom range are drawn by the app, and Filters is a header button.

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
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'list-period-android-'));
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

/** The button on the expense list that a screen reader reads as Choose period. <name>. */
const periodButton = () =>
  within(expensesRoot()).queryByRole('button', { name: /^Choose period\. / });

test('[LEDGER-111.1] opens Filters from the name on the period row, a button read as Choose period. <name>, and takes the period chosen there', async () => {
  await startExpenses();
  await addExpense({ title: 'Coffee run', date: '2026-10-01' });
  await addExpense({ title: 'Lunch', date: '2026-09-30' });
  await choosePeriod('Expenses', 'This Month');

  const button = periodButton();
  expect(button && nameOf(button)).toBe('Choose period. October 2026');
  await fireEvent.press(button!);
  await expectFilters();

  expect(dateRow()).toBe('Date, This Month');
  await chooseDateOption('Last Month');
  await closeFilters();

  expect(nameOf(periodButton()!)).toBe('Choose period. September 2026');
  expect(cardTitles()).toEqual(['Lunch']);
});

test('[LEDGER-108.2] steps to the month before with Previous period on Android', async () => {
  await startExpenses();

  await pressPreviousPeriod(expensesRoot());

  await expectPeriod(expensesRoot, 'September 2026');
});

test('[LEDGER-109.2] opens Filters from its header button on Android, with only Done, and lists the six periods in a sheet titled Date', async () => {
  await startExpenses();

  await openFilters('Expenses');

  expect(filtersBarButtons()).toEqual(['Done']);
  expect(dateRow()).toBe('Date, This Month');
  expect(await dateOptions()).toEqual(
    PERIOD_OPTIONS.map((name) => [name, name === 'This Month']),
  );
});

test('[LEDGER-109.2] closes Filters on the back button, with the period chosen in it', async () => {
  await startExpenses();
  await openFilters('Expenses');
  await chooseDateOption('This Year');
  expect(filtersOpen()).toBe(true);

  await pressBackOnFilters();

  await waitFor(() => expect(filtersOpen()).toBe(false));
  expect(periodName(expensesRoot())).toBe('2026');
});

test("[LEDGER-112.2] shows From and To under the period row as dates in the phone's format on Android", async () => {
  await startExpenses();

  await choosePeriod('Expenses', 'Custom Range');

  const dates = (['From', 'To'] as const).map((name) => {
    const field = within(expensesRoot()).getByRole('button', { name });
    return field.props.accessibilityValue?.text;
  });
  expect(dates).toEqual(['Oct 1, 2026', 'Oct 30, 2026']);
});

test('[SHELL-72.2] puts Filters at the right of the header as a filter_list icon button of at least 48 dp on Android', async () => {
  await startExpenses();

  const filters = await waitFor(() => {
    const found = rightOfBar('Expenses').buttons.find(
      (button) => nameOf(button) === 'Filters',
    );
    expect(found).toBeDefined();
    return found!;
  });
  await waitFor(() =>
    expect(iconNames(filters, 'android')).toEqual(['filter_list']),
  );
  expect(touchSize(filters).width).toBeGreaterThanOrEqual(48);
  expect(touchSize(filters).height).toBeGreaterThanOrEqual(48);
});

test("[SHELL-72.2] puts a screen's menu to the right of Filters on Android", async () => {
  await startWithGroups({ Brisbane: [] });

  await showGroup('Brisbane');

  await waitFor(() =>
    expect(rightOfBar('Brisbane').buttons.map(nameOf)).toEqual([
      'Filters',
      'Group actions',
    ]),
  );
});
