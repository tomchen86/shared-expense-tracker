import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { groupAmounts } from '@shared-expense/domain';
import { useLocalIdentity } from '../shell';
import { useExpenses } from '../ledger/use-expenses';
import { AddButton } from '../ui/add-button';
import { BottomNotice } from '../ui/bottom-notice';
import { useThemeColors } from '../ui/theme';
import { useTabRootBack } from '../ui/use-tab-root-back';
import { SwipeScrollView } from '../ui/swipe-action';
import { useDisplayLocale } from '../ui/use-display-locale';
import { groupCardLines } from './format-balance';
import { GroupCard } from './group-card';
import { useGroups } from './use-groups';
import { useGroupArchive } from './use-group-archive';
import { useRequireName } from './use-require-name';

export function GroupsScreen() {
  useTabRootBack('/');
  const colors = useThemeColors();
  const requireName = useRequireName();
  const [groups, setGroups] = useGroups();
  const expenses = useExpenses();
  const { userId } = useLocalIdentity();
  const locale = useDisplayLocale();
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
      <SwipeScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        {activeGroups?.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textMuted }]}>
            No groups yet. Tap + to create a group.
          </Text>
        ) : (
          activeGroups?.map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              lines={
                expenses
                  ? groupCardLines(
                      groupAmounts(expenses, group),
                      group.members.find((member) => member.userId === userId)!
                        .id,
                      locale,
                    )
                  : ['', '']
              }
              archiving={pending.has(group.id)}
              onPress={() => router.push(`/groups/${group.id}`)}
              onArchive={() => archive(group.id)}
            />
          ))
        )}
      </SwipeScrollView>
      {notice && (
        <BottomNotice message="Group archived · Find it in Settings" />
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
});
