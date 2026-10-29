import { DEFAULT_CATEGORIES } from '@shared-expense/domain';
import type { Database, SqlExecutor } from '../storage';

export interface Category {
  id: string;
  name: string;
  color: string;
  isDefault: boolean;
}

interface CategoryRow {
  id: string;
  name: string;
  color: string;
  isDefault: number;
}

export function isUncategorizedCategory(
  category: Pick<Category, 'name' | 'isDefault'>,
): boolean {
  return category.isDefault && category.name === 'Uncategorized';
}

async function createUuid(executor: SqlExecutor): Promise<string> {
  const [row] = await executor.all<{ bytes: string }>(
    'SELECT lower(hex(randomblob(16))) AS bytes',
  );
  const hex = row.bytes;
  const variant = ((parseInt(hex[16], 16) & 3) | 8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20)}`;
}

export async function ensureDefaultCategories(
  transaction: SqlExecutor,
): Promise<void> {
  const existing = await transaction.all<{ present: number }>(
    'SELECT 1 AS present FROM categories LIMIT 1',
  );
  if (existing.length > 0) return;

  const ids = new Set<string>();
  while (ids.size < DEFAULT_CATEGORIES.length) {
    ids.add(await createUuid(transaction));
  }
  const uniqueIds = [...ids];

  for (const [index, category] of DEFAULT_CATEGORIES.entries()) {
    await transaction.run(
      'INSERT INTO categories (id, name, color, isDefault, position) VALUES (?, ?, ?, 1, ?)',
      [uniqueIds[index], category.name, category.color, index + 1],
    );
  }
}

export async function listCategories(
  database: SqlExecutor,
): Promise<Category[]> {
  const rows = await database.all<CategoryRow>(
    'SELECT id, name, color, isDefault FROM categories ORDER BY position ASC',
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    color: row.color,
    isDefault: row.isDefault === 1,
  }));
}

export async function createCategory(
  database: Database,
  input: { name: string; color: string },
): Promise<Category> {
  return database.transaction(async (transaction) => {
    const id = await createUuid(transaction);
    const [row] = await transaction.all<{ nextPosition: number }>(
      'SELECT COALESCE(MAX(position), 0) + 1 AS nextPosition FROM categories',
    );
    await transaction.run(
      'INSERT INTO categories (id, name, color, isDefault, position) VALUES (?, ?, ?, 0, ?)',
      [id, input.name, input.color, row.nextPosition],
    );
    return {
      id,
      name: input.name,
      color: input.color,
      isDefault: false,
    };
  });
}

export async function updateCategory(
  database: SqlExecutor,
  input: { id: string; name: string; color: string },
): Promise<void> {
  const result = await database.run(
    'UPDATE categories SET name = ?, color = ? WHERE id = ? AND NOT (isDefault = 1 AND name = ?)',
    [input.name, input.color, input.id, 'Uncategorized'],
  );
  if (result.changes === 0) {
    throw new Error('Category cannot be updated');
  }
}
