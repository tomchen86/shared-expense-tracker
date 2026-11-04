import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fireEvent, waitFor } from '@testing-library/react-native';
import {
  amountField,
  expectForm,
  fillForm,
  formTitle,
  nameOf,
  openNewExpense,
  phoneDatabase,
  pressBack,
  resetPhone,
  titleField,
  watchAlerts,
} from './ledger-expense-app';
import { openDetails } from './ledger-expense-list-app';
import { expenseHeaderButtons } from './ledger-trash-app';
import { allowWrites, settle } from './shell-appearance-app';
import { navigationBarTitles, tab, tapTab } from './shell-tabs-app';
import { isOpen, openGroup } from './group-details-app';
import {
  addGroupExpense,
  archiveGroup,
  categorySheetTitle,
  detailBarsOn,
  editOn,
  expectDetailsOn,
  groupAddButton,
  groupCard,
  openCategorySheet,
  rowValue,
  startWithGroups,
} from './ledger-group-expense-app';
import type { Database } from '../../src/storage';

// Runs on Android only (apps/mobile/jest.config.cjs), as the group expense tests do
// on iOS: a phone database file of its own, in Taipei on 2026-10-30, in a region
// whose currency is USD, with Taylor saved as your name.

let mockOpen: () => Promise<Database>;

jest.mock('../../src/storage/expo', () => ({
  openPhoneDatabase: () => mockOpen(),
}));

// Not virtual, as in the iOS file.
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

/** Brisbane, with Casey and Blake added after you. */
const BRISBANE = { Brisbane: ['Casey', 'Blake'] };

let directory: string;

beforeEach(() => {
  jest.clearAllMocks();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'group-expenses-android-'));
  const file = path.join(directory, 'app.db');
  mockOpen = async () => phoneDatabase(file);
  allowWrites();
  resetPhone();
  watchAlerts();
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});

const addDinner = () =>
  addGroupExpense({
    group: 'Brisbane',
    payer: 'Casey',
    sharers: ['Blake', 'Taylor (You)', 'Casey'],
  });

test('[LEDGER-62.1] goes back to the form, with its inputs, when Back is pressed on the categories screen', async () => {
  await startWithGroups(BRISBANE);
  await openNewExpense();
  await fillForm({ amount: '8.75', title: 'Coffee' });
  await openCategorySheet();

  await pressBack();

  await waitFor(() => expect(categorySheetTitle()).toBeUndefined());
  expect(formTitle()).toBe('New Expense');
  expect(amountField().props.value).toBe('8.75');
  expect(titleField().props.value).toBe('Coffee');
});

test("[GROUPS-63.1] goes back to the group's screen when Back is pressed on the details", async () => {
  await startWithGroups(BRISBANE);
  await addDinner();
  await tapTab('Groups');
  await openGroup('Brisbane');
  await fireEvent.press(groupCard('Brisbane', 'Dinner'));
  await expectDetailsOn('Groups', 'Dinner');

  await pressBack();

  await waitFor(() => expect(detailBarsOn('Groups')).toEqual([]));
  expect(isOpen('Brisbane')).toBe(true);
  expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups', 'Brisbane']);
});

test("[GROUPS-64.1] opens New Expense for the group from the + button on the group's screen on Android", async () => {
  await startWithGroups(BRISBANE);
  await tapTab('Groups');
  await openGroup('Brisbane');

  const add = groupAddButton('Brisbane');
  expect(add).toBeDefined();
  await fireEvent.press(add!);

  await expectForm('New Expense');
  expect(rowValue('Group')).toBe('Brisbane');
});

test("[LEDGER-66.2] [LEDGER-72.2] puts Edit and, at its right, Expense actions on a group expense's details on Android", async () => {
  await startWithGroups(BRISBANE);
  await addDinner();
  await tapTab('Expenses');
  await settle();

  await openDetails('Dinner');

  await waitFor(() =>
    expect(expenseHeaderButtons('Expenses').map(nameOf)).toEqual([
      'Edit',
      'Expense actions',
    ]),
  );
});

test("[LEDGER-67.2] disables the header's Edit and Expense actions on an archived group's expense on Android", async () => {
  await startWithGroups(BRISBANE);
  await addDinner();
  await archiveGroup('Brisbane');
  await tapTab('Expenses');
  await settle();

  await openDetails('Dinner');

  expect(editOn('Expenses')?.disabled).toBe(true);
  const [, actions] = expenseHeaderButtons('Expenses');
  expect(nameOf(actions)).toBe('Expense actions');
  expect(actions).toBeDisabled();
});
