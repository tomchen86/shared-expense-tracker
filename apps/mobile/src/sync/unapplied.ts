import type { SyncRefusal } from '@shared-expense/domain';
import type { Database, SqlExecutor } from '../storage';
import { notifyApplied } from './apply';

/** A change this phone uploaded that was refused and has not been dismissed. */
export interface UnappliedChange {
  groupId: string;
  id: string;
  reason: SyncRefusal;
  content: unknown;
}

type ChangeRow = Omit<UnappliedChange, 'content'> & { content: string };

const notices =
  'FROM sync_refusals r JOIN sync_unapplied u ON u.refusal = r.position AND u.dismissed = 0';

function unpack<T extends ChangeRow>({ content, ...row }: T) {
  return { ...row, content: JSON.parse(content) as unknown };
}

export async function listUnappliedChanges(
  database: SqlExecutor,
): Promise<UnappliedChange[]> {
  const rows = await database.all<ChangeRow>(
    `SELECT r.groupId, r.id, r.reason, r.content ${notices} ORDER BY r.position`,
  );
  return rows.map(unpack);
}

export async function countGroupUnapplied(
  database: SqlExecutor,
  groupId: string,
) {
  const [{ count }] = await database.all<{ count: number }>(
    `SELECT COUNT(*) AS count ${notices} WHERE r.groupId = ?`,
    [groupId],
  );
  return count;
}

/** Resolve names against the ledger as it is now, including trash and former members. */
export async function listGroupUnapplied(
  database: SqlExecutor,
  groupId: string,
) {
  const recordId = "json_extract(r.content, '$.id')";
  const rows = await database.all<ChangeRow & { currentName: string | null }>(
    `SELECT r.groupId, r.id, r.reason, r.content, CASE json_extract(r.content, '$.type')
       WHEN 'expense' THEN (SELECT title FROM expenses WHERE spaceId = r.groupId AND id = ${recordId})
       WHEN 'member' THEN (SELECT name FROM group_members WHERE groupId = r.groupId AND id = ${recordId})
       WHEN 'category' THEN (SELECT name FROM categories WHERE spaceId = r.groupId AND id = ${recordId})
     END AS currentName
     ${notices} WHERE r.groupId = ? ORDER BY r.position`,
    [groupId],
  );
  return rows.map(unpack);
}

export async function dismissUnapplied(
  database: Database,
  groupId: string,
  id: string,
) {
  const { changes } = await database.run(
    `UPDATE sync_unapplied SET dismissed = 1 WHERE dismissed = 0
     AND refusal = (SELECT position FROM sync_refusals WHERE groupId = ? AND id = ?)`,
    [groupId, id],
  );
  if (changes) notifyApplied(database, groupId);
}
