import { useEffect, useState } from 'react';
import { useIsFocused } from 'expo-router/react-navigation';
import { listCategories } from '../categories';
import {
  listFormerMembers,
  listGroups,
  type Group,
  type GroupMember,
} from '../groups';
import { useLocalDatabase, useLocalIdentity } from '../shell';
import { listExpenses, subscribeToExpenses, type Expense } from './expenses';

export interface ExpenseView extends Expense {
  categoryLabel: string;
  group?: Group;
  members: GroupMember[];
  yourPaid: number;
  yourShare: number;
  involved: boolean;
}

/** Undefined until loaded; refresh on navigation and committed expense changes. */
export function useExpenses(trashed = false, { throwOnError = true } = {}) {
  const database = useLocalDatabase();
  const { personalSpaceId, personalParticipantId, userId } = useLocalIdentity();
  const focused = useIsFocused();
  const [expenses, setExpenses] = useState<ExpenseView[]>();
  const [error, setError] = useState<unknown>();

  useEffect(() => {
    let active = true;
    let version = 0;
    function refresh() {
      const request = ++version;
      const isCurrent = () => active && request === version;
      void Promise.all([
        listExpenses(database),
        listCategories(database),
        listGroups(database).then(async (groups) =>
          Promise.all(
            groups.map(async (group) => ({
              ...group,
              formerMembers: await listFormerMembers(database, group.id),
            })),
          ),
        ),
      ]).then(
        ([rows, categories, groups]) => {
          if (!isCurrent()) return;
          setError(undefined);
          const current = new Map(categories.map((item) => [item.id, item]));
          const selected = rows.filter(
            (expense) => (expense.trashOrder !== undefined) === trashed,
          );
          if (trashed) selected.sort((a, b) => b.trashOrder! - a.trashOrder!);
          setExpenses(
            selected.map((expense) => {
              const category = current.get(expense.category.id);
              const name = category?.name ?? expense.category.name;
              const group = groups.find((item) => item.id === expense.spaceId);
              const members = group
                ? [...group.members, ...group.formerMembers]
                : [];
              const own = new Set([
                personalParticipantId,
                ...members
                  .filter((member) => member.userId === userId)
                  .map((member) => member.id),
              ]);
              const paid = expense.payments.filter((payment) =>
                own.has(payment.participant),
              );
              const shares = expense.shares.filter((share) =>
                own.has(share.participant),
              );
              return {
                ...expense,
                category: category ?? expense.category,
                categoryLabel: category?.isArchived
                  ? `${name} (Archived)`
                  : name,
                group,
                members,
                yourPaid: paid.reduce(
                  (sum, payment) => sum + payment.amountMinor,
                  0,
                ),
                yourShare: shares.reduce(
                  (sum, share) => sum + share.amountMinor,
                  0,
                ),
                involved:
                  expense.spaceId === personalSpaceId ||
                  paid.length > 0 ||
                  shares.length > 0,
              };
            }),
          );
        },
        (failure: unknown) => {
          if (!isCurrent()) return;
          setExpenses(undefined);
          setError(failure);
        },
      );
    }
    const unsubscribe = subscribeToExpenses(database, refresh);
    refresh();
    return () => {
      active = false;
      unsubscribe();
    };
  }, [
    database,
    personalSpaceId,
    personalParticipantId,
    userId,
    focused,
    trashed,
  ]);

  if (error && throwOnError) throw error;
  return expenses;
}
