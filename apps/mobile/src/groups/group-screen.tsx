import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
} from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { formatCurrency, groupAmounts } from '@shared-expense/domain';
import { useLocalIdentity } from '../shell';
import { HeaderActions } from '../ui/header-actions';
import { SwipeScrollView } from '../ui/swipe-action';
import { TitleButton } from '../ui/title-button';
import { useThemeColors } from '../ui/theme';
import { useGroup } from './use-group';
import { useGroupArchive } from './use-group-archive';
import { GroupedSection } from '../ui/grouped-section';
import { AddButton } from '../ui/add-button';
import { useDisplayLocale } from '../ui/use-display-locale';
import { ExpenseCard } from '../ledger/expense-card';
import { useExpenses } from '../ledger/use-expenses';
import { useTrashActions } from '../ledger/trash-provider';
import { formatBalance } from './format-balance';

export function GroupScreen({ inSettings = false }: { inSettings?: boolean }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useThemeColors();
  const [group, setGroup, pendingRead] = useGroup(id);
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
  const base = inSettings ? '/settings/archived-groups' : '/groups';
  const expenses = useExpenses()?.filter((expense) => expense.spaceId === id);
  const amounts = group && expenses ? groupAmounts(expenses, group) : [];
  const totals = amounts.map(
    ({ currency, total }) =>
      `Group Total: ${formatCurrency(total, currency, locale)}`,
  );
  const ownId = group?.members.find((member) => member.userId === userId)?.id;
  const balances = amounts
    .filter(({ members }) => members.get(ownId!)!.net !== 0n)
    .map(({ currency, members }) =>
      formatBalance(members.get(ownId!)!.net, currency, locale, true),
    );
  if (amounts.length > 0 && balances.length === 0) balances.push('Settled up');
  const rename = () =>
    whenUnarchived(() =>
      router.navigate({ pathname: `${base}/rename`, params: { id } }),
    );
  const rowStyle: PressableProps['style'] = ({ pressed }) => [
    styles.row,
    pressed && { backgroundColor: colors.pressedSurface },
  ];
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          title: group?.name ?? 'Group Details',
          headerTitle:
            group && !group.archived
              ? () => (
                  <TitleButton
                    title={group.name}
                    hint="Renames the group"
                    onPress={rename}
                  />
                )
              : undefined,
        }}
      />
      {group && (
        <HeaderActions
          menu={{
            label: 'Group actions',
            actions: [
              {
                label: 'Members',
                onPress: () =>
                  router.navigate({
                    pathname: `${base}/members`,
                    params: { id },
                  }),
              },
              ...(group.archived
                ? ([] as const)
                : ([
                    {
                      label: 'Rename Group',
                      onPress: rename,
                    },
                  ] as const)),
            ],
          }}
        />
      )}
      {group !== undefined && (
        <SwipeScrollView
          backSwipe
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.content}
        >
          {group?.archived && (
            <GroupedSection style={styles.banner}>
              <Text style={{ color: colors.text, fontSize: 16 }}>
                Archived group. Expenses and allocations are read-only.
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Restore Group"
                accessibilityState={{ disabled: pending.has(id) }}
                disabled={pending.has(id)}
                onPress={() =>
                  void save(id, false, () =>
                    setGroup(
                      (current) => current && { ...current, archived: false },
                    ),
                  )
                }
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
          )}
          {amounts.length > 0 && (
            <GroupedSection style={styles.totals}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={totals.join(', ')}
                accessibilityHint="Opens Insights"
                onPress={() =>
                  router.navigate({
                    pathname: `${base}/insights`,
                    params: { groupId: id },
                  })
                }
                style={rowStyle}
              >
                <View style={{ flex: 1 }}>
                  {totals.map((line) => (
                    <Text
                      key={line}
                      style={[styles.total, { color: colors.text }]}
                    >
                      {line}
                    </Text>
                  ))}
                </View>
                <Text accessible={false} style={{ color: colors.textMuted }}>
                  ›
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={balances.join(', ')}
                accessibilityHint="Opens Balances"
                onPress={() =>
                  router.navigate({
                    pathname: `${base}/balances`,
                    params: { id },
                  })
                }
                style={rowStyle}
              >
                <View style={{ flex: 1 }}>
                  {balances.map((line) => (
                    <Text
                      key={line}
                      style={{ color: colors.text, fontSize: 17 }}
                    >
                      {line}
                    </Text>
                  ))}
                </View>
                <Text accessible={false} style={{ color: colors.textMuted }}>
                  ›
                </Text>
              </Pressable>
            </GroupedSection>
          )}
          {(!group || expenses?.length === 0) && (
            <Text style={[styles.message, { color: colors.textMuted }]}>
              {group ? 'No expenses in this group yet.' : 'Group not found.'}
            </Text>
          )}
          {group &&
            expenses?.map((expense) => (
              <ExpenseCard
                key={expense.id}
                expense={{ ...expense, group }}
                amountMinor={expense.amountMinor}
                onPress={() =>
                  router.navigate(`${base}/expenses/${expense.id}`)
                }
                onDelete={group.archived ? undefined : () => void move(expense)}
              />
            ))}
        </SwipeScrollView>
      )}
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

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 112 },
  banner: { marginBottom: 20, padding: 16 },
  totals: { marginBottom: 20 },
  total: { fontSize: 18, fontWeight: '700' },
  row: {
    padding: 16,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  restore: { minHeight: 44, justifyContent: 'center', marginTop: 8 },
  message: { padding: 20, marginTop: 48, textAlign: 'center', fontSize: 16 },
});
