import {
  checkSyncEvent,
  MAX_SYNC_PLAINTEXT_BYTES,
  mergeSyncEvent,
  nextSyncStamp,
  sameSyncUnitValue,
  type SyncRecord,
  type SyncRecordType,
  type SyncStamp,
  type SyncUnits,
} from '@shared-expense/domain';
import type { Expense } from '../ledger/expenses';
import { readCorrectedTime } from '../sharing/device-identity';
import { createUuid, type SqlExecutor } from '../storage';
import { keepOwnMoney } from './own-money';

export interface SharedGroup {
  groupId: string;
  device: string;
}

export class SyncEventTooLargeError extends Error {}

export async function sharedGroup(
  tx: SqlExecutor,
  groupId: string,
): Promise<SharedGroup | undefined> {
  const [group] = await tx.all<SharedGroup>(
    'SELECT groupId, device FROM sync_groups WHERE groupId = ?',
    [groupId],
  );
  return group;
}

export async function latestStamp(
  tx: SqlExecutor,
): Promise<SyncStamp | undefined> {
  const [seen] = await tx.all<SyncStamp>(
    'SELECT ms, counter, device FROM sync_clock',
  );
  return seen;
}

export async function saveLatestStamp(tx: SqlExecutor, stamp: SyncStamp) {
  await tx.run(
    'INSERT OR REPLACE INTO sync_clock (singleton, ms, counter, device) VALUES (1, ?, ?, ?)',
    [stamp.ms, stamp.counter, stamp.device],
  );
}

interface RecordRow {
  created: string;
  record: string;
  seeded: number;
}

function unpackRecord(row: RecordRow) {
  return {
    created: JSON.parse(row.created) as SyncStamp,
    record: JSON.parse(row.record) as SyncRecord,
    seeded: row.seeded === 1,
  };
}

export async function snapshotRecords(tx: SqlExecutor, groupId: string) {
  const rows = await tx.all<RecordRow>(
    `SELECT created, record, seeded FROM sync_records r
     WHERE r.groupId = ? AND (r.type <> 'invite' OR EXISTS (
       SELECT 1 FROM group_invites i
       WHERE i.id = r.id AND i.groupId = r.groupId AND i.expiresAtMs > ?
     ))`,
    [groupId, await readCorrectedTime(tx)],
  );
  return rows.map((row) => {
    const { record, created, seeded } = unpackRecord(row);
    return { ...record, created, seeded };
  });
}

export async function readSyncRecord(
  tx: SqlExecutor,
  groupId: string,
  type: SyncRecordType,
  id: string,
) {
  const [row] = await tx.all<RecordRow>(
    'SELECT created, record, seeded FROM sync_records WHERE groupId = ? AND type = ? AND id = ?',
    [groupId, type, id],
  );
  if (row) return unpackRecord(row);
}

export async function storeSyncRecord(
  tx: SqlExecutor,
  groupId: string,
  record: SyncRecord,
  created: SyncStamp,
  seeded = false,
) {
  return tx.run(
    `INSERT INTO sync_records (groupId, type, id, created, record, seeded) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (groupId, type, id) DO UPDATE SET created = excluded.created, record = excluded.record,
       seeded = MAX(seeded, excluded.seeded)
     WHERE created <> excluded.created OR record <> excluded.record OR seeded < excluded.seeded`,
    [
      groupId,
      record.type,
      record.id,
      JSON.stringify(created),
      JSON.stringify(record),
      Number(seeded),
    ],
  );
}

export function expenseSyncValues(expense: Expense): SyncUnits['expense'] {
  const { title, date, category, amountMinor, currency, payments, shares } =
    expense;
  return {
    title,
    date,
    note: expense.note ?? null,
    category,
    money: { amountMinor, currency, payments, shares },
    trashed: expense.trashOrder !== undefined,
  };
}

/**
 * The units among `values` whose value differs from the one in `stored`, each with the
 * stamp it has there as its base, and with no base where `stored` has none. `stored` is
 * what the record holds, or what it held when the form that made the change opened
 * (SYNC-23.2).
 */
export function changedUnits(values: object, stored: SyncRecord['units']) {
  const current: Record<
    string,
    { value: unknown; stamp: SyncStamp } | undefined
  > = stored;
  const changes: Record<string, { value: unknown; base?: SyncStamp }> = {};
  for (const [name, value] of Object.entries(values)) {
    const unit = current[name];
    if (!unit) changes[name] = { value };
    else if (!sameSyncUnitValue(name, value, unit.value))
      changes[name] = { value, base: unit.stamp };
  }
  return changes;
}

type StoredRecord = Awaited<ReturnType<typeof readSyncRecord>>;

type UnsentListener = (
  groupId: string,
  position: number,
  type: SyncRecordType,
) => void;
const unsentListeners = new Set<UnsentListener>();

/**
 * Calls `listener` each time this phone writes an unsent event, with the shared ledger's
 * ID and the event's place among the unsent ones. The call comes inside the transaction
 * that writes the event, which may still fail. Returns the function that ends it.
 */
export function subscribeToUnsentEvents(listener: UnsentListener) {
  unsentListeners.add(listener);
  return () => {
    unsentListeners.delete(listener);
  };
}

/** Uploads still waiting for a page that carries them (SYNC-161.1). */
export const CONFIRMED_EVENT_IDS =
  'SELECT eventId FROM sync_uploaded_events WHERE resendPosition IS NULL';

/** The unsent queue, with the original write position as the tiebreaker on a resend. */
export const UNSENT_EVENTS = `(SELECT o.*, COALESCE(u.resendPosition, o.position) AS sendPosition
  FROM sync_outbox o LEFT JOIN sync_uploaded_events u ON u.eventId = o.id
  WHERE u.eventId IS NULL OR u.resendPosition IS NOT NULL)`;

/** Put retained uploads ahead of the ledger's unsent events in their original write order (SYNC-161.1). */
export async function requeueConfirmedEvents(tx: SqlExecutor, groupId: string) {
  await tx.run(
    `UPDATE sync_outbox SET checked = 1 WHERE groupId = ? AND checked = 0 AND id IN (${CONFIRMED_EVENT_IDS})`,
    [groupId],
  );
  // A backup imported during an upload can leave an older unsent row. Cap the resend
  // positions just before the current queue. The original positions break any ties.
  await tx.run(
    `WITH head AS MATERIALIZED (
       SELECT MIN(sendPosition) - 1 AS beforeFirst FROM ${UNSENT_EVENTS} WHERE groupId = ?
     )
     UPDATE sync_uploaded_events SET resendPosition = MIN(o.position, COALESCE(head.beforeFirst, o.position))
     FROM sync_outbox o, head
     WHERE eventId = o.id AND o.groupId = ? AND resendPosition IS NULL`,
    [groupId, groupId],
  );
}

/** Stamps, checks, measures and stores one event of this phone, with the record it changes. */
async function writeEvent(
  tx: SqlExecutor,
  group: SharedGroup,
  previous: StoredRecord,
  change: { type: SyncRecordType; id: string } & (
    { units: object } | { deleted: true }
  ),
) {
  const stamp = nextSyncStamp({
    seen: await latestStamp(tx),
    nowMs: await readCorrectedTime(tx),
    device: group.device,
  });
  const verdict = checkSyncEvent({ version: 1, stamp, ...change }, null);
  if (verdict.status !== 'valid') throw new Error('Invalid local sync event');
  const { event } = verdict;
  const content = JSON.stringify(event);
  if (new TextEncoder().encode(content).byteLength > MAX_SYNC_PLAINTEXT_BYTES)
    throw new SyncEventTooLargeError();

  const { record } = mergeSyncEvent({ record: previous?.record, event });
  await storeSyncRecord(tx, group.groupId, record, previous?.created ?? stamp);
  // The last event of this phone that held the expense's money (SYNC-129.1).
  if (event.type === 'expense' && 'units' in event && event.units.money)
    await keepOwnMoney(tx, event.id, stamp, event.units.money.value);
  const { lastInsertRowId } = await tx.run(
    'INSERT INTO sync_outbox (id, groupId, content) VALUES (?, ?, ?)',
    [await createUuid(tx), group.groupId, content],
  );
  await saveLatestStamp(tx, stamp);
  for (const listener of unsentListeners) {
    try {
      listener(group.groupId, lastInsertRowId, change.type);
    } catch {
      // The event is written whether or not a sync can start.
    }
  }
}

/**
 * Writes the event for a change to a shared ledger's record, holding the units among
 * `values` that changed, or nothing when none did. Called inside the transaction that
 * writes the capability's own rows (SYNC-21.1). A change made in a form gives `opened`,
 * the units the record held when the form opened: the event then holds what differs from
 * those, based on their stamps, whatever the record holds now (SYNC-23.2).
 */
export async function writeLocalChange<T extends SyncRecordType>(
  tx: SqlExecutor,
  group: SharedGroup,
  type: T,
  id: string,
  values: Partial<SyncUnits[T]>,
  opened?: SyncRecord['units'],
) {
  const previous = await readSyncRecord(tx, group.groupId, type, id);
  const units = changedUnits(values, opened ?? previous?.record.units ?? {});
  if (Object.keys(units).length === 0) return;
  await writeEvent(tx, group, previous, { type, id, units });
}

/**
 * Writes the event that deletes a shared ledger's category or invite for good, and keeps its
 * tombstone. The app writes none for an expense (ADR-0021).
 */
export async function writeLocalDeletion(
  tx: SqlExecutor,
  group: SharedGroup,
  type: 'category' | 'invite',
  id: string,
) {
  const previous = await readSyncRecord(tx, group.groupId, type, id);
  await writeEvent(tx, group, previous, {
    type,
    id,
    deleted: true,
  });
}
