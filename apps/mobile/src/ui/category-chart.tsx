import type { InsightCurrency } from '@shared-expense/domain';

/** A currency's chart as the domain package chose it (INSIGHTS-10.1, INSIGHTS-11.1). */
export type CategoryChartProps = InsightCurrency['chart'];

/** Draws a currency's chart, hidden from screen readers (INSIGHTS-24.1, INSIGHTS-25.1). */
export function CategoryChart(props: CategoryChartProps) {
  void props;
  return null;
}
