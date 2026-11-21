import { checkSyncSnapshot } from './snapshot';

const stamp = { ms: 0, counter: 0, device: 'device' };
const unit = (value: unknown) => ({ value, stamp });
const group = {
  type: 'group',
  id: 'trip',
  units: { name: unit('Trip') },
  created: stamp,
  seeded: true,
};
const category = {
  type: 'category',
  id: 'none',
  created: stamp,
  seeded: true,
  units: {
    name: unit('Uncategorized'),
    color: unit('#757575'),
    archived: unit(false),
  },
};
const snapshot = {
  version: 1,
  eventVersion: 1,
  groupId: 'trip',
  sequence: 0,
  uncategorized: category.id,
  records: [group, category],
};

test.each([
  null,
  'text',
  [],
  { ...group, units: null },
  { ...group, units: [] },
])(
  'refuses malformed record containers before considering the ledger',
  (record) => {
    expect(
      checkSyncSnapshot({
        ...snapshot,
        records: [...snapshot.records, record],
      }),
    ).toEqual({ status: 'refused' });
  },
);

test('a sparse record list has a missing record', () => {
  const records = [...snapshot.records];
  records.length += 1;
  expect(checkSyncSnapshot({ ...snapshot, records })).toEqual({
    status: 'refused',
  });
});
