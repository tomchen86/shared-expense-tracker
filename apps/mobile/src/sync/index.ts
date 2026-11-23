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

export { saveGroupKey, syncGroup } from './loop';
export {
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

/** An event this phone wrote and has not uploaded yet. */
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
    await tx.run('INSERT INTO sync_groups (groupId, device) VALUES (?, ?)', [
      groupId,
      device,
    ]);

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

/** The events this phone has not uploaded yet, in the order it wrote them. */
export async function listUnsentSyncEvents(
  database: SqlExecutor,
): Promise<UnsentSyncEvent[]> {
  const rows = await database.all<{
    id: string;
    groupId: string;
    content: string;
  }>('SELECT id, groupId, content FROM sync_outbox ORDER BY position');
  return rows.map(({ id, groupId, content }) => ({
    id,
    groupId,
    content: JSON.parse(content) as SyncEvent,
  }));
}
