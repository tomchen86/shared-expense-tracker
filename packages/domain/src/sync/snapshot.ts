import {
  compareSyncStamps,
  hasFields,
  isClockInteger,
  isNonemptyString,
  isObject,
  isRecordType,
  isStamp,
  isSyncRecordId,
  isSyncUnitValue,
  moneyRefusal,
  syncRecordValues,
  winningSyncUnit,
  type SyncMoney,
  type SyncRecord,
  type SyncStamp,
} from './sync';

/**
 * One record as a snapshot holds it (ADR-0028): the record as merged so far, the stamp it
 * was created with, and whether it was there when its group became a shared ledger, which
 * fixes that stamp.
 */
export type SyncSnapshotRecord = SyncRecord & {
  created: SyncStamp;
  seeded: boolean;
};

/** What a snapshot of format version 1 holds (SYNC-98.4). */
export interface SyncSnapshot {
  /** The snapshot's own format version. */
  version: 1;
  /** The highest event format version among the events it covers. */
  eventVersion: 1;
  groupId: string;
  /** The sequence number it covers: every event up to it is merged into the records. */
  sequence: number;
  /** The ID of the category that is the group's Uncategorized. */
  uncategorized: string;
  records: SyncSnapshotRecord[];
}

export type SyncSnapshotVerdict =
  | { status: 'valid'; snapshot: SyncSnapshot }
  | { status: 'refused' }
  // The snapshot, or an event it covers, is in a format version newer than these rules know.
  | { status: 'unsupported' };

function isSnapshotRecord(value: unknown): value is SyncSnapshotRecord {
  if (!isObject(value)) return false;
  const tombstone = Object.hasOwn(value, 'deleted');
  const fields = ['type', 'id', 'units', 'created', 'seeded'];
  if (tombstone) fields.push('deleted');
  const { type, id, created, seeded, units } = value;
  if (
    !hasFields(value, fields) ||
    !isRecordType(type) ||
    !isSyncRecordId(type, id) ||
    !isStamp(created) ||
    typeof seeded !== 'boolean' ||
    !isObject(units)
  )
    return false;
  const entries = Object.entries(units);
  if (tombstone)
    return (
      (type === 'expense' || type === 'category') &&
      entries.length === 0 &&
      isStamp(value.deleted)
    );
  return (
    entries.length > 0 &&
    entries.every(
      ([name, unit]) =>
        hasFields(unit, ['stamp', 'value']) &&
        isStamp(unit.stamp) &&
        isSyncUnitValue(type, name, unit.value) &&
        (name !== 'money' ||
          moneyRefusal(unit.value as SyncMoney) === undefined),
    )
  );
}

const newerVersion = (version: unknown) =>
  typeof version === 'number' && Number.isInteger(version) && version > 1;

function isSnapshot(content: unknown): content is SyncSnapshot {
  if (
    !hasFields(content, [
      'version',
      'eventVersion',
      'groupId',
      'sequence',
      'uncategorized',
      'records',
    ]) ||
    content.version !== 1 ||
    content.eventVersion !== 1 ||
    !isNonemptyString(content.groupId) ||
    !isClockInteger(content.sequence) ||
    !Array.isArray(content.records)
  )
    return false;

  const keys = new Set<string>();
  let groupFound = false;
  let uncategorizedFound = false;
  for (const record of content.records) {
    if (!isSnapshotRecord(record)) return false;
    const key = record.type + '/' + record.id;
    if (keys.has(key)) return false;
    keys.add(key);
    if (record.type === 'group') {
      if (record.id !== content.groupId) return false;
      groupFound = true;
    }
    if (record.type === 'category' && record.id === content.uncategorized) {
      const values = syncRecordValues(record);
      uncategorizedFound =
        values?.name === 'Uncategorized' &&
        values.color === '#757575' &&
        !values.archived;
    }
  }
  return groupFound && uncategorizedFound;
}

/** Judges what a snapshot holds once decrypted and parsed (SYNC-98.4). */
export function checkSyncSnapshot(content: unknown): SyncSnapshotVerdict {
  if (
    isObject(content) &&
    (newerVersion(content.version) || newerVersion(content.eventVersion))
  )
    return { status: 'unsupported' };
  return isSnapshot(content)
    ? { status: 'valid', snapshot: content }
    : { status: 'refused' };
}

/**
 * Merges one record of a snapshot into the same record as a phone holds it; `held` is
 * undefined when the phone has nothing of it yet (SYNC-99.1).
 */
export function mergeSyncSnapshotRecord(input: {
  held?: SyncSnapshotRecord;
  incoming: SyncSnapshotRecord;
  /** The latest stamp the phone has seen, if any. */
  seen?: SyncStamp;
}): { record: SyncSnapshotRecord; seen: SyncStamp } {
  const { incoming, held } = input;
  if (held && (held.id !== incoming.id || held.type !== incoming.type))
    throw new Error('Both records must have the same type and ID');

  let seen = incoming.created;
  function observe(stamp: SyncStamp) {
    if (compareSyncStamps(stamp, seen) > 0) seen = stamp;
  }
  if (input.seen) observe(input.seen);
  if (incoming.deleted) observe(incoming.deleted);
  for (const unit of Object.values(incoming.units)) observe(unit.stamp);
  if (!held) return { record: incoming, seen };

  const created =
    incoming.seeded ||
    (!held.seeded && compareSyncStamps(incoming.created, held.created) < 0)
      ? incoming.created
      : held.created;
  const base = {
    type: incoming.type,
    id: incoming.id,
    created,
    seeded: incoming.seeded || held.seeded,
  };
  if (held.deleted || incoming.deleted) {
    const deleted =
      held.deleted &&
      (!incoming.deleted ||
        compareSyncStamps(held.deleted, incoming.deleted) > 0)
        ? held.deleted
        : incoming.deleted;
    return { record: { ...base, units: {}, deleted }, seen };
  }

  const units: Record<string, { value: unknown; stamp: SyncStamp }> = {
    ...held.units,
  };
  for (const [name, unit] of Object.entries(incoming.units))
    units[name] = winningSyncUnit(name, units[name], unit);
  return { record: { ...base, units } as SyncSnapshotRecord, seen };
}
