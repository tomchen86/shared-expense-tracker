import type { SqlExecutor } from '../storage';
import type { Expense } from './expenses';
import {
  NO_FILTER,
  hasFilter,
  participation,
  passesFilter,
  type ListFilter,
} from './list-filter';

const clearCurrent = (tx: SqlExecutor, spaceId: string) =>
  tx.run(
    'UPDATE expense_list_orders SET currentFilter = NULL WHERE spaceId = ? AND currentFilter IS NOT NULL',
    [spaceId],
  );

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
  if (!filter.categories.length) return filter;
  const names = await tx.all<{ name: string }>(
    `SELECT DISTINCT name FROM categories
     WHERE name IN (SELECT value FROM json_each(?))
       AND (spaceId = ? OR ? = (SELECT personalSpaceId FROM local_identity))`,
    [JSON.stringify(filter.categories), spaceId, spaceId],
  );
  const existing = new Set(names.map(({ name }) => name));
  const categories = filter.categories.filter((name) => existing.has(name));
  if (categories.length === filter.categories.length) return filter;
  const pruned = { ...filter, categories };
  await writeListFilter(tx, spaceId, pruned);
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
