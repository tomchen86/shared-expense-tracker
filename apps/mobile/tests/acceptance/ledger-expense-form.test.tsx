import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { processColor } from 'react-native';
import { act, within } from '@testing-library/react-native';
import {
  DISCARD_CHANGES,
  SAVE_FAILED,
  addCategory,
  addExpense,
  addExpenseButton,
  amountField,
  cancelCategoryList,
  categoryButton,
  categoryListView,
  categoryNamed,
  categoryOptions,
  chooseCategory,
  chooseDate,
  dateField,
  dateFieldView,
  editCategory,
  editExpense,
  expectForm,
  expectFormClosed,
  fillForm,
  formBarSides,
  formButton,
  formCategory,
  formCurrency,
  formScreen,
  formTitle,
  inTreeOrder,
  isCategoryListOpen,
  isSheet,
  noteField,
  openCategoryList,
  openEditExpense,
  openNewExpense,
  personalExpense,
  phoneDatabase,
  press,
  readIdentity,
  resetPhone,
  restart,
  setPhoneClock,
  setRegionCurrency,
  startExpenses,
  storedExpenses,
  swipeFormDown,
  titleField,
  watchAlerts,
} from './ledger-expense-app';
import {
  allowWrites,
  colorsInBoth,
  failWrites,
  fakePhoneAppearance,
  fixedColors,
  holdWrites,
  settle,
  switchPhoneTo,
  textsWithoutColor,
} from './shell-appearance-app';
import { push, selectedTab } from './shell-tabs-app';
import type { Database } from '../../src/storage';

// Runs on iOS. Each test starts the app on a phone database file of its own, in
// Taipei on 2026-10-30, in a region whose currency is USD, unless it says otherwise.

let mockOpen: () => Promise<Database>;

jest.mock('../../src/storage/expo', () => ({
  openPhoneDatabase: () => mockOpen(),
}));

// Not virtual: Jest caches how a module name resolves across the test files of a
// worker, so a virtual mock of an installed package stops applying once another
// file has loaded the real one.
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

const DEFAULT_NAMES = [
  'Food & Dining',
  'Transportation',
  'Shopping',
  'Entertainment',
  'Bills & Utilities',
  'Health',
  'Travel',
  'Other',
  'Uncategorized',
];
const PALETTE = [
  '#D81B60',
  '#1E88E5',
  '#FBC02D',
  '#00897B',
  '#8E24AA',
  '#F4511E',
  '#3949AB',
  '#6D4C41',
  '#757575',
  '#43A047',
  '#00ACC1',
  '#C62828',
  '#9E9D24',
];
// Compares a field's text as typed, spaces included.
const AS_TYPED = { normalizer: (text: string) => text };

let directory: string;
let alerts: ReturnType<typeof watchAlerts>;

beforeEach(() => {
  jest.clearAllMocks();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'expenses-'));
  const file = path.join(directory, 'app.db');
  mockOpen = async () => phoneDatabase(file);
  allowWrites();
  resetPhone();
  alerts = watchAlerts();
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});

const titles = async () =>
  (await storedExpenses()).map((expense) => expense.title);

async function onlyExpense() {
  const expenses = await storedExpenses();
  expect(expenses).toHaveLength(1);
  return expenses[0];
}

/** Adds an expense in the currency of a region, then moves the phone back to USD. */
async function addExpenseIn(currency: string, amount: string) {
  setRegionCurrency(currency);
  await addExpense({ amount });
  setRegionCurrency('USD');
  return onlyExpense();
}

test('[LEDGER-11.1] puts the Add expense button on the Expenses root', async () => {
  await startExpenses();

  expect(addExpenseButton()).toBeOnTheScreen();
});

test('[LEDGER-11.1] opens New Expense at /expenses/new when Add expense is pressed', async () => {
  const app = await startExpenses();

  await openNewExpense();

  expect(app.getPathname()).toBe('/expenses/new');
});

test('[LEDGER-12.1] opens New Expense at /expenses/new as a sheet over the tabs', async () => {
  const app = await startExpenses();

  await push('/expenses/new');

  await expectForm('New Expense');
  expect(isSheet()).toBe(true);
  expect(app.getPathname()).toBe('/expenses/new');
});

test('[LEDGER-12.1] opens Edit Expense for the expense in /expenses/<id>/edit', async () => {
  const app = await startExpenses();
  await addExpense();
  const expense = await onlyExpense();

  await openEditExpense(expense.id);

  expect(isSheet()).toBe(true);
  expect(titleField()).toHaveDisplayValue('Coffee run', AS_TYPED);
  expect(app.getPathname()).toBe(`/expenses/${expense.id}/edit`);
});

test('[LEDGER-13.1] shows Cancel and Add, then the currency, amount, title, category, date and note', async () => {
  await startExpenses();

  await openNewExpense();

  expect(formBarSides()).toEqual({ left: ['Cancel'], right: ['Add'] });
  expect(
    inTreeOrder(
      within(formScreen()).getByText('USD'),
      within(formScreen()).getByLabelText('Amount in USD'),
      titleField(),
      categoryButton(),
      dateFieldView(),
      noteField(),
    ),
  ).toBe(true);
  expect(amountField()).toHaveProp('keyboardType', 'decimal-pad');
  expect(formCategory()).toBe('Food & Dining');
  expect(dateField().label).toBe('Date');
});

test("[LEDGER-13.1] shows Save and the expense's own currency on Edit Expense", async () => {
  await startExpenses();
  const expense = await addExpenseIn('JPY', '1200');

  await openEditExpense(expense.id);

  expect(formBarSides()).toEqual({ left: ['Cancel'], right: ['Save'] });
  expect(
    inTreeOrder(
      within(formScreen()).getByText('JPY'),
      within(formScreen()).getByLabelText('Amount in JPY'),
    ),
  ).toBe(true);
});

test('[LEDGER-14.1] opens New Expense empty, with the first category and today', async () => {
  await startExpenses();

  await openNewExpense();

  expect(amountField()).toHaveDisplayValue('', AS_TYPED);
  expect(titleField()).toHaveDisplayValue('', AS_TYPED);
  expect(noteField()).toHaveDisplayValue('', AS_TYPED);
  expect(formCategory()).toBe('Food & Dining');
  expect(dateField().value).toBe('2026-10-30');
});

test('[LEDGER-14.1] picks the first category by its current name', async () => {
  await startExpenses();
  await editCategory('Food & Dining', 'Meals');

  await openNewExpense();

  expect(formCategory()).toBe('Meals');
});

test('[LEDGER-14.1] dates a new expense by the local calendar where it is already the next day', async () => {
  await startExpenses();
  setPhoneClock('Australia/Sydney', '2025-01-01T13:30:00Z');

  await openNewExpense();

  expect(dateField().value).toBe('2025-01-02');
});

test('[LEDGER-14.1] dates a new expense by the local calendar where it is still the previous day', async () => {
  await startExpenses();
  setPhoneClock('America/Los_Angeles', '2025-01-01T05:00:00Z');

  await openNewExpense();

  expect(dateField().value).toBe('2024-12-31');
});

test("[LEDGER-15.1] records a new expense in the currency of the phone's region", async () => {
  await startExpenses();
  setRegionCurrency('TWD');
  await openNewExpense();

  expect(within(formScreen()).getByText('TWD')).toBeOnTheScreen();
  expect(formCurrency()).toBe('TWD');
  await fillForm({ amount: '8.75', title: 'Coffee run' });
  await press('Add');

  await expectFormClosed();
  const expense = await onlyExpense();
  expect([expense.amountMinor, expense.currency]).toEqual([875, 'TWD']);
});

test("[LEDGER-15.1] follows a region's currency without decimals", async () => {
  await startExpenses();
  setRegionCurrency('JPY');
  await openNewExpense();

  await fillForm({ amount: '12.5', title: 'Ramen' });
  expect(formButton('Add').disabled).toBe(true);
  await fillForm({ amount: '1200' });
  await press('Add');

  await expectFormClosed();
  const expense = await onlyExpense();
  expect([expense.amountMinor, expense.currency]).toEqual([1200, 'JPY']);
});

test('[LEDGER-15.1] uses USD when the phone reports no currency', async () => {
  await startExpenses();
  setRegionCurrency(null);

  await openNewExpense();

  expect(formCurrency()).toBe('USD');
});

test('[LEDGER-15.1] uses USD when the phone reports a currency the ledger does not support', async () => {
  await startExpenses();
  setRegionCurrency('XAU');

  await openNewExpense();

  expect(formCurrency()).toBe('USD');
});

test('[LEDGER-16.1] fills Edit Expense with the amount, title, category, date and note', async () => {
  await startExpenses();
  await addExpense({
    category: 'Shopping',
    date: '2024-12-25',
    note: 'Morning treat',
  });
  const expense = await onlyExpense();

  await openEditExpense(expense.id);

  expect(formCurrency()).toBe('USD');
  expect(amountField()).toHaveDisplayValue('8.75', AS_TYPED);
  expect(titleField()).toHaveDisplayValue('Coffee run', AS_TYPED);
  expect(formCategory()).toBe('Shopping');
  expect(dateField().value).toBe('2024-12-25');
  expect(noteField()).toHaveDisplayValue('Morning treat', AS_TYPED);
});

test("[LEDGER-16.1] keeps the expense's currency after the phone's region changes", async () => {
  await startExpenses();
  const expense = await addExpenseIn('JPY', '1200');

  await openEditExpense(expense.id);

  expect(formCurrency()).toBe('JPY');
  expect(amountField()).toHaveDisplayValue('1200', AS_TYPED);
});

test('[LEDGER-16.1] leaves the note field empty for an expense without a note', async () => {
  await startExpenses();
  await addExpense();
  const expense = await onlyExpense();

  await openEditExpense(expense.id);

  expect(noteField()).toHaveDisplayValue('', AS_TYPED);
});

test('[LEDGER-16.1] shows the current name of a renamed category', async () => {
  await startExpenses();
  await addExpense({ category: 'Shopping' });
  const expense = await onlyExpense();
  await editCategory('Shopping', 'Groceries');

  await openEditExpense(expense.id);

  expect(formCategory()).toBe('Groceries');
});

test("[LEDGER-17.1] lists the categories in their stored order with the form's category selected", async () => {
  await startExpenses();
  await openNewExpense();

  await openCategoryList();

  expect(categoryOptions(DEFAULT_NAMES)).toEqual(
    DEFAULT_NAMES.map((name) => [name, name === 'Food & Dining']),
  );
});

test('[LEDGER-17.1] lists a new category after Uncategorized', async () => {
  await startExpenses();
  await addCategory('Gym');
  await openNewExpense();

  await openCategoryList();

  const names = [...DEFAULT_NAMES, 'Gym'];
  expect(categoryOptions(names).map(([name]) => name)).toEqual(names);
});

test('[LEDGER-17.1] selects the category pressed and goes back to the form', async () => {
  await startExpenses();
  await openNewExpense();

  await chooseCategory('Shopping');

  expect(formTitle()).toBe('New Expense');
  expect(formCategory()).toBe('Shopping');
  await openCategoryList();
  expect(
    categoryOptions(DEFAULT_NAMES).filter(([, selected]) => selected),
  ).toEqual([['Shopping', true]]);
});

test('[LEDGER-17.1] keeps the category when the list is cancelled', async () => {
  await startExpenses();
  await openNewExpense();
  await openCategoryList();

  await cancelCategoryList();

  expect(isCategoryListOpen()).toBe(false);
  expect(formTitle()).toBe('New Expense');
  expect(formCategory()).toBe('Food & Dining');
});

test('[LEDGER-18.1] offers no date after today on New Expense and Edit Expense', async () => {
  await startExpenses();
  setPhoneClock('Australia/Sydney', '2025-01-01T13:30:00Z');
  await addExpense({ date: '2024-12-25' });
  const expense = await onlyExpense();

  await openNewExpense();
  expect(dateField().maximumDate).toBe('2025-01-02');
  await press('Cancel');
  await expectFormClosed();
  await openEditExpense(expense.id);
  expect(dateField().maximumDate).toBe('2025-01-02');
});

test('[LEDGER-18.1] saves the date chosen in the date field', async () => {
  await startExpenses();
  await openNewExpense();

  chooseDate('2024-12-25');

  expect(dateField().value).toBe('2024-12-25');
  await fillForm({ amount: '8.75', title: 'Coffee run' });
  await press('Add');
  await expectFormClosed();
  expect((await onlyExpense()).date).toBe('2024-12-25');
});

test('[LEDGER-19.1] reads full-width digits in the amount', async () => {
  await startExpenses();

  await addExpense({ amount: '１２.３' });

  expect((await onlyExpense()).amountMinor).toBe(1230);
});

test('[LEDGER-19.1] reads a comma as the decimal point', async () => {
  await startExpenses();

  await addExpense({ amount: '12,5' });

  expect((await onlyExpense()).amountMinor).toBe(1250);
});

test('[LEDGER-19.1] reads a full-width decimal point and comma', async () => {
  await startExpenses();

  await addExpense({ title: 'Point', amount: '１２．３４' });
  await addExpense({ title: 'Comma', amount: '１２，５' });

  const expenses = await storedExpenses();
  expect(
    Object.fromEntries(
      expenses.map((expense) => [expense.title, expense.amountMinor]),
    ),
  ).toEqual({ Point: 1234, Comma: 1250 });
});

test('[LEDGER-19.1] does not read a comma as a thousands separator', async () => {
  await startExpenses();
  await openNewExpense();

  await fillForm({ amount: '1,234.56', title: 'Coffee run' });

  expect(formButton('Add').disabled).toBe(true);
});

test('[LEDGER-20.1] disables Add on a new form', async () => {
  await startExpenses();

  await openNewExpense();

  expect(formButton('Add').disabled).toBe(true);
});

test('[LEDGER-20.1] disables Add while the amount is 0', async () => {
  await startExpenses();
  await openNewExpense();

  await fillForm({ title: 'Invalid', amount: '0' });

  expect(formButton('Add').disabled).toBe(true);
});

test('[LEDGER-20.1] disables Add until the title has more than spaces', async () => {
  await startExpenses();
  await openNewExpense();

  await fillForm({ amount: '8.75', title: '   ' });
  expect(formButton('Add').disabled).toBe(true);
  await fillForm({ title: 'Coffee' });
  expect(formButton('Add').disabled).toBe(false);
});

test('[LEDGER-20.1] disables Add for an amount that is not valid, up to the largest amount', async () => {
  await startExpenses();
  await openNewExpense();
  await fillForm({ title: 'Coffee' });

  for (const amount of ['10.999', '12abc', '-1', '10000000000.00']) {
    await fillForm({ amount });
    expect([amount, formButton('Add').disabled]).toEqual([amount, true]);
  }
  await fillForm({ amount: '9999999999.99' });
  expect(formButton('Add').disabled).toBe(false);
});

test('[LEDGER-20.1] disables Save until the expense changes, and again once the change is undone', async () => {
  await startExpenses();
  await addExpense();
  await openEditExpense((await onlyExpense()).id);

  expect(formButton('Save').disabled).toBe(true);
  await fillForm({ title: 'Lunch' });
  expect(formButton('Save').disabled).toBe(false);
  await fillForm({ title: ' Coffee run ' });
  expect(formButton('Save').disabled).toBe(true);
});

test('[LEDGER-20.1] disables Save for decimals in a currency without them', async () => {
  await startExpenses();
  const expense = await addExpenseIn('JPY', '1200');
  await openEditExpense(expense.id);

  await fillForm({ amount: '12.5' });

  expect(formButton('Save').disabled).toBe(true);
});

test('[LEDGER-21.1] saves a personal expense with its text trimmed and closes the form', async () => {
  await startExpenses();
  const identity = await readIdentity();
  await openNewExpense();
  await fillForm({
    amount: ' 8.75 ',
    title: ' Coffee run ',
    note: ' Morning treat ',
  });

  await press('Add');

  await expectFormClosed();
  expect(selectedTab()).toBe('Expenses');
  expect(await storedExpenses()).toEqual([
    personalExpense(identity, {
      title: 'Coffee run',
      amountMinor: 875,
      currency: 'USD',
      date: '2026-10-30',
      category: await categoryNamed('Food & Dining'),
      note: 'Morning treat',
    }),
  ]);
});

test('[LEDGER-21.1] leaves out a note of only spaces', async () => {
  await startExpenses();

  await addExpense({ note: '   ' });

  expect((await onlyExpense()).note).toBeUndefined();
});

test('[LEDGER-21.1] adds one expense when Add is pressed twice before the save finishes', async () => {
  await startExpenses();
  await openNewExpense();
  await fillForm({ amount: '8.75', title: 'Coffee run' });
  const writes = holdWrites();
  const add = formButton('Add');

  act(() => {
    add.press();
    add.press();
  });
  await writes.release();
  await settle();

  await expectFormClosed();
  expect(await titles()).toEqual(['Coffee run']);
});

test('[LEDGER-22.1] saves the new amount as the payment and the share of the same expense', async () => {
  await startExpenses();
  const identity = await readIdentity();
  await addExpense();
  const before = await onlyExpense();

  await editExpense(before.id, { amount: '12.50' });

  expect(await storedExpenses()).toEqual([
    personalExpense(identity, {
      title: 'Coffee run',
      amountMinor: 1250,
      currency: 'USD',
      date: '2026-10-30',
      category: await categoryNamed('Food & Dining'),
    }),
  ]);
  expect((await onlyExpense()).id).toBe(before.id);
});

test('[LEDGER-22.1] keeps the currency of an expense without decimals', async () => {
  await startExpenses();
  const expense = await addExpenseIn('JPY', '1200');

  await editExpense(expense.id, { amount: '1500' });

  const saved = await onlyExpense();
  expect([saved.amountMinor, saved.currency]).toEqual([1500, 'JPY']);
});

test('[LEDGER-22.1] saves a new category and date, and leaves out a cleared note', async () => {
  await startExpenses();
  await addExpense({ note: 'Morning treat' });
  const expense = await onlyExpense();

  await editExpense(expense.id, {
    category: 'Shopping',
    date: '2024-12-25',
    note: '',
  });

  const saved = await onlyExpense();
  expect(saved.category).toEqual(await categoryNamed('Shopping'));
  expect(saved.date).toBe('2024-12-25');
  expect(saved.note).toBeUndefined();
});

test('[LEDGER-23.1] closes an unchanged New Expense on Cancel without asking', async () => {
  await startExpenses();
  await openNewExpense();

  await press('Cancel');

  await expectFormClosed();
  expect(alerts.shown()).toEqual([]);
  expect(await storedExpenses()).toEqual([]);
});

test('[LEDGER-23.1] closes Edit Expense on Cancel without asking once a change is undone', async () => {
  await startExpenses();
  await addExpense();
  await openEditExpense((await onlyExpense()).id);
  await fillForm({ title: 'Lunch' });
  await fillForm({ title: 'Coffee run' });

  await press('Cancel');

  await expectFormClosed();
  expect(alerts.shown()).toEqual([]);
});

test('[LEDGER-23.1] closes an unchanged form when it is swiped down', async () => {
  await startExpenses();
  await openNewExpense();

  await swipeFormDown();

  await expectFormClosed();
  expect(alerts.shown()).toEqual([]);
});

test('[LEDGER-24.1] asks before discarding a change, and Keep Editing keeps the input', async () => {
  await startExpenses();
  await openNewExpense();
  await fillForm({ title: 'Coffee' });

  await press('Cancel');

  expect(formTitle()).toBe('New Expense');
  expect(alerts.shown()).toEqual([DISCARD_CHANGES]);
  expect(alerts.buttons().map(([text]) => text)).toEqual([
    'Keep Editing',
    'Discard',
  ]);
  expect(alerts.buttons()[1]).toEqual(['Discard', 'destructive']);
  await alerts.choose('Keep Editing');
  expect(formTitle()).toBe('New Expense');
  expect(titleField()).toHaveDisplayValue('Coffee', AS_TYPED);
});

test('[LEDGER-24.1] closes without saving when Discard is chosen', async () => {
  await startExpenses();
  await openNewExpense();
  await fillForm({ amount: '8.75', title: 'Coffee' });
  await press('Cancel');

  await alerts.choose('Discard');

  await expectFormClosed();
  expect(await storedExpenses()).toEqual([]);
});

test('[LEDGER-24.1] asks when only the category changed', async () => {
  await startExpenses();
  await openNewExpense();
  await chooseCategory('Shopping');

  await press('Cancel');

  expect(alerts.shown()).toEqual([DISCARD_CHANGES]);
  expect(formTitle()).toBe('New Expense');
});

test('[LEDGER-24.1] leaves the expense as it was when an edit is discarded', async () => {
  await startExpenses();
  await addExpense();
  await openEditExpense((await onlyExpense()).id);
  await fillForm({ title: 'Lunch' });
  await press('Cancel');

  await alerts.choose('Discard');

  await expectFormClosed();
  expect(await titles()).toEqual(['Coffee run']);
});

test('[LEDGER-24.1] asks instead of closing when a changed form is swiped down', async () => {
  await startExpenses();
  await openNewExpense();
  await fillForm({ title: 'Coffee' });

  await swipeFormDown();

  expect(formTitle()).toBe('New Expense');
  expect(alerts.shown()).toEqual([DISCARD_CHANGES]);
});

test('[LEDGER-25.1] locks the form until the expense is saved', async () => {
  await startExpenses();
  await openNewExpense();
  await fillForm({ amount: '8.75', title: 'Coffee run' });
  const writes = holdWrites();

  await press('Add');

  expect(formButton('Cancel').disabled).toBe(true);
  expect(formButton('Add').disabled).toBe(true);
  expect(amountField()).toBeDisabled();
  expect(titleField()).toBeDisabled();
  expect(noteField()).toBeDisabled();
  expect(categoryButton()).toBeDisabled();
  expect(dateField().disabled).toBe(true);
  await press('Cancel');
  expect(formTitle()).toBe('New Expense');
  await writes.release();
  await settle();
  await expectFormClosed();
  expect(await titles()).toEqual(['Coffee run']);
});

test('[LEDGER-25.1] keeps the form open without asking when it is swiped down during the save', async () => {
  await startExpenses();
  await openNewExpense();
  await fillForm({ amount: '8.75', title: 'Coffee run' });
  const writes = holdWrites();
  await press('Add');

  await swipeFormDown();

  expect(formTitle()).toBe('New Expense');
  expect(alerts.shown()).toEqual([]);
  await writes.release();
  await settle();
  await expectFormClosed();
  expect(await titles()).toEqual(['Coffee run']);
});

test('[LEDGER-25.1] unlocks the form once the save fails', async () => {
  await startExpenses();
  await openNewExpense();
  await fillForm({ amount: '8.75', title: 'Coffee run' });
  failWrites();

  await press('Add');

  expect(formButton('Cancel').disabled).toBe(false);
  expect(formButton('Add').disabled).toBe(false);
  expect(amountField()).toBeEnabled();
  expect(titleField()).toBeEnabled();
  expect(noteField()).toBeEnabled();
  expect(categoryButton()).toBeEnabled();
  expect(dateField().disabled).not.toBe(true);
});

test('[LEDGER-26.1] reports an expense that cannot be added and keeps the form as it was', async () => {
  await startExpenses();
  await openNewExpense();
  await fillForm({ amount: '8.75', title: 'Coffee run' });
  failWrites();

  await press('Add');

  expect(alerts.shown()).toEqual([SAVE_FAILED]);
  expect(formTitle()).toBe('New Expense');
  expect(titleField()).toHaveDisplayValue('Coffee run', AS_TYPED);
  expect(amountField()).toHaveDisplayValue('8.75', AS_TYPED);
  expect(formButton('Add').disabled).toBe(false);
  await press('Cancel');
  await alerts.choose('Discard');
  await expectFormClosed();
  expect(await storedExpenses()).toEqual([]);
});

test('[LEDGER-26.1] adds one expense when Add is pressed again after writes recover', async () => {
  await startExpenses();
  await openNewExpense();
  await fillForm({ amount: '8.75', title: 'Coffee run' });
  failWrites();
  await press('Add');
  allowWrites();

  await press('Add');

  await expectFormClosed();
  expect(await titles()).toEqual(['Coffee run']);
});

test('[LEDGER-26.1] reports an edit that cannot be saved and leaves the expense as it was', async () => {
  await startExpenses();
  await addExpense();
  await openEditExpense((await onlyExpense()).id);
  await fillForm({ amount: '12.50' });
  failWrites();

  await press('Save');

  expect(alerts.shown()).toEqual([SAVE_FAILED]);
  expect(formTitle()).toBe('Edit Expense');
  await press('Cancel');
  await alerts.choose('Discard');
  await expectFormClosed();
  expect((await onlyExpense()).amountMinor).toBe(875);
});

test('[LEDGER-27.1] keeps every field of the expenses after the app restarts', async () => {
  const app = await startExpenses();
  const identity = await readIdentity();
  await addExpense({
    title: 'Lunch',
    amount: '12.00',
    category: 'Shopping',
    date: '2026-10-29',
    note: 'With Sam',
  });
  await addExpense();
  const lunch = (await storedExpenses()).find(
    (expense) => expense.title === 'Lunch',
  );
  await editExpense(lunch!.id, { amount: '15.00' });
  const before = await storedExpenses();

  await restart(app);

  expect(before).toEqual([
    personalExpense(identity, {
      title: 'Coffee run',
      amountMinor: 875,
      currency: 'USD',
      date: '2026-10-30',
      category: await categoryNamed('Food & Dining'),
    }),
    personalExpense(identity, {
      title: 'Lunch',
      amountMinor: 1500,
      currency: 'USD',
      date: '2026-10-29',
      category: await categoryNamed('Shopping'),
      note: 'With Sam',
    }),
  ]);
  expect(await storedExpenses()).toEqual(before);
  await openEditExpense(lunch!.id);
  expect(amountField()).toHaveDisplayValue('15.00', AS_TYPED);
  expect(noteField()).toHaveDisplayValue('With Sam', AS_TYPED);
});

test('[LEDGER-27.1] keeps the name and color the category had when the expense was saved', async () => {
  await startExpenses();
  await addExpense({ category: 'Shopping' });
  const shopping = await categoryNamed('Shopping');

  await editCategory('Shopping', 'Groceries', '#43A047');

  expect((await onlyExpense()).category).toEqual({
    id: shopping.id,
    name: 'Shopping',
    color: '#FBC02D',
  });
});

test("[LEDGER-27.1] stores the category's current name and color when the expense is saved again", async () => {
  await startExpenses();
  await addExpense({ category: 'Shopping' });
  const shopping = await categoryNamed('Shopping');
  await editCategory('Shopping', 'Groceries', '#43A047');

  await editExpense((await onlyExpense()).id, { title: 'Groceries run' });

  expect((await onlyExpense()).category).toEqual({
    id: shopping.id,
    name: 'Groceries',
    color: '#43A047',
  });
});

test('[LEDGER-28.1] lists the expenses newest date first', async () => {
  await startExpenses();

  await addExpense({ title: 'A', date: '2025-01-01' });
  await addExpense({ title: 'B', date: '2025-01-03' });
  await addExpense({ title: 'C', date: '2025-01-02' });

  expect(await titles()).toEqual(['B', 'C', 'A']);
});

test('[LEDGER-28.1] lists the expense added later first on the same date, and keeps it there when edited', async () => {
  await startExpenses();
  // The clock does not move between the two adds.
  await addExpense({ title: 'D', date: '2025-01-01' });
  await addExpense({ title: 'E', date: '2025-01-01' });
  expect(await titles()).toEqual(['E', 'D']);
  const d = (await storedExpenses()).find((expense) => expense.title === 'D');

  await editExpense(d!.id, { title: 'D2' });
  expect(await titles()).toEqual(['E', 'D2']);

  await editExpense(d!.id, { date: '2025-01-02' });
  expect(await titles()).toEqual(['D2', 'E']);
});

// SHELL-34.1 leaves out the colors of user data, such as a category's color.
const PALETTE_COLORS = new Set(
  PALETTE.map((color) => (processColor(color) as number) >>> 0),
);

function appColors(root: Parameters<typeof fixedColors>[0]) {
  return {
    colors: new Map(
      [...fixedColors(root)].filter(
        ([, { color }]) => !PALETTE_COLORS.has(color),
      ),
    ),
    uncolored: textsWithoutColor(root),
  };
}

test('[SHELL-34.1] colors the expense form and the category list with colors that follow the appearance', async () => {
  fakePhoneAppearance('light');
  await startExpenses();
  await openNewExpense();
  const lightForm = appColors(formScreen());
  await openCategoryList();
  const lightList = appColors(categoryListView());

  switchPhoneTo('dark');
  const darkList = appColors(categoryListView());
  await cancelCategoryList();
  const darkForm = appColors(formScreen());

  expect(colorsInBoth(lightForm.colors, darkForm.colors)).toEqual([]);
  expect(colorsInBoth(lightList.colors, darkList.colors)).toEqual([]);
  expect([
    ...lightForm.uncolored,
    ...darkForm.uncolored,
    ...lightList.uncolored,
    ...darkList.uncolored,
  ]).toEqual([]);
});
