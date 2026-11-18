import { waitFor } from '@testing-library/react-native';
import { addGroupExpense } from '../acceptance/ledger-group-expense-app';
import { deleteByAction, undoButton } from '../acceptance/ledger-trash-app';
import {
  LATER,
  YOU,
  at,
  changed,
  deleted,
  eachTestGetsAPhone,
  expenseTitled,
  groupId,
  receive,
  startShared,
  tryReceive,
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

eachTestGetsAPhone('synced-trash-notice-');

test.each(['restore', 'delete permanently'])(
  'dismisses a local Undo notice only after a remote %s commits',
  async (action) => {
    await startShared();
    const group = await groupId('Brisbane');
    await addGroupExpense({ group: 'Brisbane', payer: YOU, sharers: [YOU] });
    const dinner = await expenseTitled('Dinner');
    await deleteByAction('Dinner');
    await waitFor(() => expect(undoButton('Dinner')).not.toBeNull());
    const stamp = at(LATER + 1000);
    const event =
      action === 'restore'
        ? changed('expense', dinner.id, stamp, { trashed: false })
        : deleted('expense', dinner.id, stamp);

    expect(await tryReceive(group, event, { version: 2 })).toBeInstanceOf(
      Error,
    );
    expect(undoButton('Dinner')).not.toBeNull();
    await receive(group, event);
    await waitFor(() => expect(undoButton('Dinner')).toBeNull());
  },
);
