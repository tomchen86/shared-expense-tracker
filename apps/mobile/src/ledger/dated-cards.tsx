import { Fragment, type ReactNode } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useThemeColors } from '../ui/theme';
import { useDisplayLocale } from '../ui/use-display-locale';
import { formatExpenseDate } from './format-date';
import type { ExpenseView } from './use-expenses';

/** The cards of `expenses` in their order, with the date as a heading above each run of cards of that day. */
export function DatedCards({
  expenses,
  card,
}: {
  expenses: ExpenseView[];
  card: (expense: ExpenseView) => ReactNode;
}) {
  const colors = useThemeColors();
  const locale = useDisplayLocale();
  return expenses.map((expense, index) => {
    const previousDate = expenses[index - 1]?.date;
    return (
      <Fragment key={expense.id}>
        {expense.date !== previousDate && (
          <Text
            accessibilityRole="header"
            style={[
              styles.date,
              previousDate !== undefined && styles.notFirst,
              { color: colors.textMuted },
            ]}
          >
            {formatExpenseDate(expense.date, locale)}
          </Text>
        )}
        {card(expense)}
      </Fragment>
    );
  });
}

const styles = StyleSheet.create({
  date: { fontSize: 13, marginLeft: 16, marginBottom: 8 },
  notFirst: { marginTop: 12 },
});
