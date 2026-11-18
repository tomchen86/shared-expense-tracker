import { fireEvent } from '@testing-library/react-native';
import {
  expectMembers,
  memberField,
  openMemberField,
} from '../acceptance/group-details-app';
import {
  LATER,
  YOU,
  at,
  changed,
  created,
  eachTestGetsAPhone,
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

eachTestGetsAPhone('synced-member-limit-');

const addDana = () =>
  created('member', 'dana', at(LATER), { name: 'Dana', removed: false });

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
