import type { ExpenseView } from './use-expenses';

/** Across every date, in the order the expenses came (LEDGER-125.2). */
export function matchingExpenses(expenses: ExpenseView[], query: string) {
  const text = query.toLowerCase();
  return expenses.filter(({ title, note, category, group }) =>
    [title, note, category.name, group?.name].some((field) =>
      field?.toLowerCase().includes(text),
    ),
  );
}

/** All Time and search both count every listed card in the phone's number format. */
export function formatItemCount(count: number, locale: string) {
  return `${new Intl.NumberFormat(locale).format(count)} ${count === 1 ? 'item' : 'items'}`;
}
