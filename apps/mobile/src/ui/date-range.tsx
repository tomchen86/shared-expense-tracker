import { StyleSheet, Text, View } from 'react-native';
import { DateField } from './date-field';
import { useThemeColors } from './theme';

/** The first and last day of a range side by side, each a date that opens the system's calendar. */
export function DateRange({
  from,
  to,
  maximumDate,
  onChange,
}: {
  /** As YYYY-MM-DD, like `maximumDate`, the latest day either can be. */
  from: string;
  to: string;
  maximumDate: string;
  onChange: (range: { from: string; to: string }) => void;
}) {
  const colors = useThemeColors();
  return (
    <View style={styles.range}>
      <DateField
        bare
        label="From"
        value={from}
        maximumDate={maximumDate}
        onChange={(value) => onChange({ from: value, to })}
      />
      <Text style={[styles.dash, { color: colors.textMuted }]}>–</Text>
      <DateField
        bare
        label="To"
        value={to}
        maximumDate={maximumDate}
        onChange={(value) => onChange({ from, to: value })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  range: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  dash: { fontSize: 17 },
});
