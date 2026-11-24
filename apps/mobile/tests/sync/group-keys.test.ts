import * as SecureStore from 'expo-secure-store';
import { deleteGroupKeys } from '../../src/sync/read-only-copy';

const mockEntries = new Map<string, string>();
let mockUnreadable: string | undefined;

jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 1,
  getItemAsync: jest.fn(async (name: string) => {
    if (name === mockUnreadable) throw new Error('Cannot read');
    return mockEntries.get(name) ?? null;
  }),
  deleteItemAsync: jest.fn(async (name: string) => {
    mockEntries.delete(name);
  }),
}));

const GROUP = '9b2f6c1e-8d47-4f3a-b1c5-2e7d90a4f6b8';
const entry = (epoch: number) => `group-key.${GROUP}.${epoch}`;
const held = () =>
  [1, 2, 3, 4, 5, 6].filter((epoch) => mockEntries.has(entry(epoch)));

beforeEach(() => {
  jest.clearAllMocks();
  mockEntries.clear();
  mockUnreadable = undefined;
  for (const epoch of [1, 2, 3, 4, 6]) mockEntries.set(entry(epoch), 'key');
  mockEntries.set('group-key.another-group.1', 'key');
});

test('deletes the keys up to the epoch and those above it, up to the first epoch with no entry', async () => {
  await deleteGroupKeys(GROUP, 2);

  expect(held()).toEqual([6]);
  expect(mockEntries.has('group-key.another-group.1')).toBe(true);
});

test('deletes nothing for a group that was no shared ledger', async () => {
  await deleteGroupKeys(GROUP, 0);

  expect(held()).toEqual([1, 2, 3, 4, 6]);
  expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
});

test('stops looking upward at an entry it cannot read', async () => {
  mockUnreadable = entry(3);

  await deleteGroupKeys(GROUP, 2);

  expect(held()).toEqual([3, 4, 6]);
});
