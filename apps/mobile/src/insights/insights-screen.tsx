import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import {
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  buildCategoryExpenses,
  buildInsights,
  buildRangeInsights,
  currencyDecimals,
  formatCurrency,
  isLocalDate,
  type InsightChartPreference,
  type InsightCurrency,
} from '@shared-expense/domain';
import { datesOf, today, type Dates } from '../ledger/list-period';
import { useChartType, useSaveChartType } from '../shell';
import { CategoryChart } from '../ui/category-chart';
import { DateRange } from '../ui/date-range';
import { FadeText } from '../ui/fade-text';
import { GroupedSection } from '../ui/grouped-section';
import { HeaderActions, type HeaderChoice } from '../ui/header-actions';
import { PeriodPicker } from '../ui/period-picker';
import { SegmentedControl } from '../ui/segmented-control';
import { useSidewaysDragIsNoPress } from '../ui/swipe-action';
import { useThemeColors } from '../ui/theme';
import { useDisplayLocale } from '../ui/use-display-locale';
import { usePeriodSwipe } from '../ui/use-period-swipe';
import {
  CategoryExpensesScreen,
  type CategoryPeriod,
} from './category-expenses-screen';
import { useInsightsInput } from './use-insights-input';

/** Insights looks at one month, one year, or with `custom` the days from From to To (INSIGHTS-46.1). */
type Mode = 'month' | 'year' | 'custom';

const AGGREGATIONS = [
  { label: 'Month', value: 'month' },
  { label: 'Year', value: 'year' },
  { label: 'Custom', value: 'custom' },
] as const;

/** The first and last day of a month (YYYY-MM) or a year (YYYY), the last no later than `day`. */
function rangeOf(key: string, day: string): Dates {
  const { from, to } = datesOf(
    { period: { kind: key.length === 4 ? 'year' : 'month', key } },
    day,
  )!;
  return { from, to: to < day ? to : day };
}

/**
 * Valid dates take precedence over a month or year. The overview caps its initial dates at
 * today. A category keeps the dates it was opened with even if the phone's day changes.
 */
function startOf(
  { period, from, to }: { period?: unknown; from?: unknown; to?: unknown },
  day?: string,
): { mode: Mode; key?: string; range?: Dates } {
  const earlier = (date: string) =>
    day !== undefined && date > day ? day : date;
  if (
    typeof from === 'string' &&
    typeof to === 'string' &&
    isLocalDate(from) &&
    isLocalDate(to)
  )
    return { mode: 'custom', range: { from: earlier(from), to: earlier(to) } };
  if (typeof period === 'string' && isLocalDate(`${period}-01`))
    return { mode: 'month', key: period };
  if (typeof period === 'string' && /^\d{4}$/.test(period))
    return { mode: 'year', key: period };
  return { mode: 'month' };
}

function orderedDates(range: Dates) {
  return range.from <= range.to ? range : { from: range.to, to: range.from };
}

/** One TOTAL SPENT, then for each currency its total, your share on a group's Insights, and the comparison. */
function TotalCard({
  currencies,
  money,
  comparisonOf,
}: {
  currencies: InsightCurrency[];
  money: (amountMinor: number, currency: string) => string;
  comparisonOf: (currency: InsightCurrency) => string | undefined;
}) {
  const colors = useThemeColors();
  return (
    <GroupedSection style={styles.card}>
      <Text style={[styles.cardLabel, { color: colors.textMuted }]}>
        TOTAL SPENT
      </Text>
      {currencies.map((currency, row) => {
        const total = money(currency.totalMinor, currency.currency);
        const yourShare =
          currency.yourShareMinor === undefined
            ? undefined
            : money(currency.yourShareMinor, currency.currency);
        const comparison = comparisonOf(currency);
        return (
          <View
            key={currency.currency}
            accessible
            accessibilityLabel={`Total spent ${total}.${yourShare ? ` Your share ${yourShare}.` : ''}${comparison ? ` ${comparison}` : ''}`}
            style={row > 0 && styles.nextTotal}
          >
            <Text style={[styles.total, { color: colors.text }]}>{total}</Text>
            {yourShare && (
              <Text style={[styles.yourShare, { color: colors.text }]}>
                {`Your share: ${yourShare}`}
              </Text>
            )}
            {comparison && (
              <Text style={[styles.comparison, { color: colors.textMuted }]}>
                {comparison}
              </Text>
            )}
          </View>
        );
      })}
    </GroupedSection>
  );
}

/** The personal Insights, or with `group` the Insights of the `groupId` search param. */
export function InsightsScreen({ group = false }: { group?: boolean }) {
  const params = useLocalSearchParams<{
    groupId?: string;
    period?: string;
    from?: string;
    to?: string;
    categoryKey?: string;
    categoryName?: string;
    currency?: string;
  }>();
  const { categoryKey, categoryName, currency, groupId } = params;
  if (
    typeof categoryKey === 'string' &&
    typeof categoryName === 'string' &&
    typeof currency === 'string' &&
    currencyDecimals(currency) !== undefined
  ) {
    const { key, range } = startOf(params);
    const period = range
      ? orderedDates(range)
      : key
        ? { period: key }
        : undefined;
    if (period)
      return (
        <CategoryExpensesScreen
          group={group}
          groupId={groupId}
          categoryKey={categoryKey}
          title={categoryName}
          currency={currency}
          period={period}
        />
      );
  }
  return <InsightsOverview group={group} groupId={groupId} params={params} />;
}

function InsightsOverview({
  group,
  groupId,
  params,
}: {
  group: boolean;
  groupId?: string;
  params: { period?: string; from?: string; to?: string };
}) {
  const colors = useThemeColors();
  const locale = useDisplayLocale();
  const input = useInsightsInput(group, groupId);
  const savedChartType = useChartType();
  const saveChartType = useSaveChartType();
  const [chosenChartType, setChosenChartType] =
    useState<InsightChartPreference>();
  const saving = useRef(false);
  const chartType = chosenChartType ?? savedChartType;
  const day = today();
  // What the URL names, as the screen opens (INSIGHTS-45.1).
  const [start] = useState(() => startOf(params, day));
  const [mode, setMode] = useState(start.mode);
  const [key, setKey] = useState(start.key);
  // The custom range as it was chosen; From can be the later day.
  const [range, setRange] = useState(
    start.range ?? rangeOf(day.slice(0, 7), day),
  );
  const { from: first, to: last } = orderedDates(range);

  const insights = useMemo(
    () => input && buildInsights({ ...input, chartPreference: chartType }),
    [input, chartType],
  );
  // The currencies of the custom range; undefined when the domain refuses it (INSIGHTS-44.1).
  const custom = useMemo(
    () =>
      input && mode === 'custom'
        ? buildRangeInsights({
            ...input,
            chartPreference: chartType,
            from: first,
            to: last,
          })
        : undefined,
    [input, mode, chartType, first, last],
  );
  const periods =
    insights && mode !== 'custom'
      ? mode === 'month'
        ? insights.months
        : insights.years
      : [];
  // A period left without expenses, or one the URL names that has none, gives way to the latest
  // one of its year, else the latest one (INSIGHTS-40.1, INSIGHTS-45.1); with no period named,
  // none is chosen yet on opening (INSIGHTS-21.2).
  const selected =
    periods.find((period) => period.key === key) ??
    periods
      .filter((period) => period.key.slice(0, 4) === key?.slice(0, 4))
      .at(-1) ??
    periods.at(-1);
  if (selected && selected.key !== key) setKey(selected.key);
  const index = selected ? periods.indexOf(selected) : -1;
  const previous = periods[index - 1];
  const next = periods[index + 1];

  const swipe = usePeriodSwipe({
    selectedKey: selected?.key,
    previous: previous?.key,
    next: next?.key,
    enabled: periods.length > 1,
    onSelect: setKey,
  });

  const dragIsNoPress = useSidewaysDragIsNoPress();

  async function chooseChartType(chosen: InsightChartPreference) {
    if (saving.current || chosen === chartType) return;
    saving.current = true;
    setChosenChartType(chosen);
    try {
      await saveChartType(chosen);
    } catch {
      Alert.alert(
        'Unable to Save Settings',
        'Your settings could not be saved. Please try again.',
      );
    } finally {
      saving.current = false;
      setChosenChartType(undefined);
    }
  }
  const chartOption = (
    value: InsightChartPreference,
    label: string,
  ): HeaderChoice => ({
    label,
    selected: value === chartType,
    onPress: () => void chooseChartType(value),
  });

  const money = (amountMinor: number, currency: string) =>
    formatCurrency(amountMinor, currency, locale);
  const decimal = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const percentage = new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  function comparisonOf({ currency, comparison }: InsightCurrency) {
    if (!comparison || !previous) return undefined;
    const { deltaMinor, deltaPercent } = comparison;
    if (deltaPercent === null) return `No spending in ${previous.label}.`;
    if (deltaMinor === 0) return `Same as ${previous.label}.`;
    return `${money(Math.abs(deltaMinor), currency)} ${deltaMinor > 0 ? 'more' : 'less'} than ${previous.label}, ${decimal.format(Math.abs(deltaPercent))} percent.`;
  }

  const message = (title: string, hint: string) => (
    <View style={styles.message}>
      <Text
        accessibilityRole="header"
        style={[styles.messageTitle, { color: colors.text }]}
      >
        {title}
      </Text>
      <Text style={[styles.messageHint, { color: colors.textMuted }]}>
        {hint}
      </Text>
    </View>
  );
  const step = (
    label: string,
    to: string | undefined,
    side: -1 | 1,
    icon: SymbolViewProps['name'],
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: to === undefined }}
      disabled={to === undefined}
      onPress={() => to && swipe.step(to, side)}
      style={styles.step}
    >
      <SymbolView
        name={icon}
        tintColor={to === undefined ? colors.placeholder : colors.text}
        size={22}
        weight="semibold"
      />
    </Pressable>
  );

  /** Resolve the pressed position against the very data that drew the rows. Only its key travels. */
  function openCategory(
    currency: string,
    row: number,
    categoryName: string,
    period: CategoryPeriod,
  ) {
    if (!input) return;
    const currencies = buildCategoryExpenses({ ...input, ...period });
    const category = currencies?.find((item) => item.currency === currency)
      ?.categories[row];
    if (!category) return;
    router.push(
      {
        pathname: './insights',
        // Local search params decode once more than the URL parser. Preserve literal percent escapes.
        params: {
          groupId,
          ...period,
          currency,
          categoryKey: encodeURIComponent(category.key),
          categoryName: encodeURIComponent(categoryName),
        },
      },
      {
        dangerouslySingular: (_, params) => JSON.stringify(params),
      },
    );
  }

  /** The totals and the categories of the currencies of one period. */
  const page = (currencies: InsightCurrency[], period: CategoryPeriod) => (
    <>
      <TotalCard
        currencies={currencies}
        money={money}
        comparisonOf={comparisonOf}
      />
      {currencies.map((currency) => (
        <View
          key={currency.currency}
          style={styles.currency}
          {...(periods.length > 1 ? {} : dragIsNoPress)}
        >
          <Text
            accessibilityRole="header"
            style={[styles.heading, { color: colors.textMuted }]}
          >
            {`${currency.currency} categories`}
          </Text>
          <GroupedSection style={styles.categories}>
            <CategoryChart {...currency.chart} />
            {currency.categories.map((category, row) => {
              const amount = money(category.amountMinor, currency.currency);
              return (
                <Pressable
                  key={row}
                  accessibilityRole="button"
                  accessibilityHint="Shows these expenses"
                  onPress={() =>
                    openCategory(currency.currency, row, category.name, period)
                  }
                  accessibilityLabel={`${category.name}, ${amount}, ${decimal.format(category.percent)} percent`}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: colors.pressedSurface },
                  ]}
                >
                  <View
                    accessible={false}
                    style={[styles.dot, { backgroundColor: category.color }]}
                  />
                  <View style={styles.rowText}>
                    <FadeText style={[styles.rowName, { color: colors.text }]}>
                      {category.name}
                    </FadeText>
                    <Text
                      style={[styles.rowAmount, { color: colors.textMuted }]}
                    >
                      {`${amount} · ${percentage.format(category.percent / 100)}`}
                    </Text>
                  </View>
                  <Text accessible={false} style={{ color: colors.textMuted }}>
                    ›
                  </Text>
                </Pressable>
              );
            })}
          </GroupedSection>
        </View>
      ))}
    </>
  );

  const tooLarge = message(
    'Totals Too Large',
    'These totals are too large to show.',
  );
  // Whether the totals of a period show, which the chart menu is for.
  const charted =
    mode === 'custom'
      ? !!insights?.months.length && !!custom?.length
      : selected !== undefined;
  let body: ReactNode = null;
  if (input === null)
    body = (
      <Text style={[styles.messageHint, { color: colors.textMuted }]}>
        Group not found.
      </Text>
    );
  else if (input && !insights) body = tooLarge;
  else if (insights?.months.length === 0)
    body = message(
      'No expenses yet',
      'Add an expense to see spending insights.',
    );
  else if (insights && (selected || mode === 'custom'))
    body = (
      <>
        <SegmentedControl
          label="Period aggregation"
          options={AGGREGATIONS}
          value={mode}
          onChange={(chosen) => {
            if (chosen === mode) return;
            setMode(chosen);
            // Custom starts on the dates of the period that was showing (INSIGHTS-46.1). Back
            // from it, the month or year its dates end in; otherwise the year of the month, or
            // the latest month of the year (INSIGHTS-29.1).
            if (chosen === 'custom') setRange(rangeOf(selected!.key, day));
            else if (mode === 'custom')
              setKey(last.slice(0, chosen === 'month' ? 7 : 4));
            else setKey(selected!.key.slice(0, 4));
          }}
        />
        {mode === 'custom' ? (
          <>
            <View style={styles.periods}>
              <DateRange
                from={range.from}
                to={range.to}
                maximumDate={day}
                onChange={setRange}
              />
            </View>
            {custom === undefined
              ? tooLarge
              : custom.length === 0
                ? message(
                    'No Expenses in These Dates',
                    'Choose other dates to see spending insights.',
                  )
                : page(custom, { from: first, to: last })}
          </>
        ) : (
          selected && (
            <GestureDetector gesture={swipe.pan}>
              <View collapsable={false}>
                <View style={styles.periods}>
                  {periods.length > 1 &&
                    step('Previous period', previous?.key, -1, {
                      ios: 'chevron.left',
                      android: 'chevron_left',
                    })}
                  <View style={styles.period}>
                    <Animated.View style={swipe.nameStyle}>
                      <PeriodPicker
                        kind={mode}
                        periods={periods}
                        selectedKey={selected.key}
                        onSelect={setKey}
                      />
                    </Animated.View>
                  </View>
                  {periods.length > 1 &&
                    step('Next period', next?.key, 1, {
                      ios: 'chevron.right',
                      android: 'chevron_right',
                    })}
                </View>
                <Animated.View style={swipe.pageStyle}>
                  {page(selected.currencies, { period: selected.key })}
                </Animated.View>
              </View>
            </GestureDetector>
          )
        )}
      </>
    );

  return (
    <SafeAreaView
      edges={['left', 'right']}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <HeaderActions
        choices={
          charted
            ? {
                label: 'Chart visualization',
                title: 'Visualization',
                icon: { ios: 'chart.bar.xaxis', android: 'bar_chart' },
                options: [
                  chartOption('auto', 'Auto'),
                  chartOption('donut', 'Donut'),
                  chartOption('bar', 'Bar'),
                ],
              }
            : undefined
        }
      />
      <GestureHandlerRootView style={{ flex: 1 }}>
        <GestureDetector gesture={swipe.scrollGesture}>
          <ScrollView
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={styles.content}
          >
            {body}
          </ScrollView>
        </GestureDetector>
      </GestureHandlerRootView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },
  message: { marginTop: 48, alignItems: 'center', gap: 8 },
  messageTitle: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  messageHint: { fontSize: 16, textAlign: 'center' },
  periods: {
    marginTop: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  period: { flex: 1, alignItems: 'center', overflow: 'hidden' },
  step: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: { padding: 16, marginBottom: 12 },
  cardLabel: { fontSize: 13, fontWeight: '600' },
  total: { fontSize: 28, fontWeight: '700', marginTop: 4 },
  nextTotal: { marginTop: 12 },
  yourShare: { fontSize: 17, fontWeight: '600', marginTop: 2 },
  comparison: { fontSize: 15, marginTop: 4 },
  currency: { marginTop: 20 },
  heading: { fontSize: 13, marginLeft: 16, marginBottom: 8 },
  categories: { paddingHorizontal: 16, paddingBottom: 8 },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
  rowText: { flex: 1 },
  rowName: { fontSize: 17 },
  rowAmount: { fontSize: 15, marginTop: 2 },
});
