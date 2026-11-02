import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { BackHandler } from 'react-native';
import { waitFor } from '@testing-library/react-native';
import {
  addExpense,
  expectForm,
  nameOf,
  phoneDatabase,
  pressBack,
  resetPhone,
  startExpenses,
  titleField,
} from './ledger-expense-app';
import {
  cardTitles,
  detailHeaderButtons,
  openDetails,
  pressEdit,
} from './ledger-expense-list-app';
import { iconNames, ripplesOn, touchSize } from './shell-actions-app';
import { allowWrites } from './shell-appearance-app';
import { navigationBarTitles, selectedTab, tab } from './shell-tabs-app';
import type { Database } from '../../src/storage';

// Runs on Android only (apps/mobile/jest.config.cjs). Both platforms share the
// expense list and the details, so ledger-expense-list.test.tsx checks their rules
// on iOS; this file checks what Android shows differently and its back button.

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
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'expense-list-android-'));
  const file = path.join(directory, 'app.db');
  mockOpen = async () => phoneDatabase(file);
  allowWrites();
  resetPhone();
  exitApp = jest.spyOn(BackHandler, 'exitApp');
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});

test('[SHELL-52.1] puts Edit at the right of the details header as an edit icon button of at least 48 dp on Android', async () => {
  await startExpenses();
  await addExpense();

  await openDetails('Coffee run');

  await waitFor(() =>
    expect(detailHeaderButtons().map(nameOf)).toEqual(['Edit']),
  );
  const [edit] = detailHeaderButtons();
  await waitFor(() => expect(iconNames(edit, 'android')).toEqual(['edit']));
  expect(touchSize(edit).width).toBeGreaterThanOrEqual(48);
  expect(touchSize(edit).height).toBeGreaterThanOrEqual(48);
});

test('[SHELL-50.1] shows a round ripple of radius 24 on the details Edit button', async () => {
  await startExpenses();
  await addExpense();

  await openDetails('Coffee run');

  await waitFor(() => expect(detailHeaderButtons()).toHaveLength(1));
  expect(ripplesOn(detailHeaderButtons()[0])).toContainEqual(
    expect.objectContaining({ round24: true }),
  );
});

test('[LEDGER-38.1] opens Edit Expense from Edit on the details on Android', async () => {
  await startExpenses();
  await addExpense();
  await openDetails('Coffee run');

  await pressEdit();

  await expectForm('Edit Expense');
  expect(titleField()).toHaveDisplayValue('Coffee run');
});

test('[LEDGER-36.1] goes back from the details to the expense list with Back', async () => {
  await startExpenses();
  await addExpense();
  await openDetails('Coffee run');

  await pressBack();

  expect(selectedTab()).toBe('Expenses');
  expect(navigationBarTitles(tab('Expenses'))).toEqual(['Expenses']);
  expect(cardTitles()).toEqual(['Coffee run']);
  expect(exitApp).not.toHaveBeenCalled();
});
