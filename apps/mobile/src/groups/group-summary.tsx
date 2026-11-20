import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FadeText } from '../ui/fade-text';
import { GroupedSection } from '../ui/grouped-section';
import { useThemeColors } from '../ui/theme';

/** Your balance in a group, which opens Balances (GROUPS-69.4). */
export function GroupSummary({
  balances,
  onOpenBalances,
}: {
  balances: string[];
  onOpenBalances: () => void;
}) {
  const colors = useThemeColors();
  return (
    <GroupedSection>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={balances.join(', ')}
        accessibilityHint="Opens Balances"
        onPress={onOpenBalances}
        style={({ pressed }) => [
          styles.row,
          pressed && { backgroundColor: colors.pressedSurface },
        ]}
      >
        <View style={styles.lines}>
          {balances.map((line) => (
            <FadeText
              key={line}
              style={[styles.balance, { color: colors.text }]}
            >
              {line}
            </FadeText>
          ))}
        </View>
        <Text accessible={false} style={{ color: colors.textMuted }}>
          ›
        </Text>
      </Pressable>
    </GroupedSection>
  );
}

const styles = StyleSheet.create({
  row: {
    padding: 16,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  lines: { flex: 1 },
  balance: { fontSize: 17 },
});
