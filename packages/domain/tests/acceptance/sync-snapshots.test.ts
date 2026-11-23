import {
  checkSyncSnapshot,
  compareSyncStamps,
  mergeSyncSnapshotRecord,
  type SyncRecord,
  type SyncSnapshotRecord,
  type SyncStamp,
} from '../../src';
import {
  DINNER,
  DINNER_MONEY,
  FUEL_CATEGORY,
  at,
  change,
  deletion,
  merged,
  money,
  pick,
  seeded,
  unitsAt,
  valid,
} from './sync-fixtures';

// A snapshot is a shared ledger's merged records at one moment (ADR-0016, ADR-0028). These
// tests judge what a snapshot holds, and merge a snapshot's record into the record a phone
// holds, with no phone and no server.

const CREATED = at(1000, 0, 'phone-a');

/** A record as a snapshot holds it: the merged record, its creation stamp and whether that stamp is fixed. */
const held = (
  record: SyncRecord,
  created: SyncStamp = CREATED,
  wasThereWhenShared = false,
): SyncSnapshotRecord => ({ ...record, created, seeded: wasThereWhenShared });

/** A record with every value given, all at one stamp. */
const whole = (
  type: SyncRecord['type'],
  id: string,
  values: object,
  stamp: SyncStamp = CREATED,
) =>
  held({ type, id, units: unitsAt(values, stamp) } as SyncRecord, stamp, true);

/** A record that is only a tombstone. */
const tombstone = (
  type: 'expense' | 'category',
  id: string,
  stamp: SyncStamp,
) => held({ type, id, deleted: stamp, units: {} } as SyncRecord, CREATED);

const GROUP = whole('group', 'brisbane', { name: 'Brisbane' });
const UNCATEGORIZED = whole('category', 'cat-none', {
  name: 'Uncategorized',
  color: '#757575',
  archived: false,
});
const DINNER_RECORD = whole('expense', 'dinner', DINNER);
const BLAKE = whole('member', 'blake', { name: 'Blake', removed: true });
const TAXI = held(
  {
    type: 'expense',
    id: 'taxi',
    units: { title: { value: 'Taxi', stamp: at(2000) } },
  },
  at(2000),
);
const FUEL_GONE = tombstone('expense', 'fuel', at(3000, 0, 'phone-b'));
const HOTELS_GONE = tombstone('category', 'cat-hotels', at(3000, 1, 'phone-b'));

/** A snapshot of Brisbane with the group and its Uncategorized, and whatever else is given. */
const snapshot = (
  records: unknown[] = [],
  changes: Record<string, unknown> = {},
): Record<string, unknown> => ({
  version: 1,
  eventVersion: 1,
  groupId: 'brisbane',
  sequence: 0,
  uncategorized: 'cat-none',
  records: [GROUP, UNCATEGORIZED, ...records],
  ...changes,
});

/** `value` without the key `key`. */
const without = (value: object, key: string) =>
  Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));

/** `record` with one of its units replaced, or given another field. */
const withUnit = (record: SyncSnapshotRecord, name: string, unit: unknown) => ({
  ...record,
  units: { ...record.units, [name]: unit },
});

const CODE = '3q2-7wEjRWeJq83vEjRWeA';
const SECRET = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
const link = (
  expiresAtMs: unknown = 1795588320000,
  secret: unknown = SECRET,
) => ({
  secret,
  expiresAtMs,
});
/** An invite as a snapshot holds it: its one unit, at one stamp. */
const invite = (
  value: unknown = link(),
  id = CODE,
  stamp: SyncStamp = at(2000, 0, 'phone-a'),
) =>
  held(
    { type: 'invite', id, units: { link: { value, stamp } } } as SyncRecord,
    stamp,
  );

const REFUSED = { status: 'refused' };
const UNSUPPORTED = { status: 'unsupported' };

describe('SYNC-98.4', () => {
  const EVERY_KIND = [DINNER_RECORD, BLAKE, TAXI, FUEL_GONE, HOTELS_GONE];

  test.each<[string, unknown]>([
    ['only the group and its Uncategorized', snapshot()],
    [
      'the largest sequence number',
      snapshot([], { sequence: Number.MAX_SAFE_INTEGER }),
    ],
    ['whole and partial records and tombstones', snapshot(EVERY_KIND)],
    [
      'the same records in another order',
      snapshot([], {
        records: [...EVERY_KIND, UNCATEGORIZED, GROUP].reverse(),
      }),
    ],
    [
      'an expense and a category that share an ID',
      snapshot([DINNER_RECORD, whole('category', 'dinner', FUEL_CATEGORY)]),
    ],
  ])('[SYNC-98.4] a snapshot with %s can be imported', (_case, content) => {
    expect(checkSyncSnapshot(content)).toEqual({
      status: 'valid',
      snapshot: content,
    });
  });

  test.each<[string, unknown]>([
    ['snapshot format version 2', snapshot([], { version: 2 })],
    ['events of format version 2', snapshot([], { eventVersion: 2 })],
    [
      'format version 3, an unknown field and a record that is not valid',
      { ...snapshot([{ type: 'settlement' }], { version: 3 }), extra: true },
    ],
  ])('[SYNC-98.4] reports %s as a version it does not know', (_c, content) => {
    expect(checkSyncSnapshot(content)).toEqual(UNSUPPORTED);
  });

  test.each<[string, unknown]>([
    ['null', null],
    ['a text', 'snapshot'],
    ['a number', 7],
    ['an array', [snapshot()]],
  ])('[SYNC-98.4] %s is no snapshot', (_case, content) => {
    expect(checkSyncSnapshot(content)).toEqual(REFUSED);
  });

  test.each<[string, unknown]>([
    ['no version', without(snapshot(), 'version')],
    ['version 0', snapshot([], { version: 0 })],
    ['version -1', snapshot([], { version: -1 })],
    ['version 1.5', snapshot([], { version: 1.5 })],
    ['version "1"', snapshot([], { version: '1' })],
    ['event version 0', snapshot([], { eventVersion: 0 })],
    ['event version 1.5', snapshot([], { eventVersion: 1.5 })],
    ['event version "1"', snapshot([], { eventVersion: '1' })],
    ['no event version', without(snapshot(), 'eventVersion')],
  ])('[SYNC-98.4] refuses a snapshot with %s', (_case, content) => {
    expect(checkSyncSnapshot(content)).toEqual(REFUSED);
  });

  test.each<[string, unknown]>([
    ['no group ID', without(snapshot(), 'groupId')],
    ['no sequence number', without(snapshot(), 'sequence')],
    ['no Uncategorized', without(snapshot(), 'uncategorized')],
    ['no records', without(snapshot(), 'records')],
    ['a name beside', snapshot([], { name: 'Brisbane' })],
    ['records that are no array', snapshot([], { records: { 0: GROUP } })],
    ['a record with no creation stamp', snapshot([without(BLAKE, 'created')])],
    ['a record with no seeded flag', snapshot([without(BLAKE, 'seeded')])],
    ['a record with one field more', snapshot([{ ...BLAKE, position: 3 }])],
    [
      'a unit with no stamp',
      snapshot([withUnit(BLAKE, 'name', { value: 'Blake' })]),
    ],
    [
      'a unit with a base',
      snapshot([
        withUnit(BLAKE, 'name', {
          value: 'Blake',
          stamp: CREATED,
          base: CREATED,
        }),
      ]),
    ],
  ])('[SYNC-98.4] refuses a snapshot with %s', (_case, content) => {
    expect(checkSyncSnapshot(content)).toEqual(REFUSED);
  });

  test.each<[string, unknown]>([
    ['an empty group ID', { groupId: '' }],
    ['a group ID that is a number', { groupId: 7 }],
    ['sequence number -1', { sequence: -1 }],
    ['sequence number 1.5', { sequence: 1.5 }],
    ['sequence number 2^53', { sequence: Number.MAX_SAFE_INTEGER + 1 }],
    ['sequence number "0"', { sequence: '0' }],
  ])('[SYNC-98.4] refuses a snapshot with %s', (_case, changes) => {
    expect(
      checkSyncSnapshot(snapshot([], changes as Record<string, unknown>)),
    ).toEqual(REFUSED);
  });

  test.each<[string, unknown[]]>([
    ['a record of an unknown type', [{ ...DINNER_RECORD, type: 'settlement' }]],
    ['a record with an empty ID', [{ ...DINNER_RECORD, id: '' }]],
    ['the same record twice', [DINNER_RECORD, DINNER_RECORD]],
    [
      'two records of one type and ID',
      [
        DINNER_RECORD,
        withUnit(DINNER_RECORD, 'title', { value: 'Supper', stamp: at(2000) }),
      ],
    ],
  ])('[SYNC-98.4] refuses a snapshot with %s', (_case, records) => {
    expect(checkSyncSnapshot(snapshot(records))).toEqual(REFUSED);
  });

  test.each<[string, unknown]>([
    ['neither a unit nor a tombstone', { ...TAXI, units: {} }],
    ['a tombstone and a unit', { ...FUEL_GONE, units: TAXI.units }],
    ['a tombstone on a member', { ...BLAKE, units: {}, deleted: at(3000) }],
    [
      'a unit its type does not have',
      withUnit(BLAKE, 'archived', { value: false, stamp: CREATED }),
    ],
    ['a seeded flag that is a text', { ...BLAKE, seeded: 'yes' }],
  ])('[SYNC-98.4] refuses a record with %s', (_case, record) => {
    expect(checkSyncSnapshot(snapshot([record]))).toEqual(REFUSED);
  });

  test.each<[string, unknown]>([
    [
      'an empty title',
      withUnit(DINNER_RECORD, 'title', { value: '', stamp: CREATED }),
    ],
    [
      'a currency that is not supported',
      withUnit(DINNER_RECORD, 'money', {
        value: money({ currency: 'XYZ' }),
        stamp: CREATED,
      }),
    ],
    [
      'shares that do not add up',
      withUnit(DINNER_RECORD, 'money', {
        value: money({
          shares: [
            { participant: 'blake', amountMinor: 5000 },
            { participant: 'taylor', amountMinor: 5000 },
          ],
        }),
        stamp: CREATED,
      }),
    ],
    [
      'a color that is no color',
      whole('category', 'cat-fuel', { ...FUEL_CATEGORY, color: 'red' }),
    ],
    [
      'a removed flag that is a text',
      withUnit(BLAKE, 'removed', { value: 'true', stamp: CREATED }),
    ],
  ])('[SYNC-98.4] refuses a record with %s', (_case, record) => {
    expect(checkSyncSnapshot(snapshot([record]))).toEqual(REFUSED);
  });

  test('[SYNC-98.4] refuses a tombstone on the group record', () => {
    expect(checkSyncSnapshot(snapshot()).status).toBe('valid');
    expect(
      checkSyncSnapshot(
        snapshot([], {
          records: [{ ...GROUP, units: {}, deleted: at(3000) }, UNCATEGORIZED],
        }),
      ),
    ).toEqual(REFUSED);
  });

  test('[SYNC-98.4] takes the money of a record that adds up in a supported currency', () => {
    expect(DINNER_MONEY.currency).toBe('USD');
    expect(checkSyncSnapshot(snapshot([DINNER_RECORD])).status).toBe('valid');
  });

  test.each<[string, unknown]>([
    [
      "a unit's stamp with counter -1",
      withUnit(BLAKE, 'name', { value: 'Blake', stamp: at(1000, -1) }),
    ],
    [
      'a creation stamp whose device has a space',
      { ...BLAKE, created: at(1000, 0, 'phone a') },
    ],
    [
      "a tombstone's stamp with a fraction",
      { ...FUEL_GONE, deleted: at(1000.5) },
    ],
  ])('[SYNC-98.4] refuses a record with %s', (_case, record) => {
    expect(checkSyncSnapshot(snapshot([record]))).toEqual(REFUSED);
  });

  test.each<[string, unknown[]]>([
    ['no group record', [UNCATEGORIZED, DINNER_RECORD]],
    [
      'two group records',
      [GROUP, whole('group', 'tokyo', { name: 'Tokyo' }), UNCATEGORIZED],
    ],
    [
      'a group record of another group',
      [whole('group', 'tokyo', { name: 'Tokyo' }), UNCATEGORIZED],
    ],
  ])('[SYNC-98.4] refuses a snapshot with %s', (_case, records) => {
    expect(checkSyncSnapshot(snapshot([], { records }))).toEqual(REFUSED);
  });

  test.each<[string, Record<string, unknown>]>([
    ['is not in the snapshot', { uncategorized: 'cat-missing' }],
    [
      'is an expense',
      {
        uncategorized: 'dinner',
        records: [GROUP, UNCATEGORIZED, DINNER_RECORD],
      },
    ],
    [
      'is only a tombstone',
      { records: [GROUP, tombstone('category', 'cat-none', at(3000))] },
    ],
    [
      'lacks a unit',
      {
        records: [
          GROUP,
          { ...UNCATEGORIZED, units: without(UNCATEGORIZED.units, 'archived') },
        ],
      },
    ],
    [
      'has another name',
      {
        records: [
          GROUP,
          withUnit(UNCATEGORIZED, 'name', { value: 'Other', stamp: CREATED }),
        ],
      },
    ],
    [
      'has another color',
      {
        records: [
          GROUP,
          withUnit(UNCATEGORIZED, 'color', {
            value: '#C62828',
            stamp: CREATED,
          }),
        ],
      },
    ],
    [
      'is archived',
      {
        records: [
          GROUP,
          withUnit(UNCATEGORIZED, 'archived', { value: true, stamp: CREATED }),
        ],
      },
    ],
  ])(
    '[SYNC-98.4] refuses a snapshot whose Uncategorized %s',
    (_case, changes) => {
      expect(checkSyncSnapshot(snapshot([], changes))).toEqual(REFUSED);
    },
  );
  test.each([null, 'Dinner', 7, [DINNER_RECORD]])(
    '[SYNC-98.4] a snapshot cannot be taken in when a record is %p and no object',
    (record) => {
      expect(checkSyncSnapshot(snapshot([record]))).toEqual(REFUSED);
    },
  );

  test('[SYNC-98.4] a snapshot with an invite that is not revoked can be taken in', () => {
    for (const records of [
      [invite()],
      [invite(link(0))],
      [DINNER_RECORD, invite(), BLAKE],
    ]) {
      const content = snapshot(records);
      expect(checkSyncSnapshot(content)).toEqual({
        status: 'valid',
        snapshot: content,
      });
    }
  });

  test.each([
    ['its ID is 21 characters', invite(link(), '3q2-7wEjRWeJq83vEjRWe')],
    [
      'its ID ends in a character 16 bytes cannot give',
      invite(link(), '3q2-7wEjRWeJq83vEjRWeB'),
    ],
    [
      'its string is a character short',
      invite(link(1795588320000, SECRET.slice(1))),
    ],
    ['its expiry is 1.5', invite(link(1.5))],
    ['its link holds one thing more', invite({ ...link(), name: 'Brisbane' })],
    [
      'it has a unit an invite does not have',
      withUnit(invite(), 'name', { value: 'Brisbane', stamp: CREATED }),
    ],
    ['it has no unit', { ...invite(), units: {} }],
    [
      'it is only a tombstone',
      held(
        {
          type: 'invite',
          id: CODE,
          deleted: at(3000, 0, 'phone-b'),
          units: {},
        } as SyncRecord,
        CREATED,
      ),
    ],
  ])(
    '[SYNC-98.4] a snapshot with an invite cannot be taken in when %s',
    (_, record) => {
      expect(checkSyncSnapshot(snapshot([record]))).toEqual(REFUSED);
    },
  );
});

describe('SYNC-99.1', () => {
  /** Dinner after these changes on top of its first event, as a phone or a snapshot holds it. */
  const dinnerAfter = (...changes: unknown[]) =>
    held(merged([change('expense', 'dinner', CREATED, DINNER), ...changes]));

  const titled = (title: string, stamp: SyncStamp) =>
    change('expense', 'dinner', stamp, { title }, CREATED);

  test('[SYNC-99.1] a record the phone does not have becomes the snapshot’s', () => {
    const incoming = dinnerAfter();

    expect(
      mergeSyncSnapshotRecord({ incoming, seen: at(500, 0, 'phone-b') }),
    ).toEqual({ record: incoming, seen: CREATED });
    expect(mergeSyncSnapshotRecord({ incoming })).toEqual({
      record: incoming,
      seen: CREATED,
    });
  });

  test('[SYNC-99.1] keeps each unit of the side with the later stamp', () => {
    const mine = dinnerAfter(titled('Late dinner', at(3000, 0, 'phone-b')));
    const incoming = dinnerAfter(
      titled('Supper', at(2000)),
      change('expense', 'dinner', at(2500), { note: 'Window seat' }, CREATED),
    );

    const { record } = mergeSyncSnapshotRecord({ held: mine, incoming });

    expect(record.units).toEqual({
      ...unitsAt(DINNER, CREATED),
      title: { value: 'Late dinner', stamp: at(3000, 0, 'phone-b') },
      note: { value: 'Window seat', stamp: at(2500) },
    });
  });

  test('[SYNC-99.1] keeps a unit only one side has', () => {
    const partial = held(
      merged([titled('Supper', at(2000, 0, 'phone-b'))]),
      at(2000, 0, 'phone-b'),
    );
    const complete = dinnerAfter();
    const expected = {
      ...unitsAt(DINNER, CREATED),
      title: { value: 'Supper', stamp: at(2000, 0, 'phone-b') },
    };

    expect(
      mergeSyncSnapshotRecord({ held: partial, incoming: complete }).record
        .units,
    ).toEqual(expected);
    expect(
      mergeSyncSnapshotRecord({ held: complete, incoming: partial }).record
        .units,
    ).toEqual(expected);
  });

  test('[SYNC-99.1] keeps the larger value where the stamps are the same', () => {
    const supper = dinnerAfter(titled('Supper', at(2000)));
    const late = dinnerAfter(titled('Late dinner', at(2000)));
    const kept = { value: 'Supper', stamp: at(2000) };

    expect(
      mergeSyncSnapshotRecord({ held: supper, incoming: late }).record.units,
    ).toMatchObject({ title: kept });
    expect(
      mergeSyncSnapshotRecord({ held: late, incoming: supper }).record.units,
    ).toMatchObject({ title: kept });
  });

  test('[SYNC-99.1] a tombstone on either side leaves only the tombstone, the later of two', () => {
    const changed = dinnerAfter(titled('Supper', at(3000, 0, 'phone-b')));
    const gone = tombstone('expense', 'dinner', at(2000));
    const goneLater = tombstone('expense', 'dinner', at(2500, 0, 'phone-b'));

    for (const [mine, incoming] of [
      [changed, gone],
      [gone, changed],
    ]) {
      const { record } = mergeSyncSnapshotRecord({ held: mine, incoming });
      expect(record.deleted).toEqual(at(2000));
      expect(record.units).toEqual({});
    }
    for (const [mine, incoming] of [
      [gone, goneLater],
      [goneLater, gone],
    ]) {
      const { record } = mergeSyncSnapshotRecord({ held: mine, incoming });
      expect(record.deleted).toEqual(at(2500, 0, 'phone-b'));
      expect(record.units).toEqual({});
    }
  });

  test('[SYNC-99.1] an invite keeps the larger link where the stamps are the same, and a tombstone on the phone beats the snapshot’s link', () => {
    const sooner = invite(link(1795588320000));
    const later = invite(link(1795588320001));
    const kept = { value: link(1795588320001), stamp: at(2000, 0, 'phone-a') };

    expect(
      mergeSyncSnapshotRecord({ held: sooner, incoming: later }).record.units,
    ).toEqual({ link: kept });
    expect(
      mergeSyncSnapshotRecord({ held: later, incoming: sooner }).record.units,
    ).toEqual({ link: kept });

    const revoked = held(
      {
        type: 'invite',
        id: CODE,
        deleted: at(2500, 0, 'phone-b'),
        units: {},
      } as SyncRecord,
      at(2000, 0, 'phone-a'),
    );
    const { record } = mergeSyncSnapshotRecord({
      held: revoked,
      incoming: invite(link(), CODE, at(3000, 0, 'phone-a')),
    });
    expect(record.units).toEqual({});
    expect(record.deleted).toEqual(at(2500, 0, 'phone-b'));
  });

  test.each<
    [string, [SyncStamp, boolean], [SyncStamp, boolean], [SyncStamp, boolean]]
  >([
    [
      'the earlier one when neither is fixed, here the snapshot’s',
      [at(1500, 0, 'phone-b'), false],
      [at(1000), false],
      [at(1000), false],
    ],
    [
      'the earlier one when neither is fixed, here the phone’s',
      [at(1000), false],
      [at(1500, 0, 'phone-b'), false],
      [at(1000), false],
    ],
    [
      'the snapshot’s when it is fixed, though it is later',
      [at(1000, 0, 'phone-b'), false],
      [at(2000), true],
      [at(2000), true],
    ],
    [
      'the phone’s when only that one is fixed, though it is later',
      [at(2000, 0, 'phone-b'), true],
      [at(1000), false],
      [at(2000, 0, 'phone-b'), true],
    ],
    [
      'the snapshot’s when both are fixed',
      [at(1000, 0, 'phone-b'), true],
      [at(2000), true],
      [at(2000), true],
    ],
  ])(
    '[SYNC-99.1] the creation stamp is %s',
    (_case, [mineAt, mineFixed], [theirsAt, theirsFixed], [stamp, fixed]) => {
      const record = merged([change('expense', 'dinner', at(5000), DINNER)]);

      const result = mergeSyncSnapshotRecord({
        held: held(record, mineAt, mineFixed),
        incoming: held(record, theirsAt, theirsFixed),
      }).record;

      expect(result.created).toEqual(stamp);
      expect(result.seeded).toBe(fixed);
    },
  );

  test('[SYNC-99.1] reports the latest stamp seen, counting every stamp of the snapshot’s record', () => {
    const incoming = dinnerAfter(titled('Supper', at(6000)));
    const mine = dinnerAfter(
      change(
        'expense',
        'dinner',
        at(9000, 0, 'phone-b'),
        { ...DINNER, title: 'Late dinner' },
        CREATED,
      ),
    );

    expect(
      mergeSyncSnapshotRecord({ incoming, seen: at(5000, 0, 'phone-b') }).seen,
    ).toEqual(at(6000));
    expect(
      mergeSyncSnapshotRecord({ incoming, seen: at(7000, 0, 'phone-b') }).seen,
    ).toEqual(at(7000, 0, 'phone-b'));
    expect(
      mergeSyncSnapshotRecord({
        incoming: tombstone('expense', 'dinner', at(6500)),
        seen: at(5000, 0, 'phone-b'),
      }).seen,
    ).toEqual(at(6500));
    // None of the snapshot's units is kept, and its stamps have still been seen.
    const outdated = mergeSyncSnapshotRecord({
      held: mine,
      incoming,
      seen: at(5000, 0, 'phone-b'),
    });
    expect(outdated.record.units).toEqual(mine.units);
    expect(outdated.seen).toEqual(at(6000));
    // A creation stamp counts too.
    expect(
      mergeSyncSnapshotRecord({
        incoming: held(dinnerAfter(), at(8000, 0, 'phone-c'), true),
        seen: at(5000, 0, 'phone-b'),
      }).seen,
    ).toEqual(at(8000, 0, 'phone-c'));
  });

  test('[SYNC-99.1] leaves what it was given as it was', () => {
    const mine = dinnerAfter(titled('Late dinner', at(3000, 0, 'phone-b')));
    const incoming = dinnerAfter(titled('Supper', at(2000)));
    const before = JSON.stringify([mine, incoming]);

    mergeSyncSnapshotRecord({ held: mine, incoming });

    expect(JSON.stringify([mine, incoming])).toBe(before);
  });

  test('[SYNC-99.1] throws when the two are not the same record', () => {
    const mine = dinnerAfter();
    expect(
      mergeSyncSnapshotRecord({ held: mine, incoming: dinnerAfter() }).record,
    ).toEqual(mine);

    expect(() =>
      mergeSyncSnapshotRecord({
        held: mine,
        incoming: whole('expense', 'fuel', DINNER),
      }),
    ).toThrow();
    expect(() =>
      mergeSyncSnapshotRecord({
        held: mine,
        incoming: whole('category', 'dinner', FUEL_CATEGORY),
      }),
    ).toThrow();
  });

  // The property that makes a snapshot safe: merging it gives what merging its events gives.

  const DEVICES = ['phone-a', 'phone-b', 'phone-c'];
  const VALUES: Record<string, Record<string, readonly unknown[]>> = {
    expense: {
      title: ['Dinner', 'Supper', 'Late dinner'],
      date: ['2025-03-14', '2025-03-15'],
      note: [null, 'Window seat'],
      category: [
        DINNER.category,
        { id: 'cat-fuel', name: 'Fuel', color: '#1E88E5' },
      ],
      money: [
        DINNER_MONEY,
        money({ payments: [{ participant: 'taylor', amountMinor: 10001 }] }),
      ],
      trashed: [true, false],
    },
    category: {
      name: ['Fuel', 'Petrol'],
      color: ['#1E88E5', '#43A047'],
      archived: [true, false],
    },
    group: { name: ['Brisbane', 'Brissie'] },
    member: { name: ['Blake', 'Blake K.'], removed: [true, false] },
  };
  const RECORDS: readonly (readonly [string, string])[] = [
    ['expense', 'dinner'],
    ['expense', 'fuel'],
    ['category', 'cat-fuel'],
    ['category', 'cat-hotels'],
    ['group', 'brisbane'],
    ['member', 'blake'],
  ];

  /** One of 12 stamps, so that many events share one. */
  const crowded = (random: () => number) =>
    at(
      1000 + Math.floor(random() * 2),
      Math.floor(random() * 2),
      pick(DEVICES, random),
    );

  function randomEvent(random: () => number) {
    const [type, id] = pick(RECORDS, random);
    const stamp = crowded(random);
    if ((id === 'fuel' || id === 'cat-hotels') && random() < 0.08) {
      return valid(deletion(type as 'expense' | 'category', id, stamp));
    }
    const choices = VALUES[type];
    const names = Object.keys(choices).filter(() => random() < 0.5);
    if (names.length === 0) names.push(pick(Object.keys(choices), random));
    return valid(
      change(
        type as SyncRecord['type'],
        id,
        stamp,
        Object.fromEntries(
          names.map((name) => [name, pick(choices[name], random)]),
        ),
      ),
    );
  }

  type Events = ReturnType<typeof randomEvent>[];

  /**
   * What a phone holds after merging these events: its records with their creation stamps,
   * and the latest stamp among them, which is what it has seen at least.
   */
  function stateOf(events: Events) {
    const records = new Map<string, SyncSnapshotRecord>();
    let seen: SyncStamp | undefined;
    for (const [type, id] of RECORDS) {
      const own = events.filter(
        (event) => event.type === type && event.id === id,
      );
      if (own.length === 0) continue;
      const created = own
        .map((event) => event.stamp)
        .reduce((a, b) => (compareSyncStamps(a, b) <= 0 ? a : b));
      records.set(`${type}/${id}`, held(merged(own), created));
    }
    for (const { stamp } of events) {
      if (!seen || compareSyncStamps(stamp, seen) > 0) seen = stamp;
    }
    return { records, seen };
  }

  test('[SYNC-99.1] merging a snapshot gives what merging its events gives, however 150 events are split, 50 times', () => {
    const random = seeded(139);
    const events: Events = Array.from({ length: 150 }, () =>
      randomEvent(random),
    );
    const everything = stateOf(events);
    expect(
      [...everything.records.values()].filter((record) => record.deleted)
        .length,
    ).toBeGreaterThan(0);

    for (let run = 0; run < 50; run += 1) {
      const inSnapshot: Events = [];
      const onPhone: Events = [];
      for (const event of events) {
        const where = random();
        if (where < 0.6) inSnapshot.push(event);
        if (where > 0.4) onPhone.push(event);
      }
      const taken = stateOf(inSnapshot);
      const phone = stateOf(onPhone);
      // What the phone has seen afterwards: what it had seen, and every stamp the
      // snapshot's records hold. A stamp that left no trace in them is not among these.
      const seen = [...taken.records.values()]
        .flatMap((record) => [
          record.created,
          ...(record.deleted ? [record.deleted] : []),
          ...Object.values(
            record.units as Record<string, { stamp: SyncStamp }>,
          ).map((unit) => unit.stamp),
        ])
        .reduce(
          (latest, stamp) =>
            latest && compareSyncStamps(latest, stamp) >= 0 ? latest : stamp,
          phone.seen,
        );

      for (let pass = 0; pass < 2; pass += 1) {
        for (const [key, incoming] of taken.records) {
          const result = mergeSyncSnapshotRecord({
            held: phone.records.get(key),
            incoming,
            seen: phone.seen,
          });
          phone.records.set(key, result.record);
          phone.seen = result.seen;
        }
        expect(Object.fromEntries(phone.records)).toEqual(
          Object.fromEntries(everything.records),
        );
        expect(phone.seen).toEqual(seen);
      }
    }
  });
});
