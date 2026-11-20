import { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatCurrency } from '@shared-expense/domain';
import { AddButton } from '../ui/add-button';
import { HeaderActions } from '../ui/header-actions';
import { useThemeColors } from '../ui/theme';
import { useDisplayLocale } from '../ui/use-display-locale';
import { ExpenseCard } from './expense-card';
import { PeriodList, useListPeriod } from './list-period-ui';
import { formatItemCount } from './list-search';
import { useTrashActions } from './trash-provider';
import { useReadExpenses } from './use-expenses';

export function ExpensesScreen() {
  const colors = useThemeColors();
  const locale = useDisplayLocale();
  const read = useReadExpenses();
  const expenses = useMemo(
    () => read.expenses?.filter((expense) => expense.involved),
    [read.expenses],
  );
  const { move } = useTrashActions();
  const periods = useListPeriod(undefined, expenses, read);
  // The total includes every matching card in the period, including those outside the viewport
  // (LEDGER-35.6, LEDGER-118.2).
  const cards = periods.shown ?? [];
  const totals = new Map<string, bigint>();
  for (const expense of cards) {
    totals.set(
      expense.currency,
      (totals.get(expense.currency) ?? 0n) + BigInt(expense.yourShare),
    );
  }
  const amounts = [...totals.keys()]
    .sort()
    .map((currency) => formatCurrency(totals.get(currency)!, currency, locale))
    .join(', ');
  // All Time shows a count until a filter narrows it to a set of amounts.
  const count = formatItemCount(cards.length, locale);
  const allTime = periods.option === 'all' && !periods.filter.active;
  const spent = amounts
    ? `Spent in ${periods.name} ${amounts}`
    : `Nothing spent in ${periods.name}`;
  return (
    <SafeAreaView
      edges={['left', 'right']}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <HeaderActions filter={periods.filterAction} />
      <PeriodList
        periods={periods}
        searchExpenses={expenses}
        total={
          expenses && {
            value: allTime ? count : amounts || '—',
            plain: allTime,
            accessibilityLabel: `View expense insights. ${allTime ? count : spent}.`,
            onPress: () =>
              router.navigate({
                pathname: '/insights',
                params: periods.insights,
              }),
          }
        }
        message={
          expenses?.length === 0 && (
            <Text style={[styles.empty, { color: colors.textMuted }]}>
              No expenses to display. Add a personal expense or get involved in
              a group expense.
            </Text>
          )
        }
        card={(expense) => (
          <ExpenseCard
            expense={expense}
            amountMinor={expense.yourShare}
            onPress={() => router.navigate(`/expenses/${expense.id}`)}
            onDelete={
              expense.group?.archived ? undefined : () => void move(expense)
            }
          />
        )}
      />
      <AddButton onPress={() => router.navigate('/expenses/new')} />
      {periods.filters}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  empty: { textAlign: 'center', marginTop: 48, fontSize: 16, lineHeight: 24 },
});
