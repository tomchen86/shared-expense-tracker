import { Pressable, StyleSheet, Text } from 'react-native';
import { ReviewIcon } from '../ledger/review-mark';
import { GroupedSection } from '../ui/grouped-section';
import { useThemeColors } from '../ui/theme';

/**
 * The button under a group's title that says how many of its expenses need review, and
 * opens the first (GROUPS-107.2). A screen reader reads the sentence and the hint, not
 * the icon or the chevron.
 */
export function ReviewButton({
  count,
  onPress,
}: {
  count: number;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const label =
    count === 1 ? '1 expense needs review' : `${count} expenses need review`;
  return (
    <GroupedSection style={styles.section}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint="Opens the first one"
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
