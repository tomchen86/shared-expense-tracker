import {
  nextSyncStamp,
  type SyncEvent,
  type SyncRecordType,
  type SyncRefusal,
  type SyncUnits,
} from '@shared-expense/domain';
import { listCategories } from '../categories/repository';
import { listExpenses } from '../ledger/expenses';
import type { Database, SqlExecutor } from '../storage';
import {
  expenseSyncValues,
  latestStamp,
  saveLatestStamp,
  sharedGroup,
  storeLocalRecord,
} from './records';

/** An event this phone wrote and has not uploaded yet. */
export interface UnsentSyncEvent {
  /** The event's own ID, the same every time it is uploaded. */
  id: string;
  /** The shared ledger the event belongs to. */
  groupId: string;
  content: SyncEvent;
}

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

function notImplemented(name: string, ...inputs: unknown[]): never {
  throw new Error(`Not implemented: ${name} (${inputs.length} inputs)`);
}

/** Makes a group a shared ledger on this phone, whose device ID is `device`. */
export async function shareGroup(
  database: Database,
  { groupId, device }: { groupId: string; device: string },
): Promise<void> {
  await database.transaction(async (tx) => {
    if (await sharedGroup(tx, groupId)) return;
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
    async function seed<T extends SyncRecordType>(
      type: T,
      id: string,
      values: SyncUnits[T],
    ) {
      const stamp = nextSyncStamp({ seen, nowMs: Date.now(), device });
      seen = stamp;
      const units = Object.fromEntries(
        Object.entries(values).map(([name, value]) => [name, { value, stamp }]),
      );
      await storeLocalRecord(tx, groupId, { type, id, units }, stamp);
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

/**
 * Applies the events received for a shared ledger, in the order given. It throws, and
 * saves nothing of the call, when the group is not a shared ledger or an event is of a
 * format version it does not know.
 */
export async function applySyncEvents(
  database: Database,
  groupId: string,
  events: readonly ReceivedSyncEvent[],
): Promise<void> {
  return notImplemented('applySyncEvents', database, groupId, events);
}

/** The received events that were judged not to apply, in the order they were received. */
export async function listRefusedSyncEvents(
  database: SqlExecutor,
): Promise<RefusedSyncEvent[]> {
  return notImplemented('listRefusedSyncEvents', database);
}
