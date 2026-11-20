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
  return expenses.map((expense, index) => (
    <Fragment key={expense.id}>
      <DateHeading expense={expense} previous={expenses[index - 1]} />
      {card(expense)}
    </Fragment>
  ));
}

/** The date above a card, when the card before it, `previous`, is of another day or there is none. */
export function DateHeading({
  expense,
  previous,
}: {
  expense: ExpenseView;
  previous: ExpenseView | undefined;
}) {
  const colors = useThemeColors();
  const locale = useDisplayLocale();
  if (expense.date === previous?.date) return null;
  return (
    <Text
      accessibilityRole="header"
      style={[
        styles.date,
        previous !== undefined && styles.notFirst,
        { color: colors.textMuted },
      ]}
    >
      {formatExpenseDate(expense.date, locale)}
    </Text>
  );
}

const styles = StyleSheet.create({
  date: { fontSize: 13, marginLeft: 16, marginBottom: 8 },
  notFirst: { marginTop: 12 },
});
