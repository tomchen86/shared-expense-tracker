import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocales } from 'expo-localization';
import { formatCurrency } from '@shared-expense/domain';
import { GroupedSection } from '../ui/grouped-section';
import { useThemeColors } from '../ui/theme';
import { formatExpenseDate } from './format-date';
import type { ExpenseView } from './use-expenses';

export function ExpenseCard({
  expense,
  amountMinor,
  onPress,
}: {
  expense: ExpenseView;
  amountMinor: number;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const locale = useLocales()[0].languageTag;
  const amount = formatCurrency(amountMinor, expense.currency, locale);
  const date = formatExpenseDate(expense.date, locale);
  const groupName =
    expense.group &&
    `${expense.group.name}${expense.group.archived ? ' · Archived' : ''}`;
  const metadata = [
    expense.category.name,
    ...(groupName ? [groupName] : []),
    date,
  ];
  return (
    <GroupedSection style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[expense.title, amount, ...metadata].join(', ')}
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
        {metadata.map((text, index) => (
          <Text
            key={index}
            style={[styles.metadata, { color: colors.textMuted }]}
          >
            {text}
          </Text>
        ))}
      </Pressable>
    </GroupedSection>
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
