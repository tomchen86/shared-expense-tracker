import { Pressable, StyleSheet } from 'react-native';
import { FadeText } from '../ui/fade-text';
import { GroupedSection } from '../ui/grouped-section';
import { useThemeColors } from '../ui/theme';

/** This Month: one line with the total of each currency this month, as a button (LEDGER-35.3). */
export function ThisMonthButton({
  totals,
  onPress,
}: {
  totals: string[];
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <GroupedSection style={styles.section}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`View expense insights. ${totals.length === 0 ? 'Nothing spent this month' : `Spent this month ${totals.join(', ')}`}.`}
        onPress={onPress}
        style={({ pressed }) => [
          styles.button,
          pressed && { backgroundColor: colors.pressedSurface },
        ]}
      >
        <FadeText style={[styles.total, { color: colors.text }]}>
          {`This Month: ${totals.length === 0 ? '—' : totals.join(', ')}`}
        </FadeText>
      </Pressable>
    </GroupedSection>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 24 },
  button: { padding: 16 },
  total: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
});
