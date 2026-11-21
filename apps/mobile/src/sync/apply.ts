import {
  checkSyncEvent,
  compareSyncStamps,
  mergeSyncEvent,
  type SyncEvent,
  type SyncRefusal,
} from '@shared-expense/domain';
import { applyMergedCategory } from '../categories/merged-category';
import { groupUncategorized } from '../categories/repository';
import { applyMergedGroup } from '../groups';
import { notifyExpensesChanged } from '../ledger/expenses';
import { applyMergedExpense } from '../ledger/merged-expense';
import type { Database, SqlExecutor } from '../storage';
import { markIfOverridden } from './own-money';
import { orderSyncedRows } from './positions';
import {
  latestStamp,
  readSyncRecord,
  saveLatestStamp,
  sharedGroup,
  storeSyncRecord,
} from './records';

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
} as const;

async function canMergeInGroup(
  tx: SqlExecutor,
  groupId: string,
  event: SyncEvent,
) {
  if (event.type === 'group') return event.id === groupId;
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
  if (!(await sharedGroup(tx, groupId))) throw new Error('Not a shared ledger');
  // Sharing seeds at least the group's own stamp in the same transaction.
  const initial = (await latestStamp(tx))!;
  const uncategorized = await groupUncategorized(tx, groupId);
  let seen = initial;
  let visibleChange = false;
  const toOrder = new Set<'member' | 'category'>();
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
      continue;
    }
    const { event } = verdict;
    if (!(await canMergeInGroup(tx, groupId, event))) continue;
    const previous = await readSyncRecord(tx, groupId, event.type, event.id);
    const merged = mergeSyncEvent({ record: previous?.record, seen, event });
    seen = merged.seen;
    const { record } = merged;
    // The stamp has been seen, but no event replaces the reserved category's seeded record.
    if (record.type === 'category' && record.id === uncategorized.id) continue;
    const created =
      previous &&
      (previous.seeded || compareSyncStamps(previous.created, event.stamp) <= 0)
        ? previous.created
        : event.stamp;
    await storeSyncRecord(tx, groupId, record, created);
    if (record.type === 'member' || record.type === 'category')
      toOrder.add(record.type);
    switch (record.type) {
      case 'group':
      case 'member':
        if (await applyMergedGroup(tx, groupId, record)) visibleChange = true;
        break;
      case 'category':
        if (
          await applyMergedCategory(
            tx,
            groupId,
            record,
            uncategorized,
            event.stamp.ms,
          )
        )
          visibleChange = true;
        break;
      case 'expense':
        if (await markIfOverridden(tx, event)) visibleChange = true;
        if (
          await applyMergedExpense(
            tx,
            groupId,
            record,
            previous?.record,
            event.stamp.ms,
          )
        ) {
          visibleChange = true;
          if (
            previous?.record.type === 'expense' &&
            previous.record.units.trashed?.value &&
            !record.units.trashed?.value
          )
            leftTrash.add(event.id);
        }
        break;
    }
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
