import { useRef, useState, type ComponentRef } from 'react';
import {
  AccessibilityInfo,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useLocalDatabase, useLocalIdentity } from '../shell';
import { showActionMenu } from '../ui/action-menu';
import { GroupedSection } from '../ui/grouped-section';
import { HeaderActions } from '../ui/header-actions';
import { useThemeColors } from '../ui/theme';
import {
  addGroupMember,
  listGroups,
  memberNameKey,
  MemberNameExistsError,
  removeGroupMember,
  type GroupMember,
} from './index';
import { useGroup } from './use-group';

const ALREADY_EXISTS = 'A member with this name already exists.';

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
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [duplicate, setDuplicate] = useState(false);
  const field = useRef<ComponentRef<typeof TextInput>>(null);
  usePreventRemove(busy, () => {});

  function showDuplicate() {
    setDuplicate(true);
    AccessibilityInfo.announceForAccessibility(ALREADY_EXISTS);
  }

  async function add(former?: GroupMember) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await addGroupMember(database, id, name, former?.id);
      const updated = (await listGroups(database)).find(
        (item) => item.id === id,
      )!;
      setGroup(
        (current) =>
          current && {
            ...current,
            members: updated.members,
            formerMembers: current.formerMembers.filter(
              (member) => member.id !== former?.id,
            ),
          },
      );
      setName('');
      setDuplicate(false);
      field.current?.focus();
    } catch (error) {
      if (error instanceof MemberNameExistsError) showDuplicate();
      else
        Alert.alert(
          'Unable to Add Member',
          'The member could not be saved. Please try again.',
        );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function submit() {
    if (busyRef.current || !group) return;
    if (!name.trim()) {
      setAdding(false);
      setName('');
      setDuplicate(false);
      return;
    }
    if (
      group.members.some(
        (member) => memberNameKey(member.name) === memberNameKey(name),
      )
    ) {
      showDuplicate();
      return;
    }
    const former = group.formerMembers.find(
      (member) => memberNameKey(member.name) === memberNameKey(name),
    );
    if (former) {
      Alert.alert(
        `Add ${former.name} Back?`,
        `${former.name} was removed from this group before. Adding them back reconnects their past payments and shares.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Add Back', onPress: () => void add(former) },
        ],
        { cancelable: true },
      );
    } else void add();
  }

  async function remove(member: GroupMember) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await removeGroupMember(database, id, member.id);
      setGroup(
        (current) =>
          current && {
            ...current,
            members: current.members.filter(
              (candidate) => candidate.id !== member.id,
            ),
            formerMembers: [member, ...current.formerMembers],
          },
      );
    } catch {
      Alert.alert(
        'Unable to Remove Member',
        'The member could not be removed. Please try again.',
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function openMenu(member: GroupMember) {
    if (busyRef.current) return;
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
            if (!busyRef.current)
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
      <Stack.Screen options={{ gestureEnabled: !busy }} />
      <HeaderActions
        cancel={{
          label: 'Close',
          disabled: busy,
          onPress: () => {
            if (!busyRef.current) router.back();
          },
        }}
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
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
                accessibilityState={{ disabled: busy }}
                disabled={busy}
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
          {group &&
            !group.archived &&
            (adding ? (
              <View>
                <TextInput
                  ref={field}
                  accessibilityLabel="Member name"
                  placeholder="Enter member name"
                  placeholderTextColor={colors.textMuted}
                  value={name}
                  autoFocus
                  autoCapitalize="words"
                  autoCorrect={false}
                  returnKeyType="done"
                  submitBehavior="submit"
                  onChangeText={(value) => {
                    if (!busyRef.current) {
                      setName(value);
                      setDuplicate(false);
                    }
                  }}
                  onSubmitEditing={submit}
                  style={[styles.input, { color: colors.text }]}
                />
                {duplicate && (
                  <Text style={[styles.error, { color: colors.error }]}>
                    {ALREADY_EXISTS}
                  </Text>
                )}
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add Member"
                accessibilityState={{ disabled: busy }}
                disabled={busy}
                onPress={() => {
                  if (!busyRef.current) setAdding(true);
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
            ))}
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
  input: { minHeight: 54, paddingHorizontal: 16, fontSize: 17 },
  error: { fontSize: 15, marginHorizontal: 16, marginBottom: 12 },
});
