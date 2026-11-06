import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fireEvent, waitFor } from '@testing-library/react-native';
import {
  amountField,
  expectForm,
  fillForm,
  formCategory,
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
import {
  nativeViews,
  navigationBarTitles,
  tab,
  tapTab,
} from './shell-tabs-app';
import { isOpen, openGroup } from './group-details-app';
import {
  addGroupExpense,
  addNewCategoryFromForm,
  archiveGroup,
  chooseGroup,
  choosePayer,
  closeList,
  detailBarsOn,
  editOn,
  expectDetailsOn,
  expectList,
  groupAddButton,
  groupCard,
  isListOpen,
  isNewCategoryOpen,
  isSplitOn,
  listButtons,
  listOptions,
  openNewCategory,
  openRow,
  pressInList,
  rowValue,
  setSplit,
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

test('[LEDGER-62.2] goes back to the form, with its inputs and category, when Back is pressed on New Category', async () => {
  await startWithGroups(BRISBANE);
  await openNewExpense();
  await fillForm({ amount: '8.75', title: 'Coffee' });
  await openNewCategory();

  await fireEvent(nativeViews(/^Modal$/).at(-1)!, 'requestClose');
  await settle();

  await waitFor(() => expect(isNewCategoryOpen()).toBe(false));
  expect(formTitle()).toBe('New Expense');
  expect(amountField().props.value).toBe('8.75');
  expect(titleField().props.value).toBe('Coffee');
  expect(formCategory()).toBe('Food & Dining');
});

test('[LEDGER-62.2] selects the category added from + Add New Category on Android', async () => {
  await startWithGroups(BRISBANE);
  await openNewExpense();
  await fillForm({ amount: '8.75', title: 'Coffee' });

  await addNewCategoryFromForm('Gym');

  expect(formTitle()).toBe('New Expense');
  expect(amountField().props.value).toBe('8.75');
  expect(formCategory()).toBe('Gym');
});

test('[LEDGER-46.2] opens Select Group when the switch is turned on, listing the unarchived groups', async () => {
  await startWithGroups({ Brisbane: [], Tokyo: [], Paris: [] });
  await archiveGroup('Tokyo');
  await tapTab('Expenses');
  await openNewExpense();

  await setSplit(true);

  await expectList('Select Group');
  expect(listOptions('Select Group')).toEqual([
    ['Brisbane', false],
    ['Paris', false],
  ]);
});

test('[LEDGER-46.2] keeps the switch on with no group when Select Group is cancelled', async () => {
  await startWithGroups(BRISBANE);
  await openNewExpense();
  await setSplit(true);

  await closeList('Select Group');

  expect(isSplitOn()).toBe(true);
  expect(rowValue('Group')).toBe('not selected');
});

test('[LEDGER-46.2] keeps the group and the payer when Select Group is cancelled after a group is chosen', async () => {
  await startWithGroups(BRISBANE);
  await openNewExpense();
  await chooseGroup('Brisbane');
  await choosePayer('Taylor (You)');

  await openRow('Group');
  await closeList('Select Group');

  expect(rowValue('Group')).toBe('Brisbane');
  expect(rowValue('Paid by')).toBe('Taylor (You)');
});

test('[LEDGER-46.2] shows only Cancel in Select Group when there are no groups', async () => {
  await startWithGroups();
  await openNewExpense();

  await setSplit(true);

  await expectList('Select Group');
  expect(listOptions('Select Group')).toEqual([]);
  expect(listButtons('Select Group')).toEqual(['Cancel']);
});

test('[LEDGER-48.2] keeps the payer when Who Paid? is cancelled', async () => {
  await startWithGroups(BRISBANE);
  await openNewExpense();
  await chooseGroup('Brisbane');
  await choosePayer('Casey');

  await openRow('Paid by');
  await closeList('Who Paid?');

  expect(rowValue('Paid by')).toBe('Casey');
});

test('[LEDGER-89.1] opens the lists as sheets titled Select Group, Who Paid? and Split Between, with Cancel or Done', async () => {
  await startWithGroups(BRISBANE);
  await openNewExpense();
  await chooseGroup('Brisbane');

  await openRow('Group');
  expect(listButtons('Select Group')).toContain('Cancel');
  await closeList('Select Group');

  await openRow('Paid by');
  expect(listButtons('Who Paid?')).toContain('Cancel');
  await closeList('Who Paid?');

  await openRow('Split between');
  expect(listButtons('Split Between')).toContain('Done');
  await pressInList('Split Between', 'Casey');
  expect(isListOpen('Split Between')).toBe(true);
  await closeList('Split Between');
  expect(rowValue('Split between')).toBe('1 person');
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

test("[LEDGER-66.3] [LEDGER-72.2] puts Edit and, at its right, Expense actions on a group expense's details on Android", async () => {
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
  expect(expenseHeaderButtons('Expenses').map(nameOf)).toEqual([
    'Edit',
    'Expense actions',
  ]);
  const [, actions] = expenseHeaderButtons('Expenses');
  expect(nameOf(actions)).toBe('Expense actions');
  expect(actions).toBeDisabled();
});
