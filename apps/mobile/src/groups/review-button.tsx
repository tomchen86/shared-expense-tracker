import { Pressable, StyleSheet, Text } from 'react-native';
import { ReviewIcon } from '../ledger/review-mark';
import { GroupedSection } from '../ui/grouped-section';
import { useThemeColors } from '../ui/theme';

/**
 * Each count under a group's title has a spoken label and hint (GROUPS-107.2, GROUPS-170.1).
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
