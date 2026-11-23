import { possibleSyncDuplicates } from './duplicates';
import {
  checkSyncEvent,
  mergeSyncEvent,
  nextSyncStamp,
  sameSyncUnitValue,
  syncRecordValues,
  type SyncChange,
  type SyncUnits,
} from './sync';

const stamp = { ms: 1000, counter: 0, device: 'phone-a' };
const event = {
  version: 1,
  stamp,
  type: 'group',
  id: 'trip',
  units: { name: { value: 'Trip' } },
};

// Exercise the objects produced by JSON.parse, including an own __proto__ key.
const parsed = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

test('orders matching expenses with identical creation stamps by ID, regardless of input order', () => {
  const common = {
    date: '2026-10-30',
    amountMinor: 1000,
    currency: 'USD',
    trashed: false,
  };
  const mine = { ...common, id: 'mine', created: { ...stamp, ms: 2000 } };
  const first = {
    ...common,
    id: 'a,b',
    created: { ...stamp, device: 'other' },
  };
  const next = { ...first, id: 'b' };
  for (const expenses of [
    [mine, next, first],
    [first, next, mine],
  ])
    expect(
      possibleSyncDuplicates({ device: stamp.device, expenses, distinct: [] }),
    ).toEqual([
      { id: mine.id, of: first.id },
      { id: mine.id, of: next.id },
    ]);
});

test.each(['__proto__', 'constructor', 'toString'])(
  'does not accept the inherited object key %s as a record type or unit',
  (key) => {
    const contents = [
      { ...event, type: key },
      { ...event, units: { ...event.units, [key]: { value: 'unexpected' } } },
    ];
    for (const content of contents) {
      expect(checkSyncEvent(parsed(content), null)).toEqual({
        status: 'refused',
        reason: 'structure',
      });
    }
  },
);

test.each(['phone-a\n', 'phone-a\r\n', 'phone-a\x7f'])(
  'rejects the device %p when receiving and stamping an event',
  (device) => {
    expect(
      checkSyncEvent(parsed({ ...event, stamp: { ...stamp, device } }), null),
    ).toEqual({ status: 'refused', reason: 'structure' });
    expect(() => nextSyncStamp({ nowMs: 1000, device })).toThrow();
  },
);

test('does not accept a newline after a complete category color', () => {
  expect(
    checkSyncEvent(
      parsed({
        ...event,
        type: 'category',
        units: { color: { value: '#aabbcc\n' } },
      }),
      null,
    ),
  ).toEqual({ status: 'refused', reason: 'structure' });
});

test('accepts object property names as identifiers and distinct participants', () => {
  const allocations = [
    { participant: '__proto__', amountMinor: 1 },
    { participant: 'constructor', amountMinor: 2 },
    { participant: 'toString', amountMinor: 3 },
  ];
  const content = parsed({
    ...event,
    type: 'expense',
    id: '__proto__',
    units: {
      money: {
        value: {
          amountMinor: 6,
          currency: 'JPY',
          payments: allocations,
          shares: allocations,
        },
      },
    },
  });

  expect(checkSyncEvent(content, null)).toEqual({
    status: 'valid',
    event: content,
  });
});

test('invite links with the same stamp converge by expiry, then secret', () => {
  const firstSecret = 'A'.repeat(43);
  const lastSecret = 'B' + firstSecret.slice(1);
  const first = { expiresAtMs: 1, secret: lastSecret };
  const second = { expiresAtMs: 2, secret: firstSecret };
  const third = { expiresAtMs: 2, secret: lastSecret };
  const change = (value: SyncUnits['invite']['link']): SyncChange => ({
    version: 1,
    type: 'invite',
    id: 'A'.repeat(22),
    stamp,
    units: { link: { value } },
  });

  for (const [smaller, larger] of [
    [first, second],
    [second, third],
  ]) {
    for (const [a, b] of [
      [smaller, larger],
      [larger, smaller],
    ]) {
      const { record } = mergeSyncEvent({ event: change(a) });
      const result = mergeSyncEvent({ record, event: change(b) });
      expect(syncRecordValues(result.record)).toEqual({ link: larger });
    }
  }
  expect(sameSyncUnitValue('link', first, { ...first })).toBe(true);
  expect(sameSyncUnitValue('link', second, third)).toBe(false);
});
