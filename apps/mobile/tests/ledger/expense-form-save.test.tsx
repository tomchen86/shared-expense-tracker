import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ActionSheetIOS } from 'react-native';
import { act } from '@testing-library/react-native';
import {
  addExpense,
  amountField,
  expectFormClosed,
  fillForm,
  formButton,
  formTitle,
  menuField,
  noteField,
  openEditExpense,
  openNewExpense,
  phoneDatabase,
  resetPhone,
  startExpenses,
  storedExpenses,
  titleField,
  watchAlerts,
} from '../acceptance/ledger-expense-app';
import {
  fillGroupExpense,
  memberIds,
  startWithGroups,
} from '../acceptance/ledger-group-expense-app';
import { barTitled } from '../acceptance/group-details-app';
import { allowWrites, settle } from '../acceptance/shell-appearance-app';
import type { Database } from '../../src/storage';

// On a busy phone the keys typed just before a press on the title bar's Add or Save,
// or a choice made just before it, can reach React in the same batch as the press,
// before React renders what they change. The expense form must save what its fields
// hold at the press, not what they held at the last render. Each test calls the
// field's change handler and the bar's press handler inside one act(), so React
// renders neither until both have run; fireEvent would wrap each in an act() of its
// own and render in between.

let mockOpen: () => Promise<Database>;

jest.mock('../../src/storage/expo', () => ({
  openPhoneDatabase: () => mockOpen(),
}));

// Not virtual, as in the expense form's acceptance tests.
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

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
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
let file: string;

beforeEach(() => {
  jest.clearAllMocks();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'expense-form-save-'));
  file = path.join(directory, 'app.db');
  mockOpen = async () => phoneDatabase(file);
  allowWrites();
  resetPhone();
  watchAlerts();
  jest
    .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
    .mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});

interface BarItem {
  type: string;
  title?: string;
  accessibilityLabel?: string;
  buttonId?: string;
}

/**
 * Runs `change`, then presses `button` on the form's bar, before React renders the
 * change, as the native bar reports a press on iOS: by the ID of a button that was
 * enabled at the last render, to the handler the bar holds when the press arrives.
 */
async function changeAndPressInOneBatch(
  change: () => void,
  button: 'Add' | 'Save',
) {
  // The native bar reports no press on a disabled button.
  expect(formButton(button).disabled).toBe(false);
  const title = formTitle()!;
  await act(async () => {
    change();
    const bar = barTitled(title)!;
    const items: BarItem[] = [
      ...(bar.props.headerLeftBarButtonItems ?? []),
      ...(bar.props.headerRightBarButtonItems ?? []),
    ];
    const item = items.find(
      (candidate) =>
        candidate.type === 'button' &&
        (candidate.accessibilityLabel || candidate.title) === button,
    )!;
    bar.props.onPressHeaderBarButtonItem({
      nativeEvent: { buttonId: item.buttonId },
    });
  });
  await settle();
}

type Field = ReturnType<typeof amountField>;

/** Changes `field` to `text` and presses `button` before React renders the change. */
const typeAndPressInOneBatch = (
  field: Field,
  text: string,
  button: 'Add' | 'Save',
) => {
  const { onChangeText } = field.props;
  return changeAndPressInOneBatch(() => onChangeText(text), button);
};

async function onlyExpense() {
  const expenses = await storedExpenses();
  expect(expenses).toHaveLength(1);
  return expenses[0];
}

test('New Expense saves the whole amount when its last key comes with Add', async () => {
  await startExpenses();
  await openNewExpense();
  await fillForm({ title: 'Coffee run', amount: '8.7' });

  await typeAndPressInOneBatch(amountField(), '8.75', 'Add');

  await expectFormClosed();
  const coffee = await onlyExpense();
  expect(coffee.amountMinor).toBe(875);
  expect(coffee.payments.map((payment) => payment.amountMinor)).toEqual([875]);
  expect(coffee.shares.map((share) => share.amountMinor)).toEqual([875]);
});

test('New Expense saves the whole title when its last key comes with Add', async () => {
  await startExpenses();
  await openNewExpense();
  await fillForm({ amount: '8.75', title: 'Coffee ru' });

  await typeAndPressInOneBatch(titleField(), 'Coffee run', 'Add');

  await expectFormClosed();
  expect((await onlyExpense()).title).toBe('Coffee run');
});

test('New Expense saves the whole note when its last key comes with Add', async () => {
  await startExpenses();
  await openNewExpense();
  await fillForm({ amount: '8.75', title: 'Coffee run', note: 'Morning trea' });

  await typeAndPressInOneBatch(noteField(), 'Morning treat', 'Add');

  await expectFormClosed();
  expect((await onlyExpense()).note).toBe('Morning treat');
});

test('New Expense saves nothing when the key that comes with Add makes the amount invalid', async () => {
  await startExpenses();
  await openNewExpense();
  await fillForm({ title: 'Coffee run', amount: '8.75' });

  await typeAndPressInOneBatch(amountField(), '8.755', 'Add');

  expect(formTitle()).toBe('New Expense');
  expect(formButton('Add').disabled).toBe(true);
  expect(await storedExpenses()).toEqual([]);
});

test('New Expense saves the category chosen in the same batch as Add', async () => {
  await startExpenses();
  await openNewExpense();
  await fillForm({ title: 'Coffee run', amount: '8.75' });
  const { props } = menuField('Category');
  const shopping = props.options.find((option) => option.name === 'Shopping')!;

  await changeAndPressInOneBatch(() => props.onSelect(shopping.id), 'Add');

  await expectFormClosed();
  expect((await onlyExpense()).category.name).toBe('Shopping');
});

test('Edit Expense saves the whole amount when its last key comes with Save', async () => {
  await startExpenses();
  await addExpense();
  const { id } = await onlyExpense();
  await openEditExpense(id);
  await fillForm({ amount: '12.5' });

  await typeAndPressInOneBatch(amountField(), '12.55', 'Save');

  await expectFormClosed();
  const coffee = await onlyExpense();
  expect(coffee.id).toBe(id);
  expect(coffee.amountMinor).toBe(1255);
});

test('New Expense splits the whole amount when its last key comes with Add', async () => {
  await startWithGroups({ Brisbane: ['Casey', 'Blake'] });
  const ids = await memberIds(file, 'Brisbane');
  await openNewExpense();
  await fillGroupExpense({
    amount: '100.0',
    group: 'Brisbane',
    payer: 'Taylor (You)',
    sharers: ['Casey', 'Blake'],
  });

  await typeAndPressInOneBatch(amountField(), '100.01', 'Add');

  await expectFormClosed();
  const dinner = await onlyExpense();
  expect(dinner.amountMinor).toBe(10001);
  expect(dinner.payments).toEqual([
    { participant: ids.Taylor, amountMinor: 10001 },
  ]);
  expect(dinner.shares).toEqual([
    { participant: ids.Casey, amountMinor: 5001 },
    { participant: ids.Blake, amountMinor: 5000 },
  ]);
});
