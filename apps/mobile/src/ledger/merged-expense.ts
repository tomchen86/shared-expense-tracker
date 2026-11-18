import {
  changedSyncUnits,
  syncRecordValues,
  type SyncRecord,
} from '@shared-expense/domain';
import { resolveExpenseCategory } from '../categories/repository';
import type { SqlExecutor } from '../storage';
import { writeExpenseRows } from './expenses';

/** Returns whether the merge changed the expense that screens read. */
export async function applyMergedExpense(
  tx: SqlExecutor,
  groupId: string,
  record: Extract<SyncRecord, { type: 'expense' }>,
  previous: SyncRecord | undefined,
): Promise<boolean> {
  const { id } = record;
  if (record.deleted) {
    // Payments and shares cascade with their expense.
    const { changes } = await tx.run(
      'DELETE FROM expenses WHERE id = ? AND spaceId = ?',
      [id, groupId],
    );
    return changes > 0;
  }
  const values = syncRecordValues(record);
  if (
    !values ||
    Object.keys(changedSyncUnits(values, previous?.units ?? {})).length === 0
  )
    return false;

  const [existing] = await tx.all<{ trashOrder: number | null }>(
    'SELECT trashOrder FROM expenses WHERE id = ? AND spaceId = ?',
    [id, groupId],
  );
  let trashOrder: number | null | undefined = existing?.trashOrder;
  if (!values.trashed) trashOrder = undefined;
  else if (trashOrder == null) {
    const [next] = await tx.all<{ trashOrder: number }>(
      'SELECT COALESCE(MAX(trashOrder), 0) + 1 AS trashOrder FROM expenses',
    );
    trashOrder = next.trashOrder;
  }
  await writeExpenseRows(
    tx,
    {
      id,
      spaceId: groupId,
      title: values.title,
      date: values.date,
      note: values.note ?? undefined,
      category: await resolveExpenseCategory(tx, groupId, values.category),
      ...values.money,
      trashOrder,
    },
    !!existing,
  );
  return true;
}
