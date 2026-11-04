import type { Database } from '../storage';
import { notifyExpensesChanged } from './expenses';

export async function moveExpenseToTrash(
  database: Database,
  spaceId: string,
  id: string,
): Promise<boolean> {
  const { changes } = await database.transaction((tx) =>
    tx.run(
      `UPDATE expenses SET trashOrder =
        (SELECT COALESCE(MAX(trashOrder), 0) + 1 FROM expenses)
       WHERE id = ? AND spaceId = ? AND trashOrder IS NULL`,
      [id, spaceId],
    ),
  );
  if (changes) notifyExpensesChanged(database);
  return changes !== 0;
}

export async function restoreExpense(
  database: Database,
  spaceId: string,
  id: string,
): Promise<boolean> {
  const { changes } = await database.transaction((tx) =>
    tx.run(
      'UPDATE expenses SET trashOrder = NULL WHERE id = ? AND spaceId = ? AND trashOrder IS NOT NULL',
      [id, spaceId],
    ),
  );
  if (changes) notifyExpensesChanged(database);
  return changes !== 0;
}

/** Omitting id empties this space's trash. Foreign keys remove payments and shares. */
export async function deleteTrashedExpenses(
  database: Database,
  spaceId: string,
  id?: string,
): Promise<boolean> {
  const { changes } = await database.transaction((tx) =>
    tx.run(
      `DELETE FROM expenses WHERE spaceId = ? AND trashOrder IS NOT NULL${id === undefined ? '' : ' AND id = ?'}`,
      id === undefined ? [spaceId] : [spaceId, id],
    ),
  );
  if (changes) notifyExpensesChanged(database);
  return changes !== 0;
}
