import { syncRecordValues, type SyncRecord } from '@shared-expense/domain';
import { moveExpensesToCategory } from '../ledger/expenses';
import { restoreMergedExpenseCategories } from '../ledger/merged-expense';
import type { SqlExecutor } from '../storage';
import type { Category } from './repository';

export async function applyMergedCategory(
  tx: SqlExecutor,
  groupId: string,
  record: Extract<SyncRecord, { type: 'category' }>,
  uncategorized: Pick<Category, 'id' | 'name' | 'color'>,
) {
  if (record.deleted) {
    // Repoint expense foreign keys first. Their sync units keep the real assignment.
    await moveExpensesToCategory(
      tx,
      record.id,
      { ...uncategorized, spaceId: groupId },
      undefined,
    );
    const { changes } = await tx.run(
      'DELETE FROM categories WHERE spaceId = ? AND id = ?',
      [groupId, record.id],
    );
    return changes > 0;
  }
  const values = syncRecordValues(record);
  if (!values) return false;
  const { name, color, archived } = values;
  const [existing] = await tx.all<{
    name: string;
    color: string;
    isArchived: number;
  }>(
    'SELECT name, color, isArchived FROM categories WHERE id = ? AND spaceId = ?',
    [record.id, groupId],
  );
  if (existing) {
    if (
      name === existing.name &&
      color === existing.color &&
      Number(archived) === existing.isArchived
    )
      return false;
    await tx.run(
      'UPDATE categories SET name = ?, color = ?, isArchived = ? WHERE id = ? AND spaceId = ?',
      [name, color, Number(archived), record.id, groupId],
    );
    return true;
  }
  await tx.run(
    `INSERT INTO categories (id, spaceId, name, color, isArchived, isDefault, position)
     VALUES (?, ?, ?, ?, ?, 0, (SELECT COALESCE(MAX(position), 0) + 1 FROM categories))`,
    [record.id, groupId, name, color, Number(archived)],
  );
  await restoreMergedExpenseCategories(tx, groupId, record.id);
  return true;
}
