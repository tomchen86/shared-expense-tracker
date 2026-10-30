import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  DISCARD_CHANGES,
  expectFormClosed,
  fillForm,
  formBarSides,
  formIsInATab,
  formScreen,
  formTitle,
  openNewExpense,
  phoneDatabase,
  press,
  pressBack,
  resetPhone,
  startExpenses,
  storedExpenses,
  watchAlerts,
} from './ledger-expense-app';
import { allowWrites, holdWrites, settle } from './shell-appearance-app';
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

test('[LEDGER-13.1] puts Cancel at the left and Add at the right of the header on Android', async () => {
  await startExpenses();

  await openNewExpense();

  expect(formBarSides()).toEqual({ left: ['Cancel'], right: ['Add'] });
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
