import { ScrollView, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { useLocales } from 'expo-localization';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatCurrency, toLocalDate } from '@shared-expense/domain';
import { AddButton } from '../ui/add-button';
import { useThemeColors } from '../ui/theme';
import { ExpenseCard } from './expense-card';
import { ThisMonthButton } from './this-month-button';
import { useTrashActions } from './trash-provider';
import { useExpenses } from './use-expenses';

export function ExpensesScreen() {
  const colors = useThemeColors();
  const locale = useLocales()[0].languageTag;
  const expenses = useExpenses()?.filter((expense) => expense.involved);
  const { move } = useTrashActions();
  const totals = new Map<string, bigint>();
  const thisMonth = toLocalDate(
    new Date(),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ).slice(0, 7);
  for (const expense of expenses ?? []) {
    if (expense.date.slice(0, 7) !== thisMonth) continue;
    totals.set(
      expense.currency,
      (totals.get(expense.currency) ?? 0n) + BigInt(expense.yourShare),
    );
  }
  const shown = [...totals.keys()]
    .sort()
    .map((currency) => formatCurrency(totals.get(currency)!, currency, locale));
  return (
    <SafeAreaView
      edges={['left', 'right']}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        {expenses && (
          <>
            <ThisMonthButton
              totals={shown}
              onPress={() => router.navigate('/insights')}
            />
            {expenses.length === 0 && (
              <Text style={[styles.empty, { color: colors.textMuted }]}>
                No expenses to display. Add a personal expense or get involved
                in a group expense.
              </Text>
            )}
            {expenses.map((expense) => (
              <ExpenseCard
                key={expense.id}
                expense={expense}
                amountMinor={expense.yourShare}
                onPress={() => router.navigate(`/expenses/${expense.id}`)}
                onDelete={
                  expense.group?.archived ? undefined : () => void move(expense)
                }
              />
            ))}
          </>
        )}
      </ScrollView>
      <AddButton onPress={() => router.navigate('/expenses/new')} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 112 },
  empty: { textAlign: 'center', marginTop: 48, fontSize: 16, lineHeight: 24 },
});
