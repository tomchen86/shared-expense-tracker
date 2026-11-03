import { DEFAULT_CATEGORIES } from '@shared-expense/domain';
import { createUuid, type Database, type SqlExecutor } from '../storage';
import { moveExpensesToCategory } from '../ledger/expenses';

const UNCATEGORIZED_NAME =
  DEFAULT_CATEGORIES[DEFAULT_CATEGORIES.length - 1].name;

export interface Category {
  id: string;
  name: string;
  color: string;
  isDefault: boolean;
  isArchived: boolean;
  /** The user ID of whoever added the category. */
  createdByUserId?: string;
  /** The space the category belongs to: your personal space ID or a group ID. */
  spaceId: string;
}

interface CategoryRow {
  id: string;
  name: string;
  color: string;
  isDefault: number;
  isArchived: number;
  createdByUserId: string | null;
  spaceId: string;
}

export function isUncategorizedCategory(
  category: Pick<Category, 'name' | 'isDefault'>,
): boolean {
  return category.isDefault && category.name === UNCATEGORIZED_NAME;
}

export async function ensureDefaultCategories(
  transaction: SqlExecutor,
  spaceId: string,
): Promise<void> {
  const existing = await transaction.all<{ present: number }>(
    'SELECT 1 AS present FROM categories WHERE spaceId = ? LIMIT 1',
    [spaceId],
  );
  if (existing.length > 0) return;

  const [row] = await transaction.all<{ position: number }>(
    'SELECT COALESCE(MAX(position), 0) AS position FROM categories',
  );

  const ids = new Set<string>();
  while (ids.size < DEFAULT_CATEGORIES.length) {
    ids.add(await createUuid(transaction));
  }
  const uniqueIds = [...ids];

  for (const [index, category] of DEFAULT_CATEGORIES.entries()) {
    await transaction.run(
      'INSERT INTO categories (id, name, color, isDefault, position, spaceId) VALUES (?, ?, ?, 1, ?, ?)',
      [
        uniqueIds[index],
        category.name,
        category.color,
        row.position + index + 1,
        spaceId,
      ],
    );
  }
}

export async function listCategories(
  database: SqlExecutor,
  spaceId?: string,
): Promise<Category[]> {
  const rows = await database.all<CategoryRow>(
    `SELECT id, name, color, isDefault, isArchived, createdByUserId, spaceId FROM categories${spaceId === undefined ? '' : ' WHERE spaceId = ?'} ORDER BY position ASC`,
    spaceId === undefined ? [] : [spaceId],
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    color: row.color,
    isDefault: row.isDefault === 1,
    isArchived: row.isArchived === 1,
    createdByUserId: row.createdByUserId ?? undefined,
    spaceId: row.spaceId,
  }));
}

export async function createCategory(
  database: Database,
  input: {
    name: string;
    color: string;
    createdByUserId: string;
    spaceId: string;
  },
): Promise<Category> {
  return database.transaction(async (transaction) => {
    const id = await createUuid(transaction);
    const [row] = await transaction.all<{ nextPosition: number }>(
      'SELECT COALESCE(MAX(position), 0) + 1 AS nextPosition FROM categories',
    );
    await transaction.run(
      'INSERT INTO categories (id, name, color, isDefault, position, createdByUserId, spaceId) VALUES (?, ?, ?, 0, ?, ?, ?)',
      [
        id,
        input.name,
        input.color,
        row.nextPosition,
        input.createdByUserId,
        input.spaceId,
      ],
    );
    return {
      id,
      name: input.name,
      color: input.color,
      isDefault: false,
      isArchived: false,
      createdByUserId: input.createdByUserId,
      spaceId: input.spaceId,
    };
  });
}

export async function setCategoryArchived(
  database: SqlExecutor,
  id: string,
  archived: boolean,
): Promise<void> {
  const result = await database.run(
    'UPDATE categories SET isArchived = ? WHERE id = ? AND NOT (isDefault = 1 AND name = ?)',
    [archived ? 1 : 0, id, UNCATEGORIZED_NAME],
  );
  if (result.changes !== 1)
    throw new Error('Category cannot be archived or restored');
}

export async function deleteCategory(
  database: SqlExecutor,
  id: string,
): Promise<void> {
  // The expense foreign key also prevents deleting a category that became used
  // after the confirmation opened.
  const result = await database.run(
    'DELETE FROM categories WHERE id = ? AND NOT (isDefault = 1 AND name = ?)',
    [id, UNCATEGORIZED_NAME],
  );
  if (result.changes !== 1) throw new Error('Category cannot be deleted');
}

export async function moveAndArchiveCategory(
  database: Database,
  sourceId: string,
  targetId: string,
): Promise<void> {
  await database.transaction(async (transaction) => {
    const [source] = await transaction.all<CategoryRow>(
      'SELECT * FROM categories WHERE id = ?',
      [sourceId],
    );
    const [target] = await transaction.all<CategoryRow>(
      'SELECT * FROM categories WHERE id = ?',
      [targetId],
    );
    if (
      !source ||
      !target ||
      sourceId === targetId ||
      source.isArchived ||
      target.isArchived ||
      source.spaceId !== target.spaceId
    )
      throw new Error('Categories cannot be moved');
    await moveExpensesToCategory(transaction, sourceId, target);
    await setCategoryArchived(transaction, sourceId, true);
  });
}

export async function updateCategory(
  database: SqlExecutor,
  input: { id: string; name: string; color: string },
): Promise<void> {
  const result = await database.run(
    'UPDATE categories SET name = ?, color = ? WHERE id = ? AND NOT (isDefault = 1 AND name = ?)',
    [input.name, input.color, input.id, UNCATEGORIZED_NAME],
  );
  if (result.changes === 0) {
    throw new Error('Category cannot be updated');
  }
}
