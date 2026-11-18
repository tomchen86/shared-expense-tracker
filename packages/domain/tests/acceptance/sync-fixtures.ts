import {
  checkSyncEvent,
  mergeSyncEvent,
  type SyncEvent,
  type SyncMerge,
  type SyncMoney,
  type SyncRecord,
  type SyncRecordType,
  type SyncStamp,
  type SyncUnits,
  type SyncVerdict,
} from '../../src';

/** A stamp, written in the spec's scenarios as ms/counter/device. */
export const at = (ms: number, counter = 0, device = 'phone-a'): SyncStamp => ({
  ms,
  counter,
  device,
});

/** The stamp of Dinner's first event. */
export const CREATED = at(1000, 0, 'phone-a');

export const DINNER_MONEY: SyncMoney = {
  amountMinor: 10001,
  currency: 'USD',
  payments: [{ participant: 'casey', amountMinor: 10001 }],
  shares: [
    { participant: 'blake', amountMinor: 3334 },
    { participant: 'taylor', amountMinor: 3334 },
    { participant: 'casey', amountMinor: 3333 },
  ],
};

/** The expense the spec's scenarios call Dinner. */
export const DINNER: SyncUnits['expense'] = {
  title: 'Dinner',
  date: '2025-03-14',
  note: null,
  category: { id: 'cat-food', name: 'Food & Dining', color: '#D81B60' },
  money: DINNER_MONEY,
  trashed: false,
};

export const FUEL_CATEGORY: SyncUnits['category'] = {
  name: 'Fuel',
  color: '#1E88E5',
  archived: false,
};

/** Dinner's money with some of it changed. */
export const money = (changes: Partial<SyncMoney>): SyncMoney => ({
  ...DINNER_MONEY,
  ...changes,
});

/**
 * What an event that changes units holds. Every unit carries `base`, the stamp it
 * replaces, when one is given; a record's first event has none.
 */
export function change<T extends SyncRecordType>(
  type: T,
  id: string,
  stamp: SyncStamp,
  values: Partial<SyncUnits[T]>,
  base?: SyncStamp,
) {
  return {
    version: 1,
    stamp,
    type: type as string,
    id,
    units: Object.fromEntries(
      Object.entries(values).map(([unit, value]) => [
        unit,
        base ? { value, base } : { value },
      ]),
    ) as Record<string, { value: unknown; base?: SyncStamp }>,
  };
}

/** What an event that permanently deletes a record holds. */
export const deletion = (
  type: 'expense' | 'category',
  id: string,
  stamp: SyncStamp,
) => ({ version: 1, stamp, type: type as string, id, deleted: true });

/** Dinner's first event. */
export const dinnerCreated = () => change('expense', 'dinner', CREATED, DINNER);

/** A change to Dinner made on top of its first event. */
export const dinnerChange = (
  stamp: SyncStamp,
  values: Partial<SyncUnits['expense']>,
  base: SyncStamp = CREATED,
) => change('expense', 'dinner', stamp, values, base);

/** The verdict on an event; without a receive time, as for a change not sent yet. */
export const judge = (
  content: unknown,
  receivedAtMs: number | null = null,
): SyncVerdict =>
  checkSyncEvent(content, receivedAtMs === null ? null : { receivedAtMs });

export const refused = (reason: string) => ({ status: 'refused', reason });

/** The event behind content that must be valid. */
export function valid(
  content: unknown,
  receivedAtMs: number | null = null,
): SyncEvent {
  const verdict = judge(content, receivedAtMs);
  if (verdict.status !== 'valid') {
    throw new Error(`Expected a valid event: ${JSON.stringify(verdict)}`);
  }
  return verdict.event;
}

/** Checks an event and merges it into the record it names. */
export const merge = (
  record: SyncRecord | undefined,
  content: unknown,
  seen?: SyncStamp,
): SyncMerge => mergeSyncEvent({ record, seen, event: valid(content) });

/** The record left by merging events, in the order given, into `record` or into nothing. */
export function merged(
  contents: readonly unknown[],
  record?: SyncRecord,
): SyncRecord {
  const result = contents.reduce<SyncRecord | undefined>(
    (current, content) => merge(current, content).record,
    record,
  );
  if (!result) throw new Error('Nothing was merged');
  return result;
}

/** Dinner after its first event. */
export const dinner = () => merged([dinnerCreated()]);

/** A record's units when every value still has the same stamp. */
export const unitsAt = (values: object, stamp: SyncStamp) =>
  Object.fromEntries(
    Object.entries(values).map(([unit, value]) => [unit, { value, stamp }]),
  );

/** One unit of a record: its value and its stamp. */
export const unit = (record: SyncRecord, name: string) =>
  (
    record.units as Record<
      string,
      { value: unknown; stamp: SyncStamp } | undefined
    >
  )[name];

/** The same two events in both orders. */
export const bothOrders = (first: unknown, second: unknown): unknown[][] => [
  [first, second],
  [second, first],
];

/** What one phone holds: its records by type and ID, and the latest stamp it has seen. */
export interface Phone {
  records: Record<string, SyncRecord>;
  seen?: SyncStamp;
}

/** An event as a phone downloads it. */
export interface Delivery {
  content: unknown;
  receivedAtMs: number;
}

/** Judges a downloaded event and merges it when it is valid, as a phone does. */
export function receive(phone: Phone, delivery: Delivery): Phone {
  const verdict = checkSyncEvent(delivery.content, {
    receivedAtMs: delivery.receivedAtMs,
  });
  if (verdict.status !== 'valid') return phone;
  const key = `${verdict.event.type}/${verdict.event.id}`;
  const result = mergeSyncEvent({
    record: phone.records[key],
    seen: phone.seen,
    event: verdict.event,
  });
  return {
    records: { ...phone.records, [key]: result.record },
    seen: result.seen,
  };
}

export const receiveAll = (deliveries: readonly Delivery[]): Phone =>
  deliveries.reduce(receive, { records: {} });

/** A small seeded generator (mulberry32): the same seed gives the same numbers on every run. */
export function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = <T>(items: readonly T[], random: () => number): T =>
  items[Math.floor(random() * items.length)];

/** The items in a random order, with some of them delivered again. */
export function shuffledWithRepeats<T>(
  items: readonly T[],
  random: () => number,
): T[] {
  const result = [...items];
  for (const item of items) {
    while (random() < 0.3) result.push(item);
  }
  for (let last = result.length - 1; last > 0; last -= 1) {
    const other = Math.floor(random() * (last + 1));
    [result[last], result[other]] = [result[other], result[last]];
  }
  return result;
}
