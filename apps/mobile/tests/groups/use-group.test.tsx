import { act, renderHook } from '@testing-library/react-native';
import { useGroup } from '../../src/groups/use-group';

// A stand-in database per test, a focus effect that runs on mount, and one stored group.
let mockDatabase = {};
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    useFocusEffect: (effect: () => void | (() => void)) =>
      useEffect(effect, [effect]),
  };
});
jest.mock('../../src/shell', () => ({ useLocalDatabase: () => mockDatabase }));
jest.mock('../../src/groups/index', () => ({
  listGroups: async () => [
    { id: 'g1', name: 'Brisbane', members: [{ id: 'm1', name: 'Taylor' }] },
  ],
  listFormerMembers: async () => [],
}));

beforeEach(() => {
  mockDatabase = {};
});

/** A new reader of `id`: the group each of its renders saw, from the first, and its setter. */
async function reader(id: string, options?: { startFromLatest: boolean }) {
  const seen: unknown[] = [];
  const { result } = await renderHook(() => {
    const [group, setGroup] = useGroup(id, options);
    seen.push(group);
    return setGroup;
  });
  await act(async () => {});
  return { seen, setGroup: result.current };
}

test('a sheet opened over the group lays out with the group from its first render', async () => {
  await reader('g1');
  const sheet = await reader('g1', { startFromLatest: true });
  expect(sheet.seen[0]).toMatchObject({ name: 'Brisbane' });
});

test('starts from the changes a screen made, such as a member it added', async () => {
  const members = await reader('g1', { startFromLatest: true });
  await act(async () => {
    members.setGroup(
      (current) =>
        current && {
          ...current,
          members: [
            ...current.members,
            { ...current.members[0], id: 'm2', name: 'Blake' },
          ],
        },
    );
  });
  const again = await reader('g1', { startFromLatest: true });
  expect(again.seen[0]).toMatchObject({
    members: [{ name: 'Taylor' }, { name: 'Blake' }],
  });
});

test('a form that reads the group fresh starts with nothing until its own read', async () => {
  await reader('g1');
  const form = await reader('g1');
  expect(form.seen[0]).toBeUndefined();
  expect(form.seen.at(-1)).toMatchObject({ name: 'Brisbane' });
});
