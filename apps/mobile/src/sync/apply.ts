import {
  checkSyncEvent,
  compareSyncStamps,
  mergeSyncEvent,
  type SyncEvent,
  type SyncRefusal,
} from '@shared-expense/domain';
import { notifyExpensesChanged } from '../ledger/expenses';
import { applyMergedExpense } from '../ledger/merged-expense';
import type { Database, SqlExecutor } from '../storage';
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

/** Judge, merge and apply a shared ledger's received events in delivery order, in one transaction. */
export async function applySyncEvents(
  database: Database,
  groupId: string,
  events: readonly ReceivedSyncEvent[],
): Promise<void> {
  const leftTrash = new Set<string>();
  const expensesChanged = await database.transaction(async (tx) => {
    if (!(await sharedGroup(tx, groupId)))
      throw new Error('Not a shared ledger');
    // Sharing seeds at least the group's own stamp in the same transaction.
    const initial = (await latestStamp(tx))!;
    let seen = initial;
    let changed = false;
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
      const created =
        previous && compareSyncStamps(previous.created, event.stamp) <= 0
          ? previous.created
          : event.stamp;
      await storeSyncRecord(tx, groupId, merged.record, created);
      if (
        merged.record.type === 'expense' &&
        (await applyMergedExpense(tx, groupId, merged.record, previous?.record))
      ) {
        changed = true;
        if (
          previous?.record.type === 'expense' &&
          previous.record.units.trashed?.value &&
          !merged.record.units.trashed?.value
        )
          leftTrash.add(event.id);
      }
    }
    if (compareSyncStamps(seen, initial) > 0) await saveLatestStamp(tx, seen);
    return changed;
  });
  if (expensesChanged) notifyExpensesChanged(database, leftTrash);
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
