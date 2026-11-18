import { fireEvent, waitFor } from '@testing-library/react-native';
import {
  expectMembers,
  memberField,
  openMemberField,
} from '../acceptance/group-details-app';
import {
  categoryOptions,
  menuOptions,
  openEditExpense,
  openNewExpense,
  titleField,
} from '../acceptance/ledger-expense-app';
import {
  addGroupExpense,
  chooseGroup,
} from '../acceptance/ledger-group-expense-app';
import {
  LATER,
  YOU,
  at,
  changed,
  created,
  eachTestGetsAPhone,
  expenseTitled,
  groupId,
  receive,
  showMembers,
  startShared,
} from '../acceptance/sync-app';

jest.mock('../../src/storage/expo', () => ({
  openPhoneDatabase: async () =>
    jest
      .requireActual<typeof import('../acceptance/sync-app')>(
        '../acceptance/sync-app',
      )
      .openPhone(),
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

eachTestGetsAPhone('synced-member-options-');

const addDana = () =>
  created('member', 'dana', at(LATER), { name: 'Dana', removed: false });

test.each(['New Expense', 'Edit Expense'])(
  'an open %s picks up the new member and category without losing its draft',
  async (form) => {
    await startShared();
    const group = await groupId('Brisbane');
    if (form === 'New Expense') {
      await openNewExpense();
      await chooseGroup('Brisbane');
    } else {
      await addGroupExpense({ group: 'Brisbane', payer: YOU, sharers: [YOU] });
      await openEditExpense((await expenseTitled('Dinner')).id);
    }
    await fireEvent.changeText(titleField(), 'Draft');
    await receive(
      group,
      addDana(),
      created('category', 'rail', at(LATER, 1), {
        name: 'Rail',
        color: '#00ACC1',
        archived: false,
      }),
    );
    await waitFor(() =>
      expect(menuOptions('Paid by').map(([name]) => name)).toEqual([
        YOU,
        'Casey',
        'Blake',
        'Dana',
      ]),
    );
    expect(categoryOptions(['Rail'])).toEqual([['Rail', false]]);
    expect(titleField().props.value).toBe('Draft');
  },
);

test('the last place taken remotely closes the name field until Add Member is chosen again', async () => {
  const names = Array.from({ length: 18 }, (_, i) => `Member ${i + 1}`);
  await startShared({ Brisbane: names });
  const group = await groupId('Brisbane');
  await showMembers('Brisbane');
  await openMemberField();
  await fireEvent.changeText(memberField()!, 'Pending');
  await receive(group, addDana());
  await expectMembers([YOU, ...names, 'Dana']);
  expect(memberField()).toBeUndefined();
  await receive(
    group,
    changed('member', 'dana', at(LATER, 1), { removed: true }),
  );
  await expectMembers([YOU, ...names, 'Add Member']);
  await openMemberField();
  expect(memberField()!.props.value).toBe('Pending');
});
