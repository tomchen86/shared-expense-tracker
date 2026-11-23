import {
  checkSyncEvent,
  compareSyncStamps,
  syncRecordValues,
  type SyncEvent,
  type SyncRecord,
  type SyncRefusal,
} from '@shared-expense/domain';
import { applyMergedCategory } from '../categories/merged-category';
import { groupUncategorized } from '../categories/repository';
import { applyMergedGroup } from '../groups';
import { notifyExpensesChanged } from '../ledger/expenses';
import { applyMergedExpense } from '../ledger/merged-expense';
import type { Database, SqlExecutor } from '../storage';
import { applyMergedInvite } from './invites';
import { markIfOverridden } from './own-money';
import { orderSyncedRows } from './positions';
import {
  latestStamp,
  mergeRecordEvent,
  readSyncRecord,
  saveLatestStamp,
  sharedGroup,
  storeSyncRecord,
  updateReceived,
} from './records';
import { undoRefusedEvent } from './undo-refused';

/** An event as the API relays it, decrypted and parsed. */
export interface ReceivedSyncEvent {
  id: string;
  /** The ID of the device that uploaded it. */
  device: string;
  /** When the API received it, in milliseconds since the Unix epoch. */
  receivedAtMs: number;
  content: unknown;
}

/** A received event that was judged not to apply. */
export interface RefusedSyncEvent extends ReceivedSyncEvent {
  groupId: string;
  reason: SyncRefusal;
}

type AppliedListener = (groupId: string) => void;
const listeners = new WeakMap<Database, Set<AppliedListener>>();

/**
 * Calls `listener` with the shared ledger's ID each time events applied to one have
 * changed what the screens read. Returns the function that ends it.
 */
export function subscribeToAppliedEvents(
  database: Database,
  listener: AppliedListener,
) {
  let subscribers = listeners.get(database);
  if (!subscribers) {
    subscribers = new Set();
    listeners.set(database, subscribers);
  }
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}

const recordOwners = {
  expense: ['expenses', 'spaceId'],
  member: ['group_members', 'groupId'],
  category: ['categories', 'spaceId'],
  invite: ['group_invites', 'groupId'],
} as const;

export async function canMergeInGroup(
  tx: SqlExecutor,
  groupId: string,
  event: Pick<SyncEvent, 'type' | 'id'>,
) {
  if (event.type === 'group') return event.id === groupId;
  // A distinct record lives entirely under its ledger's key in sync_records.
  if (event.type === 'distinct') return true;
  const [table, owner] = recordOwners[event.type];
  // Partial records and tombstones can belong to another group even without a visible row.
  const foreign = await tx.all(
    `SELECT 1 FROM ${table} WHERE id = ? AND ${owner} <> ?
     UNION ALL SELECT 1 FROM sync_records WHERE type = ? AND id = ?
       AND groupId IN (SELECT groupId FROM sync_groups WHERE groupId <> ?)
     LIMIT 1`,
    [event.id, groupId, event.type, event.id, groupId],
  );
  return foreign.length === 0;
}

/**
 * Judges, merges and stores a shared ledger's received events in delivery order, inside
 * the transaction `tx`. Resolves with whether that changed what the screens read, and
 * adds to `leftTrash` the expenses an event took out of the trash.
 */
export async function applyReceivedEvents(
  tx: SqlExecutor,
  groupId: string,
  events: readonly ReceivedSyncEvent[],
  leftTrash: Set<string>,
): Promise<boolean> {
  const group = await sharedGroup(tx, groupId);
  if (!group) throw new Error('Not a shared ledger');
  // Sharing seeds at least the group's own stamp in the same transaction.
  const initial = (await latestStamp(tx))!;
  const uncategorized = await groupUncategorized(tx, groupId);
  let seen = initial;
  let visibleChange = false;
  const toOrder = new Set<'member' | 'category'>();
  async function project(
    record: SyncRecord,
    previous: SyncRecord | undefined,
    eventMs: number | null,
  ) {
    switch (record.type) {
      case 'distinct':
        return false; // Its sync record itself is what the duplicate check reads.
      case 'invite':
        return applyMergedInvite(tx, groupId, record);
      case 'member':
        toOrder.add('member');
        return applyMergedGroup(tx, groupId, record);
      case 'group':
        return applyMergedGroup(tx, groupId, record);
      case 'category':
        toOrder.add('category');
        return applyMergedCategory(tx, groupId, record, uncategorized, eventMs);
      case 'expense': {
        const changed = await applyMergedExpense(
          tx,
          groupId,
          record,
          previous,
          eventMs,
        );
        if (
          changed &&
          previous?.type === 'expense' &&
          previous.units.trashed?.value &&
          !syncRecordValues(record)?.trashed
        )
          leftTrash.add(record.id);
        return changed;
      }
    }
  }
  for (const received of events) {
    const verdict = checkSyncEvent(received.content, received);
    if (verdict.status === 'unsupported')
      throw new Error('Unknown sync event format version');
    if (verdict.status === 'refused') {
      await tx.run(
        `INSERT INTO sync_refusals (groupId, id, device, receivedAtMs, content, reason)
         VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (groupId, id) DO NOTHING`,
        [
          groupId,
          received.id,
          received.device,
          received.receivedAtMs,
          JSON.stringify(received.content),
          verdict.reason,
        ],
      );
      if (received.device === group.device) {
        const notice = await tx.run(
          `INSERT INTO sync_unapplied (refusal) SELECT position FROM sync_refusals
           WHERE groupId = ? AND id = ? ON CONFLICT (refusal) DO NOTHING`,
          [groupId, received.id],
        );
        if (notice.changes) visibleChange = true;
        const undone = await undoRefusedEvent(
          tx,
          groupId,
          received,
          !notice.changes,
        );
        if (undone) {
          await project(undone.record, undone.previous, null);
          visibleChange = true;
        }
      }
      continue;
    }
    const { event } = verdict;
    if (!(await canMergeInGroup(tx, groupId, event))) continue;
    const previous = await readSyncRecord(tx, groupId, event.type, event.id);
    if (compareSyncStamps(event.stamp, seen) > 0) seen = event.stamp;
    const { record, created } = mergeRecordEvent(previous, event);
    // The stamp has been seen, but no event replaces the reserved category's seeded record.
    if (record.type === 'category' && record.id === uncategorized.id) continue;
    await updateReceived(tx, groupId, event, (held) =>
      mergeRecordEvent(held, event),
    );
    const { changes } = await storeSyncRecord(tx, groupId, record, created);
    if (record.type === 'expense') {
      // An earlier event may change who recorded the expense without winning a unit.
      if (previous && created !== previous.created) visibleChange = true;
      if (await markIfOverridden(tx, event)) visibleChange = true;
    }
    if (record.type === 'distinct' && changes > 0) visibleChange = true;
    if (await project(record, previous?.record, event.stamp.ms))
      visibleChange = true;
  }
  for (const type of toOrder)
    if (await orderSyncedRows(tx, groupId, type)) visibleChange = true;
  if (compareSyncStamps(seen, initial) > 0) await saveLatestStamp(tx, seen);
  return visibleChange;
}

/** Tells the screens that what they read of the shared ledger `groupId` has changed. */
export function notifyApplied(
  database: Database,
  groupId: string,
  leftTrash?: ReadonlySet<string>,
) {
  // An expense's card names its group, its members and its category.
  notifyExpensesChanged(database, leftTrash);
  listeners.get(database)?.forEach((listener) => listener(groupId));
}

/** Judge, merge and apply a shared ledger's received events in delivery order, in one transaction. */
export async function applySyncEvents(
  database: Database,
  groupId: string,
  events: readonly ReceivedSyncEvent[],
): Promise<void> {
  const leftTrash = new Set<string>();
  const changed = await database.transaction((tx) =>
    applyReceivedEvents(tx, groupId, events, leftTrash),
  );
  if (changed) notifyApplied(database, groupId, leftTrash);
}

/** Refusals retain their original envelope and receipt order across restarts. */
export async function listRefusedSyncEvents(
  database: SqlExecutor,
): Promise<RefusedSyncEvent[]> {
  const rows = await database.all<RefusedSyncEvent & { content: string }>(
    'SELECT groupId, id, device, receivedAtMs, content, reason FROM sync_refusals ORDER BY position',
  );
  return rows.map(({ content, ...envelope }) => ({
    ...envelope,
    content: JSON.parse(content) as unknown,
  }));
}
