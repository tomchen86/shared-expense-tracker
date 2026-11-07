import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Alert, BackHandler } from 'react-native';
import { fireEvent, waitFor } from '@testing-library/react-native';
import {
  addExpense,
  formBarSides,
  formTitle,
  nameOf,
  phoneDatabase,
  pressBack,
  resetPhone,
  startExpenses,
  storedExpenses,
} from './ledger-expense-app';
import { NOT_FOUND, openDetails } from './ledger-expense-list-app';
import {
  DELETE_EXPENSE,
  NO_DELETED,
  chooseExpenseAction,
  deleteByAction,
  expectCards,
  expenseHeaderButtons,
  fakeScreenReader,
  noticeShown,
  openTrash,
  openTrashed,
  trashLines,
} from './ledger-trash-app';
import {
  alertsShown,
  lastAlertButtons,
  pressAlertButton,
  textsOn,
} from './group-details-app';
import { iconNames } from './shell-actions-app';
import { allowWrites, settle } from './shell-appearance-app';
import { navigationBarTitles, push, tab } from './shell-tabs-app';
import type { Database } from '../../src/storage';

// Runs on Android only (apps/mobile/jest.config.cjs). Both platforms share the
// trash, so ledger-trash.test.tsx checks its rules on iOS; this file checks the
// Expense actions menus, which Android shows as a dialog, and its back button.

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
// React Native leaves the app through exitApp when nothing handles a back press.
let exitApp: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'expense-trash-android-'));
  const file = path.join(directory, 'app.db');
  mockOpen = async () => phoneDatabase(file);
  allowWrites();
  resetPhone();
  fakeScreenReader(false);
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  exitApp = jest.spyOn(BackHandler, 'exitApp');
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});

/** Moves Coffee run to the trash and opens its read-only details from Trash. */
async function openTrashedCoffeeRun() {
  await startExpenses();
  await addExpense();
  await deleteByAction('Coffee run');
  await openTrash();
  await openTrashed('Coffee run');
}

test('[LEDGER-72.2] puts Expense actions at the right of Edit on the details on Android, with Delete and Cancel', async () => {
  await startExpenses();
  await addExpense();
  await openDetails('Coffee run');

  await waitFor(() =>
    expect(expenseHeaderButtons('Expenses').map(nameOf)).toEqual([
      'Edit',
      'Expense actions',
    ]),
  );
  const [, menu] = expenseHeaderButtons('Expenses');
  await waitFor(() =>
    expect(iconNames(menu, 'android')).toEqual(['more_vert']),
  );
  await fireEvent.press(menu);
  await settle();

  expect(alertsShown().at(-1)?.[0]).toBe('Expense actions');
  expect(lastAlertButtons()).toEqual(['Delete', 'Cancel']);
});

test('[LEDGER-72.2] moves the expense to the trash from the dialog of the details on Android', async () => {
  await startExpenses();
  await addExpense({ title: 'Coffee run' });
  await addExpense({ title: 'Lunch' });
  await openDetails('Lunch');

  await chooseExpenseAction('Expenses', 'Delete');

  await waitFor(() =>
    expect(navigationBarTitles(tab('Expenses'))).toEqual(['Expenses']),
  );
  await expectCards(['Coffee run']);
  expect(noticeShown()).toBe(true);
});

test('[LEDGER-78.3] puts only Expense actions on the read-only details on Android, with Delete Permanently and Cancel', async () => {
  await openTrashedCoffeeRun();

  await waitFor(() =>
    expect(expenseHeaderButtons('Settings').map(nameOf)).toEqual([
      'Expense actions',
    ]),
  );
  const [menu] = expenseHeaderButtons('Settings');
  await waitFor(() =>
    expect(iconNames(menu, 'android')).toEqual(['more_vert']),
  );
  await fireEvent.press(menu);
  await settle();

  expect(alertsShown().at(-1)?.[0]).toBe('Expense actions');
  expect(lastAlertButtons()).toEqual(['Delete Permanently', 'Cancel']);
});

test('[LEDGER-78.3] goes back from the read-only details to Trash with Back on Android', async () => {
  await openTrashedCoffeeRun();

  await pressBack();

  expect(navigationBarTitles(tab('Settings'))).toEqual(['Settings', 'Trash']);
  expect(exitApp).not.toHaveBeenCalled();
});

test('[LEDGER-80.1] deletes an expense in the trash for good from the read-only details on Android', async () => {
  await openTrashedCoffeeRun();

  await chooseExpenseAction('Settings', 'Delete Permanently');
  expect(alertsShown().at(-1)).toEqual(DELETE_EXPENSE);
  await pressAlertButton('Delete');

  await waitFor(() =>
    expect(navigationBarTitles(tab('Settings'))).toEqual(['Settings', 'Trash']),
  );
  await waitFor(() => expect(trashLines()).toEqual([NO_DELETED]));
});

test('[LEDGER-85.1] closes the Edit Expense of an expense in the trash, which shows only Expense not found. and Cancel, with Back on Android', async () => {
  await startExpenses();
  await addExpense();
  const [coffeeRun] = await storedExpenses();
  await deleteByAction('Coffee run');
  const before = await storedExpenses();

  await push(`/expenses/${coffeeRun.id}/edit`);

  await waitFor(() => expect(formTitle()).toBe('Edit Expense'));
  await waitFor(() => expect(textsOn('Edit Expense')).toEqual([NOT_FOUND]));
  expect(formBarSides()).toEqual({ left: ['Cancel'], right: [] });
  await pressBack();
  await waitFor(() => expect(formTitle()).toBeUndefined());
  expect(alertsShown()).toEqual([]);
  expect(await storedExpenses()).toEqual(before);
  expect(exitApp).not.toHaveBeenCalled();
});
