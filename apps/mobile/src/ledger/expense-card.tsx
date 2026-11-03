import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocales } from 'expo-localization';
import { formatCurrency } from '@shared-expense/domain';
import { GroupedSection } from '../ui/grouped-section';
import { SwipeAction } from '../ui/swipe-action';
import { useThemeColors } from '../ui/theme';
import { formatExpenseDate } from './format-date';
import type { Expense } from './expenses';

export function ExpenseCard({
  expense,
  onPress,
  onDelete,
}: {
  expense: Expense;
  onPress: () => void;
  onDelete?: () => void;
}) {
  const colors = useThemeColors();
  const locale = useLocales()[0].languageTag;
  const amount = formatCurrency(expense.amountMinor, expense.currency, locale);
  const date = formatExpenseDate(expense.date, locale);
  const card = (
    <GroupedSection>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${expense.title}, ${amount}, ${expense.category.name}, ${date}`}
        accessibilityActions={
          onDelete ? [{ name: 'delete', label: 'Delete expense' }] : undefined
        }
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'delete') onDelete?.();
        }}
        onPress={onPress}
        style={({ pressed }) => [
          styles.content,
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
          <Text style={[styles.amount, { color: colors.text }]}>{amount}</Text>
        </View>
        <Text style={[styles.metadata, { color: colors.textMuted }]}>
          {expense.category.name}
        </Text>
        <Text style={[styles.metadata, { color: colors.textMuted }]}>
          {date}
        </Text>
      </Pressable>
    </GroupedSection>
  );
  return (
    <View style={styles.card}>
      {onDelete ? (
        <SwipeAction
          label="Delete"
          accessibilityLabel={`Delete ${expense.title} expense`}
          disabled={false}
          onPress={onDelete}
        >
          {card}
        </SwipeAction>
      ) : (
        card
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 12 },
  content: { padding: 16, minHeight: 112 },
  main: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { flex: 1, fontSize: 18, fontWeight: '700' },
  amount: { fontSize: 16, fontWeight: '600' },
  metadata: { marginTop: 8, fontSize: 14 },
});
