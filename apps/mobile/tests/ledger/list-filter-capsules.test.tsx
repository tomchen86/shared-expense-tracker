import { fireEvent } from '@testing-library/react-native';
import { addExpense, startExpenses } from '../acceptance/ledger-expense-app';
import { expensesRoot } from '../acceptance/ledger-expense-list-app';
import {
  capsuleRow,
  pressPaidByMeCapsule,
  turnPaidByMe,
} from '../acceptance/ledger-list-filter-app';
import { deleteByAction } from '../acceptance/ledger-trash-app';
import { settle } from '../acceptance/shell-appearance-app';

jest.mock('../../src/storage/expo', () => ({
  openPhoneDatabase: async () =>
    jest
      .requireActual<typeof import('../acceptance/shell-appearance-app')>(
        '../acceptance/shell-appearance-app',
      )
      .testDatabase(':memory:'),
}));

afterEach(() => jest.restoreAllMocks());

function categoryToggle(name: string) {
  return capsuleRow(expensesRoot())?.queryAll(
    (view) => view.props.label === name && typeof view.props.isOn === 'boolean',
  )[0];
}

async function toggleCategory(name: string) {
  const toggle = categoryToggle(name);
  if (!toggle) throw new Error(`No category toggle for ${name}`);
  await fireEvent(toggle, 'isOnChange', {
    nativeEvent: { isOn: !toggle.props.isOn },
  });
  await settle();
}

test('refreshes category options as expenses change and removes the row when the last category filter is cleared', async () => {
  await startExpenses();
  await addExpense({ title: 'Shoes', category: 'Shopping' });
  await turnPaidByMe(true);
  await toggleCategory('Shopping');

  await deleteByAction('Shoes');
  expect(categoryToggle('Shopping')?.props.isOn).toBe(true);
  await toggleCategory('Shopping');
  expect(categoryToggle('Shopping')).toBeUndefined();

  await addExpense({ title: 'Train', category: 'Travel' });
  expect(categoryToggle('Travel')?.props.isOn).toBe(false);
  await toggleCategory('Travel');
  await pressPaidByMeCapsule(expensesRoot());
  expect(categoryToggle('Travel')?.props.isOn).toBe(true);
  await toggleCategory('Travel');
  expect(capsuleRow(expensesRoot())).toBeUndefined();
});
