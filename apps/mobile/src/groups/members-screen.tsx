import { useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useLocalDatabase, useLocalIdentity } from '../shell';
import { showActionMenu } from '../ui/action-menu';
import { GroupedSection } from '../ui/grouped-section';
import { HeaderActions } from '../ui/header-actions';
import { useThemeColors } from '../ui/theme';
import { removeGroupMember, type GroupMember } from './index';
import { useGroup } from './use-group';

export function MembersScreen({
  inSettings = false,
}: {
  inSettings?: boolean;
}) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const database = useLocalDatabase();
  const identity = useLocalIdentity();
  const colors = useThemeColors();
  const [group, setGroup] = useGroup(id);
  const base = inSettings ? '/settings/archived-groups' : '/groups';
  const [removing, setRemoving] = useState(false);
  const removingRef = useRef(false);
  usePreventRemove(removing, () => {});

  async function remove(member: GroupMember) {
    if (removingRef.current) return;
    removingRef.current = true;
    setRemoving(true);
    try {
      await removeGroupMember(database, id, member.id);
      setGroup(
        (current) =>
          current && {
            ...current,
            members: current.members.filter(
              (candidate) => candidate.id !== member.id,
            ),
          },
      );
    } catch {
      Alert.alert(
        'Unable to Remove Member',
        'The member could not be removed. Please try again.',
      );
    } finally {
      removingRef.current = false;
      setRemoving(false);
    }
  }

  function openMenu(member: GroupMember) {
    if (removingRef.current) return;
    const own = member.userId === identity.userId;
    showActionMenu({
      title: member.name,
      message: own
        ? undefined
        : 'If removed, their historical payments and shares will be retained.',
      actions: [
        {
          label: 'Rename',
          onPress: () => {
            if (!removingRef.current)
              router.navigate({
                pathname: `${base}/rename-member`,
                params: { id, memberId: member.id },
              });
          },
        },
        ...(own
          ? []
          : [
              {
                label: 'Remove from Group',
                destructive: true,
                onPress: () => void remove(member),
              },
            ]),
      ],
    });
  }

  return (
    <View
      collapsable={false}
      style={[styles.screen, { backgroundColor: colors.background }]}
    >
      <Stack.Screen options={{ gestureEnabled: !removing }} />
      <HeaderActions
        cancel={{
          label: 'Close',
          disabled: removing,
          onPress: () => {
            if (!removingRef.current) router.back();
          },
        }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        <GroupedSection>
          {group?.members.map((member) => {
            const label =
              member.name + (member.userId === identity.userId ? ' (You)' : '');
            if (group.archived)
              return (
                <View key={member.id} style={styles.row}>
                  <Text style={[styles.name, { color: colors.text }]}>
                    {label}
                  </Text>
                </View>
              );
            return (
              <Pressable
                key={member.id}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ disabled: removing }}
                disabled={removing}
                onPress={() => openMenu(member)}
                style={({ pressed }) => [
                  styles.row,
                  pressed && { backgroundColor: colors.pressedSurface },
                ]}
              >
                <Text style={[styles.name, { color: colors.text }]}>
                  {label}
                </Text>
                <Text accessible={false} style={{ color: colors.textMuted }}>
                  ›
                </Text>
              </Pressable>
            );
          })}
          {group && !group.archived && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add Member"
              accessibilityState={{ disabled: removing }}
              disabled={removing}
              onPress={() => {
                if (!removingRef.current)
                  router.navigate({
                    pathname: `${base}/add-member`,
                    params: { id },
                  });
              }}
              style={({ pressed }) => [
                styles.row,
                pressed && { backgroundColor: colors.pressedSurface },
              ]}
            >
              <Text style={[styles.name, { color: colors.accent }]}>
                Add Member
              </Text>
            </Pressable>
          )}
        </GroupedSection>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 20, paddingBottom: 32 },
  row: {
    minHeight: 54,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  name: { flex: 1, fontSize: 17 },
});
