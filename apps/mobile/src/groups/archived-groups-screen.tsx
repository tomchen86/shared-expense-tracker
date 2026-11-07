import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { FadeText } from '../ui/fade-text';
import { GroupedSection } from '../ui/grouped-section';
import { useThemeColors } from '../ui/theme';
import { useGroups } from './use-groups';
import { useGroupArchive } from './use-group-archive';

export function ArchivedGroupsScreen() {
  const colors = useThemeColors();
  const [groups, setGroups] = useGroups();
  const { pending, save } = useGroupArchive();
  const archived = groups?.filter((group) => group.archived);
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
    >
      {archived?.length === 0 && (
        <Text style={[styles.empty, { color: colors.textMuted }]}>
          No archived groups.
        </Text>
      )}
      {archived?.map((group) => (
        <View key={group.id} style={styles.card}>
          <GroupedSection>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open ${group.name}`}
              onPress={() =>
                router.push(`/settings/archived-groups/${group.id}`)
              }
              style={({ pressed }) => [
                styles.row,
                pressed && { backgroundColor: colors.pressedSurface },
              ]}
            >
              <FadeText
                style={{ fontSize: 18, fontWeight: '700', color: colors.text }}
              >
                {group.name}
              </FadeText>
              <Text
                style={{ marginTop: 8, fontSize: 15, color: colors.textMuted }}
              >
                Archived group
              </Text>
            </Pressable>
          </GroupedSection>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Restore ${group.name}`}
            accessibilityState={{ disabled: pending.has(group.id) }}
            disabled={pending.has(group.id)}
            onPress={() =>
              void save(group.id, false, () =>
                setGroups((current) =>
                  current?.map((item) =>
                    item.id === group.id ? { ...item, archived: false } : item,
                  ),
                ),
              )
            }
            style={({ pressed }) => [
              styles.restore,
              pressed && { backgroundColor: colors.pressedSurface },
            ]}
          >
            <Text style={{ fontSize: 17, color: colors.accent }}>Restore</Text>
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 32 },
  empty: { textAlign: 'center', marginTop: 48, fontSize: 16 },
  card: { marginBottom: 12 },
  row: { padding: 16 },
  restore: {
    alignSelf: 'flex-end',
    minHeight: 44,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: 12,
  },
});
