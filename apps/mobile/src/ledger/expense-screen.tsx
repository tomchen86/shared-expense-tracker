import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useLocales } from 'expo-localization';
import { formatCurrency } from '@shared-expense/domain';
import { GroupedSection } from '../ui/grouped-section';
import { HeaderActions } from '../ui/header-actions';
import { useThemeColors } from '../ui/theme';
import { formatExpenseDate } from './format-date';
import { useExpenses } from './use-expenses';

export function ExpenseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useThemeColors();
  const locale = useLocales()[0].languageTag;
  const expenses = useExpenses();
  const expense = expenses?.find((item) => item.id === id);
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {expense && (
        <HeaderActions
          edit={{
            label: 'Edit',
            onPress: () => router.navigate(`/expenses/${id}/edit`),
          }}
        />
      )}
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        {expense ? (
          <>
            <Text style={[styles.title, { color: colors.text }]}>
              {expense.title}
            </Text>
            <Text style={[styles.amount, { color: colors.text }]}>
              {formatCurrency(expense.amountMinor, expense.currency, locale)}
            </Text>
            <Text style={[styles.heading, { color: colors.textMuted }]}>
              DETAILS
            </Text>
            <GroupedSection>
              <View style={styles.row}>
                <Text style={{ color: colors.text }}>Category</Text>
                <View style={styles.category}>
                  <View
                    accessible={false}
                    style={[
                      styles.dot,
                      { backgroundColor: expense.category.color },
                    ]}
                  />
                  <Text style={[styles.value, { color: colors.textMuted }]}>
                    {expense.categoryLabel}
                  </Text>
                </View>
              </View>
              <View
                style={[
                  styles.row,
                  {
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: colors.separator,
                  },
                ]}
              >
                <Text style={{ color: colors.text }}>Date</Text>
                <Text style={[styles.value, { color: colors.textMuted }]}>
                  {formatExpenseDate(expense.date, locale)}
                </Text>
              </View>
            </GroupedSection>
            {expense.note && (
              <>
                <Text style={[styles.heading, { color: colors.textMuted }]}>
                  NOTE
                </Text>
                <GroupedSection>
                  <Text style={[styles.note, { color: colors.text }]}>
                    {expense.note}
                  </Text>
                </GroupedSection>
              </>
            )}
          </>
        ) : expenses !== undefined ? (
          <Text style={[styles.missing, { color: colors.textMuted }]}>
            Expense not found.
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '700' },
  amount: { fontSize: 32, fontWeight: '600', marginTop: 8 },
  heading: { marginTop: 28, marginBottom: 8, marginLeft: 16, fontSize: 13 },
  row: {
    minHeight: 54,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
  },
  value: { flexShrink: 1, textAlign: 'right' },
  category: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
  note: { padding: 16, fontSize: 17 },
  missing: { textAlign: 'center', marginTop: 48, fontSize: 16 },
});
