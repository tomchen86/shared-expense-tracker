// Stubs for the merge rules in docs/specs/sync/spec.md. The implementer replaces the
// bodies; the types and signatures are the boundary the acceptance tests use.
import type { Share } from '../ledger/money';

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

/** Each kind of record's units, and the value each unit holds (SYNC-5.1, SYNC-6.1). */
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
  type: 'expense' | 'category';
  id: string;
  deleted: true;
}

export type SyncEvent = SyncChange | SyncDeletion;

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

/** Why an event is not applied (SYNC-10.1). */
export type SyncRefusal = 'structure' | 'clock' | 'currency' | 'sum';

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
  throw new Error(
    `Not implemented: compareSyncStamps(${a.device}, ${b.device})`,
  );
}

/** The stamp for a change this phone makes at `nowMs`, its corrected time. */
export function nextSyncStamp(input: {
  /** The latest stamp the phone has seen, if any. */
  seen?: SyncStamp;
  nowMs: number;
  device: string;
}): SyncStamp {
  throw new Error(`Not implemented: nextSyncStamp(${input.device})`);
}

/**
 * Judges one event by itself. `content` is what the event holds once decrypted and parsed;
 * `envelope` is null for a change this phone has not sent yet.
 */
export function checkSyncEvent(
  content: unknown,
  envelope: { receivedAtMs: number } | null,
): SyncVerdict {
  throw new Error(
    `Not implemented: checkSyncEvent(${typeof content}, ${envelope?.receivedAtMs})`,
  );
}

/** Merges an event into the record it names; `record` is undefined when the phone has nothing of it yet. */
export function mergeSyncEvent(input: {
  record?: SyncRecord;
  /** The latest stamp the phone has seen, if any. */
  seen?: SyncStamp;
  event: SyncEvent;
}): SyncMerge {
  throw new Error(`Not implemented: mergeSyncEvent(${input.event.id})`);
}

/**
 * Whether `event` overrode `mine`, this phone's own money change, without its author
 * having seen it (SYNC-14.1). It looks at these two only, never at the record.
 */
export function overridesSyncMoney(
  event: SyncEvent,
  mine: SyncMoneyChange,
): boolean {
  throw new Error(
    `Not implemented: overridesSyncMoney(${event.id}, ${mine.stamp.device})`,
  );
}

/** Every unit's value, or undefined while the record lacks a unit or once it is deleted. */
export function syncRecordValues(
  record: SyncRecord,
): SyncUnits[SyncRecordType] | undefined {
  throw new Error(`Not implemented: syncRecordValues(${record.id})`);
}
