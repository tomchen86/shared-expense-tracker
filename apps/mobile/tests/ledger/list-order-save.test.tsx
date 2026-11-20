import {
  addExpense,
  startExpenses,
  watchAlerts,
} from '../acceptance/ledger-expense-app';
import {
  cardTitles,
  expensesRoot,
} from '../acceptance/ledger-expense-list-app';
import { chooseSort, sortName } from '../acceptance/ledger-list-find-app';
import {
  allowWrites,
  holdWrites,
  settle,
} from '../acceptance/shell-appearance-app';

jest.mock('../../src/storage/expo', () => ({
  openPhoneDatabase: async () =>
    jest
      .requireActual<typeof import('../acceptance/shell-appearance-app')>(
        '../acceptance/shell-appearance-app',
      )
      .testDatabase(':memory:'),
}));

afterEach(() => {
  allowWrites();
  jest.restoreAllMocks();
});

test('sorts immediately during a slow write and restores the saved order if the write fails', async () => {
  const alerts = watchAlerts();
  await startExpenses();
  await addExpense({ title: 'First' });
  await addExpense({ title: 'Second' });

  const writes = holdWrites();
  await chooseSort(expensesRoot(), 'Oldest First');
  expect(cardTitles()).toEqual(['First', 'Second']);

  await writes.fail();
  await settle();
  expect(sortName(expensesRoot())).toBe('Sort By, Newest First');
  expect(cardTitles()).toEqual(['Second', 'First']);
  expect(alerts.shown()).toEqual([
    [
      'Unable to Save Settings',
      'Your settings could not be saved. Please try again.',
    ],
  ]);
});
