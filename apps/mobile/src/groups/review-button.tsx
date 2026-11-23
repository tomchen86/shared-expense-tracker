import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { ReviewIcon } from '../ledger/review-mark';
import { GroupedSection } from '../ui/grouped-section';
import { useThemeColors } from '../ui/theme';

/**
<<<<<<< HEAD
 * A button under a group's title that says what waits for the person, and leads there. A
 * screen reader reads the sentence and the hint, not the icon or the chevron.
 */
function NoticeButton({
  label,
  hint,
  icon,
  onPress,
}: {
  label: string;
  hint: string;
  icon?: ReactNode;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <GroupedSection style={styles.section}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={hint}
        onPress={onPress}
        style={({ pressed }) => [
          styles.button,
          pressed && { backgroundColor: colors.pressedSurface },
        ]}
      >
        {icon}
        <Text style={[styles.text, { color: colors.text }]}>{label}</Text>
        <Text accessible={false} style={{ color: colors.textMuted }}>
          ›
        </Text>
      </Pressable>
    </GroupedSection>
  );
}

/**
 * The button that says how many of the group's expenses need review, and opens the
 * first (GROUPS-107.2).
=======
 * Each count under a group's title has a spoken label and hint (GROUPS-107.2, GROUPS-170.1).
>>>>>>> b2b5bb7ed7f8216f19bb931fb68a51df19d31bcf
 */
export function ReviewButton({
  count,
  unapplied = false,
  onPress,
}: {
  count: number;
  unapplied?: boolean;
  onPress: () => void;
}) {
<<<<<<< HEAD
  return (
    <NoticeButton
      label={
        count === 1 ? '1 expense needs review' : `${count} expenses need review`
      }
      hint="Opens the first one"
      icon={<ReviewIcon size={18} />}
      onPress={onPress}
    />
  );
}

/**
 * The button that says how many people have asked to join the shared ledger, and opens
 * its Members (GROUPS-130.1).
 */
export function JoinRequestsButton({
  count,
  onPress,
}: {
  count: number;
  onPress: () => void;
}) {
  return (
    <NoticeButton
      label={
        count === 1 ? '1 person wants to join' : `${count} people want to join`
      }
      hint="Opens Members"
      onPress={onPress}
    />
=======
  const colors = useThemeColors();
  const label = unapplied
    ? count === 1
      ? "1 change wasn't applied"
      : `${count} changes weren't applied`
    : count === 1
      ? '1 expense needs review'
      : `${count} expenses need review`;
  return (
    <GroupedSection style={styles.section}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={unapplied ? 'Opens the list' : 'Opens the first one'}
        onPress={onPress}
        style={({ pressed }) => [
          styles.button,
          pressed && { backgroundColor: colors.pressedSurface },
        ]}
      >
        <ReviewIcon size={18} />
        <Text style={[styles.text, { color: colors.text }]}>{label}</Text>
        <Text accessible={false} style={{ color: colors.textMuted }}>
          ›
        </Text>
      </Pressable>
    </GroupedSection>
>>>>>>> b2b5bb7ed7f8216f19bb931fb68a51df19d31bcf
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 20 },
  button: {
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  text: { flex: 1, fontSize: 16 },
});
