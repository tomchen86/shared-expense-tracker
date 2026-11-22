import { DEFAULT_CATEGORIES } from '@shared-expense/domain';
import { createUuid, type Database, type SqlExecutor } from '../storage';
import { moveExpensesToCategory } from '../ledger/expenses';
import {
  sharedGroup,
  writeLocalChange,
  writeLocalDeletion,
  type SharedGroup,
} from '../sync/records';

const UNCATEGORIZED_NAME =
  DEFAULT_CATEGORIES[DEFAULT_CATEGORIES.length - 1].name;

export interface Category {
  id: string;
  name: string;
  color: string;
  isDefault: boolean;
  isUncategorized: boolean;
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
  isUncategorized: number;
  isArchived: number;
  createdByUserId: string | null;
  spaceId: string;
}

export function isUncategorizedCategory(
  category: Pick<Category, 'isUncategorized'>,
): boolean {
  return category.isUncategorized;
}

/** Keep the expense's saved label and color while the assigned category exists in its group. */
export async function resolveExpenseCategory(
  tx: SqlExecutor,
  groupId: string,
  assigned: Pick<Category, 'id' | 'name' | 'color'>,
) {
  const [known] = await tx.all(
    'SELECT 1 FROM categories WHERE id = ? AND spaceId = ?',
    [assigned.id, groupId],
  );
  if (known) return assigned;
  return groupUncategorized(tx, groupId);
}

export async function groupUncategorized(tx: SqlExecutor, groupId: string) {
  const [uncategorized] = await tx.all<Pick<Category, 'id' | 'name' | 'color'>>(
    'SELECT id, name, color FROM categories WHERE spaceId = ? AND isUncategorized = 1',
    [groupId],
  );
  return uncategorized;
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
      'INSERT INTO categories (id, name, color, isDefault, position, spaceId, isUncategorized) VALUES (?, ?, ?, 1, ?, ?, ?)',
      [
        uniqueIds[index],
        category.name,
        category.color,
        row.position + index + 1,
        spaceId,
        Number(category.name === UNCATEGORIZED_NAME),
      ],
    );
  }
}

export async function listCategories(
  database: SqlExecutor,
  spaceId?: string,
): Promise<Category[]> {
  const rows = await database.all<CategoryRow>(
    `SELECT * FROM categories${spaceId === undefined ? '' : ' WHERE spaceId = ?'} ORDER BY position ASC`,
    spaceId === undefined ? [] : [spaceId],
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    color: row.color,
    isDefault: row.isDefault === 1,
    isUncategorized: row.isUncategorized === 1,
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
    const group = await sharedGroup(transaction, input.spaceId);
    if (group)
      await writeLocalChange(transaction, group, 'category', id, {
        name: input.name,
        color: input.color,
        archived: false,
      });
    return {
      id,
      name: input.name,
      color: input.color,
      isDefault: false,
      isUncategorized: false,
      isArchived: false,
      createdByUserId: input.createdByUserId,
      spaceId: input.spaceId,
    };
  });
}

async function sharedGroupForCategory(
  transaction: SqlExecutor,
  id: string,
): Promise<SharedGroup | undefined> {
  const [group] = await transaction.all<SharedGroup>(
    `SELECT s.groupId, s.device FROM categories c
     JOIN sync_groups s ON s.groupId = c.spaceId WHERE c.id = ?`,
    [id],
  );
  return group;
}

export function setCategoryArchived(
  database: Database,
  id: string,
  archived: boolean,
): Promise<void> {
  return database.transaction(async (transaction) => {
    const group = await sharedGroupForCategory(transaction, id);
    await writeCategoryArchived(transaction, id, archived, group);
  });
}

async function writeCategoryArchived(
  transaction: SqlExecutor,
  id: string,
  archived: boolean,
  group: SharedGroup | undefined,
) {
  const result = await transaction.run(
    'UPDATE categories SET isArchived = ? WHERE id = ? AND isUncategorized = 0',
    [archived ? 1 : 0, id],
  );
  if (result.changes !== 1)
    throw new Error('Category cannot be archived or restored');
  if (group)
    await writeLocalChange(transaction, group, 'category', id, { archived });
}

export async function deleteCategory(
  database: Database,
  id: string,
): Promise<void> {
  await database.transaction(async (transaction) => {
    const group = await sharedGroupForCategory(transaction, id);
    // The expense foreign key also prevents deleting a category that became used
    // after the confirmation opened.
    const result = await transaction.run(
      'DELETE FROM categories WHERE id = ? AND isUncategorized = 0',
      [id],
    );
    if (result.changes !== 1) throw new Error('Category cannot be deleted');
    if (group) await writeLocalDeletion(transaction, group, 'category', id);
  });
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
    const group = await sharedGroup(transaction, source.spaceId);
    await moveExpensesToCategory(transaction, sourceId, target, group);
    await writeCategoryArchived(transaction, sourceId, true, group);
  });
}

export async function updateCategory(
  database: Database,
  input: { id: string; name: string; color: string },
): Promise<void> {
  await database.transaction(async (transaction) => {
    const { id, name, color } = input;
    const result = await transaction.run(
      'UPDATE categories SET name = ?, color = ? WHERE id = ? AND isUncategorized = 0',
      [name, color, id],
    );
    if (result.changes === 0) throw new Error('Category cannot be updated');
    const group = await sharedGroupForCategory(transaction, id);
    if (group)
      await writeLocalChange(transaction, group, 'category', id, {
        name,
        color,
      });
  });
}
