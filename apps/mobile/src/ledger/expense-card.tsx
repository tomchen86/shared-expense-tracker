import { useMemo } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatCurrency } from '@shared-expense/domain';
import { GroupedSection } from '../ui/grouped-section';
import { SwipeAction } from '../ui/swipe-action';
import { useThemeColors } from '../ui/theme';
import { useDisplayLocale } from '../ui/use-display-locale';
import { formatExpenseDate } from './format-date';
import type { ExpenseView } from './use-expenses';

export function ExpenseCard({
  expense,
  amountMinor = expense.amountMinor,
  onPress,
  onDelete,
}: {
  expense: ExpenseView;
  amountMinor?: number;
  onPress: () => void;
  onDelete?: () => void;
}) {
  const colors = useThemeColors();
  const swipeBlocker = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 10 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy),
      }),
    [],
  );
  const locale = useDisplayLocale();
  const amount = formatCurrency(amountMinor, expense.currency, locale);
  const date = formatExpenseDate(expense.date, locale);
  const groupName =
    expense.group &&
    `${expense.group.name}${expense.group.archived ? ' · Archived' : ''}`;
  const metadata = [
    expense.categoryLabel,
    ...(groupName ? [groupName] : []),
    date,
  ];
  const card = (
    <GroupedSection>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[expense.title, amount, ...metadata].join(', ')}
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
        <View style={styles.category}>
          <View
            accessible={false}
            style={[styles.dot, { backgroundColor: expense.category.color }]}
          />
          <Text style={[styles.categoryName, { color: colors.textMuted }]}>
            {expense.categoryLabel}
          </Text>
        </View>
        {groupName && (
          <Text style={[styles.metadata, { color: colors.textMuted }]}>
            {groupName}
          </Text>
        )}
        <Text style={[styles.metadata, { color: colors.textMuted }]}>
          {date}
        </Text>
      </Pressable>
    </GroupedSection>
  );
  return (
    <View style={styles.card} {...(onDelete ? {} : swipeBlocker.panHandlers)}>
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
  category: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
  categoryName: { flexShrink: 1, fontSize: 14 },
  metadata: { marginTop: 8, fontSize: 14 },
});
