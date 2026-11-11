import { compareSyncStamps, nextSyncStamp, type SyncStamp } from '../../src';
import { at } from './sync-fixtures';

const order = (a: SyncStamp, b: SyncStamp) =>
  Math.sign(compareSyncStamps(a, b));

test.each<[string, SyncStamp, SyncStamp]>([
  ['milliseconds first', at(1000, 5, 'b'), at(1001, 0, 'a')],
  ['then the counter, as a number', at(1000, 9, 'b'), at(1000, 10, 'a')],
  ['then the device', at(1000, 5, 'a'), at(1000, 5, 'b')],
  ['uppercase before lowercase', at(1000, 5, 'Z9'), at(1000, 5, 'a1')],
  ['digits as bytes, not as numbers', at(1000, 5, '10'), at(1000, 5, '9')],
  ['a prefix before the longer device', at(1000, 5, 'ab'), at(1000, 5, 'abc')],
])('[SYNC-1.1] compares %s', (_rule, earlier, later) => {
  expect(order(earlier, later)).toBe(-1);
  expect(order(later, earlier)).toBe(1);
});

test('[SYNC-1.1] equal milliseconds, counter and device are the same stamp', () => {
  expect(order(at(1000, 5, 'b'), at(1000, 5, 'b'))).toBe(0);
});

test.each<[string, SyncStamp | undefined, SyncStamp]>([
  ['nothing has been seen', undefined, at(5000, 0, 'phone-a')],
  [
    'the clock is ahead of what was seen',
    at(4000, 7, 'phone-b'),
    at(5000, 0, 'phone-a'),
  ],
  [
    'the clock is at the millisecond that was seen',
    at(5000, 0, 'phone-a'),
    at(5000, 1, 'phone-a'),
  ],
  [
    'the clock is behind what was seen',
    at(9000, 2, 'phone-b'),
    at(9000, 3, 'phone-a'),
  ],
  [
    'the counter that was seen is at its limit',
    at(9000, Number.MAX_SAFE_INTEGER, 'phone-b'),
    at(9001, 0, 'phone-a'),
  ],
])(
  '[SYNC-2.1] stamps a change made at 5000 when %s',
  (_case, seen, expected) => {
    const stamp = nextSyncStamp({ seen, nowMs: 5000, device: 'phone-a' });

    expect(stamp).toEqual(expected);
    if (seen) expect(order(stamp, seen)).toBe(1);
  },
);

test('[SYNC-2.1] changes made one after another get later and later stamps', () => {
  let seen: SyncStamp | undefined;
  const stamps = [5000, 5000, 4000, 5000, 6000].map((nowMs) => {
    seen = nextSyncStamp({ seen, nowMs, device: 'phone-a' });
    return seen;
  });

  expect(stamps).toEqual([
    at(5000, 0, 'phone-a'),
    at(5000, 1, 'phone-a'),
    at(5000, 2, 'phone-a'),
    at(5000, 3, 'phone-a'),
    at(6000, 0, 'phone-a'),
  ]);
});
