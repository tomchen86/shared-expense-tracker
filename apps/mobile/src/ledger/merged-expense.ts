import { syncRecordValues, type SyncRecord } from '@shared-expense/domain';
import { resolveExpenseCategory } from '../categories/repository';
import type { SqlExecutor } from '../storage';
import { changedUnits } from '../sync/records';
import { recordExpenseChanges, writeExpenseRows } from './expenses';

/** A category has arrived. Each waiting expense gets its own saved label and color back. */
export async function restoreMergedExpenseCategories(
  tx: SqlExecutor,
  groupId: string,
  categoryId: string,
  eventMs: number,
) {
  const restored = await tx.all<{ id: string }>(
    `UPDATE expenses AS e SET categoryId = ?,
       categoryName = json_extract(s.record, '$.units.category.value.name'),
       categoryColor = json_extract(s.record, '$.units.category.value.color')
     FROM sync_records AS s
     WHERE s.groupId = ? AND s.type = 'expense' AND s.id = e.id AND e.spaceId = s.groupId
       AND e.categoryId <> ? AND json_extract(s.record, '$.units.category.value.id') = ?
     RETURNING id`,
    [categoryId, groupId, categoryId, categoryId],
  );
  await recordExpenseChanges(
    tx,
    restored.map(({ id }) => id),
    eventMs,
  );
}

/** Returns whether the merge changed the expense that screens read. */
export async function applyMergedExpense(
  tx: SqlExecutor,
  groupId: string,
  record: Extract<SyncRecord, { type: 'expense' }>,
  previous: SyncRecord | undefined,
  eventMs: number,
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
  if (!values) return false;
  const changed = Object.keys(changedUnits(values, previous?.units ?? {}));
  if (changed.length === 0) return false;

  const category = await resolveExpenseCategory(tx, groupId, values.category);
  const [existing] = await tx.all<{
    trashOrder: number | null;
    sameCategory: number;
  }>(
    `SELECT trashOrder, (categoryId = ? AND categoryName = ? AND categoryColor = ?) AS sameCategory
     FROM expenses WHERE id = ? AND spaceId = ?`,
    [category.id, category.name, category.color, id, groupId],
  );
  // Two missing categories both resolve to the same stored Uncategorized assignment.
  if (
    changed.length === 1 &&
    changed[0] === 'category' &&
    existing?.sameCategory
  )
    return false;
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
      category,
      ...values.money,
      trashOrder,
    },
    !!existing,
    eventMs,
  );
  return true;
}
