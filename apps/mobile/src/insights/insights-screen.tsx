import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Alert,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useIsFocused } from 'expo-router/react-navigation';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  buildInsights,
  formatCurrency,
  type InsightCategory,
  type InsightChartPreference,
  type InsightContext,
  type InsightCurrency,
  type InsightExpense,
} from '@shared-expense/domain';
import { listCategories } from '../categories';
import { listGroups } from '../groups';
import { listExpenses } from '../ledger';
import { subscribeToExpenses } from '../ledger/expenses';
import {
  useChartType,
  useLocalDatabase,
  useLocalIdentity,
  useSaveChartType,
} from '../shell';
import { CategoryChart } from '../ui/category-chart';
import { GroupedSection } from '../ui/grouped-section';
import { HeaderActions, type HeaderChoice } from '../ui/header-actions';
import { PeriodPicker } from '../ui/period-picker';
import { SegmentedControl } from '../ui/segmented-control';
import { useThemeColors } from '../ui/theme';
import { useDisplayLocale } from '../ui/use-display-locale';

type Mode = 'month' | 'year';

const AGGREGATIONS = [
  { label: 'Month', value: 'month' },
  { label: 'Year', value: 'year' },
] as const;

interface InsightsInput {
  expenses: InsightExpense[];
  categories: InsightCategory[];
  context: InsightContext;
}

/**
 * What buildInsights needs, read again on focus and after expense changes;
 * undefined until read, null when the group is not found.
 */
function useInsightsInput(group: boolean, groupId: string | undefined) {
  const database = useLocalDatabase();
  const { userId, personalSpaceId, personalParticipantId } = useLocalIdentity();
  const focused = useIsFocused();
  const [input, setInput] = useState<InsightsInput | null>();
  const [error, setError] = useState<unknown>();

  useEffect(() => {
    let active = true;
    let version = 0;
    function refresh() {
      const request = ++version;
      void Promise.all([
        listExpenses(database),
        listCategories(database),
        listGroups(database),
      ]).then(
        ([rows, categories, groups]) => {
          if (!active || request !== version) return;
          if (group && !groups.some(({ id }) => id === groupId)) {
            setInput(null);
            return;
          }
          // Your space first, then each group in the order they were created
          // (INSIGHTS-17.1); archived ones too.
          const spaces = group
            ? [groupId]
            : [personalSpaceId, ...groups.map(({ id }) => id)];
          setInput({
            expenses: rows
              .filter(({ trashOrder }) => trashOrder === undefined)
              .map((expense) => ({
                amountMinor: expense.amountMinor,
                currency: expense.currency,
                date: expense.date,
                spaceId: expense.spaceId,
                shares: expense.shares,
                categoryId: expense.category.id,
                categoryName: expense.category.name,
                categorySnapshot: {
                  name: expense.category.name,
                  color: expense.category.color,
                },
              })),
            categories: spaces.flatMap((space) =>
              categories.filter(({ spaceId }) => spaceId === space),
            ),
            context:
              group && groupId
                ? { kind: 'group', groupId }
                : {
                    kind: 'personal',
                    userId,
                    personalSpaceId,
                    personalParticipantId,
                    participants: groups.flatMap(({ members }) =>
                      members.map((member) => ({
                        id: member.id,
                        userId: member.userId ?? undefined,
                      })),
                    ),
                  },
          });
        },
        (failure: unknown) => {
          if (active && request === version) setError(failure);
        },
      );
    }
    const unsubscribe = subscribeToExpenses(database, refresh);
    refresh();
    return () => {
      active = false;
      unsubscribe();
    };
  }, [
    database,
    group,
    groupId,
    userId,
    personalSpaceId,
    personalParticipantId,
    focused,
  ]);

  if (error) throw error;
  return input;
}

/** The personal Insights, or with `group` the Insights of the `groupId` search param. */
export function InsightsScreen({ group = false }: { group?: boolean }) {
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();
  const colors = useThemeColors();
  const locale = useDisplayLocale();
  const input = useInsightsInput(group, groupId);
  const savedChartType = useChartType();
  const saveChartType = useSaveChartType();
  const [chosenChartType, setChosenChartType] =
    useState<InsightChartPreference>();
  const saving = useRef(false);
  const chartType = chosenChartType ?? savedChartType;
  const [mode, setMode] = useState<Mode>('month');
  const [key, setKey] = useState<string>();

  const insights = useMemo(
    () => input && buildInsights({ ...input, chartPreference: chartType }),
    [input, chartType],
  );
  const periods = insights
    ? mode === 'month'
      ? insights.months
      : insights.years
    : [];
  // A period left without expenses gives way to the latest one of its year,
  // else the latest one (INSIGHTS-40.1); none is chosen yet on opening (INSIGHTS-21.1).
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

  const steps = useRef<{ previous?: string; next?: string }>({});
  steps.current = { previous: previous?.key, next: next?.key };
  const swipe = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 2,
      onPanResponderRelease: (_, { dx }) => {
        const to =
          dx > 40
            ? steps.current.previous
            : dx < -40
              ? steps.current.next
              : undefined;
        if (to) setKey(to);
      },
    }),
  ).current;

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
    icon: SymbolViewProps['name'],
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: to === undefined }}
      disabled={to === undefined}
      onPress={() => to && setKey(to)}
      style={styles.step}
    >
      <SymbolView
        name={icon}
        tintColor={to === undefined ? colors.placeholder : colors.accent}
        size={22}
      />
    </Pressable>
  );

  let body: ReactNode = null;
  if (input === null)
    body = (
      <Text style={[styles.messageHint, { color: colors.textMuted }]}>
        Group not found.
      </Text>
    );
  else if (input && !insights)
    body = message('Totals Too Large', 'These totals are too large to show.');
  else if (insights && !selected)
    body = message(
      'No expenses yet',
      'Add an expense to see spending insights.',
    );
  else if (selected)
    body = (
      <>
        <SegmentedControl
          label="Period aggregation"
          options={AGGREGATIONS}
          value={mode}
          onChange={(chosen) => {
            if (chosen === mode) return;
            // The year of the month, or the latest month of the year (INSIGHTS-29.1).
            setMode(chosen);
            setKey(selected.key.slice(0, 4));
          }}
        />
        <View style={styles.periods}>
          {periods.length > 1 &&
            step('Previous period', previous?.key, {
              ios: 'chevron.left',
              android: 'chevron_left',
            })}
          <View {...swipe.panHandlers} style={styles.period}>
            <PeriodPicker
              kind={mode}
              periods={periods}
              selectedKey={selected.key}
              onSelect={setKey}
            />
          </View>
          {periods.length > 1 &&
            step('Next period', next?.key, {
              ios: 'chevron.right',
              android: 'chevron_right',
            })}
        </View>
        {selected.currencies.map((currency) => {
          const total = money(currency.totalMinor, currency.currency);
          const comparison = comparisonOf(currency);
          return (
            <GroupedSection key={currency.currency} style={styles.card}>
              <View
                accessible
                accessibilityLabel={`Total spent ${total}.${comparison ? ` ${comparison}` : ''}`}
              >
                <Text style={[styles.cardLabel, { color: colors.textMuted }]}>
                  TOTAL SPENT
                </Text>
                <Text style={[styles.total, { color: colors.text }]}>
                  {total}
                </Text>
                {comparison && (
                  <Text
                    style={[styles.comparison, { color: colors.textMuted }]}
                  >
                    {comparison}
                  </Text>
                )}
              </View>
            </GroupedSection>
          );
        })}
        {selected.currencies.map((currency) => (
          <View key={currency.currency} style={styles.currency}>
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
                  <View
                    key={row}
                    accessible
                    accessibilityLabel={`${category.name}, ${amount}, ${decimal.format(category.percent)} percent`}
                    style={styles.row}
                  >
                    <View
                      style={[styles.dot, { backgroundColor: category.color }]}
                    />
                    <View style={styles.rowText}>
                      <Text
                        numberOfLines={1}
                        style={[styles.rowName, { color: colors.text }]}
                      >
                        {category.name}
                      </Text>
                      <Text
                        style={[styles.rowAmount, { color: colors.textMuted }]}
                      >
                        {`${amount} · ${percentage.format(category.percent / 100)}`}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </GroupedSection>
          </View>
        ))}
      </>
    );

  return (
    <SafeAreaView
      edges={['left', 'right']}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <HeaderActions
        choices={
          selected && {
            label: 'Chart visualization',
            title: 'Visualization',
            icon: { ios: 'chart.bar.xaxis', android: 'bar_chart' },
            options: [
              chartOption('auto', 'Auto'),
              chartOption('donut', 'Donut'),
              chartOption('bar', 'Bar'),
            ],
          }
        }
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        {body}
      </ScrollView>
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
  period: { flex: 1, alignItems: 'center' },
  step: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: { padding: 16, marginBottom: 12 },
  cardLabel: { fontSize: 13, fontWeight: '600' },
  total: { fontSize: 28, fontWeight: '700', marginTop: 4 },
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
