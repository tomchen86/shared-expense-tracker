import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
} from 'react-native';
import { FadeText } from '../ui/fade-text';
import { GroupedSection } from '../ui/grouped-section';
import { useThemeColors } from '../ui/theme';

/** Group Total, which opens Insights, and your balance, which opens Balances. */
export function GroupSummary({
  total,
  balances,
  onOpenInsights,
  onOpenBalances,
}: {
  total: string;
  balances: string[];
  onOpenInsights: () => void;
  onOpenBalances: () => void;
}) {
  const colors = useThemeColors();
  const rowStyle: PressableProps['style'] = ({ pressed }) => [
    styles.row,
    pressed && { backgroundColor: colors.pressedSurface },
  ];
  const chevron = (
    <Text accessible={false} style={{ color: colors.textMuted }}>
      ›
    </Text>
  );
  return (
    <GroupedSection style={styles.section}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={total}
        accessibilityHint="Opens Insights"
        onPress={onOpenInsights}
        style={rowStyle}
      >
        <FadeText
          containerStyle={styles.lines}
          style={[styles.total, { color: colors.text }]}
        >
          {total}
        </FadeText>
        {chevron}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={balances.join(', ')}
        accessibilityHint="Opens Balances"
        onPress={onOpenBalances}
        style={rowStyle}
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
        {chevron}
      </Pressable>
    </GroupedSection>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 20 },
  row: {
    padding: 16,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  lines: { flex: 1 },
  total: { fontSize: 18, fontWeight: '700' },
  balance: { fontSize: 17 },
});
