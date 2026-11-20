import { useMemo } from 'react';
import type { InsightContext } from '@shared-expense/domain';
import { useReadExpenses } from '../ledger/use-expenses';
import { useLocalIdentity } from '../shell';

/** Both Insights screens use the same card data and category order for a given read. */
export function useInsightsInput(group: boolean, groupId?: string) {
  const { expenses, groups, categories } = useReadExpenses();
  const { userId, personalSpaceId, personalParticipantId } = useLocalIdentity();
  return useMemo(() => {
    if (!expenses) return undefined;
    const ledger = group ? groups.find(({ id }) => id === groupId) : undefined;
    if (group && !ledger) return null;
    // Your space first, then the groups in creation order, including archived groups.
    const spaces = ledger
      ? [ledger.id]
      : [personalSpaceId, ...groups.map(({ id }) => id)];
    const context: InsightContext = ledger
      ? {
          kind: 'group',
          groupId: ledger.id,
          ownMemberId: ledger.members.find((member) => member.userId === userId)
            ?.id,
        }
      : {
          kind: 'personal',
          userId,
          personalSpaceId,
          personalParticipantId,
          participants: groups.flatMap(({ members }) =>
            members.map(({ id, userId }) => ({
              id,
              userId: userId ?? undefined,
            })),
          ),
        };
    return {
      expenses: expenses.map((expense) => ({
        ...expense,
        categoryId: expense.categorySnapshot.id,
        categoryName: expense.categorySnapshot.name,
      })),
      categories: spaces.flatMap((space) =>
        categories.filter(({ spaceId }) => spaceId === space),
      ),
      context,
    };
  }, [
    expenses,
    groups,
    categories,
    group,
    groupId,
    userId,
    personalSpaceId,
    personalParticipantId,
  ]);
}
