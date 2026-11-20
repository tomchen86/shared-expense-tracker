import { useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useSegments } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { buildCategoryExpenses, formatCurrency } from '@shared-expense/domain';
import { DateHeading } from '../ledger/dated-cards';
import { ExpenseCard, paidBy } from '../ledger/expense-card';
import { formatExpenseDate } from '../ledger/format-date';
import { monthName, type Dates } from '../ledger/list-period';
import type { ExpenseView } from '../ledger/use-expenses';
import { useLocalIdentity } from '../shell';
import { GroupedSection } from '../ui/grouped-section';
import { useThemeColors } from '../ui/theme';
import { useDisplayLocale } from '../ui/use-display-locale';
import { useInsightsInput } from './use-insights-input';

export type CategoryPeriod = { period: string } | Dates;

export function CategoryExpensesScreen({
  group,
  groupId,
  categoryKey,
  title,
  currency,
  period,
}: {
  group: boolean;
  groupId?: string;
  categoryKey: string;
  title: string;
  currency: string;
  period: CategoryPeriod;
}) {
  const input = useInsightsInput(group, groupId);
  const currencies = useMemo(
    () => input && buildCategoryExpenses({ ...input, ...period }),
    [input, period],
  );
  const colors = useThemeColors();
  const locale = useDisplayLocale();
  const { userId, personalSpaceId } = useLocalIdentity();
  const segments = useSegments();
  const base = segments.includes('settings')
    ? '/settings/archived-groups'
    : group
      ? '/groups'
      : '';
  const label =
    'from' in period
      ? `${formatExpenseDate(period.from, locale)} – ${formatExpenseDate(period.to, locale)}`
      : period.period.length === 4
        ? period.period
        : monthName(period.period);
  const cards =
    currencies
      ?.find((item) => item.currency === currency)
      ?.categories.find((category) => category.key === categoryKey)?.expenses ??
    [];
  const amountOf = (expense: ExpenseView) =>
    group || expense.spaceId === personalSpaceId
      ? expense.amountMinor
      : expense.yourShare;
  const amount =
    currencies &&
    formatCurrency(
      cards.reduce((sum, expense) => sum + amountOf(expense), 0),
      currency,
      locale,
    );
  const count = `${cards.length} ${cards.length === 1 ? 'expense' : 'expenses'}`;

  return (
    <SafeAreaView
      edges={['left', 'right']}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      {/* Clear the Insights route's gesture override to use the iOS default. */}
      <Stack.Screen options={{ title, fullScreenGestureEnabled: undefined }} />
      {input === null ? (
        <Text style={[styles.message, { color: colors.textMuted }]}>
          Group not found.
        </Text>
      ) : input && !currencies ? (
        <View style={styles.message}>
          <Text
            accessibilityRole="header"
            style={[styles.period, { color: colors.text }]}
          >
            Totals Too Large
          </Text>
          <Text style={{ color: colors.textMuted }}>
            These totals are too large to show.
          </Text>
        </View>
      ) : (
        <FlatList
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.content}
          data={cards}
          keyExtractor={(expense) => expense.id}
          ListHeaderComponent={
            <GroupedSection style={styles.summary}>
              <View
                accessible
                accessibilityLabel={
                  amount ? `Spent in ${label} ${amount}. ${count}.` : label
                }
              >
                <Text style={[styles.period, { color: colors.text }]}>
                  {label}
                </Text>
                {amount && (
                  <>
                    <Text style={[styles.amount, { color: colors.text }]}>
                      {amount}
                    </Text>
                    <Text style={[styles.count, { color: colors.textMuted }]}>
                      {count}
                    </Text>
                  </>
                )}
              </View>
            </GroupedSection>
          }
          renderItem={({ item, index }) => (
            <>
              <DateHeading expense={item} previous={cards[index - 1]} />
              <ExpenseCard
                expense={item}
                amountMinor={amountOf(item)}
                trailing={group ? paidBy(item, userId) : undefined}
                onPress={() => router.navigate(`${base}/expenses/${item.id}`)}
              />
            </>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40 },
  summary: { padding: 16, marginBottom: 20 },
  period: { fontSize: 17, fontWeight: '600' },
  amount: { fontSize: 28, fontWeight: '700', marginTop: 4 },
  count: { fontSize: 15, marginTop: 4 },
  message: {
    margin: 20,
    marginTop: 48,
    alignItems: 'center',
    textAlign: 'center',
    gap: 8,
  },
});
