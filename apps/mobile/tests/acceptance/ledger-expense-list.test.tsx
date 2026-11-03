import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { processColor } from 'react-native';
import {
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';
import {
  addExpense,
  editCategory,
  editExpense,
  expectForm,
  expectFormClosed,
  fillForm,
  formCount,
  press,
  resetPhone,
  restart,
  setPhoneClock,
  setPhoneLanguage,
  setRegionCurrency,
  startExpenses,
  storedExpenses,
  titleField,
} from './ledger-expense-app';
import {
  EMPTY_LIST,
  NOT_FOUND,
  NO_EXPENSE_ID,
  allowReads,
  card,
  cardTitles,
  cards,
  detailBarItems,
  detailBars,
  detailLines,
  detailScreen,
  expectDetails,
  expensesRoot,
  goBackFromDetails,
  hasEdit,
  holdReads,
  linesIn,
  openDetails,
  phoneDatabaseWithReads,
  pressEdit,
  readOut,
  scrollViewTheTitleFollows,
  shownInOrder,
  startExpensesAt,
  totalShareLines,
} from './ledger-expense-list-app';
import { saveName } from './groups-app';
import {
  allowWrites,
  colorsInBoth,
  fakePhoneAppearance,
  fixedColors,
  settle,
  switchPhoneTo,
  textsWithoutColor,
} from './shell-appearance-app';
import {
  navigationBarTitles,
  selectedTab,
  tab,
  tapTab,
} from './shell-tabs-app';
import type { Database } from '../../src/storage';

// Runs on iOS. Each test starts the app on a phone database file of its own, in
// Taipei on 2026-10-30, in a region whose currency is USD, unless it says otherwise,
// and adds its expenses through New Expense.

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

let directory: string;

beforeEach(() => {
  jest.clearAllMocks();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'expense-list-'));
  const file = path.join(directory, 'app.db');
  mockOpen = async () => phoneDatabaseWithReads(file);
  allowWrites();
  allowReads();
  resetPhone();
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});

async function onlyExpense() {
  const expenses = await storedExpenses();
  expect(expenses).toHaveLength(1);
  return expenses[0];
}

async function expenseTitled(title: string) {
  const expense = (await storedExpenses()).find(
    (candidate) => candidate.title === title,
  );
  if (expense === undefined) throw new Error(`No expense titled ${title}`);
  return expense;
}

/** Adds an expense in the currency of a region, then moves the phone back to USD. */
async function addExpenseIn(currency: string, title: string, amount: string) {
  setRegionCurrency(currency);
  await addExpense({ title, amount });
  setRegionCurrency('USD');
}

const LONG_TITLE = 'a'.repeat(200);
const LONG_NOTE = 'b'.repeat(500);

// The expense list

test('[LEDGER-31.1] lists the personal expenses newest date first', async () => {
  await startExpenses();
  await addExpense({ title: 'A', date: '2025-01-01' });
  await addExpense({ title: 'B', date: '2025-01-03' });
  await addExpense({ title: 'C', date: '2025-01-02' });

  expect(cardTitles()).toEqual(['B', 'C', 'A']);
});

test('[LEDGER-31.1] lists the expense added later first on the same date', async () => {
  await startExpenses();
  await addExpense({ title: 'E', date: '2025-01-01' });
  await addExpense({ title: 'F', date: '2025-01-01' });
  await addExpense({ title: 'D', date: '2025-01-01' });

  expect(cardTitles()).toEqual(['D', 'F', 'E']);
});

test('[LEDGER-31.1] shows a new expense on top once New Expense closes', async () => {
  await startExpenses();
  await addExpense({ title: 'Coffee run' });

  await addExpense({ title: 'Lunch' });

  expect(cardTitles()).toEqual(['Lunch', 'Coffee run']);
});

test('[LEDGER-31.1] shows the change to an expense once Edit Expense closes', async () => {
  await startExpenses();
  await addExpense();
  const expense = await onlyExpense();

  await editExpense(expense.id, { title: 'Lunch', amount: '12.50' });
  await settle();

  expect(cardTitles()).toEqual(['Lunch']);
  expect(linesIn(card('Lunch'))).toContain('$12.50');
  expect(linesIn(expensesRoot())).not.toContain('Coffee run');
});

test('[LEDGER-31.1] keeps the cards after the app restarts', async () => {
  const app = await startExpenses();
  await addExpense({ title: 'Coffee run' });
  await addExpense({ title: 'Lunch' });

  await restart(app);

  await waitFor(() => expect(cardTitles()).toEqual(['Lunch', 'Coffee run']));
});

test('[LEDGER-32.2] shows the empty list text and no cards on the first start', async () => {
  await startExpenses();

  await waitFor(() => expect(linesIn(expensesRoot())).toContain(EMPTY_LIST));
  expect(cards()).toEqual([]);
});

test('[LEDGER-32.2] replaces the empty list text with the first card', async () => {
  await startExpenses();

  await addExpense();

  expect(cardTitles()).toEqual(['Coffee run']);
  expect(linesIn(expensesRoot())).not.toContain(EMPTY_LIST);
});

test('[LEDGER-43.1] never shows the empty list while the stored expenses load', async () => {
  const first = await startExpenses();
  await addExpense();
  await first.unmount();
  await settle();
  const reads = holdReads();

  await startExpenses();

  expect(screen.queryByText(EMPTY_LIST)).toBeNull();
  expect(totalShareLines()).not.toContain('Your Total Share: —');
  await reads.release();
  await waitFor(() => expect(cardTitles()).toEqual(['Coffee run']));
  expect(screen.queryByText(EMPTY_LIST)).toBeNull();
});

// Cards

test('[LEDGER-33.1] shows the title, amount, category and date on the card, without the note or payer', async () => {
  await startExpenses();
  await saveName('Tom');
  await tapTab('Expenses');

  await addExpense({ note: 'Morning treat' });

  const lines = linesIn(card('Coffee run'));
  const expected = ['Coffee run', '$8.75', 'Food & Dining', 'Oct 30, 2026'];
  expect(shownInOrder(lines, expected)).toEqual(expected);
  expect(lines.join('\n')).not.toMatch(/Morning treat|Tom|paid/i);
});

test('[LEDGER-33.1] reads each card as one button with its title, amount, category and date', async () => {
  await startExpenses();

  await addExpense();

  expect(cards()).toHaveLength(1);
  const [shown] = cards();
  const expected = ['Coffee run', '$8.75', 'Food & Dining', 'Oct 30, 2026'];
  expect(shownInOrder([readOut(shown)], expected)).toEqual(expected);
});

test('[LEDGER-33.1] shows the current name of a renamed category on the card', async () => {
  await startExpenses();
  await addExpense({ category: 'Shopping' });

  await editCategory('Shopping', 'Groceries');

  await waitFor(() =>
    expect(linesIn(card('Coffee run'))).toContain('Groceries'),
  );
  expect(linesIn(card('Coffee run'))).not.toContain('Shopping');
});

test('[LEDGER-34.1] shows the title on one line, cut at its end, and reads it in full', async () => {
  await startExpenses();

  await addExpense({ title: LONG_TITLE });

  const shown = within(card(LONG_TITLE)).getByText(LONG_TITLE);
  expect(shown.props.numberOfLines).toBe(1);
  expect(shown.props.ellipsizeMode ?? 'tail').toBe('tail');
  expect(readOut(card(LONG_TITLE))).toContain(LONG_TITLE);
});

// Your Total Share

test('[LEDGER-35.1] sums the cards of one currency', async () => {
  await startExpenses();
  await addExpense({ amount: '8.75' });
  await addExpense({ title: 'Lunch', amount: '12.50' });

  expect(totalShareLines()).toEqual(['Your Total Share: $21.25']);
});

test('[LEDGER-35.1] shows a line for each currency, above the cards, by currency code', async () => {
  setPhoneLanguage('en-US');
  await startExpenses();

  await addExpenseIn('AUD', 'Taxi', '0.30');
  await addExpenseIn('USD', 'Coffee', '8.75');
  await addExpenseIn('JPY', 'Ramen', '1200');

  expect(cardTitles()).toEqual(['Ramen', 'Coffee', 'Taxi']);
  expect(totalShareLines()).toEqual([
    'Your Total Share: A$0.30',
    'Your Total Share: ¥1,200',
    'Your Total Share: $8.75',
  ]);
  const lines = linesIn(expensesRoot());
  expect(lines.indexOf('Your Total Share: $8.75')).toBeLessThan(
    lines.indexOf('Ramen'),
  );
});

test('[LEDGER-35.1] shows Your Total Share as text that does nothing when pressed', async () => {
  const app = await startExpenses();
  await addExpense();
  expect(totalShareLines()).toEqual(['Your Total Share: $8.75']);

  const buttons = within(expensesRoot()).queryAllByRole('button');
  expect(
    buttons
      .filter((button) =>
        linesIn(button).some((line) => line.startsWith('Your Total Share')),
      )
      .map(readOut),
  ).toEqual([]);
  await fireEvent.press(screen.getByText('Your Total Share: $8.75'));
  await settle();
  expect(app.getPathname()).toBe('/');
});

test('[LEDGER-35.1] shows a dash before there are expenses', async () => {
  await startExpenses();

  await waitFor(() =>
    expect(totalShareLines()).toEqual(['Your Total Share: —']),
  );
});

test('[LEDGER-35.1] follows a changed amount', async () => {
  await startExpenses();
  await addExpense({ amount: '8.75' });
  const expense = await onlyExpense();

  await editExpense(expense.id, { amount: '12.50' });
  await settle();

  expect(totalShareLines()).toEqual(['Your Total Share: $12.50']);
});

test('[LEDGER-35.1] sums past the largest amount of a single expense', async () => {
  await startExpenses();
  await addExpense({ amount: '9999999999.99' });
  await addExpense({ title: 'Lunch', amount: '9999999999.99' });

  expect(totalShareLines()).toEqual(['Your Total Share: $19,999,999,999.98']);
});

// Opening the details

test('[LEDGER-36.1] pushes the details of the card pressed onto the Expenses tab at /expenses/<id>', async () => {
  const app = await startExpenses();
  await addExpense({ title: 'Coffee run' });
  await addExpense({ title: 'Lunch', amount: '12.50' });
  const lunch = await expenseTitled('Lunch');

  await openDetails('Lunch');

  expect(selectedTab()).toBe('Expenses');
  expect(navigationBarTitles(tab('Expenses'))).toEqual(['Expenses', 'Expense']);
  expect(app.getPathname()).toBe(`/expenses/${lunch.id}`);
  expect(detailLines()).toContain('$12.50');
  expect(detailLines()).not.toContain('Coffee run');
});

test('[LEDGER-36.1] opens the details at /expenses/<id> on top of the Expenses root', async () => {
  const first = await startExpenses();
  await addExpense({ title: 'Coffee run' });
  await addExpense({ title: 'Lunch' });
  const lunch = await expenseTitled('Lunch');
  await first.unmount();
  await settle();

  await startExpensesAt(`/expenses/${lunch.id}`);

  await expectDetails('Lunch');
  expect(selectedTab()).toBe('Expenses');
  expect(navigationBarTitles(tab('Expenses'))).toEqual(['Expenses', 'Expense']);
  expect(detailLines()).not.toContain('Coffee run');
});

test('[LEDGER-36.1] pushes one details screen when a card is pressed twice', async () => {
  await startExpenses();
  await addExpense({ title: 'Lunch' });

  const pressed = card('Lunch');
  await fireEvent.press(pressed);
  await fireEvent.press(pressed);
  await expectDetails('Lunch');

  expect(navigationBarTitles(tab('Expenses'))).toEqual(['Expenses', 'Expense']);
  await goBackFromDetails();
  expect(navigationBarTitles(tab('Expenses'))).toEqual(['Expenses']);
});

test('[LEDGER-36.1] goes back from the details to the expense list', async () => {
  await startExpenses();
  await addExpense();
  await openDetails('Coffee run');

  await goBackFromDetails();

  expect(selectedTab()).toBe('Expenses');
  expect(navigationBarTitles(tab('Expenses'))).toEqual(['Expenses']);
  expect(cardTitles()).toEqual(['Coffee run']);
});

// The details

test('[LEDGER-37.1] shows the title, amount, category, date and note in order on the details', async () => {
  await startExpenses();
  await addExpense({
    category: 'Shopping',
    date: '2024-12-25',
    note: 'Morning treat',
  });

  await openDetails('Coffee run');

  const expected = [
    'Coffee run',
    '$8.75',
    'DETAILS',
    'Category',
    'Shopping',
    'Date',
    'Dec 25, 2024',
    'NOTE',
    'Morning treat',
  ];
  expect(shownInOrder(detailLines(), expected)).toEqual(expected);
});

test('[LEDGER-37.1] leaves out the NOTE section for an expense without a note', async () => {
  await startExpenses();
  await addExpense();

  await openDetails('Coffee run');

  const expected = ['Coffee run', '$8.75', 'DETAILS', 'Category', 'Date'];
  expect(shownInOrder(detailLines(), expected)).toEqual(expected);
  expect(detailLines()).not.toContain('NOTE');
});

test('[LEDGER-37.1] shows the current name of a renamed category on the details', async () => {
  await startExpenses();
  await addExpense({ category: 'Shopping' });
  await editCategory('Shopping', 'Groceries');

  await openDetails('Coffee run');

  expect(detailLines()).toContain('Groceries');
  expect(detailLines()).not.toContain('Shopping');
});

test('[LEDGER-37.1] shows a long title and note in full on the details', async () => {
  await startExpenses();
  await addExpense({ title: LONG_TITLE, note: LONG_NOTE });

  await openDetails(LONG_TITLE);

  for (const text of [LONG_TITLE, LONG_NOTE]) {
    const shown = within(detailScreen()).getByText(text);
    expect(shown.props.numberOfLines ?? 0).toBe(0);
  }
});

test('[LEDGER-38.1] opens Edit Expense for the expense from Edit on the details', async () => {
  const app = await startExpenses();
  await addExpense();
  const expense = await onlyExpense();
  await openDetails('Coffee run');

  await pressEdit();

  await expectForm('Edit Expense');
  expect(titleField()).toHaveDisplayValue('Coffee run');
  expect(app.getPathname()).toBe(`/expenses/${expense.id}/edit`);
});

test('[LEDGER-38.1] shows the saved change on the details once Edit Expense closes', async () => {
  await startExpenses();
  await addExpense();
  await openDetails('Coffee run');

  await pressEdit();
  await expectForm('Edit Expense');
  await fillForm({ title: 'Lunch', amount: '12.50' });
  await press('Save');
  await expectFormClosed();

  await waitFor(() => expect(detailLines()).toContain('Lunch'));
  expect(navigationBarTitles(tab('Expenses'))).toEqual(['Expenses', 'Expense']);
  expect(detailLines()).toContain('$12.50');
  expect(detailLines()).not.toContain('Coffee run');
});

test('[LEDGER-38.1] opens one Edit Expense when Edit is pressed twice', async () => {
  await startExpenses();
  await addExpense();
  await openDetails('Coffee run');

  await pressEdit();
  await pressEdit();
  await settle();

  await expectForm('Edit Expense');
  expect(formCount()).toBe(1);
  await press('Cancel');
  await expectFormClosed();
  expect(navigationBarTitles(tab('Expenses'))).toEqual(['Expenses', 'Expense']);
});

test('[LEDGER-44.1] shows the saved change on the list as soon as the details go back', async () => {
  await startExpenses();
  await addExpense();
  await openDetails('Coffee run');
  await pressEdit();
  await expectForm('Edit Expense');
  await fillForm({ amount: '9.25' });
  await press('Save');
  await expectFormClosed();
  await waitFor(() => expect(detailLines()).toContain('$9.25'));
  await settle();
  // With reads held, the list shows only what it had before the details went back.
  const reads = holdReads();

  await goBackFromDetails();

  expect(detailBars()).toEqual([]);
  expect(linesIn(card('Coffee run'))).toContain('$9.25');
  expect(totalShareLines()).toEqual(['Your Total Share: $9.25']);
  await reads.release();
});

test('[LEDGER-39.1] shows only Expense not found., titled Expense, for an ID that is no expense', async () => {
  await startExpensesAt(`/expenses/${NO_EXPENSE_ID}`);

  await waitFor(() => expect(detailBars()).toHaveLength(1));
  expect(selectedTab()).toBe('Expenses');
  await waitFor(() => expect(detailLines()).toEqual([NOT_FOUND]));
  expect(hasEdit()).toBe(false);
});

test("[LEDGER-39.1] never shows Expense not found. while an expense's details open from its card", async () => {
  await startExpenses();
  await addExpense();
  const reads = holdReads();

  await fireEvent.press(card('Coffee run'));
  await waitFor(() => expect(detailBars()).toHaveLength(1));
  await settle();

  expect(screen.queryByText(NOT_FOUND)).toBeNull();
  await reads.release();
  await expectDetails('Coffee run');
  expect(screen.queryByText(NOT_FOUND)).toBeNull();
});

test('[LEDGER-39.1] never shows Expense not found. while details opened at their URL load', async () => {
  const first = await startExpenses();
  await addExpense();
  const expense = await onlyExpense();
  await first.unmount();
  await settle();
  const reads = holdReads();

  await startExpensesAt(`/expenses/${expense.id}`);
  await waitFor(() => expect(detailBars()).toHaveLength(1));
  await settle();

  expect(screen.queryByText(NOT_FOUND)).toBeNull();
  await reads.release();
  await expectDetails('Coffee run');
  expect(screen.queryByText(NOT_FOUND)).toBeNull();
});

// Formats

test('[LEDGER-40.1] shows amounts and dates the way a phone in the United States does', async () => {
  setPhoneLanguage('en-US');
  await startExpenses();

  await addExpenseIn('USD', 'Coffee', '8.75');
  await addExpenseIn('AUD', 'Taxi', '0.30');
  await addExpenseIn('JPY', 'Ramen', '1200');

  for (const [title, amount] of [
    ['Coffee', '$8.75'],
    ['Taxi', 'A$0.30'],
    ['Ramen', '¥1,200'],
  ]) {
    const expected = [title, amount, 'Oct 30, 2026'];
    expect(shownInOrder(linesIn(card(title)), expected)).toEqual(expected);
  }
  await openDetails('Ramen');
  const expected = ['Ramen', '¥1,200', 'Oct 30, 2026'];
  expect(shownInOrder(detailLines(), expected)).toEqual(expected);
});

test('[LEDGER-40.1] shows amounts and dates the way a phone in Japan does', async () => {
  setPhoneLanguage('ja-JP');
  setRegionCurrency('JPY');
  await startExpenses();

  await addExpense({ title: 'Ramen', amount: '1200' });

  const expected = ['Ramen', '￥1,200', '2026/10/30'];
  expect(shownInOrder(linesIn(card('Ramen')), expected)).toEqual(expected);
  expect(totalShareLines()).toEqual(['Your Total Share: ￥1,200']);
  await openDetails('Ramen');
  expect(shownInOrder(detailLines(), expected)).toEqual(expected);
});

test("[LEDGER-40.1] shows the currency's own decimals where the region rounds them away", async () => {
  setPhoneLanguage('en-US');
  await startExpenses();

  await addExpenseIn('IDR', 'Satay', '1234.56');
  await addExpenseIn('IQD', 'Tea', '1.234');

  expect(linesIn(card('Satay'))).toContain('IDR 1,234.56');
  expect(linesIn(card('Tea'))).toContain('IQD 1.234');
});

test('[LEDGER-40.1] shows the largest amount in full on the card and the details', async () => {
  await startExpenses();

  await addExpense({ amount: '9999999999.99' });

  expect(linesIn(card('Coffee run'))).toContain('$9,999,999,999.99');
  await openDetails('Coffee run');
  expect(detailLines()).toContain('$9,999,999,999.99');
});

test('[LEDGER-40.1] shows the date of an expense on a phone west of UTC', async () => {
  // jest.config.cjs runs the tests in America/Los_Angeles, where a date read
  // as UTC midnight falls on the day before.
  expect(new Date(2026, 9, 25).getTimezoneOffset()).toBeGreaterThan(0);
  await startExpenses();
  setPhoneClock('America/Los_Angeles', '2026-10-30T19:00:00Z');

  await addExpense({ date: '2026-10-25' });

  expect(linesIn(card('Coffee run'))).toContain('Oct 25, 2026');
  await openDetails('Coffee run');
  expect(detailLines()).toContain('Oct 25, 2026');
});

// The shell's rules on these screens

test('[SHELL-13.1] shows only a back arrow named Back on the details', async () => {
  await startExpenses();
  await addExpense();

  await openDetails('Coffee run');

  const pushed = detailBars()[0]?.props;
  // The native stack hides the back title with backButtonDisplayMode on iOS 14
  // and later, and with backTitleVisible when it knows no iOS version, as in Jest.
  expect(pushed).toMatchObject(
    pushed?.backButtonDisplayMode === undefined
      ? { backTitle: 'Back', backTitleVisible: false }
      : { backTitle: 'Back', backButtonDisplayMode: 'minimal' },
  );
});

test('[SHELL-25.1] puts the expense list in the scroll view the Expenses large title follows', async () => {
  await startExpenses();
  await addExpense();

  const scrollView = scrollViewTheTitleFollows();

  expect(scrollView?.props.contentInsetAdjustmentBehavior).toBe('automatic');
  const lines = linesIn(scrollView!);
  expect(lines).toContain('Your Total Share: $8.75');
  expect(lines).toContain('Coffee run');
});

test('[SHELL-52.1] puts Edit at the right of the details title bar as a plain text button on iOS', async () => {
  await startExpenses();
  await addExpense();

  await openDetails('Coffee run');

  expect(detailBarItems()).toEqual([
    { type: 'button', title: 'Edit', variant: 'plain' },
  ]);
});

// SHELL-34.1 leaves out the colors of user data, such as a category's color.
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

test('[SHELL-34.1] colors the expense list and the details with colors that follow the appearance', async () => {
  fakePhoneAppearance('light');
  await startExpenses();
  await addExpense({ note: 'Morning treat' });
  const lightList = appColors(expensesRoot());
  await openDetails('Coffee run');
  const lightDetails = appColors(detailScreen());

  await switchPhoneTo('dark');
  const darkDetails = appColors(detailScreen());
  await goBackFromDetails();
  const darkList = appColors(expensesRoot());

  expect(colorsInBoth(lightList.colors, darkList.colors)).toEqual([]);
  expect(colorsInBoth(lightDetails.colors, darkDetails.colors)).toEqual([]);
  expect([
    ...lightList.uncolored,
    ...darkList.uncolored,
    ...lightDetails.uncolored,
    ...darkDetails.uncolored,
  ]).toEqual([]);
});
