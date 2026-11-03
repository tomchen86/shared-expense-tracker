import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useLocales } from 'expo-localization';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatCurrency } from '@shared-expense/domain';
import { AddButton } from '../ui/add-button';
import { GroupedSection } from '../ui/grouped-section';
import { useThemeColors } from '../ui/theme';
import { formatExpenseDate } from './format-date';
import { useExpenses } from './use-expenses';

export function ExpensesScreen() {
  const colors = useThemeColors();
  const locale = useLocales()[0].languageTag;
  const expenses = useExpenses();
  const totals = new Map<string, bigint>();
  for (const expense of expenses ?? []) {
    totals.set(
      expense.currency,
      (totals.get(expense.currency) ?? 0n) + BigInt(expense.amountMinor),
    );
  }
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
            <GroupedSection style={styles.totals}>
              {totals.size === 0 ? (
                <Text style={[styles.total, { color: colors.text }]}>
                  Your Total Share: —
                </Text>
              ) : (
                [...totals.keys()].sort().map((currency) => (
                  <Text
                    key={currency}
                    style={[styles.total, { color: colors.text }]}
                  >
                    Your Total Share:{' '}
                    {formatCurrency(totals.get(currency)!, currency, locale)}
                  </Text>
                ))
              )}
            </GroupedSection>
            {expenses.length === 0 && (
              <Text style={[styles.empty, { color: colors.textMuted }]}>
                No expenses to display. Add a personal expense or get involved
                in a group expense.
              </Text>
            )}
            {expenses.map((expense) => {
              const amount = formatCurrency(
                expense.amountMinor,
                expense.currency,
                locale,
              );
              const date = formatExpenseDate(expense.date, locale);
              return (
                <GroupedSection key={expense.id} style={styles.card}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${expense.title}, ${amount}, ${expense.category.name}, ${date}`}
                    onPress={() => router.navigate(`/expenses/${expense.id}`)}
                    style={({ pressed }) => [
                      styles.cardContent,
                      pressed && { backgroundColor: colors.pressedSurface },
                    ]}
                  >
                    <View style={styles.main}>
                      <Text
                        numberOfLines={1}
                        style={[styles.title, { color: colors.text }]}
                      >
                        {expense.title}
                      </Text>
                      <Text style={[styles.amount, { color: colors.text }]}>
                        {amount}
                      </Text>
                    </View>
                    <Text
                      style={[styles.metadata, { color: colors.textMuted }]}
                    >
                      {expense.category.name}
                    </Text>
                    <Text
                      style={[styles.metadata, { color: colors.textMuted }]}
                    >
                      {date}
                    </Text>
                  </Pressable>
                </GroupedSection>
              );
            })}
          </>
        )}
      </ScrollView>
      <AddButton onPress={() => router.navigate('/expenses/new')} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 112 },
  totals: { padding: 16, marginBottom: 24 },
  total: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  empty: { textAlign: 'center', marginTop: 48, fontSize: 16, lineHeight: 24 },
  card: { marginBottom: 12 },
  cardContent: { padding: 16, minHeight: 112 },
  main: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { flex: 1, fontSize: 18, fontWeight: '700' },
  amount: { fontSize: 16, fontWeight: '600' },
  metadata: { marginTop: 8, fontSize: 14 },
});
