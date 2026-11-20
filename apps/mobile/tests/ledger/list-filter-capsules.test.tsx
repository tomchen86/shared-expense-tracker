import { StyleSheet } from 'react-native';
import { fireEvent, screen, within } from '@testing-library/react-native';
import { showGroup } from '../acceptance/group-balances-app';
import {
  expectClosed,
  expectOpen,
  screenOf,
} from '../acceptance/group-details-app';
import {
  addExpense,
  startExpenses,
  watchAlerts,
} from '../acceptance/ledger-expense-app';
import { expensesRoot } from '../acceptance/ledger-expense-list-app';
import {
  addGroupExpense,
  startWithGroups,
} from '../acceptance/ledger-group-expense-app';
import {
  capsuleRow,
  pressPaidByMeCapsule,
  setAmounts,
  turnPaidByMe,
} from '../acceptance/ledger-list-filter-app';
import { deleteByAction } from '../acceptance/ledger-trash-app';
import { settle } from '../acceptance/shell-appearance-app';
import { tabBar } from '../acceptance/shell-tabs-app';

// The test sends the native text change directly. Expo creates the field's ObservableState on iOS.
jest.mock('@expo/ui/swift-ui', () => ({
  ...jest.requireActual('@expo/ui/swift-ui'),
  useNativeState: (value: string) => ({ value }),
}));

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

test.each(['Expenses', 'Brisbane'])(
  'dismisses Amount from a backdrop over %s and lets the next press open the expense',
  async (title) => {
    watchAlerts();
    await startWithGroups({ Brisbane: ['Casey'] });
    await addGroupExpense({
      group: 'Brisbane',
      title: 'Dinner',
      amount: '60.00',
      payer: 'Taylor (You)',
      sharers: ['Taylor (You)', 'Casey'],
    });
    if (title === 'Brisbane') await showGroup(title);
    await setAmounts(title, '10');
    const list = screenOf(title);
    const row = capsuleRow(list)!;
    const [popover] = row.queryAll(
      (view) => typeof view.props.onIsPresentedChange === 'function',
    );
    const [trigger] = popover.queryAll(
      (view) => typeof view.props.onButtonPress === 'function',
    );
    await fireEvent(trigger, 'buttonPress');
    const outside = () =>
      screen.getByRole('button', { name: 'Dismiss popover' });
    const firstBackdrop = outside();
    await fireEvent(popover, 'isPresentedChange', {
      nativeEvent: { isPresented: false },
    });
    expect(firstBackdrop).not.toBeOnTheScreen();
    await fireEvent(trigger, 'buttonPress');

    const backdrop = outside();
    expect(backdrop).toHaveStyle({ ...StyleSheet.absoluteFill, zIndex: 1 });
    expect(backdrop.parent).toContainElement(tabBar());
    expect(tabBar()).not.toContainElement(backdrop);

    const [lowest] = popover.queryAll(
      (view) => view.props.placeholder === 'Min',
    );
    await fireEvent(lowest, 'textChange', { nativeEvent: { value: '' } });
    await settle();
    expect(capsuleRow(list)).toBeDefined();
    await fireEvent.press(backdrop);
    expect(capsuleRow(list)).toBeUndefined();
    expect(backdrop).not.toBeOnTheScreen();
    await expectClosed('Expense');

    await fireEvent.press(
      within(list).getByRole('button', { name: /^Dinner,/ }),
    );
    await expectOpen('Expense');
  },
);
