import { compareSyncRecordOrder, type SyncStamp } from '@shared-expense/domain';
import type { SqlExecutor } from '../storage';

/** Reuse just this group's position slots, including any allocated during this batch. */
export async function orderSyncedRows(
  tx: SqlExecutor,
  groupId: string,
  type: 'member' | 'category',
) {
  const [table, owner, stamp] =
    type === 'member'
      ? [
          'group_members',
          'groupId',
          "json_extract(s.record, '$.units.removed.stamp')",
        ]
      : ['categories', 'spaceId', 's.created'];
  const rows = await tx.all<{ id: string; position: number; stamp: string }>(
    `SELECT item.id, item.position, ${stamp} AS stamp FROM ${table} item
     JOIN sync_records s ON s.groupId = item.${owner} AND s.type = ? AND s.id = item.id
     WHERE item.${owner} = ?`,
    [type, groupId],
  );
  const slots = rows.map((row) => row.position).sort((a, b) => a - b);
  const ordered = rows
    .map((row) => ({ ...row, stamp: JSON.parse(row.stamp) as SyncStamp }))
    .sort(compareSyncRecordOrder);
  const moves = ordered
    .map((row, index) => ({ ...row, target: slots[index] }))
    .filter((row) => row.position !== row.target);
  // Positions assigned by the app are nonnegative. Vacate the occupied slots
  // first because SQLite checks the unique position after each row update.
  for (const row of moves)
    await tx.run(`UPDATE ${table} SET position = ? WHERE id = ?`, [
      -row.position - 1,
      row.id,
    ]);
  for (const row of moves)
    await tx.run(`UPDATE ${table} SET position = ? WHERE id = ?`, [
      row.target,
      row.id,
    ]);
  return moves.length > 0;
}
