import {
  nextSyncStamp,
  type SyncEvent,
  type SyncRecordType,
  type SyncUnits,
} from '@shared-expense/domain';
import { listCategories } from '../categories/repository';
import { listExpenses } from '../ledger/expenses';
import { readCorrectedTime } from '../sharing/device-identity';
import type { Database, SqlExecutor } from '../storage';
import {
  UNSENT_EVENTS,
  expenseSyncValues,
  latestStamp,
  saveLatestStamp,
  sharedGroup,
  storeSyncRecord,
} from './records';

export {
  applySyncEvents,
  listRefusedSyncEvents,
  type ReceivedSyncEvent,
  type RefusedSyncEvent,
} from './apply';

export { saveGroupKey } from './key-rotation';
export { syncGroup } from './loop';
export { lastSyncedAt } from './notices';
export { listUnappliedChanges, type UnappliedChange } from './unapplied';
export {
  deleteReadOnlyCopy,
  makeReadOnlyCopy,
  readOnlyCopyOf,
  type ReadOnlyCopy,
  type ReadOnlyCopyReason,
} from './read-only-copy';
export {
  sendSnapshot,
  takeSnapshot,
  type SendSnapshotResult,
  type TakeSnapshotResult,
} from './snapshots';

/**
 * Whether a shared ledger of this phone waits for a snapshot (SYNC-165.1): the API has
 * cleared events after its cursor, and no download has got a page since. False for a
 * group that is no shared ledger.
 */
export async function isWaitingForSnapshot(
  database: SqlExecutor,
  groupId: string,
): Promise<boolean> {
  const waiting = await database.all(
    'SELECT 1 FROM sync_groups WHERE groupId = ? AND waitsForSnapshot = 1',
    [groupId],
  );
  return waiting.length > 0;
}

/** An event this phone has queued for upload. */
export interface UnsentSyncEvent {
  /** The event's own ID, the same every time it is uploaded. */
  id: string;
  /** The shared ledger the event belongs to. */
  groupId: string;
  content: SyncEvent;
}

/** Makes a group a shared ledger on this phone, whose device ID is `device`. */
export async function shareGroup(
  database: Database,
  { groupId, device }: { groupId: string; device: string },
  beforeSharing?: (tx: SqlExecutor) => Promise<void>,
): Promise<void> {
  await database.transaction(async (tx) => {
    if (await sharedGroup(tx, groupId)) return;
    await beforeSharing?.(tx);
    const [group] = await tx.all<{ name: string }>(
      'SELECT name FROM groups WHERE id = ?',
      [groupId],
    );
    if (!group) throw new Error('Group not found');
    await tx.run(
      `INSERT INTO sync_groups (groupId, device, ownMemberId)
       SELECT ?, ?, (SELECT m.id FROM group_members m, local_identity i
                     WHERE m.groupId = ? AND m.userId = i.userId)`,
      [groupId, device, groupId],
    );

    let seen = await latestStamp(tx);
    const nowMs = await readCorrectedTime(tx);
    async function seed<T extends SyncRecordType>(
      type: T,
      id: string,
      values: SyncUnits[T],
    ) {
      const stamp = nextSyncStamp({ seen, nowMs, device });
      seen = stamp;
      const units = Object.fromEntries(
        Object.entries(values).map(([name, value]) => [name, { value, stamp }]),
      );
      await storeSyncRecord(tx, groupId, { type, id, units }, stamp, true);
    }

    await seed('group', groupId, group);
    const members = await tx.all<{ id: string; name: string; removed: number }>(
      'SELECT id, name, removed FROM group_members WHERE groupId = ? ORDER BY position',
      [groupId],
    );
    for (const member of members)
      await seed('member', member.id, {
        name: member.name,
        removed: member.removed === 1,
      });
    for (const category of await listCategories(tx, groupId))
      await seed('category', category.id, {
        name: category.name,
        color: category.color,
        archived: category.isArchived,
      });
    for (const expense of await listExpenses(tx, groupId))
      await seed('expense', expense.id, expenseSyncValues(expense));
    await saveLatestStamp(tx, seen!); // The group itself always has a stamp.
  });
}

/** This phone's unsent events in upload order, including any requeued after a snapshot. */
export async function listUnsentSyncEvents(
  database: SqlExecutor,
): Promise<UnsentSyncEvent[]> {
  const rows = await database.all<{
    id: string;
    groupId: string;
    content: string;
  }>(
    `SELECT id, groupId, content FROM ${UNSENT_EVENTS} ORDER BY sendPosition, position`,
  );
  return rows.map(({ id, groupId, content }) => ({
    id,
    groupId,
    content: JSON.parse(content) as SyncEvent,
  }));
}
