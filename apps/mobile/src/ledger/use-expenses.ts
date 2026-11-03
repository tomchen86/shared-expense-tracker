import { useEffect, useState } from 'react';
import { useIsFocused } from 'expo-router/react-navigation';
import { listCategories } from '../categories';
import { useLocalDatabase, useLocalIdentity } from '../shell';
import { listExpenses, subscribeToExpenses, type Expense } from './expenses';

/** Undefined until loaded; refresh on navigation and committed expense changes. */
export function useExpenses(trashed = false) {
  const database = useLocalDatabase();
  const { personalSpaceId } = useLocalIdentity();
  const focused = useIsFocused();
  const [expenses, setExpenses] = useState<Expense[]>();
  const [error, setError] = useState<unknown>();

  useEffect(() => {
    let active = true;
    let version = 0;
    function refresh() {
      const request = ++version;
      void Promise.all([
        listExpenses(database),
        listCategories(database, personalSpaceId),
      ]).then(
        ([rows, categories]) => {
          if (!active || request !== version) return;
          const current = new Map(categories.map((item) => [item.id, item]));
          const selected = rows.filter(
            (expense) =>
              expense.spaceId === personalSpaceId &&
              (expense.trashOrder !== undefined) === trashed,
          );
          if (trashed) selected.sort((a, b) => b.trashOrder! - a.trashOrder!);
          setExpenses(
            selected.map((expense) => ({
              ...expense,
              category: current.get(expense.category.id) ?? expense.category,
            })),
          );
        },
        (failure: unknown) => {
          if (active && request === version) setError(failure);
        },
      );
    }
    const unsubscribe = subscribeToExpenses(database, refresh);
    refresh();
    return () => {
      active = false;
      unsubscribe();
    };
  }, [database, personalSpaceId, focused, trashed]);

  if (error) throw error;
  return expenses;
}
