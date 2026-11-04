import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { CategoryChart } from '../../src/ui/category-chart';

// The donut is a ring of 120 ticks; each category gets ticks in proportion to
// its amount, at least one, and together they always fill the ring.

const category = (color: string, amountMinor: number) => ({
  name: color,
  color,
  amountMinor,
  percent: 0,
});

/** How many of the ring's ticks each color fills. */
function ticksByColor() {
  const counts: Record<string, number> = {};
  for (const view of screen.container.queryAll(
    (node) => typeof node.type === 'string',
  )) {
    const style = StyleSheet.flatten(view.props.style) ?? {};
    if (
      style.position === 'absolute' &&
      typeof style.backgroundColor === 'string'
    )
      counts[style.backgroundColor] = (counts[style.backgroundColor] ?? 0) + 1;
  }
  return counts;
}

test('fills the whole ring when rounding leaves a tick over', async () => {
  // 3:3:1 rounds to 51 + 51 + 17 = 119 ticks.
  await render(
    <CategoryChart
      kind="donut"
      categories={[
        category('#D81B60', 300),
        category('#1E88E5', 300),
        category('#FBC02D', 100),
      ]}
    />,
  );

  const counts = ticksByColor();
  expect(Object.values(counts).reduce((sum, count) => sum + count, 0)).toBe(
    120,
  );
  expect(counts['#FBC02D']).toBe(17);
});

test('gives a tiny category one tick and still fills the ring', async () => {
  await render(
    <CategoryChart
      kind="donut"
      categories={[category('#D81B60', 100000), category('#1E88E5', 1)]}
    />,
  );

  expect(ticksByColor()).toEqual({ '#D81B60': 119, '#1E88E5': 1 });
});
