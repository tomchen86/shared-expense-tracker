import {
  checkSyncSnapshot,
  possibleSyncDuplicates,
  syncRecordValues,
  type SyncDuplicateCandidate,
  type SyncStamp,
} from '../../src';
import {
  at,
  bothOrders,
  CREATED,
  DINNER,
  judge,
  merged,
  refused,
  unit,
  unitsAt,
} from './sync-fixtures';

// Possible duplicates (ADR-0035). A "not a duplicate" record is a record of a shared ledger
// of a kind of its own: its one unit, `expenses`, holds the IDs of two expenses that are not
// the same expense. The rule that finds possible duplicates reads a ledger's expenses, the
// pairs such records name, and the device ID of the phone that asks.

// The "not a duplicate" record

/** A "not a duplicate" record's first event, or a later change of its unit when `base` is given. */
const distinct = (
  expenses: unknown = ['dinner', 'supper'],
  {
    id = 'pair-1',
    stamp = CREATED,
    base = undefined as SyncStamp | undefined,
  } = {},
) => ({
  version: 1,
  stamp,
  type: 'distinct',
  id,
  units: {
    expenses: base ? { value: expenses, base } : { value: expenses },
  },
});

const VALID = (content: unknown) => ({ status: 'valid', event: content });

test.each<[string, unknown]>([
  ['the first event of a "not a duplicate" record', distinct()],
  ['its two expenses in the other order', distinct(['supper', 'dinner'])],
  [
    'a later change of its unit',
    distinct(['dinner', 'taxi'], { stamp: at(2000), base: CREATED }),
  ],
])('[SYNC-200.1] [SYNC-4.3] accepts %s', (_case, content) => {
  expect(judge(content)).toEqual(VALID(content));
});

test.each<[string, unknown]>([
  ['one expense', ['dinner']],
  ['three expenses', ['dinner', 'supper', 'taxi']],
  ['the same expense twice', ['dinner', 'dinner']],
  ['an empty ID', ['dinner', '']],
  ['an ID that is a number', ['dinner', 7]],
  ['a text in place of the two IDs', 'dinner,supper'],
  ['an object in place of the two IDs', { first: 'dinner', second: 'supper' }],
  ['nothing in place of the two IDs', null],
])(
  '[SYNC-200.1] refuses a "not a duplicate" record that names %s, for its structure',
  (_case, expenses) => {
    // Otherwise every such record is refused, whatever it names.
    expect(judge(distinct())).toEqual(VALID(distinct()));

    expect(judge(distinct(expenses))).toEqual(refused('structure'));
  },
);

test.each<[string, unknown]>([
  [
    'a unit such records do not have',
    {
      ...distinct(),
      units: {
        expenses: { value: ['dinner', 'supper'] },
        name: { value: 'Dinner' },
      },
    },
  ],
  ['no unit changed', { ...distinct(), units: {} }],
  [
    'the deletion of such a record',
    {
      version: 1,
      stamp: at(2000),
      type: 'distinct',
      id: 'pair-1',
      deleted: true,
    },
  ],
])('[SYNC-200.1] [SYNC-4.3] refuses %s for its structure', (_case, content) => {
  expect(judge(distinct())).toEqual(VALID(distinct()));

  expect(judge(content)).toEqual(refused('structure'));
});

test('[SYNC-200.1] a merged "not a duplicate" record shows the two expenses it names', () => {
  const record = merged([distinct()]);

  expect(syncRecordValues(record)).toEqual({ expenses: ['dinner', 'supper'] });
  expect(unit(record, 'expenses')).toEqual({
    value: ['dinner', 'supper'],
    stamp: CREATED,
  });
});

test.each<[string, string[], string[], string[]]>([
  [
    'the larger second ID when the first is the same',
    ['dinner', 'supper'],
    ['dinner', 'taxi'],
    ['dinner', 'taxi'],
  ],
  [
    'the larger first ID, whatever the second',
    ['dinner', 'supper'],
    ['supper', 'dinner'],
    ['supper', 'dinner'],
  ],
])(
  '[SYNC-200.1] keeps %s when two events with one stamp change the unit, in either order',
  (_case, first, second, kept) => {
    for (const order of bothOrders(distinct(first), distinct(second))) {
      expect(unit(merged(order), 'expenses')).toEqual({
        value: kept,
        stamp: CREATED,
      });
    }
  },
);

// A snapshot that holds such records

const snapshotWith = (...records: unknown[]) => ({
  version: 1,
  eventVersion: 1,
  groupId: 'brisbane',
  sequence: 0,
  uncategorized: 'cat-none',
  records: [
    {
      type: 'group',
      id: 'brisbane',
      units: unitsAt({ name: 'Brisbane' }, CREATED),
      created: CREATED,
      seeded: true,
    },
    {
      type: 'category',
      id: 'cat-none',
      units: unitsAt(
        { name: 'Uncategorized', color: '#757575', archived: false },
        CREATED,
      ),
      created: CREATED,
      seeded: true,
    },
    ...records,
  ],
});

/** A "not a duplicate" record as a snapshot holds it. */
const heldDistinct = (expenses: unknown = ['dinner', 'taxi']) => ({
  type: 'distinct',
  id: 'pair-1',
  units: { expenses: { value: expenses, stamp: at(2000) } },
  created: at(2000),
  seeded: false,
});

const heldDinner = {
  type: 'expense',
  id: 'dinner',
  units: unitsAt(DINNER, CREATED),
  created: CREATED,
  seeded: true,
};

test.each<[string, unknown]>([
  [
    'that names two of its expenses',
    snapshotWith(
      heldDinner,
      { ...heldDinner, id: 'taxi', seeded: false },
      heldDistinct(),
    ),
  ],
  [
    'that names an expense it holds only a tombstone of, and one it does not hold',
    snapshotWith(
      {
        type: 'expense',
        id: 'fuel',
        deleted: at(3000, 0, 'phone-b'),
        units: {},
        created: CREATED,
        seeded: false,
      },
      heldDistinct(['fuel', 'ghost']),
    ),
  ],
])(
  '[SYNC-98.3] a snapshot with a "not a duplicate" record %s can be imported',
  (_case, content) => {
    expect(checkSyncSnapshot(content)).toEqual({
      status: 'valid',
      snapshot: content,
    });
  },
);

test.each<[string, unknown]>([
  ['names one expense', heldDistinct(['dinner'])],
  ['names three', heldDistinct(['dinner', 'taxi', 'fuel'])],
  ['names the same expense twice', heldDistinct(['dinner', 'dinner'])],
  ['names an empty ID', heldDistinct(['dinner', ''])],
  [
    'has a unit such records do not have',
    {
      ...heldDistinct(),
      units: {
        ...heldDistinct().units,
        name: { value: 'Dinner', stamp: at(2000) },
      },
    },
  ],
  ['has no unit', { ...heldDistinct(), units: {} }],
  [
    'is only a tombstone',
    { ...heldDistinct(), units: {}, deleted: at(3000, 0, 'phone-b') },
  ],
])(
  '[SYNC-98.3] a snapshot cannot be imported when its "not a duplicate" record %s',
  (_case, record) => {
    // Otherwise the snapshot is refused for holding such a record at all.
    expect(checkSyncSnapshot(snapshotWith(heldDistinct())).status).toBe(
      'valid',
    );

    expect(checkSyncSnapshot(snapshotWith(record))).toEqual({
      status: 'refused',
    });
  },
);

// The rule

/** An expense of 100.01 USD on 2025-03-14, out of the trash, unless said otherwise. */
const expense = (
  id: string,
  created: SyncStamp,
  changes: Partial<SyncDuplicateCandidate> = {},
): SyncDuplicateCandidate => ({
  id,
  created,
  date: '2025-03-14',
  amountMinor: 10001,
  currency: 'USD',
  trashed: false,
  ...changes,
});

const DINNER_A = expense('dinner', at(1000, 0, 'phone-a'));
const SUPPER_B = expense('supper', at(2000, 0, 'phone-b'));
const SNACK_C = expense('snack', at(3000, 0, 'phone-c'));
const BRUNCH_A = expense('brunch', at(1500, 0, 'phone-a'));

/** What the phone `device` shows of these expenses, with these pairs said not to be duplicates. */
const pairsOn = (
  device: string,
  expenses: SyncDuplicateCandidate[],
  distinctPairs: [string, string][] = [],
) => possibleSyncDuplicates({ device, expenses, distinct: distinctPairs });

const SUPPER_OF_DINNER = { id: 'supper', of: 'dinner' };

test.each(['phone-a', 'phone-b'])(
  '[SYNC-201.1] marks the expense recorded later, on %s as on the other phone that recorded one of the two',
  (device) => {
    expect(pairsOn(device, [DINNER_A, SUPPER_B])).toEqual([SUPPER_OF_DINNER]);
  },
);

test('[SYNC-201.1] shows nothing on a phone that recorded neither expense', () => {
  // The same two are a pair on the phones that recorded them.
  expect(pairsOn('phone-a', [DINNER_A, SUPPER_B])).toEqual([SUPPER_OF_DINNER]);

  expect(pairsOn('phone-c', [DINNER_A, SUPPER_B])).toEqual([]);
});

test.each<[string, Partial<SyncDuplicateCandidate>]>([
  ['another amount', { amountMinor: 10000 }],
  ['another currency', { currency: 'JPY' }],
  ['another date', { date: '2025-03-15' }],
])('[SYNC-201.1] two expenses with %s are no pair', (_case, changes) => {
  expect(pairsOn('phone-a', [DINNER_A, SUPPER_B])).toEqual([SUPPER_OF_DINNER]);

  expect(pairsOn('phone-a', [DINNER_A, { ...SUPPER_B, ...changes }])).toEqual(
    [],
  );
});

test('[SYNC-201.1] two expenses that one phone recorded are no pair', () => {
  expect(pairsOn('phone-a', [DINNER_A, SUPPER_B])).toEqual([SUPPER_OF_DINNER]);

  expect(
    pairsOn('phone-a', [
      DINNER_A,
      { ...SUPPER_B, created: at(2000, 0, 'phone-a') },
    ]),
  ).toEqual([]);
});

test.each<[string, boolean, boolean]>([
  ['the earlier one', true, false],
  ['the later one', false, true],
  ['both', true, true],
])(
  '[SYNC-201.1] two expenses are no pair while %s is in the trash',
  (_case, dinnerTrashed, supperTrashed) => {
    expect(pairsOn('phone-a', [DINNER_A, SUPPER_B])).toEqual([
      SUPPER_OF_DINNER,
    ]);

    expect(
      pairsOn('phone-a', [
        { ...DINNER_A, trashed: dinnerTrashed },
        { ...SUPPER_B, trashed: supperTrashed },
      ]),
    ).toEqual([]);
  },
);

test('[SYNC-201.1] two expenses said not to be duplicates are no pair, whichever is named first', () => {
  expect(pairsOn('phone-a', [DINNER_A, SUPPER_B])).toEqual([SUPPER_OF_DINNER]);

  expect(
    pairsOn('phone-a', [DINNER_A, SUPPER_B], [['dinner', 'supper']]),
  ).toEqual([]);
  expect(
    pairsOn('phone-b', [DINNER_A, SUPPER_B], [['supper', 'dinner']]),
  ).toEqual([]);
});

test('[SYNC-201.1] a pair stays one when only another pair was said not to be duplicates', () => {
  expect(
    pairsOn('phone-a', [DINNER_A, SUPPER_B], [['dinner', 'taxi']]),
  ).toEqual([SUPPER_OF_DINNER]);
  expect(
    pairsOn(
      'phone-a',
      [DINNER_A, SUPPER_B],
      [
        ['supper', 'taxi'],
        ['taxi', 'dinner'],
      ],
    ),
  ).toEqual([SUPPER_OF_DINNER]);
});

test('[SYNC-201.1] tells two expenses created in one millisecond apart by their device IDs', () => {
  const supper = { ...SUPPER_B, created: at(1000, 0, 'phone-b') };

  for (const device of ['phone-a', 'phone-b'])
    expect(pairsOn(device, [supper, DINNER_A])).toEqual([SUPPER_OF_DINNER]);
});

test('[SYNC-201.1] of three alike expenses from three phones, each phone shows the pairs it recorded one expense of, in the order of their creation stamps', () => {
  const three = [DINNER_A, SUPPER_B, SNACK_C];

  expect(pairsOn('phone-a', three)).toEqual([
    SUPPER_OF_DINNER,
    { id: 'snack', of: 'dinner' },
  ]);
  expect(pairsOn('phone-b', three)).toEqual([
    SUPPER_OF_DINNER,
    { id: 'snack', of: 'supper' },
  ]);
  expect(pairsOn('phone-c', three)).toEqual([
    { id: 'snack', of: 'dinner' },
    { id: 'snack', of: 'supper' },
  ]);
});

test('[SYNC-201.1] an expense alike to two that one phone recorded is paired with each, the earlier first, and those two are no pair', () => {
  const three = [DINNER_A, BRUNCH_A, SUPPER_B];

  for (const device of ['phone-a', 'phone-b']) {
    expect(pairsOn(device, three)).toEqual([
      SUPPER_OF_DINNER,
      { id: 'supper', of: 'brunch' },
    ]);
    expect(pairsOn(device, three, [['dinner', 'supper']])).toEqual([
      { id: 'supper', of: 'brunch' },
    ]);
  }
});

test('[SYNC-201.1] gives one answer whatever order the expenses and the pairs are handed over in', () => {
  const [a, b, c] = [DINNER_A, SUPPER_B, SNACK_C];
  const expected = [SUPPER_OF_DINNER, { id: 'snack', of: 'dinner' }];

  for (const order of [
    [a, b, c],
    [a, c, b],
    [b, a, c],
    [b, c, a],
    [c, a, b],
    [c, b, a],
  ])
    expect(pairsOn('phone-a', order)).toEqual(expected);
  const settled: [string, string][] = [
    ['snack', 'dinner'],
    ['supper', 'snack'],
  ];
  expect(pairsOn('phone-a', [c, b, a], settled)).toEqual([SUPPER_OF_DINNER]);
  expect(pairsOn('phone-a', [a, b, c], [...settled].reverse())).toEqual([
    SUPPER_OF_DINNER,
  ]);
});

test('[SYNC-201.1] finds no pair among no expenses, or one', () => {
  expect(pairsOn('phone-a', [])).toEqual([]);
  expect(pairsOn('phone-a', [DINNER_A])).toEqual([]);
});

test('[SYNC-201.1] finds the pairs among many expenses that are not alike', () => {
  const others = Array.from({ length: 200 }, (_, index) =>
    expense(`other-${index}`, at(5000 + index, 0, 'phone-b'), {
      amountMinor: 20000 + index,
    }),
  );

  expect(pairsOn('phone-a', [...others, SUPPER_B, DINNER_A])).toEqual([
    SUPPER_OF_DINNER,
  ]);
});

test('[SYNC-201.1] changes nothing of what it is handed', () => {
  const expenses = [DINNER_A, SUPPER_B].map((each) =>
    Object.freeze({ ...each, created: Object.freeze({ ...each.created }) }),
  );
  const pairs = Object.freeze([
    Object.freeze(['dinner', 'taxi'] as [string, string]),
  ]);
  Object.freeze(expenses);

  expect(
    possibleSyncDuplicates({
      device: 'phone-a',
      expenses,
      distinct: pairs,
    }),
  ).toEqual([SUPPER_OF_DINNER]);
});
