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
  const periods = useListPeriod(false, expenses, read.placed);
  // The total is that of the cards under it: of every expense of the period, drawn or not
  // (LEDGER-35.5, LEDGER-118.2).
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
  // A total of every expense ever means little: all dates show how many there are.
  const count = formatItemCount(cards.length, locale);
  const allTime = periods.option === 'all';
  const spent = amounts
    ? `Spent in ${periods.name} ${amounts}`
    : `Nothing spent in ${periods.name}`;
  return (
    <SafeAreaView
      edges={['left', 'right']}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <HeaderActions
        filter={{ label: 'Filters', onPress: periods.openFilters }}
      />
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
