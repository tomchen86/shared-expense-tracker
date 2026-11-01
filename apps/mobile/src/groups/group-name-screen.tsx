import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useLocalDatabase } from '../shell';
import { GroupedSection } from '../ui/grouped-section';
import { HeaderActions } from '../ui/header-actions';
import { useThemeColors } from '../ui/theme';
import {
  addGroupMember,
  memberNameKey,
  MemberNameExistsError,
  renameGroup,
  renameGroupMember,
  type Group,
  type GroupMember,
} from './index';
import { useGroup } from './use-group';

type Form = 'Add Member' | 'Rename Member' | 'Rename Group';
const ALREADY_EXISTS = 'A member with this name already exists.';

export function AddMemberScreen() {
  return <GroupNameScreen form="Add Member" />;
}

export function RenameMemberScreen() {
  return <GroupNameScreen form="Rename Member" />;
}

export function RenameGroupScreen() {
  return <GroupNameScreen form="Rename Group" />;
}

function GroupNameScreen({ form }: { form: Form }) {
  const { id, memberId } = useLocalSearchParams<{
    id: string;
    memberId?: string;
  }>();
  const [group] = useGroup(id);
  const colors = useThemeColors();
  if (!group)
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  return (
    <NameEditor
      form={form}
      group={group}
      member={group.members.find((member) => member.id === memberId)}
    />
  );
}

function NameEditor({
  form,
  group,
  member,
}: {
  form: Form;
  group: Group & { formerMembers: GroupMember[] };
  member?: GroupMember;
}) {
  const database = useLocalDatabase();
  const colors = useThemeColors();
  const isGroup = form === 'Rename Group';
  const adding = form === 'Add Member';
  const initialName = adding ? '' : isGroup ? group.name : member!.name;
  const [name, setName] = useState(initialName);
  const [duplicate, setDuplicate] = useState(false);
  const [status, setStatus] = useState<'editing' | 'saving' | 'saved'>(
    'editing',
  );
  const submitting = useRef(false);
  const saving = status === 'saving';
  const canSave = !!name.trim() && (adding || name.trim() !== initialName);
  usePreventRemove(saving, () => {});
  useEffect(() => {
    if (status === 'saved') router.back();
  }, [status]);

  function showDuplicate() {
    setDuplicate(true);
    AccessibilityInfo.announceForAccessibility(ALREADY_EXISTS);
  }

  async function save(former?: GroupMember) {
    if (submitting.current) return;
    submitting.current = true;
    setStatus('saving');
    try {
      if (isGroup) await renameGroup(database, group.id, name);
      else if (adding)
        await addGroupMember(database, group.id, name, former?.id);
      else await renameGroupMember(database, group.id, member!.id, name);
      setStatus('saved');
    } catch (error) {
      submitting.current = false;
      setStatus('editing');
      if (error instanceof MemberNameExistsError) showDuplicate();
      else
        Alert.alert(
          adding ? 'Unable to Add Member' : `Unable to ${form}`,
          isGroup
            ? 'Your group could not be saved. Please try again.'
            : 'The member could not be saved. Please try again.',
        );
    }
  }

  function submit() {
    if (submitting.current || !canSave) return;
    if (
      !isGroup &&
      group.members.some(
        (candidate) =>
          candidate.id !== member?.id &&
          memberNameKey(candidate.name) === memberNameKey(name),
      )
    ) {
      showDuplicate();
      return;
    }
    const former = adding
      ? group.formerMembers.find(
          (candidate) => memberNameKey(candidate.name) === memberNameKey(name),
        )
      : undefined;
    if (former) {
      Alert.alert(
        `Add ${former.name} Back?`,
        `${former.name} was removed from this group before. Adding them back reconnects their past payments and shares.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Add Back', onPress: () => void save(former) },
        ],
        { cancelable: true },
      );
    } else void save();
  }

  return (
    <View
      collapsable={false}
      style={[styles.screen, { backgroundColor: colors.background }]}
    >
      <Stack.Screen options={{ gestureEnabled: !saving }} />
      <HeaderActions
        cancel={{
          label: 'Cancel',
          disabled: saving,
          onPress: () => {
            if (!submitting.current) router.back();
          },
        }}
        confirm={{
          label: adding ? 'Add' : 'Save',
          disabled: saving || !canSave,
          onPress: submit,
        }}
      />
      <ScrollView
        automaticallyAdjustKeyboardInsets
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        {isGroup && (
          <Text
            accessibilityRole="header"
            style={[styles.sectionLabel, { color: colors.textMuted }]}
          >
            GROUP DETAILS
          </Text>
        )}
        <GroupedSection>
          <View style={styles.row}>
            {isGroup && (
              <Text style={[styles.label, { color: colors.text }]}>Name</Text>
            )}
            <TextInput
              accessibilityLabel={isGroup ? 'Group name' : 'Member name'}
              autoCapitalize="words"
              autoCorrect={false}
              autoFocus
              editable={!saving}
              onChangeText={(value) => {
                if (!submitting.current) {
                  setName(value);
                  setDuplicate(false);
                }
              }}
              onSubmitEditing={submit}
              placeholder={isGroup ? 'Group name' : 'Enter member name'}
              placeholderTextColor={colors.placeholder}
              returnKeyType="done"
              style={[
                styles.input,
                isGroup && styles.groupInput,
                { color: colors.text },
              ]}
              value={name}
            />
          </View>
        </GroupedSection>
        {duplicate && (
          <Text style={[styles.error, { color: colors.error }]}>
            {ALREADY_EXISTS}
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32 },
  sectionLabel: { fontSize: 13, marginHorizontal: 16, marginBottom: 8 },
  row: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  label: { fontSize: 17 },
  input: { minHeight: 44, flex: 1, fontSize: 17 },
  groupInput: { marginLeft: 16, textAlign: 'right' },
  error: { fontSize: 15, marginHorizontal: 16, marginTop: 8 },
});
