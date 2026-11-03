import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { AddButton } from '../ui/add-button';
import { GroupedSection } from '../ui/grouped-section';
import { useThemeColors } from '../ui/theme';
import { useTabRootBack } from '../ui/use-tab-root-back';
import { SwipeAction } from '../ui/swipe-action';
import { useGroups } from './use-groups';
import { useGroupArchive } from './use-group-archive';
import { useRequireName } from './use-require-name';

export function GroupsScreen() {
  useTabRootBack('/');
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const requireName = useRequireName();
  const [groups, setGroups] = useGroups();
  const { pending, save } = useGroupArchive();
  const [notice, setNotice] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const activeGroups = groups?.filter((group) => !group.archived);

  function archive(id: string) {
    void save(id, true, () => {
      setGroups((current) =>
        current?.map((group) =>
          group.id === id ? { ...group, archived: true } : group,
        ),
      );
      setNotice(true);
      AccessibilityInfo.announceForAccessibility(
        'Group archived · Find it in Settings',
      );
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setNotice(false), 4500);
    });
  }

  return (
    <SafeAreaView
      edges={['left', 'right']}
      style={[styles.screen, { backgroundColor: colors.background }]}
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        {activeGroups?.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textMuted }]}>
            No groups yet. Tap + to create a group.
          </Text>
        ) : (
          activeGroups?.map((group) => (
            <View key={group.id} style={styles.card}>
              <SwipeAction
                label="Archive"
                accessibilityLabel={`Archive ${group.name}`}
                disabled={pending.has(group.id)}
                onPress={() => archive(group.id)}
              >
                <GroupedSection>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${group.name}`}
                    accessibilityActions={
                      pending.has(group.id)
                        ? []
                        : [{ name: 'archive', label: 'Archive group' }]
                    }
                    onAccessibilityAction={(event) => {
                      if (event.nativeEvent.actionName === 'archive')
                        archive(group.id);
                    }}
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
              </SwipeAction>
            </View>
          ))
        )}
      </ScrollView>
      {notice && (
        <GroupedSection style={[styles.notice, { bottom: insets.bottom + 92 }]}>
          <Text style={{ color: colors.text, fontSize: 15 }}>
            Group archived · Find it in Settings
          </Text>
        </GroupedSection>
      )}
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
  notice: { position: 'absolute', left: 20, right: 20, padding: 16 },
  row: { padding: 16, minHeight: 56, justifyContent: 'center' },
  name: { fontSize: 17 },
});
