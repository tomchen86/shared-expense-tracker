import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { groupAmounts } from '@shared-expense/domain';
import { useLocalDatabase, useLocalIdentity } from '../shell';
import { AddButton } from '../ui/add-button';
import { GroupedSection } from '../ui/grouped-section';
import { HeaderActions } from '../ui/header-actions';
import { useThemeColors } from '../ui/theme';
import { useDisplayLocale } from '../ui/use-display-locale';
import { ExpenseCard, paidBy } from '../ledger/expense-card';
import { PeriodList, useListPeriod } from '../ledger/list-period-ui';
import { useTrashActions } from '../ledger/trash-provider';
import { useReadExpenses } from '../ledger/use-expenses';
import { useReceivedRequests } from '../sharing/received-requests';
import { useSyncNotices } from '../sync/use-sync-notices';
import { groupTotals, yourBalanceLines } from './format-balance';
import { GroupLargeTitle, useLargeTitleScroll } from './group-large-title';
import { GroupSummary } from './group-summary';
import { JoinRequestsButton, ReviewButton } from './review-button';
import { useGroup } from './use-group';
import { useGroupArchive } from './use-group-archive';

export function GroupScreen({ inSettings = false }: { inSettings?: boolean }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useThemeColors();
  const [group, setGroup, pendingRead] = useGroup(id);
  const database = useLocalDatabase();
  const notices = useSyncNotices(database, group?.shared ? id : undefined);
  // Only an unarchived shared ledger has any (SHARING-190.1).
  const asking = useReceivedRequests(database, id).requests.length;
  /** Runs `go` if the group is unarchived, once a read in progress has finished. */
  function whenUnarchived(go: () => void) {
    const read = pendingRead();
    if (read === undefined) {
      if (group && !group.archived) go();
      return;
    }
    void read.then(
      (fresh) => {
        if (fresh && !fresh.archived) go();
      },
      () => undefined,
    );
  }
  const { pending, save } = useGroupArchive();
  const { move } = useTrashActions();
  const { userId } = useLocalIdentity();
  const locale = useDisplayLocale();
  const titleScroll = useLargeTitleScroll();
  const base = inSettings ? '/settings/archived-groups' : '/groups';
  const read = useReadExpenses();
  const expenses = useMemo(
    () => read.expenses?.filter((expense) => expense.spaceId === id),
    [read.expenses, id],
  );
  const periods = useListPeriod(id, expenses, read);
  // Every expense of the group that needs review, whatever the list shows of them, in the
  // order of LEDGER-28.1, which is the order they are read in (GROUPS-107.2).
  const toReview = useMemo(
    () =>
      expenses?.filter((expense) => expense.yours || expense.duplicateOf) ?? [],
    [expenses],
  );
  // Your balance uses every expense (GROUPS-69.4). The total uses every card that passes
  // the dates and the filter (GROUPS-68.6, LEDGER-118.2).
  const amounts = group && expenses ? groupAmounts(expenses, group) : [];
  const total =
    group && periods.shown
      ? groupTotals(groupAmounts(periods.shown, group), locale)
      : '';
  const ownId = group?.members.find((member) => member.userId === userId)?.id;
  const rename = () =>
    whenUnarchived(() =>
      router.navigate({ pathname: `${base}/rename`, params: { id } }),
    );
  const membersAction = {
    label: 'Members',
    onPress: () =>
      router.navigate({ pathname: `${base}/members`, params: { id } }),
  };
  const categoriesAction = {
    label: 'Categories',
    onPress: () =>
      router.navigate({
        pathname: '/manage-categories',
        params: { scopeKind: 'group', spaceId: id },
      }),
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          title: group
            ? titleScroll.scrolledAway
              ? group.name
              : ''
            : 'Group Details',
        }}
      />
      {group && (
        <HeaderActions
          filter={periods.filterAction}
          menu={{
            label: 'Group actions',
            actions: group.archived
              ? [membersAction, categoriesAction]
              : [
                  membersAction,
                  { label: 'Rename Group', onPress: rename },
                  categoriesAction,
                ],
          }}
        />
      )}
      {group !== undefined && (
        <PeriodList
          backSwipe
          groupId={id}
          periods={periods}
          searchExpenses={group ? expenses : undefined}
          scrollEventThrottle={16}
          onScroll={titleScroll.onScroll}
          top={
            <>
              {group && (
                <GroupLargeTitle
                  name={group.name}
                  onLayout={titleScroll.onTitleLayout}
                  onRename={group.archived ? undefined : rename}
                />
              )}
              {notices.lines.map((notice) => (
                <Text
                  key={notice}
                  style={[styles.notice, { color: colors.textMuted }]}
                >
                  {notice}
                </Text>
              ))}
              {toReview.length > 0 && (
                <ReviewButton
                  count={toReview.length}
                  onPress={() =>
                    router.navigate(`${base}/expenses/${toReview[0].id}`)
                  }
                />
              )}
<<<<<<< HEAD
              {asking > 0 && group?.shared && !group.archived && (
                <JoinRequestsButton
                  count={asking}
                  onPress={membersAction.onPress}
=======
              {notices.unapplied > 0 && (
                <ReviewButton
                  unapplied
                  count={notices.unapplied}
                  onPress={() =>
                    router.navigate({
                      pathname: `${base}/unapplied`,
                      params: { id },
                    })
                  }
>>>>>>> b2b5bb7ed7f8216f19bb931fb68a51df19d31bcf
                />
              )}
              {group?.archived && (
                <ArchivedBanner
                  restoring={pending.has(id)}
                  onRestore={() =>
                    void save(id, false, () =>
                      setGroup(
                        (current) => current && { ...current, archived: false },
                      ),
                    )
                  }
                />
              )}
            </>
          }
          total={
            amounts.length > 0
              ? {
                  value: total || '—',
                  accessibilityLabel: `${periods.name}: ${total || 'nothing'}`,
                  onPress: () =>
                    router.navigate({
                      pathname: `${base}/insights`,
                      params: { groupId: id, ...periods.insights },
                    }),
                }
              : undefined
          }
          summary={
            <GroupSummary
              balances={yourBalanceLines(amounts, ownId!, locale)}
              onOpenBalances={() =>
                router.navigate({
                  pathname: `${base}/balances`,
                  params: { id },
                })
              }
            />
          }
          message={
            (!group || expenses?.length === 0) && (
              <Text style={[styles.message, { color: colors.textMuted }]}>
                {group ? 'No expenses in this group yet.' : 'Group not found.'}
              </Text>
            )
          }
          card={(expense) => (
            <ExpenseCard
              expense={expense}
              trailing={paidBy(expense, userId)}
              onPress={() => router.navigate(`${base}/expenses/${expense.id}`)}
              onDelete={group?.archived ? undefined : () => void move(expense)}
            />
          )}
        />
      )}
      {periods.filters}
      {group && !group.archived && (
        <AddButton
          onPress={() =>
            whenUnarchived(() =>
              router.navigate({
                pathname: '/expenses/new',
                params: { groupId: id },
              }),
            )
          }
        />
      )}
    </View>
  );
}

function ArchivedBanner({
  restoring,
  onRestore,
}: {
  restoring: boolean;
  onRestore: () => void;
}) {
  const colors = useThemeColors();
  return (
    <GroupedSection style={styles.banner}>
      <Text style={{ color: colors.text, fontSize: 16 }}>
        Archived group. Expenses and allocations are read-only.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Restore Group"
        accessibilityState={{ disabled: restoring }}
        disabled={restoring}
        onPress={onRestore}
        style={({ pressed }) => [
          styles.restore,
          pressed && { backgroundColor: colors.pressedSurface },
        ]}
      >
        <Text style={{ color: colors.accent, fontSize: 17 }}>
          Restore Group
        </Text>
      </Pressable>
    </GroupedSection>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 112 },
  // Under the large title, on its left edge: the title is pulled 4 points to the left.
  notice: {
    fontSize: 15,
    lineHeight: 20,
    marginLeft: -4,
    marginTop: -8,
    marginBottom: 16,
  },
  banner: { marginBottom: 20, padding: 16 },
  restore: { minHeight: 44, justifyContent: 'center', marginTop: 8 },
  message: { padding: 20, marginTop: 48, textAlign: 'center', fontSize: 16 },
});
