import { currencyDecimals } from '@shared-expense/domain';
import type { SqlExecutor } from '../storage';
import type { ExpenseView } from './use-expenses';

export const ORDER_NAMES = {
  newest: 'Newest First',
  oldest: 'Oldest First',
  edited: 'Recently Edited',
  highest: 'Highest Amount',
  lowest: 'Lowest Amount',
} as const;

export type ListOrder = keyof typeof ORDER_NAMES;

export const ORDER_OPTIONS = Object.entries(ORDER_NAMES).map(([id, name]) => ({
  id,
  name,
}));

export async function readListOrders(database: SqlExecutor) {
  const rows = await database.all<{ spaceId: string; sortOrder: ListOrder }>(
    'SELECT spaceId, sortOrder FROM expense_list_orders',
  );
  return new Map(rows.map(({ spaceId, sortOrder }) => [spaceId, sortOrder]));
}

export function saveListOrder(
  database: SqlExecutor,
  spaceId: string,
  order: ListOrder,
) {
  return database.run(
    `INSERT INTO expense_list_orders (spaceId, sortOrder) VALUES (?, ?)
     ON CONFLICT (spaceId) DO UPDATE SET sortOrder = excluded.sortOrder`,
    [spaceId, order],
  );
}

/** The input is newest first, including its tie-breaker for equal card amounts (LEDGER-121.1). */
export function orderedCards(
  expenses: ExpenseView[],
  order: ListOrder,
  inGroup: boolean,
) {
  switch (order) {
    case 'newest':
      return expenses;
    case 'oldest':
      return [...expenses].reverse();
    case 'edited':
      return [...expenses].sort((a, b) =>
        a.changedAt === b.changedAt
          ? b.addedOrder - a.addedOrder
          : (b.changedAt ?? -Infinity) - (a.changedAt ?? -Infinity),
      );
    case 'highest':
    case 'lowest': {
      const amount = (expense: ExpenseView) =>
        (inGroup ? expense.amountMinor : expense.yourShare) /
        10 ** currencyDecimals(expense.currency)!;
      const direction = order === 'highest' ? -1 : 1;
      return [...expenses].sort((a, b) => direction * (amount(a) - amount(b)));
    }
  }
}
