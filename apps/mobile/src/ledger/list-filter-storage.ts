import type { SqlExecutor } from '../storage';
import type { Expense } from './expenses';
import {
  NO_FILTER,
  hasFilter,
  participation,
  passesFilter,
  type ListFilter,
  type SavedFilter,
} from './list-filter';

const clearCurrent = (tx: SqlExecutor, spaceId: string) =>
  tx.run(
    'UPDATE expense_list_orders SET currentFilter = NULL WHERE spaceId = ? AND currentFilter IS NOT NULL',
    [spaceId],
  );

/** Check all selected names against this list's categories, including archived ones (LEDGER-141.1). */
async function pruneCategories(
  tx: SqlExecutor,
  spaceId: string,
  filters: ListFilter[],
) {
  const selected = new Set(filters.flatMap((filter) => filter.categories));
  if (!selected.size) return filters;
  const names = await tx.all<{ name: string }>(
    `SELECT DISTINCT name FROM categories
     WHERE name IN (SELECT value FROM json_each(?))
       AND (spaceId = ? OR ? = (SELECT personalSpaceId FROM local_identity))`,
    [JSON.stringify([...selected]), spaceId, spaceId],
  );
  if (names.length === selected.size) return filters;
  const existing = new Set(names.map(({ name }) => name));
  return filters.map((filter) => ({
    ...filter,
    categories: filter.categories.filter((name) => existing.has(name)),
  }));
}

/** Read in a transaction: a category name that no longer exists is forgotten for good. */
export async function readListFilter(
  tx: SqlExecutor,
  spaceId: string,
): Promise<ListFilter> {
  const [row] = await tx.all<{ currentFilter: string }>(
    'SELECT currentFilter FROM expense_list_orders WHERE spaceId = ? AND currentFilter IS NOT NULL',
    [spaceId],
  );
  if (!row) return NO_FILTER;
  const filter: ListFilter = JSON.parse(row.currentFilter);
  const [pruned] = await pruneCategories(tx, spaceId, [filter]);
  if (pruned !== filter) await writeListFilter(tx, spaceId, pruned);
  return pruned;
}

export async function writeListFilter(
  tx: SqlExecutor,
  spaceId: string,
  filter: ListFilter,
) {
  if (!hasFilter(filter)) {
    await clearCurrent(tx, spaceId);
    return;
  }
  await tx.run(
    `INSERT INTO expense_list_orders (spaceId, sortOrder, currentFilter) VALUES (?, 'newest', ?)
     ON CONFLICT (spaceId) DO UPDATE SET currentFilter = excluded.currentFilter`,
    [spaceId, JSON.stringify(filter)],
  );
}

export async function readSavedFilters(tx: SqlExecutor, spaceId: string) {
  const [row] = await tx.all<{ savedFilters: string }>(
    'SELECT savedFilters FROM expense_list_orders WHERE spaceId = ?',
    [spaceId],
  );
  const saved: SavedFilter[] = JSON.parse(row?.savedFilters ?? '[]');
  const conditions = saved.map((item) => item.filter);
  const pruned = await pruneCategories(tx, spaceId, conditions);
  if (pruned === conditions) return saved;
  const next = saved.map(({ name }, i) => ({ name, filter: pruned[i] }));
  await writeSavedFilters(tx, spaceId, next);
  return next;
}

/** Saving requires a current filter, so the list already has a row (LEDGER-143.2). */
export function writeSavedFilters(
  tx: SqlExecutor,
  spaceId: string,
  saved: SavedFilter[],
) {
  return tx.run(
    'UPDATE expense_list_orders SET savedFilters = ? WHERE spaceId = ?',
    [JSON.stringify(saved), spaceId],
  );
}

/** Called inside a local add or restore transaction, including for lists that are closed (LEDGER-142.1). */
export async function revealPlacedExpense(tx: SqlExecutor, expense: Expense) {
  const lists = await tx.all<{
    spaceId: string;
    personalSpaceId: string;
    personalParticipantId: string;
    categoryName: string;
  }>(
    `SELECT f.spaceId, i.personalSpaceId, i.personalParticipantId, c.name AS categoryName
     FROM expense_list_orders f CROSS JOIN local_identity i JOIN categories c ON c.id = ?
     WHERE f.currentFilter IS NOT NULL AND f.spaceId IN (i.personalSpaceId, ?)`,
    [expense.category.id, expense.spaceId],
  );
  if (!lists.length) return;
  const { personalSpaceId, personalParticipantId, categoryName } = lists[0];
  const members = await tx.all<{ id: string }>(
    'SELECT id FROM group_members WHERE groupId = ? AND userId = (SELECT userId FROM local_identity)',
    [expense.spaceId],
  );
  const card = {
    ...expense,
    category: { ...expense.category, name: categoryName },
    ...participation(
      expense,
      personalSpaceId,
      new Set([personalParticipantId, ...members.map(({ id }) => id)]),
    ),
  };
  for (const { spaceId } of lists) {
    const inGroup = spaceId !== personalSpaceId;
    if (
      (inGroup || card.involved) &&
      !passesFilter(await readListFilter(tx, spaceId), card, inGroup)
    )
      await clearCurrent(tx, spaceId);
  }
}
