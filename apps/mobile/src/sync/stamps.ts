import {
  compareSyncStamps,
  nextSyncStamp,
  type SyncEvent,
  type SyncRecord,
  type SyncStamp,
} from '@shared-expense/domain';
import { readCorrectedTime } from '../sharing/device-identity';
import type { SqlExecutor, SqlValue } from '../storage';
import { orderSyncedRows } from './positions';
import { readSyncRecord, saveLatestStamp, storeSyncRecord } from './records';

// The checks of an unsent event's stamp (ADR-0016, ADR-0027). A stamp more than 5 minutes
// ahead of the corrected time is replaced before any other phone sees it, wherever the
// local data holds it: in the event, in the record it changed, and as the base of later
// unsent events. Everything here runs inside the caller's transaction, and resolves with
// the shared ledgers whose members or categories a replaced stamp put in another order.

/** How far ahead of the corrected time a checked stamp may be, in milliseconds (SYNC-84.1). */
const MOST_AHEAD_MS = 300_000;

interface Unsent {
  position: number;
  id: string;
  groupId: string;
  content: string;
  event: SyncEvent;
}

type Change = { base?: SyncStamp };

const keyOf = ({ ms, counter, device }: SyncStamp) =>
  `${ms}/${counter}/${device}`;

const placeholders = (values: readonly unknown[]) =>
  values.map(() => '?').join(', ');

/** The phone's unsent events that `where` selects, in the order it wrote them. */
async function readUnsent(
  tx: SqlExecutor,
  where = '',
  parameters: readonly SqlValue[] = [],
): Promise<Unsent[]> {
  const rows = await tx.all<Omit<Unsent, 'event'>>(
    `SELECT position, id, groupId, content FROM sync_outbox ${where} ORDER BY position`,
    parameters,
  );
  return rows.map((row) => ({
    ...row,
    event: JSON.parse(row.content) as SyncEvent,
  }));
}

/**
 * The latest of the stamps left (SYNC-85.1): those the records of every shared ledger
 * hold, and the stamps and bases of the unsent events, without the ones being replaced.
 */
async function latestStampLeft(
  tx: SqlExecutor,
  unsent: readonly Unsent[],
  replaced: ReadonlySet<string>,
) {
  let latest: SyncStamp | undefined;
  const hold = (stamp: SyncStamp | undefined) => {
    if (
      stamp &&
      !replaced.has(keyOf(stamp)) &&
      (!latest || compareSyncStamps(stamp, latest) > 0)
    )
      latest = stamp;
  };
  // ponytail: reads every record of every shared ledger. Only a stamp more than 5 minutes
  // ahead gets here; keep the latest stamp held in a column if that is ever common.
  const records = await tx.all<{ created: string; record: string }>(
    'SELECT created, record FROM sync_records',
  );
  for (const row of records) {
    const record = JSON.parse(row.record) as SyncRecord;
    hold(JSON.parse(row.created) as SyncStamp);
    hold(record.deleted);
    Object.values<{ stamp: SyncStamp }>(record.units).forEach((unit) =>
      hold(unit.stamp),
    );
  }
  for (const { event } of unsent) {
    hold(event.stamp);
    if ('units' in event)
      Object.values<Change>(event.units).forEach((change) => hold(change.base));
  }
  return latest;
}

/**
 * Gives the unsent events at the positions in `renames` the stamp given there, and writes
 * that stamp wherever the local data holds the old one. All at once: a new stamp can be
 * the stamp another of these events had.
 */
async function rename(
  tx: SqlExecutor,
  unsent: readonly Unsent[],
  renames: ReadonlyMap<number, SyncStamp>,
): Promise<Set<string>> {
  const to = new Map<string, SyncStamp>();
  const records = new Map<string, Unsent>();
  for (const row of unsent) {
    const stamp = renames.get(row.position);
    if (!stamp) continue;
    to.set(keyOf(row.event.stamp), stamp);
    records.set(`${row.groupId}/${row.event.type}/${row.event.id}`, row);
  }
  const renamed = (stamp: SyncStamp) => to.get(keyOf(stamp)) ?? stamp;

  const toOrder = new Map<string, [string, 'member' | 'category']>();
  for (const { groupId, event } of records.values()) {
    const stored = await readSyncRecord(tx, groupId, event.type, event.id);
    // An event's record is stored with it.
    if (!stored) continue;
    const { record } = stored;
    const units = Object.fromEntries(
      Object.entries<{ stamp: SyncStamp }>(record.units).map(([name, unit]) => [
        name,
        { ...unit, stamp: renamed(unit.stamp) },
      ]),
    );
    await storeSyncRecord(
      tx,
      groupId,
      {
        ...record,
        ...(record.deleted && { deleted: renamed(record.deleted) }),
        units,
      } as SyncRecord,
      renamed(stored.created),
    );
    if (event.type === 'member' || event.type === 'category')
      toOrder.set(`${groupId}/${event.type}`, [groupId, event.type]);
  }

  for (const row of unsent) {
    const { event } = row;
    const content = JSON.stringify({
      ...event,
      stamp: renames.get(row.position) ?? event.stamp,
      ...('units' in event && {
        units: Object.fromEntries(
          Object.entries<Change>(event.units).map(([name, change]) => [
            name,
            change.base ? { ...change, base: renamed(change.base) } : change,
          ]),
        ),
      }),
    });
    if (content !== row.content)
      await tx.run('UPDATE sync_outbox SET content = ? WHERE position = ?', [
        content,
        row.position,
      ]);
  }

  // A category's place follows the stamp it was created with, and a member's the stamp
  // of its last removal or return.
  const moved = new Set<string>();
  for (const [groupId, type] of toOrder.values())
    if (await orderSyncedRows(tx, groupId, type)) moved.add(groupId);
  return moved;
}

/**
 * Replaces the stamp of each of `rows` that is more than 5 minutes ahead of the corrected
 * time (SYNC-85.1): the phone's latest stamp comes down to the latest one left, and each
 * replaced event takes the next stamp after it, in the order the events were written.
 */
async function replaceStampsAhead(
  tx: SqlExecutor,
  rows: readonly Unsent[],
): Promise<Set<string>> {
  const nowMs = await readCorrectedTime(tx);
  const ahead = new Set(
    rows
      .filter(({ event }) => event.stamp.ms - nowMs > MOST_AHEAD_MS)
      .map(({ position }) => position),
  );
  if (ahead.size === 0) return new Set();

  const unsent = await readUnsent(tx);
  const replaced = unsent.filter(({ position }) => ahead.has(position));
  let seen = await latestStampLeft(
    tx,
    unsent,
    new Set(replaced.map(({ event }) => keyOf(event.stamp))),
  );
  const renames = new Map<number, SyncStamp>();
  for (const { position, event } of replaced) {
    seen = nextSyncStamp({ seen, nowMs, device: event.stamp.device });
    renames.set(position, seen);
  }
  await saveLatestStamp(tx, seen!); // At least one stamp was replaced.
  return rename(tx, unsent, renames);
}

/**
 * Checks the stamp of every unsent event of this phone that has not been checked, those
 * of its other shared ledgers too, and marks them checked (SYNC-84.1).
 */
export async function checkUnsentStamps(tx: SqlExecutor): Promise<Set<string>> {
  const unchecked = await readUnsent(tx, 'WHERE checked = 0');
  if (unchecked.length === 0) return new Set();
  const moved = await replaceStampsAhead(tx, unchecked);
  await tx.run('UPDATE sync_outbox SET checked = 1 WHERE checked = 0');
  return moved;
}

/**
 * Checks again the stamps of the unsent events with these IDs, checked or not: the events
 * of an upload the API refused for its clock (SYNC-87.1).
 */
export async function recheckStamps(
  tx: SqlExecutor,
  ids: readonly string[],
): Promise<Set<string>> {
  return replaceStampsAhead(
    tx,
    await readUnsent(tx, `WHERE id IN (${placeholders(ids)})`, ids),
  );
}

/**
 * Gives each unsent event of the shared ledger that `uploaded` names, by its event ID, the
 * stamp the API holds for it, and marks it checked (SYNC-96.1).
 */
export async function takeUploadedStamps(
  tx: SqlExecutor,
  groupId: string,
  uploaded: ReadonlyMap<string, SyncStamp>,
): Promise<Set<string>> {
  if (uploaded.size === 0) return new Set();
  const these = `WHERE groupId = ? AND id IN (${placeholders([...uploaded.keys()])})`;
  const parameters = [groupId, ...uploaded.keys()];
  const rows = await readUnsent(tx, these, parameters);
  if (rows.length === 0) return new Set();
  // Checked whether or not the stamp differs: no later check may give it another.
  await tx.run(`UPDATE sync_outbox SET checked = 1 ${these}`, parameters);
  const renames = new Map(
    rows.map((row) => [row.position, uploaded.get(row.id)!]),
  );
  // Most often the phone uploaded the event as it still holds it.
  return rows.some(
    (row) => keyOf(row.event.stamp) !== keyOf(renames.get(row.position)!),
  )
    ? rename(tx, await readUnsent(tx), renames)
    : new Set();
}
