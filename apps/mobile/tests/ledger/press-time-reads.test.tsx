import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { waitFor } from '@testing-library/react-native';
import type { Database } from '../../src/storage';
import { openNodeDatabase } from '../../src/storage/node';
import { moveExpenseToTrash } from '../../src/ledger/trash';
import { allowWrites, settle } from '../acceptance/shell-appearance-app';
import { textsOn } from '../acceptance/group-details-app';
import {
  expectFormClosed,
  fillForm,
  formTitle,
  openNewExpense,
  press,
  resetPhone,
  storedExpenses,
  watchAlerts,
} from '../acceptance/ledger-expense-app';
import {
  closeCategorySheet,
  openCategorySheet,
  startWithGroups,
} from '../acceptance/ledger-group-expense-app';
import {
  allowReads,
  failReads,
  holdReads,
  openDetails,
  phoneDatabaseWithReads,
  pressEdit,
} from '../acceptance/ledger-expense-list-app';

// Reads the details and the expense form make when an action is pressed: a read
// that fails shows the read error and nothing else, and Edit opens only for an
// expense still out of the trash.

let mockOpen: () => Promise<Database>;

jest.mock('../../src/storage/expo', () => ({
  openPhoneDatabase: () => mockOpen(),
}));

jest.mock('expo-localization', () => {
  const phone = () =>
    jest.requireActual<typeof import('../acceptance/ledger-expense-app')>(
      '../acceptance/ledger-expense-app',
    );
  return {
    ...jest.requireActual<object>('expo-localization'),
    getLocales: () => phone().phoneLocales(),
    getCalendars: () => phone().phoneCalendars(),
    useLocales: () => phone().phoneLocales(),
    useCalendars: () => phone().phoneCalendars(),
  };
});

const READ_ERROR = [
  'Unable to Load Local Data',
  'Your data was not changed.',
  'Try Again',
];

let directory: string;
let file: string;
let alerts: ReturnType<typeof watchAlerts>;

beforeEach(() => {
  jest.clearAllMocks();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'press-reads-'));
  file = path.join(directory, 'app.db');
  mockOpen = async () => phoneDatabaseWithReads(file);
  allowWrites();
  allowReads();
  resetPhone();
  alerts = watchAlerts();
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});

/** Starts the app with a personal expense titled Coffee run and opens its details. */
async function openCoffeeRun() {
  await startWithGroups();
  await openNewExpense();
  await fillForm({ amount: '8.75', title: 'Coffee run' });
  await press('Add');
  await expectFormClosed();
  await openDetails('Coffee run');
}

test('shows the read error and opens no Edit Expense when Edit cannot read the expense', async () => {
  await openCoffeeRun();
  failReads();

  await pressEdit();
  await settle();

  await waitFor(() => expect(textsOn('Expense')).toEqual(READ_ERROR));
  expect(formTitle()).toBeUndefined();
  expect(alerts.shown()).toEqual([]);
});

test('opens no Edit Expense when Edit reads that the expense was moved to the trash', async () => {
  await openCoffeeRun();
  const [coffee] = await storedExpenses();
  // Another connection, so the details do not hear of the move until Edit reads.
  const other = openNodeDatabase(file);
  await moveExpenseToTrash(other, coffee.spaceId, coffee.id);
  await other.close();

  await pressEdit();
  await settle();

  expect(formTitle()).toBeUndefined();
});

test('shows only the read error, with no save alert, when Add waits for a read that fails', async () => {
  await startWithGroups();
  await openNewExpense();
  await fillForm({ amount: '8.75', title: 'Spin class' });
  await openCategorySheet();
  const reads = holdReads();

  await closeCategorySheet();
  await press('Add');
  await reads.fail();
  await settle();

  await waitFor(() => expect(textsOn('New Expense')).toEqual(READ_ERROR));
  expect(alerts.shown()).toEqual([]);
  expect(await storedExpenses()).toEqual([]);
});
