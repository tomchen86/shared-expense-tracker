import { StyleSheet, View } from 'react-native';
import type { InsightCurrency } from '@shared-expense/domain';
import { useThemeColors } from './theme';

/** A currency's chart as the domain package chose it (INSIGHTS-10.1, INSIGHTS-11.1). */
export type CategoryChartProps = InsightCurrency['chart'];

const RING = 120;
const RADIUS = 64;

/** Draws a currency's chart, hidden from screen readers (INSIGHTS-24.1, INSIGHTS-25.1). */
export function CategoryChart({ kind, categories }: CategoryChartProps) {
  const colors = useThemeColors();
  const largest = Math.max(...categories.map((item) => item.amountMinor));
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.chart}
    >
      {kind === 'donut' ? (
        <View style={styles.ring}>
          {ringColors(categories).map((color, index) => (
            <View
              key={index}
              style={[
                styles.tick,
                {
                  backgroundColor: color,
                  transform: [
                    { rotate: `${(index * 360) / RING}deg` },
                    { translateY: -RADIUS },
                  ],
                },
              ]}
            />
          ))}
        </View>
      ) : (
        categories.map((item, index) => (
          <View
            key={index}
            style={[styles.track, { backgroundColor: colors.segmentedTrack }]}
          >
            <View
              style={[
                styles.fill,
                {
                  backgroundColor: item.color,
                  width: `${kind === 'progress' ? item.percent : (item.amountMinor / largest) * 100}%`,
                },
              ]}
            />
          </View>
        ))
      )}
    </View>
  );
}

/**
 * The color of each of the ring's RING ticks: every category gets ticks in
 * proportion to its amount, and at least one however small it is.
 */
function ringColors(categories: CategoryChartProps['categories']) {
  const total = categories.reduce((sum, item) => sum + item.amountMinor, 0);
  const counts = categories.map((item) =>
    Math.max(1, Math.round((item.amountMinor / total) * RING)),
  );
  // Rounding and the minimum can miss RING either way; the largest absorbs it.
  const largest = counts.indexOf(Math.max(...counts));
  counts[largest] += RING - counts.reduce((sum, count) => sum + count, 0);
  return categories.flatMap((item, index) =>
    Array.from({ length: counts[index] }, () => item.color),
  );
}

const styles = StyleSheet.create({
  chart: { paddingVertical: 12, gap: 8 },
  ring: {
    alignSelf: 'center',
    width: RADIUS * 2 + 20,
    height: RADIUS * 2 + 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tick: { position: 'absolute', width: 5, height: 20, borderRadius: 1 },
  track: { height: 12, borderRadius: 6, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 6 },
});
