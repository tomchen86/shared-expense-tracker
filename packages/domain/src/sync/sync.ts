import { isInviteCode } from '../api/invites';
import { isLocalDate } from '../ledger/dates';
import { currencyDecimals, type Share } from '../ledger/money';

/** When a change was made (SYNC-1.1). */
export interface SyncStamp {
  /** Milliseconds since the Unix epoch. */
  ms: number;
  counter: number;
  /** The ID of the device that made the change. */
  device: string;
}

/** An amount with its currency and who paid and shares it: one unit (SYNC-12.1). */
export interface SyncMoney {
  amountMinor: number;
  currency: string;
  /** In order. */
  payments: Share<string>[];
  /** In order. */
  shares: Share<string>[];
}

/** Each kind of record's units, and the value each unit holds (SYNC-5.1, SYNC-6.1, SYNC-250.1). */
export interface SyncUnits {
  expense: {
    title: string;
    /** YYYY-MM-DD */
    date: string;
    /** null when the expense has no note. */
    note: string | null;
    /** The category, with its name and color as they were when the expense was saved. */
    category: { id: string; name: string; color: string };
    money: SyncMoney;
    /** Whether the expense is in the trash. */
    trashed: boolean;
  };
  category: { name: string; color: string; archived: boolean };
  group: { name: string };
  member: { name: string; removed: boolean };
  invite: { link: { secret: string; expiresAtMs: number } };
  /**
   * A roster entry (ADR-0039): its ID is a device ID, and it says which member that device
   * represents, with the phone's user ID and its X25519 public key in lowercase hexadecimal.
   */
  device: { member: { memberId: string; userId: string; boxKey: string } };
}

export type SyncRecordType = keyof SyncUnits;

/** An event that changes units of one record. A record's first event holds them all. */
export type SyncChange = {
  [T in SyncRecordType]: {
    version: 1;
    stamp: SyncStamp;
    type: T;
    id: string;
    units: {
      [U in keyof SyncUnits[T]]?: {
        value: SyncUnits[T][U];
        /** The stamp this unit had on the phone that made the change. Left out when it had none. */
        base?: SyncStamp;
      };
    };
  };
}[SyncRecordType];

/** An event that permanently deletes one record. */
export interface SyncDeletion {
  version: 1;
  stamp: SyncStamp;
  type: 'expense' | 'category' | 'invite';
  id: string;
  deleted: true;
}

export type SyncEvent = SyncChange | SyncDeletion;

/** The encrypted event limit, less the version byte, nonce and authentication tag (ADR-0021). */
export const MAX_SYNC_PLAINTEXT_BYTES = 65_536 - 41;

/** One record as merged so far. */
export type SyncRecord = {
  [T in SyncRecordType]: {
    type: T;
    id: string;
    /** The tombstone's stamp, once the record was permanently deleted (SYNC-13.1). */
    deleted?: SyncStamp;
    units: {
      [U in keyof SyncUnits[T]]?: { value: SyncUnits[T][U]; stamp: SyncStamp };
    };
  };
}[SyncRecordType];

/** Why an event is not applied (SYNC-10.2). */
export type SyncRefusal = 'structure' | 'device' | 'clock' | 'currency' | 'sum';

export type SyncVerdict =
  | { status: 'valid'; event: SyncEvent }
  | { status: 'refused'; reason: SyncRefusal }
  // The event's format version is newer than these rules know (SYNC-3.1).
  | { status: 'unsupported' };

export interface SyncMerge {
  record: SyncRecord;
  /** The latest stamp the phone has seen, this event's included (SYNC-15.1). */
  seen: SyncStamp;
}

/** A money change this phone made itself: the expense, the stamp of its event, and the money it set. */
export interface SyncMoneyChange {
  /** The ID of the expense whose money was changed. */
  id: string;
  stamp: SyncStamp;
  money: SyncMoney;
}

/** Negative when `a` is earlier than `b`, positive when it is later, 0 when they are the same stamp. */
export function compareSyncStamps(a: SyncStamp, b: SyncStamp): number {
  return (
    compare(a.ms, b.ms) ||
    compare(a.counter, b.counter) ||
    compare(a.device, b.device)
  );
}

/** The stamp for a change this phone makes at `nowMs`, its corrected time. */
export function nextSyncStamp(input: {
  /** The latest stamp the phone has seen, if any. */
  seen?: SyncStamp;
  nowMs: number;
  device: string;
}): SyncStamp {
  const { seen, nowMs, device } = input;
  if (!isClockInteger(nowMs) || !isDevice(device)) {
    throw new Error('Invalid corrected time or device ID');
  }
  if (!seen || nowMs > seen.ms) return { ms: nowMs, counter: 0, device };
  if (seen.counter < Number.MAX_SAFE_INTEGER) {
    return { ms: seen.ms, counter: seen.counter + 1, device };
  }
  if (seen.ms === Number.MAX_SAFE_INTEGER) {
    throw new Error('No later sync stamp is representable');
  }
  return { ms: seen.ms + 1, counter: 0, device };
}

/**
 * Judges one event by itself. `content` is what the event holds once decrypted and parsed;
 * `envelope` is what the API relays with it: when it was received, and the ID of the device
 * that uploaded it. It is null for a change this phone has not sent yet.
 */
export function checkSyncEvent(
  content: unknown,
  envelope: { receivedAtMs: number; device: string } | null,
): SyncVerdict {
  if (envelope !== null && !isClockInteger(envelope.receivedAtMs)) {
    throw new Error('Invalid event receive time');
  }
  if (
    isObject(content) &&
    typeof content.version === 'number' &&
    Number.isInteger(content.version) &&
    content.version > 1
  ) {
    return { status: 'unsupported' };
  }
  if (!isSyncEvent(content)) return { status: 'refused', reason: 'structure' };
  // Only the stamp of the event itself: a unit's base may name any device (SYNC-65.1).
  if (envelope !== null && content.stamp.device !== envelope.device) {
    return { status: 'refused', reason: 'device' };
  }
  if (envelope !== null && content.stamp.ms - envelope.receivedAtMs > 600_000) {
    return { status: 'refused', reason: 'clock' };
  }
  if (content.type === 'expense' && 'units' in content && content.units.money) {
    const reason = moneyRefusal(content.units.money.value);
    if (reason) return { status: 'refused', reason };
  }
  return { status: 'valid', event: content };
}

/** Merges an event into the record it names; `record` is undefined when the phone has nothing of it yet. */
export function mergeSyncEvent(input: {
  record?: SyncRecord;
  /** The latest stamp the phone has seen, if any. */
  seen?: SyncStamp;
  event: SyncEvent;
}): SyncMerge {
  const { record, event } = input;
  if (record && (record.type !== event.type || record.id !== event.id)) {
    throw new Error('The event and record must identify the same record');
  }
  const seen =
    input.seen && compareSyncStamps(input.seen, event.stamp) > 0
      ? input.seen
      : event.stamp;

  if ('deleted' in event) {
    const deleted =
      record?.deleted && compareSyncStamps(record.deleted, event.stamp) > 0
        ? record.deleted
        : event.stamp;
    return {
      record: { type: event.type, id: event.id, deleted, units: {} },
      seen,
    };
  }
  if (record?.deleted) return { record, seen };

  const units: Record<string, { value: unknown; stamp: SyncStamp }> = {
    ...record?.units,
  };
  for (const [name, change] of Object.entries(event.units)) {
    units[name] = winningSyncUnit(name, units[name], {
      value: change.value,
      stamp: event.stamp,
    });
  }
  // The matching record type and validated event keep each unit's value type.
  return {
    record: { type: event.type, id: event.id, units } as SyncRecord,
    seen,
  };
}

type StampedUnit = { value: unknown; stamp: SyncStamp };

/** Selects the same value for a unit whether its change arrives in an event or a snapshot. */
export function winningSyncUnit(
  name: string,
  current: StampedUnit | undefined,
  incoming: StampedUnit,
): StampedUnit {
  if (!current) return incoming;
  const order = compareSyncStamps(incoming.stamp, current.stamp);
  return order > 0 ||
    (order === 0 && compareUnitValues(name, incoming.value, current.value) > 0)
    ? incoming
    : current;
}

/**
 * Whether `event` overrode `mine`, this phone's own money change, without its author
 * having seen it (SYNC-14.1). It looks at these two only, never at the record.
 */
export function overridesSyncMoney(
  event: SyncEvent,
  mine: SyncMoneyChange,
): boolean {
  if (event.type !== 'expense' || event.id !== mine.id) {
    throw new Error('The event must identify the expense of the money change');
  }
  if ('deleted' in event || !event.units.money) return false;
  const { base, value } = event.units.money;
  return (
    compareSyncStamps(event.stamp, mine.stamp) > 0 &&
    (!base || compareSyncStamps(base, mine.stamp) < 0) &&
    compareMoney(value, mine.money) !== 0
  );
}

/** Every unit's value, or undefined while the record lacks a unit or once it is deleted. */
export function syncRecordValues<R extends SyncRecord>(
  record: R,
): SyncUnits[R['type']] | undefined {
  if (record.deleted) return undefined;
  const units: Record<string, { value: unknown } | undefined> = record.units;
  const values: Record<string, unknown> = {};
  for (const name of Object.keys(unitValidators[record.type])) {
    const unit = units[name];
    if (!unit) return undefined;
    values[name] = unit.value;
  }
  return values as SyncUnits[R['type']];
}

/** Whether two values of the unit named `unit` are the same, compared as a merge compares them (SYNC-19.1). */
export function sameSyncUnitValue(
  unit: string,
  a: unknown,
  b: unknown,
): boolean {
  return compareUnitValues(unit, a, b) === 0;
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function hasFields(
  value: unknown,
  fields: readonly string[],
): value is Record<string, unknown> {
  return (
    isObject(value) &&
    Object.keys(value).length === fields.length &&
    fields.every((field) => Object.hasOwn(value, field))
  );
}

export function isClockInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isDevice(value: unknown): value is string {
  return isNonemptyString(value) && !/[^\x21-\x7e]/.test(value);
}

export function isNonemptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function isStamp(value: unknown): value is SyncStamp {
  return (
    hasFields(value, ['ms', 'counter', 'device']) &&
    isClockInteger(value.ms) &&
    isClockInteger(value.counter) &&
    isDevice(value.device)
  );
}

function isColor(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    value.length === 7 &&
    /^#[0-9a-f]{6}$/i.test(value)
  );
}

function isAmount(value: unknown): value is number {
  return isClockInteger(value) && value <= 999_999_999_999;
}

function isAllocations(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  const participants = new Set<string>();
  for (const share of value) {
    if (
      !hasFields(share, ['participant', 'amountMinor']) ||
      !isNonemptyString(share.participant) ||
      !isAmount(share.amountMinor) ||
      participants.has(share.participant)
    ) {
      return false;
    }
    participants.add(share.participant);
  }
  return true;
}

function isMoney(value: unknown): boolean {
  return (
    hasFields(value, ['amountMinor', 'currency', 'payments', 'shares']) &&
    isAmount(value.amountMinor) &&
    value.amountMinor > 0 &&
    typeof value.currency === 'string' &&
    isAllocations(value.payments) &&
    isAllocations(value.shares)
  );
}

const unitValidators: {
  [T in SyncRecordType]: {
    [U in keyof SyncUnits[T]]: (value: unknown) => boolean;
  };
} = {
  expense: {
    title: isNonemptyString,
    date: (value) => typeof value === 'string' && isLocalDate(value),
    note: (value) => value === null || isNonemptyString(value),
    category: (value) =>
      hasFields(value, ['id', 'name', 'color']) &&
      isNonemptyString(value.id) &&
      isNonemptyString(value.name) &&
      isColor(value.color),
    money: isMoney,
    trashed: (value) => typeof value === 'boolean',
  },
  category: {
    name: isNonemptyString,
    color: isColor,
    archived: (value) => typeof value === 'boolean',
  },
  group: { name: isNonemptyString },
  member: {
    name: isNonemptyString,
    removed: (value) => typeof value === 'boolean',
  },
  invite: {
    link: (value) =>
      hasFields(value, ['secret', 'expiresAtMs']) &&
      typeof value.secret === 'string' &&
      /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(value.secret) &&
      isClockInteger(value.expiresAtMs),
  },
  device: {
    member: (value) =>
      hasFields(value, ['memberId', 'userId', 'boxKey']) &&
      isNonemptyString(value.memberId) &&
      isNonemptyString(value.userId) &&
      typeof value.boxKey === 'string' &&
      /^[0-9a-f]{64}$/.test(value.boxKey),
  },
};

export function isRecordType(type: unknown): type is SyncRecordType {
  return typeof type === 'string' && Object.hasOwn(unitValidators, type);
}

export function isSyncRecordId(
  type: SyncRecordType,
  id: unknown,
): id is string {
  if (type === 'invite') return isInviteCode(id);
  return type === 'device' ? isDevice(id) : isNonemptyString(id);
}

export function isSyncUnitValue(
  type: SyncRecordType,
  name: string,
  value: unknown,
): boolean {
  const validators: Record<string, (value: unknown) => boolean> =
    unitValidators[type];
  return Object.hasOwn(validators, name) && validators[name](value);
}

export function moneyRefusal({
  amountMinor,
  currency,
  payments,
  shares,
}: SyncMoney): 'currency' | 'sum' | undefined {
  if (currencyDecimals(currency) === undefined) return 'currency';
  if (!addsUp(payments, amountMinor) || !addsUp(shares, amountMinor))
    return 'sum';
}

function isSyncEvent(content: unknown): content is SyncEvent {
  if (
    !isObject(content) ||
    content.version !== 1 ||
    !isStamp(content.stamp) ||
    !isRecordType(content.type) ||
    !isSyncRecordId(content.type, content.id)
  ) {
    return false;
  }
  if (Object.hasOwn(content, 'deleted')) {
    return (
      hasFields(content, ['version', 'stamp', 'type', 'id', 'deleted']) &&
      content.deleted === true &&
      (content.type === 'expense' ||
        content.type === 'category' ||
        content.type === 'invite')
    );
  }
  if (
    !hasFields(content, ['version', 'stamp', 'type', 'id', 'units']) ||
    !isObject(content.units) ||
    Object.keys(content.units).length === 0
  ) {
    return false;
  }
  const type = content.type;
  return Object.entries(content.units).every(([name, change]) => {
    if (!isObject(change)) return false;
    const hasBase = Object.hasOwn(change, 'base');
    return (
      hasFields(change, hasBase ? ['value', 'base'] : ['value']) &&
      (!hasBase || isStamp(change.base)) &&
      isSyncUnitValue(type, name, change.value)
    );
  });
}

function addsUp(allocations: Share<string>[], amountMinor: number): boolean {
  // All amounts are nonnegative; stop before a long list could overflow a sum.
  let remaining = amountMinor;
  for (const allocation of allocations) {
    remaining -= allocation.amountMinor;
    if (remaining < 0) return false;
  }
  return remaining === 0;
}

/** JavaScript compares strings by UTF-16 code units, independently of locale. */
function compare(
  a: string | number | boolean,
  b: string | number | boolean,
): number {
  return a === b ? 0 : a < b ? -1 : 1;
}

function compareAllocations(a: Share<string>[], b: Share<string>[]): number {
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const order =
      compare(a[index].amountMinor, b[index].amountMinor) ||
      compare(a[index].participant, b[index].participant);
    if (order !== 0) return order;
  }
  return compare(a.length, b.length);
}

function compareMoney(a: SyncMoney, b: SyncMoney): number {
  return (
    compare(a.amountMinor, b.amountMinor) ||
    compare(a.currency, b.currency) ||
    compareAllocations(a.payments, b.payments) ||
    compareAllocations(a.shares, b.shares)
  );
}

function compareUnitValues(name: string, a: unknown, b: unknown): number {
  if (name === 'link') {
    const first = a as SyncUnits['invite']['link'];
    const second = b as SyncUnits['invite']['link'];
    return (
      compare(first.expiresAtMs, second.expiresAtMs) ||
      compare(first.secret, second.secret)
    );
  }
  if (name === 'member') {
    const first = a as SyncUnits['device']['member'];
    const second = b as SyncUnits['device']['member'];
    return (
      compare(first.memberId, second.memberId) ||
      compare(first.userId, second.userId) ||
      compare(first.boxKey, second.boxKey)
    );
  }
  if (name === 'money') return compareMoney(a as SyncMoney, b as SyncMoney);
  if (name === 'category') {
    const first = a as SyncUnits['expense']['category'];
    const second = b as SyncUnits['expense']['category'];
    return (
      compare(first.color, second.color) ||
      compare(first.id, second.id) ||
      compare(first.name, second.name)
    );
  }
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  return compare(a as string | boolean, b as string | boolean);
}
