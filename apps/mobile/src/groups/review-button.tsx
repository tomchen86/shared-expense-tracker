import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { ReviewIcon } from '../ledger/review-mark';
import { GroupedSection } from '../ui/grouped-section';
import { useThemeColors } from '../ui/theme';

/**
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
 * first (GROUPS-107.1).
 */
export function ReviewButton({
  count,
  onPress,
}: {
  count: number;
  onPress: () => void;
}) {
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
