import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { processColor } from 'react-native';
import { within } from '@testing-library/react-native';
import {
  DISCARD_CHANGES,
  amountField,
  cancelCategoryList,
  categoryButton,
  categoryListView,
  chooseDate,
  dateFieldForScreenReaders,
  dateFieldView,
  expectFormClosed,
  fillForm,
  formBarSides,
  formCategory,
  formIsInATab,
  formScreen,
  formTitle,
  inTreeOrder,
  isCategoryListOpen,
  noteField,
  openCategoryList,
  openNewExpense,
  phoneDatabase,
  press,
  pressBack,
  resetPhone,
  setPhoneLanguage,
  startExpenses,
  storedExpenses,
  titleField,
  watchAlerts,
} from './ledger-expense-app';
import { dotColors, PALETTE } from './ledger-expense-list-app';
import {
  allowWrites,
  colorsInBoth,
  fakePhoneAppearance,
  fixedColors,
  holdWrites,
  settle,
  switchPhoneTo,
  textsWithoutColor,
} from './shell-appearance-app';
import { selectedTab } from './shell-tabs-app';
import type { Database } from '../../src/storage';

// Runs on Android only (apps/mobile/jest.config.cjs), as the expense form tests do
// on iOS: a phone database file of its own, in Taipei on 2026-10-30, in a region
// whose currency is USD.

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

/** The ways Android shows a screen rising from the bottom. */
const FROM_THE_BOTTOM = ['slide_from_bottom', 'fade_from_bottom'];

let directory: string;
let alerts: ReturnType<typeof watchAlerts>;

beforeEach(() => {
  jest.clearAllMocks();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'expenses-android-'));
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

test('[LEDGER-12.1] opens New Expense rising from the bottom over the tab bar on Android', async () => {
  await startExpenses();

  await openNewExpense();

  expect(FROM_THE_BOTTOM).toContain(formScreen().props.stackAnimation);
  // Android draws no title bar on a form sheet (react-native-screens), which would
  // leave the form without its Cancel and Add.
  expect(formScreen().props.stackPresentation).not.toBe('formSheet');
  expect(formIsInATab()).toBe(false);
  expect(formBarSides()).toEqual({ left: ['Cancel'], right: ['Add'] });
});

test('[LEDGER-13.2] puts Cancel at the left and Add at the right of the header on Android', async () => {
  await startExpenses();

  await openNewExpense();

  expect(formBarSides()).toEqual({ left: ['Cancel'], right: ['Add'] });
});

test('[LEDGER-17.5] [LEDGER-90.1] opens the category list as a sheet titled Category, and keeps the category when it is cancelled', async () => {
  await startExpenses();
  await openNewExpense();

  await openCategoryList();

  expect(isCategoryListOpen()).toBe(true);
  await cancelCategoryList();
  expect(isCategoryListOpen()).toBe(false);
  expect(formTitle()).toBe('New Expense');
  expect(formCategory()).toBe('Food & Dining');
});

test('[LEDGER-17.5] puts a dot of its color before each category in the sheet', async () => {
  await startExpenses();
  await openNewExpense();

  await openCategoryList();

  expect(dotColors(categoryListView()).slice(0, 3)).toEqual([
    '#D81B60',
    '#1E88E5',
    '#FBC02D',
  ]);
});

// SHELL-34.1 leaves out the colors of user data, such as a category's color.
const PALETTE_COLORS = new Set(
  PALETTE.map((color) => (processColor(color) as number) >>> 0),
);

const appColors = (root: Parameters<typeof fixedColors>[0]) => ({
  colors: new Map(
    [...fixedColors(root)].filter(
      ([, { color }]) => !PALETTE_COLORS.has(color),
    ),
  ),
  uncolored: textsWithoutColor(root),
});

test('[SHELL-34.1] colors the category list with colors that follow the appearance', async () => {
  fakePhoneAppearance('light');
  await startExpenses();
  await openNewExpense();
  await openCategoryList();
  const light = appColors(categoryListView());

  await switchPhoneTo('dark');
  const dark = appColors(categoryListView());

  expect(colorsInBoth(light.colors, dark.colors)).toEqual([]);
  expect([...light.uncolored, ...dark.uncolored]).toEqual([]);
});

test('[LEDGER-13.2] shows the title, currency, amount, category, date and note in order on Android', async () => {
  await startExpenses();

  await openNewExpense();

  expect(
    inTreeOrder(
      titleField(),
      within(formScreen()).getByText('USD'),
      amountField(),
      categoryButton(),
      dateFieldView(),
      noteField(),
    ),
  ).toBe(true);
});

test('[LEDGER-23.1] closes an unchanged form when Back is pressed', async () => {
  await startExpenses();
  await openNewExpense();

  await pressBack();

  await expectFormClosed();
  expect(selectedTab()).toBe('Expenses');
  expect(alerts.shown()).toEqual([]);
});

test('[LEDGER-24.1] asks before discarding a change when Back is pressed', async () => {
  await startExpenses();
  await openNewExpense();
  await fillForm({ amount: '8.75', title: 'Coffee' });

  await pressBack();

  expect(formTitle()).toBe('New Expense');
  expect(alerts.shown()).toEqual([DISCARD_CHANGES]);
  await alerts.choose('Discard');
  await expectFormClosed();
  expect(await storedExpenses()).toEqual([]);
});

test('[LEDGER-25.1] keeps the form open without asking when Back is pressed during the save', async () => {
  await startExpenses();
  await openNewExpense();
  await fillForm({ amount: '8.75', title: 'Coffee run' });
  const writes = holdWrites();
  await press('Add');

  await pressBack();

  expect(formTitle()).toBe('New Expense');
  expect(alerts.shown()).toEqual([]);
  await writes.release();
  await settle();
  await expectFormClosed();
  expect((await storedExpenses()).map((expense) => expense.title)).toEqual([
    'Coffee run',
  ]);
});

test('[LEDGER-13.2] names the date field Date on Android, leaving the date out of its name', async () => {
  await startExpenses();

  await openNewExpense();

  expect(dateFieldForScreenReaders().name).toBe('Date');
});

test("[LEDGER-30.1] shows today in the phone region's date format and reads it with the name Date", async () => {
  await startExpenses();

  await openNewExpense();

  expect(within(dateFieldView()).getByText('Oct 30, 2026')).toBeOnTheScreen();
  expect(dateFieldForScreenReaders()).toEqual({
    name: 'Date',
    value: 'Oct 30, 2026',
  });
});

test('[LEDGER-30.1] shows the date the way a phone in Japan writes it', async () => {
  await startExpenses();
  setPhoneLanguage('ja-JP');

  await openNewExpense();

  expect(within(dateFieldView()).getByText('2026/10/30')).toBeOnTheScreen();
  expect(dateFieldForScreenReaders().value).toBe('2026/10/30');
});

test('[LEDGER-30.1] shows a chosen date in the same format', async () => {
  await startExpenses();
  await openNewExpense();

  await chooseDate('2024-12-25');

  expect(within(dateFieldView()).getByText('Dec 25, 2024')).toBeOnTheScreen();
  expect(dateFieldForScreenReaders().value).toBe('Dec 25, 2024');
});
