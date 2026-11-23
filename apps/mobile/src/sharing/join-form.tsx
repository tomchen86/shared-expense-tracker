import { useState } from 'react';
import {
  AccessibilityInfo,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import { MAX_SHARED_GROUP_MEMBERS } from '@shared-expense/domain';
import { memberNameKey } from '../groups';
import { GroupedSection } from '../ui/grouped-section';
import { InviteAction } from '../ui/invite-action';
import { materialSymbolFrame } from '../ui/material-symbol-frame';
import { useThemeColors } from '../ui/theme';
import type { JoinCard } from './join-invite';

const duplicateName = 'A member with this name already exists.';
const newMember = -1;

export function JoinForm({
  card,
  initialName,
  preparing,
  onSend,
}: {
  card: JoinCard;
  initialName: string;
  preparing?: boolean;
  onSend: (name: string, memberId: string | null) => void;
}) {
  const colors = useThemeColors();
  const [name, setName] = useState(initialName);
  const [duplicate, setDuplicate] = useState(false);
  const atLimit = card.members.length >= MAX_SHARED_GROUP_MEMBERS;
  const [selected, select] = useState<number | undefined>(() => {
    const match = card.members.findIndex(
      (member) =>
        !member.hasDevice &&
        memberNameKey(member.name) === memberNameKey(initialName),
    );
    return match !== -1 ? match : atLimit ? undefined : newMember;
  });
  const text = [styles.text, { color: colors.text }];
  const secondary = [styles.text, { color: colors.textMuted }];
  // Keep the entered name and selection mounted until the draft can be stored.
  if (preparing)
    return (
      <Text style={[text, { textAlign: 'center' }]}>Sending request…</Text>
    );

  function row(label: string, index: number) {
    const checked = selected === index;
    return (
      <Pressable
        key={index}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: checked }}
        style={({ pressed }) => [
          styles.row,
          pressed && { backgroundColor: colors.pressedSurface },
        ]}
        onPress={() => {
          if (!checked) setDuplicate(false);
          select(index);
        }}
      >
        <Text style={[text, styles.label]}>{label}</Text>
        {checked && (
          <SymbolView
            name={{ ios: 'checkmark', android: 'check' }}
            size={20}
            style={materialSymbolFrame}
            tintColor={colors.accent}
          />
        )}
      </Pressable>
    );
  }
  function submit() {
    if (!name.trim() || selected === undefined) return;
    if (
      selected === newMember &&
      card.members.some(
        (member) => memberNameKey(member.name) === memberNameKey(name),
      )
    ) {
      setDuplicate(true);
      AccessibilityInfo.announceForAccessibility(duplicateName);
      return;
    }
    onSend(
      name.trim(),
      selected === newMember ? null : card.members[selected].id,
    );
  }
  return (
    <View style={styles.content}>
      <Text
        accessibilityRole="header"
        style={[styles.title, { color: colors.text }]}
      >
        {card.name}
      </Text>
      {atLimit && card.members.every((member) => member.hasDevice) ? (
        <Text style={secondary}>
          This group is full. A shared group can have up to 20 members.
        </Text>
      ) : (
        <>
          <GroupedSection>
            <TextInput
              accessibilityLabel="Your name"
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="done"
              placeholder="Enter your name"
              placeholderTextColor={colors.placeholder}
              value={name}
              onChangeText={(value) => {
                setDuplicate(false);
                setName(value);
              }}
              style={[styles.input, text]}
            />
          </GroupedSection>
          {duplicate && (
            <Text style={[styles.text, { color: colors.error }]}>
              {duplicateName}
            </Text>
          )}
          <Text accessibilityRole="header" style={text}>
            Join as
          </Text>
          <GroupedSection>
            {!atLimit && row('New Member', newMember)}
            {card.members.map((member, index) =>
              member.hasDevice ? (
                <View key={index} style={[styles.row, styles.joinedRow]}>
                  <Text style={text}>{member.name}</Text>
                  <Text style={secondary}>Already joined</Text>
                </View>
              ) : (
                row(member.name, index)
              ),
            )}
          </GroupedSection>
          {atLimit && (
            <Text style={secondary}>
              A shared group can have up to 20 members. You can join as one of
              the members above.
            </Text>
          )}
          <Text style={secondary}>
            A member of this group has to approve your request.
          </Text>
          <InviteAction
            label="Send Request"
            disabled={!name.trim() || selected === undefined}
            onPress={submit}
          />
        </>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  content: { gap: 12 },
  text: { fontSize: 17 },
  title: { fontSize: 22, fontWeight: '600' },
  input: { minHeight: 48, paddingHorizontal: 16 },
  row: {
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  joinedRow: { flexWrap: 'wrap', justifyContent: 'space-between' },
  label: { flex: 1 },
});
