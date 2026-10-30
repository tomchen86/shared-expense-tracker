import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useLocalDatabase } from '../shell';
import { AddButton } from '../ui/add-button';
import { GroupedSection } from '../ui/grouped-section';
import { useThemeColors } from '../ui/theme';
import { useTabRootBack } from '../ui/use-tab-root-back';
import { listGroups, type Group } from './index';
import { useRequireName } from './use-require-name';

export function GroupsScreen() {
  useTabRootBack('/');
  const database = useLocalDatabase();
  const colors = useThemeColors();
  const requireName = useRequireName();
  const [groups, setGroups] = useState<Group[]>([]);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void listGroups(database)
        .then((rows) => {
          if (active) setGroups(rows);
        })
        .catch(() => undefined);
      return () => {
        active = false;
      };
    }, [database]),
  );

  return (
    <SafeAreaView
      edges={['left', 'right']}
      style={[styles.screen, { backgroundColor: colors.background }]}
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        {groups.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textMuted }]}>
            No groups yet. Tap + to create a group.
          </Text>
        ) : (
          groups.map((group) => (
            <GroupedSection key={group.id} style={styles.card}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open ${group.name}`}
                onPress={() => router.push(`/groups/${group.id}`)}
                style={({ pressed }) => [
                  styles.row,
                  pressed && { backgroundColor: colors.pressedSurface },
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={[styles.name, { color: colors.text }]}
                >
                  {group.name}
                </Text>
              </Pressable>
            </GroupedSection>
          ))
        )}
      </ScrollView>
      <AddButton
        label="Add group"
        onPress={() => {
          if (!requireName()) router.navigate('/groups/new');
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 112 },
  empty: { textAlign: 'center', marginTop: 48, fontSize: 16 },
  card: { marginBottom: 12 },
  row: { padding: 16, minHeight: 56, justifyContent: 'center' },
  name: { fontSize: 17 },
});
