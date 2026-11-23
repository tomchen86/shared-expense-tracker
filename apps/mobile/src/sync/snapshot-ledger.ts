import {
  checkSyncSnapshot,
  compareSyncStamps,
  mergeSyncSnapshotRecord,
  type SyncRecord,
  type SyncSnapshot,
  type SyncSnapshotRecord,
} from '@shared-expense/domain';
import { applyMergedCategory } from '../categories/merged-category';
import { groupUncategorized } from '../categories/repository';
import { applyMergedGroup } from '../groups';
import { applyMergedExpense } from '../ledger/merged-expense';
import type { SqlExecutor } from '../storage';
import { canMergeInGroup } from './apply';
import { applyMergedInvite } from './invites';
import { readGroupKey } from './loop';
import { orderSyncedRows } from './positions';
import {
  latestStamp,
  readSyncRecord,
  saveLatestStamp,
  snapshotRecords,
  storeSyncRecord,
  updateReceived,
  type StoredRecord,
} from './records';

/** Read the outbox, cursor and merged records at one point in the ledger's history. */
export async function makeSnapshot(tx: SqlExecutor, groupId: string) {
  const [ledger] = await tx.all<{
    epoch: number;
    cursor: number;
    unsent: number;
  }>(
    `SELECT epoch, cursor, EXISTS(SELECT 1 FROM sync_outbox WHERE groupId = ?) AS unsent
     FROM sync_groups WHERE groupId = ?`,
    [groupId, groupId],
  );
  if (!ledger) throw new Error('Not a shared ledger');
  if (ledger.unsent) return { outcome: 'unsent-events' } as const;
  const key = await readGroupKey(groupId, ledger.epoch);
  if (!key) return { outcome: 'no-key' } as const;
  const content: SyncSnapshot = {
    version: 1,
    eventVersion: 1,
    groupId,
    sequence: ledger.cursor,
    uncategorized: (await groupUncategorized(tx, groupId)).id,
    records: await snapshotRecords(tx, groupId),
  };
  if (checkSyncSnapshot(content).status !== 'valid')
    throw new Error('Invalid snapshot in local data');
  return { outcome: 'made', content, epoch: ledger.epoch, key } as const;
}

/** Only a new shared ledger needs a local device and a position. */
async function openSnapshotGroup(
  tx: SqlExecutor,
  snapshot: SyncSnapshot,
  epoch: number,
) {
  const { groupId, uncategorized, records, sequence } = snapshot;
  // Personal expenses and categories use their space ID in the same column as group rows.
  const [personal] = await tx.all(
    'SELECT 1 FROM local_identity WHERE personalSpaceId = ?',
    [groupId],
  );
  if (personal) return false;
  const [group] = await tx.all<{ shared: number }>(
    `SELECT s.groupId IS NOT NULL AS shared FROM groups g
     LEFT JOIN sync_groups s ON s.groupId = g.id WHERE g.id = ?`,
    [groupId],
  );
  if (group) {
    if (
      !group.shared ||
      (await groupUncategorized(tx, groupId)).id !== uncategorized
    )
      return false;
    await tx.run(
      'UPDATE sync_groups SET cursor = MAX(cursor, ?), epoch = MAX(epoch, ?) WHERE groupId = ?',
      [sequence, epoch, groupId],
    );
    return true;
  }
  // Validation established exactly one group record and a complete reserved category.
  const groupRecord = records.find((r) => r.type === 'group')!;
  const name = groupRecord.units.name!.value;
  await tx.run(
    `INSERT INTO groups (id, name, position)
    SELECT ?, ?, COALESCE(MAX(position), 0) + 1 FROM groups`,
    [groupId, name],
  );
  await tx.run(
    `INSERT INTO sync_groups (groupId, device, cursor, epoch)
    SELECT ?, deviceId, ?, ? FROM device_identity WHERE singleton = 1`,
    [groupId, sequence, epoch],
  );
  return true;
}

interface MergedExpense {
  record: Extract<SyncSnapshotRecord, { type: 'expense' }>;
  previous?: SyncRecord;
}

function byCreation(a: MergedExpense, b: MergedExpense) {
  return (
    compareSyncStamps(a.record.created, b.record.created) ||
    Number(a.record.id > b.record.id) - Number(a.record.id < b.record.id)
  );
}

/** New rows get their creation order and their trash order from two independent stamps. */
async function applyExpenses(
  tx: SqlExecutor,
  groupId: string,
  expenses: MergedExpense[],
) {
  const [before] = await tx.all<{ last: number }>(
    'SELECT COALESCE(MAX(trashOrder), 0) AS last FROM expenses',
  );
  for (const { record, previous } of expenses.sort(byCreation)) {
    await applyMergedExpense(
      tx,
      groupId,
      record,
      previous,
      lastChangeMs(record),
    );
  }
  // Reorder only the slots this import allocated. Older entries, including other ledgers',
  // keep their positions. Ordering the new entries is independent of their insertion order.
  await tx.run(
    `WITH ordered AS MATERIALIZED (
    SELECT e.id, ? + ROW_NUMBER() OVER (ORDER BY
      json_extract(s.record, '$.units.trashed.stamp.ms'),
      json_extract(s.record, '$.units.trashed.stamp.counter'),
      json_extract(s.record, '$.units.trashed.stamp.device'), e.id) AS position
    FROM expenses e JOIN sync_records s ON s.groupId = e.spaceId AND s.type = 'expense' AND s.id = e.id
    WHERE e.spaceId = ? AND e.trashOrder > ?
  ) UPDATE expenses SET trashOrder = ordered.position FROM ordered
    WHERE expenses.id = ordered.id AND expenses.trashOrder <> ordered.position`,
    [before.last, groupId, before.last],
  );
}

function lastChangeMs(record: SyncRecord) {
  return (
    record.deleted?.ms ??
    Math.max(...Object.values(record.units).map((unit) => unit.stamp.ms))
  );
}

/** Store sync state and project it into the same ledger tables an event updates, all in tx. */
export async function importSnapshot(
  tx: SqlExecutor,
  snapshot: SyncSnapshot,
  epoch: number,
) {
  const { groupId, uncategorized } = snapshot;
  const reservedRecord = snapshot.records.find(
    (record): record is Extract<SyncSnapshotRecord, { type: 'category' }> =>
      record.type === 'category' && record.id === uncategorized,
  )!;
  // Decide ownership against the phone's data before creating or updating any rows.
  const foreign = new Set<SyncSnapshotRecord>();
  for (const record of snapshot.records) {
    if (!(await canMergeInGroup(tx, groupId, record))) foreign.add(record);
  }
  if (
    foreign.has(reservedRecord) ||
    !(await openSnapshotGroup(tx, snapshot, epoch))
  )
    return false;
  const reserved = {
    id: uncategorized,
    name: reservedRecord.units.name!.value,
    color: reservedRecord.units.color!.value,
  };
  const expenses: MergedExpense[] = [];
  const invites: Extract<SyncRecord, { type: 'invite' }>[] = [];
  let seen = await latestStamp(tx);
  for (const incoming of snapshot.records) {
    const previous = await readSyncRecord(
      tx,
      groupId,
      incoming.type,
      incoming.id,
    );
    const merge = (held: StoredRecord | undefined) =>
      mergeSyncSnapshotRecord({
        incoming,
        held: held && {
          ...held.record,
          created: held.created,
          seeded: held.seeded,
        },
        seen,
      });
    const merged = merge(previous);
    seen = merged.seen;
    if (foreign.has(incoming)) continue;
    const { created, seeded, ...record } = merged.record;
    await storeSyncRecord(tx, groupId, record, created, seeded);
    await updateReceived(tx, groupId, incoming, (held) => {
      const { created, seeded, ...record } = merge(held).record;
      return { record, created, seeded };
    });
    switch (record.type) {
      case 'invite':
        invites.push(record);
        break;
      case 'group':
      case 'member':
        await applyMergedGroup(tx, groupId, record);
        break;
      case 'category':
        await applyMergedCategory(
          tx,
          groupId,
          record,
          reserved,
          lastChangeMs(record),
        );
        break;
      case 'expense':
        expenses.push({
          record: { ...record, created, seeded },
          previous: previous?.record,
        });
        break;
    }
  }
  await tx.run(
    'UPDATE categories SET isUncategorized = 1 WHERE spaceId = ? AND id = ?',
    [groupId, uncategorized],
  );
  await applyExpenses(tx, groupId, expenses);
  await orderSyncedRows(tx, groupId, 'category');
  await orderSyncedRows(tx, groupId, 'member');
  // An invite's card uses the merged group name and ordered members.
  for (const invite of invites) await applyMergedInvite(tx, groupId, invite);
  await saveLatestStamp(tx, seen!); // A valid snapshot always includes the group itself.
  return true;
}
