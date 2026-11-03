import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { HeaderActions } from '../ui/header-actions';
import { useThemeColors } from '../ui/theme';
import { useGroup } from './use-group';
import { useGroupArchive } from './use-group-archive';
import { GroupedSection } from '../ui/grouped-section';

export function GroupScreen({ inSettings = false }: { inSettings?: boolean }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useThemeColors();
  const [group, setGroup] = useGroup(id);
  const { pending, save } = useGroupArchive();
  const base = inSettings ? '/settings/archived-groups' : '/groups';
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
                        router.navigate({
                          pathname: `${base}/rename`,
                          params: { id },
                        }),
                    },
                  ] as const)),
            ],
          }}
        />
      )}
      {group !== undefined && (
        <ScrollView contentInsetAdjustmentBehavior="automatic">
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
          <Text style={[styles.message, { color: colors.textMuted }]}>
            {group ? 'No expenses in this group yet.' : 'Group not found.'}
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { margin: 20, padding: 16 },
  restore: { minHeight: 44, justifyContent: 'center', marginTop: 8 },
  message: { padding: 20, marginTop: 48, textAlign: 'center', fontSize: 16 },
});
