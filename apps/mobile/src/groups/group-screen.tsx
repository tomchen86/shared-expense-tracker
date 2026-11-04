import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { HeaderActions } from '../ui/header-actions';
import { useThemeColors } from '../ui/theme';
import { useGroup } from './use-group';
import { useGroupArchive } from './use-group-archive';
import { GroupedSection } from '../ui/grouped-section';
import { AddButton } from '../ui/add-button';
import { ExpenseCard } from '../ledger/expense-card';
import { useExpenses } from '../ledger/use-expenses';

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
  const base = inSettings ? '/settings/archived-groups' : '/groups';
  const expenses = useExpenses()?.filter((expense) => expense.spaceId === id);
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: group?.name ?? 'Group Details' }} />
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
                      onPress: () =>
                        whenUnarchived(() =>
                          router.navigate({
                            pathname: `${base}/rename`,
                            params: { id },
                          }),
                        ),
                    },
                  ] as const)),
            ],
          }}
        />
      )}
      {group !== undefined && (
        <ScrollView
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
              />
            ))}
        </ScrollView>
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
  restore: { minHeight: 44, justifyContent: 'center', marginTop: 8 },
  message: { padding: 20, marginTop: 48, textAlign: 'center', fontSize: 16 },
});
