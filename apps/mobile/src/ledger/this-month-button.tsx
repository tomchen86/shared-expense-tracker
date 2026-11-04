import { Pressable, StyleSheet, Text } from 'react-native';
import { GroupedSection } from '../ui/grouped-section';
import { useThemeColors } from '../ui/theme';

/** This Month: a line per currency total of this month, as one button (LEDGER-35.2). */
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
        {(totals.length === 0 ? ['—'] : totals).map((total) => (
          <Text key={total} style={[styles.total, { color: colors.text }]}>
            {`This Month: ${total}`}
          </Text>
        ))}
      </Pressable>
    </GroupedSection>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 24 },
  button: { padding: 16 },
  total: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
});
