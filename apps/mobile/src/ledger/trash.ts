import type { Database } from '../storage';
import { sharedGroup, writeLocalChange } from '../sync/records';
import { notifyExpensesChanged, recordExpenseChanges } from './expenses';

export function moveExpenseToTrash(
  database: Database,
  spaceId: string,
  id: string,
): Promise<boolean> {
  return setTrashed(database, spaceId, id, true);
}

export function restoreExpense(
  database: Database,
  spaceId: string,
  id: string,
): Promise<boolean> {
  return setTrashed(database, spaceId, id, false);
}

async function setTrashed(
  database: Database,
  spaceId: string,
  id: string,
  trashed: boolean,
): Promise<boolean> {
  const changed = await database.transaction(async (tx) => {
    const { changes } = await tx.run(
      trashed
        ? `UPDATE expenses SET trashOrder =
        (SELECT COALESCE(MAX(trashOrder), 0) + 1 FROM expenses)
       WHERE id = ? AND (spaceId = ? OR spaceId IN (SELECT id FROM groups))
       AND NOT EXISTS (SELECT 1 FROM groups WHERE id = expenses.spaceId AND archived = 1)
       AND trashOrder IS NULL`
        : `UPDATE expenses SET trashOrder = NULL WHERE id = ?
       AND (spaceId = ? OR spaceId IN (SELECT id FROM groups)) AND trashOrder IS NOT NULL`,
      [id, spaceId],
    );
    if (!changes) return false;
    await recordExpenseChanges(tx, [id]);
    const [expense] = await tx.all<{ spaceId: string }>(
      'SELECT spaceId FROM expenses WHERE id = ?',
      [id],
    );
    const group = await sharedGroup(tx, expense.spaceId);
    if (group) await writeLocalChange(tx, group, 'expense', id, { trashed });
    return true;
  });
  if (changed)
    notifyExpensesChanged(database, undefined, trashed ? undefined : id);
  return changed;
}

/** Omitting id empties the personal trash. Foreign keys remove allocations. */
export async function deleteTrashedExpenses(
  database: Database,
  spaceId: string,
  id?: string,
): Promise<boolean> {
  const { changes } = await database.transaction((tx) =>
    tx.run(
      // A group's expense is never deleted for good, whichever space is asked for (LEDGER-80.2).
      `DELETE FROM expenses WHERE spaceId = ? AND spaceId NOT IN (SELECT id FROM groups)
       AND trashOrder IS NOT NULL${id === undefined ? '' : ' AND id = ?'}`,
      id === undefined ? [spaceId] : [spaceId, id],
    ),
  );
  if (changes) notifyExpensesChanged(database);
  return changes !== 0;
}
