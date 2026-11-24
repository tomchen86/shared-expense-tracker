import {
  checkSyncSnapshot,
  mergeSyncSnapshotRecord,
  syncRecordValues,
  type SyncRecord,
  type SyncSnapshotRecord,
  type SyncStamp,
} from '../../src';
import {
  at,
  bothOrders,
  CREATED,
  judge,
  merged,
  refused,
  unit,
  unitsAt,
} from './sync-fixtures';

// A roster entry as a record of a shared ledger (ADR-0015, ADR-0039): its type is
// `device`, its ID is a device ID, and its one unit, `member`, says which member that
// device represents, with the phone's user ID and its X25519 public key.

/** A box public key, as SHARING-136.1's scenario has it. */
const BOX_KEY =
  'bc908a559c76aef30842db38b5e1844f63847c087cf94b793fe477da10d44e75';

const REPRESENTS = { memberId: 'blake', userId: 'user-b', boxKey: BOX_KEY };

/** A roster entry's first event, or a later change to it when `base` is given. */
const entry = (
  member: unknown = REPRESENTS,
  {
    id = 'phone-b' as unknown,
    stamp = CREATED,
    base = undefined as SyncStamp | undefined,
  } = {},
) => ({
  version: 1,
  stamp,
  type: 'device',
  id,
  units: { member: base ? { value: member, base } : { value: member } },
});

const VALID = (content: unknown) => ({ status: 'valid', event: content });

test.each<[string, unknown]>([
  ["a roster entry's first event", entry()],
  [
    'a later change to the member it represents',
    entry(
      { ...REPRESENTS, memberId: 'casey' },
      { stamp: at(2000), base: CREATED },
    ),
  ],
])('[SYNC-250.1] accepts %s', (_case, content) => {
  expect(judge(content)).toEqual(VALID(content));
});

test('[SYNC-4.4] accepts a roster entry as a kind of record', () => {
  expect(judge(entry())).toEqual(VALID(entry()));
});

test.each<[string, unknown]>([
  [
    'a unit roster entries do not have',
    {
      ...entry(),
      units: { member: { value: REPRESENTS }, name: { value: 'Blake' } },
    },
  ],
  ['a roster entry that changes no unit', { ...entry(), units: {} }],
  [
    'the deletion of a roster entry',
    {
      version: 1,
      stamp: at(2000),
      type: 'device',
      id: 'phone-b',
      deleted: true,
    },
  ],
])('[SYNC-4.4] refuses %s for its structure', (_case, content) => {
  // Otherwise every roster entry is refused, whatever it holds.
  expect(judge(entry())).toEqual(VALID(entry()));

  expect(judge(content)).toEqual(refused('structure'));
});

test.each<[string, unknown]>([
  ['a space', 'phone b'],
  ['a character outside ASCII', 'phöne'],
  ['a number', 7],
])(
  '[SYNC-250.1] refuses a roster entry whose ID has %s for its structure',
  (_case, id) => {
    expect(judge(entry())).toEqual(VALID(entry()));

    expect(judge(entry(REPRESENTS, { id }))).toEqual(refused('structure'));
  },
);

test.each<[string, unknown]>([
  ['an empty member ID', { ...REPRESENTS, memberId: '' }],
  ['a member ID that is a number', { ...REPRESENTS, memberId: 7 }],
  ['an empty user ID', { ...REPRESENTS, userId: '' }],
  ['no user ID', { memberId: 'blake', boxKey: BOX_KEY }],
  ['a box key of 63 characters', { ...REPRESENTS, boxKey: BOX_KEY.slice(1) }],
  ['a box key of 66 characters', { ...REPRESENTS, boxKey: `${BOX_KEY}00` }],
  ['a box key in capitals', { ...REPRESENTS, boxKey: BOX_KEY.toUpperCase() }],
  [
    'a box key with a g in it',
    { ...REPRESENTS, boxKey: `g${BOX_KEY.slice(1)}` },
  ],
  ['a box key that is a number', { ...REPRESENTS, boxKey: 7 }],
  ['an extra field', { ...REPRESENTS, name: 'Blake' }],
  ['a value that is only the member ID', 'blake'],
  ['a value that is null', null],
])(
  '[SYNC-250.1] refuses a roster entry with %s for its structure',
  (_case, member) => {
    expect(judge(entry())).toEqual(VALID(entry()));

    expect(judge(entry(member))).toEqual(refused('structure'));
  },
);

test('[SYNC-250.1] has something to show once its one unit has arrived, and follows a later change', () => {
  const first = merged([entry()]);

  expect(syncRecordValues(first)).toEqual({ member: REPRESENTS });

  const later = entry(
    { ...REPRESENTS, memberId: 'casey' },
    { stamp: at(2000), base: CREATED },
  );
  const changed = merged([later], first);

  expect(syncRecordValues(changed)).toEqual({
    member: { ...REPRESENTS, memberId: 'casey' },
  });
  expect(unit(changed, 'member')?.stamp).toEqual(at(2000));
});

test.each<[string, object, object, object]>([
  [
    'the larger member ID',
    REPRESENTS,
    { ...REPRESENTS, memberId: 'casey' },
    { ...REPRESENTS, memberId: 'casey' },
  ],
  [
    'the larger user ID when the member IDs are equal',
    REPRESENTS,
    { ...REPRESENTS, userId: 'user-c' },
    { ...REPRESENTS, userId: 'user-c' },
  ],
  [
    'the larger box key when the rest is equal',
    { ...REPRESENTS, boxKey: '0'.repeat(64) },
    { ...REPRESENTS, boxKey: 'f'.repeat(64) },
    { ...REPRESENTS, boxKey: 'f'.repeat(64) },
  ],
  [
    'the member ID before the user ID',
    { ...REPRESENTS, memberId: 'casey', userId: 'user-a' },
    { ...REPRESENTS, memberId: 'blake', userId: 'user-z' },
    { ...REPRESENTS, memberId: 'casey', userId: 'user-a' },
  ],
])(
  '[SYNC-250.1] keeps %s of two events with one stamp, in either order',
  (_case, one, other, kept) => {
    for (const order of bothOrders(entry(one), entry(other))) {
      const record = merged(order);

      expect(unit(record, 'member')).toEqual({ value: kept, stamp: CREATED });
    }
  },
);

// In a snapshot

const held = (
  record: object,
  created: SyncStamp = CREATED,
): SyncSnapshotRecord =>
  ({ ...record, created, seeded: false }) as SyncSnapshotRecord;

const whole = (type: string, id: string, values: object) =>
  ({
    type,
    id,
    units: unitsAt(values, CREATED),
    created: CREATED,
    seeded: true,
  }) as unknown as SyncSnapshotRecord;

const rosterRecord = (member: unknown = REPRESENTS, id = 'phone-b') =>
  held({
    type: 'device',
    id,
    units: { member: { value: member, stamp: CREATED } },
  });

const snapshot = (records: unknown[]) => ({
  version: 1,
  eventVersion: 1,
  groupId: 'brisbane',
  sequence: 0,
  uncategorized: 'cat-none',
  records: [
    whole('group', 'brisbane', { name: 'Brisbane' }),
    whole('category', 'cat-none', {
      name: 'Uncategorized',
      color: '#757575',
      archived: false,
    }),
    ...records,
  ],
});

test.each<[string, unknown[]]>([
  [
    'a roster entry and the member it represents',
    [
      whole('member', 'blake', { name: 'Blake', removed: false }),
      rosterRecord(),
    ],
  ],
  ['a roster entry for a member it does not hold', [rosterRecord()]],
  [
    'the roster entries of two devices',
    [
      rosterRecord(),
      rosterRecord({ ...REPRESENTS, userId: 'user-c' }, 'phone-c'),
    ],
  ],
])('[SYNC-98.4] a snapshot with %s can be imported', (_case, records) => {
  const content = snapshot(records);

  expect(checkSyncSnapshot(content)).toEqual({
    status: 'valid',
    snapshot: content,
  });
});

test.each<[string, unknown]>([
  ['an ID with a space', rosterRecord(REPRESENTS, 'phone b')],
  [
    'a box key that is one character short',
    rosterRecord({ ...REPRESENTS, boxKey: BOX_KEY.slice(1) }),
  ],
  [
    'a box key in capitals',
    rosterRecord({ ...REPRESENTS, boxKey: BOX_KEY.toUpperCase() }),
  ],
  ['an empty member ID', rosterRecord({ ...REPRESENTS, memberId: '' })],
  [
    'an extra field in its value',
    rosterRecord({ ...REPRESENTS, name: 'Blake' }),
  ],
  [
    'a unit roster entries do not have',
    held({
      type: 'device',
      id: 'phone-b',
      units: {
        member: { value: REPRESENTS, stamp: CREATED },
        name: { value: 'Blake', stamp: CREATED },
      },
    }),
  ],
  [
    'only a tombstone',
    held({ type: 'device', id: 'phone-b', deleted: at(2000), units: {} }),
  ],
  ['the same device twice', [rosterRecord(), rosterRecord()]],
])(
  '[SYNC-98.4] refuses a snapshot whose roster entry has %s',
  (_case, wrong) => {
    // Otherwise every snapshot with a roster entry is refused.
    expect(checkSyncSnapshot(snapshot([rosterRecord()])).status).toBe('valid');

    expect(checkSyncSnapshot(snapshot([wrong].flat())).status).toBe('refused');
  },
);

test('[SYNC-250.1] merges a roster entry from a snapshot as its events would merge', () => {
  const mine = merged([entry()]) as SyncRecord;
  const theirs = rosterRecord({ ...REPRESENTS, memberId: 'casey' });

  for (const [phone, incoming] of [
    [mine, theirs],
    [merged([entry({ ...REPRESENTS, memberId: 'casey' })]), rosterRecord()],
  ] as const) {
    const { record } = mergeSyncSnapshotRecord({
      held: held(phone),
      incoming,
    });

    // The stamps are equal, so the larger member ID stays whichever side held it.
    expect(unit(record, 'member')).toEqual({
      value: { ...REPRESENTS, memberId: 'casey' },
      stamp: CREATED,
    });
  }
});
