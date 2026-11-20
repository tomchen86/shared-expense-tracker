import { FlatList } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { addExpense, startExpenses } from '../acceptance/ledger-expense-app';
import { expensesRoot } from '../acceptance/ledger-expense-list-app';
import { endSearch, typeSearch } from '../acceptance/ledger-list-find-app';
import { choosePeriod } from '../acceptance/ledger-list-period-app';
import { nativeViews } from '../acceptance/shell-tabs-app';

jest.mock('../../src/storage/expo', () => ({
  openPhoneDatabase: async () =>
    jest
      .requireActual<typeof import('../acceptance/shell-appearance-app')>(
        '../acceptance/shell-appearance-app',
      )
      .testDatabase(':memory:'),
}));

afterEach(() => jest.restoreAllMocks());

test('returns to the native resting offset on each search edit and on close', async () => {
  await startExpenses();
  await addExpense({ title: 'Coffee' });
  const scroll = (y: number) =>
    fireEvent.scroll(nativeViews(/^RCTScrollView$/, expensesRoot())[0], {
      nativeEvent: {
        contentOffset: { x: 0, y },
        contentSize: { width: 400, height: 2000 },
        layoutMeasurement: { width: 400, height: 800 },
      },
    });
  const command = jest.spyOn(FlatList.prototype, 'scrollToOffset');
  const top = { offset: -96, animated: true };
  await scroll(top.offset);
  await scroll(400);
  await typeSearch('Expenses', 'c');
  expect(command.mock.calls).toEqual([[top]]);

  await scroll(320);
  await typeSearch('Expenses', 'co');
  expect(command.mock.calls).toEqual([[top], [top]]);

  await scroll(280);
  await choosePeriod('Expenses', 'Last Month');
  expect(command).toHaveBeenCalledTimes(2);
  await endSearch('Expenses');
  expect(command.mock.calls).toEqual([[top], [top], [top]]);
});
