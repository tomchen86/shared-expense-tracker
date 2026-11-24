import { useEffect, useRef, useState } from 'react';
import { useIsFocused } from 'expo-router/react-navigation';
import type { SyncMoney } from '@shared-expense/domain';
import { listCategories, type Category } from '../categories';
import {
  listFormerMembers,
  listGroups,
  type Group,
  type GroupMember,
} from '../groups';
import { useLocalDatabase, useLocalIdentity } from '../shell';
import { readDuplicateTargets } from '../sync/duplicates';
import {
  listExpensesForCards,
  subscribeToExpenses,
  type Expense,
} from './expenses';
import { participation } from './list-filter';

export type GroupWithFormerMembers = Group & { formerMembers: GroupMember[] };

export interface ExpenseView extends Expense {
  addedOrder: number;
  changedAt: number | null;
  /** The money the user entered, while the expense needs review (LEDGER-151.1). */
  yours?: SyncMoney;
  /** The earlier expense shown in the possible duplicate block, while this one is marked. */
  duplicateOf?: string;
  /** The assignment as stored, even after the category used for display changes. */
  categorySnapshot: Expense['category'];
  categoryLabel: string;
  group?: Group;
  members: GroupMember[];
  paidByMe: boolean;
  yourPaid: number;
  yourShare: number;
  involved: boolean;
}

/** Undefined until loaded; refresh on navigation and committed expense changes. */
export function useExpenses(
  trashed = false,
  options?: { throwOnError: boolean },
) {
  return useReadExpenses(trashed, options).expenses;
}

/**
 * The expenses as useExpenses returns them and, with each read, `placed`: the IDs of the expenses
 * the user added in New Expense or put back from the trash on this phone since the read before
 * (LEDGER-117.2). Every read brings a new array.
 */
export function useReadExpenses(trashed = false, { throwOnError = true } = {}) {
  const database = useLocalDatabase();
  const { personalSpaceId, personalParticipantId, userId } = useLocalIdentity();
  const focused = useIsFocused();
  const [expenses, setExpenses] = useState<ExpenseView[]>();
  const [categories, setCategories] = useState<Category[]>([]);
  const [groups, setGroups] = useState<GroupWithFormerMembers[]>([]);
  const [placed, setPlaced] = useState<readonly string[]>([]);
  const [error, setError] = useState<unknown>();
  // Kept through the reads that a change of focus starts over, until one read is shown.
  const waiting = useRef<string[]>([]);

  useEffect(() => {
    let active = true;
    let version = 0;
    function refresh(_leftTrash?: ReadonlySet<string>, placedId?: string) {
      if (placedId !== undefined) waiting.current.push(placedId);
      const request = ++version;
      const isCurrent = () => active && request === version;
      void Promise.all([
        listExpensesForCards(database),
        readDuplicateTargets(database),
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
        ([rows, duplicates, categories, groups]) => {
          if (!isCurrent()) return;
          setError(undefined);
          const current = new Map(categories.map((item) => [item.id, item]));
          const selected = rows.filter(
            (expense) => (expense.trashOrder !== undefined) === trashed,
          );
          if (trashed) selected.sort((a, b) => b.trashOrder! - a.trashOrder!);
          setCategories(categories);
          setGroups(groups);
          setPlaced(waiting.current);
          waiting.current = [];
          setExpenses(
            selected.map((expense) => {
              const category = current.get(expense.category.id);
              const cardCategory = category ?? expense.category;
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
              return {
                ...expense,
                // A read-only copy's expenses carry no mark (SYNC-302.1).
                ...(group?.readOnlyCopy && { yours: undefined }),
                duplicateOf: duplicates.get(expense.id),
                categorySnapshot: expense.category,
                category: cardCategory,
                categoryLabel: category?.isArchived
                  ? `${cardCategory.name} (Archived)`
                  : cardCategory.name,
                group,
                members,
                ...participation(expense, personalSpaceId, own),
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
  return { expenses, categories, groups, placed };
}
