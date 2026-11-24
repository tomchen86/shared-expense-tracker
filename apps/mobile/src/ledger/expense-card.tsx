import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatCurrency } from '@shared-expense/domain';
import { FadeText } from '../ui/fade-text';
import { GroupedSection } from '../ui/grouped-section';
import { SwipeAction, useSidewaysDragIsNoPress } from '../ui/swipe-action';
import { useThemeColors } from '../ui/theme';
import { useDisplayLocale } from '../ui/use-display-locale';
import { formatExpenseDate } from './format-date';
import { POSSIBLE_DUPLICATE, REPLACED, ReviewIcon } from './review-mark';
import type { ExpenseView } from './use-expenses';

/** What an expense's details call the participant: by name as it is now, and yours with " (You)" (LEDGER-66.3). */
export function participantName(
  expense: Pick<ExpenseView, 'members'>,
  participant: string,
  userId: string,
) {
  const member = expense.members.find((item) => item.id === participant);
  return (
    (member?.name ?? participant) + (member?.userId === userId ? ' (You)' : '')
  );
}

/** The trailing label on an expense card viewed in its group's ledger. */
export function paidBy(expense: ExpenseView, userId: string) {
  const { participant } = expense.payments[0];
  const payer = expense.members.find((member) => member.id === participant);
  return `Paid by ${payer?.userId === userId ? 'You' : (payer?.name ?? participant)}`;
}

export function ExpenseCard({
  expense,
  amountMinor = expense.amountMinor,
  trailing,
  onPress,
  onDelete,
}: {
  expense: ExpenseView;
  amountMinor?: number;
  /** What the card shows at the right of the category, in place of the group's name. */
  trailing?: string;
  onPress: () => void;
  onDelete?: () => void;
}) {
  const colors = useThemeColors();
  const dragIsNoPress = useSidewaysDragIsNoPress();
  const locale = useDisplayLocale();
  const amount = formatCurrency(amountMinor, expense.currency, locale);
  const date = formatExpenseDate(expense.date, locale);
  const right =
    trailing ??
    (expense.group &&
      `${expense.group.name}${expense.group.archived ? ' · Archived' : ''}`);
  const marks = [
    ...(expense.yours ? [REPLACED] : []),
    ...(expense.duplicateOf ? [POSSIBLE_DUPLICATE] : []),
  ];
  const metadata = [
    expense.categoryLabel,
    ...(right ? [right] : []),
    date,
    ...marks,
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
          <FadeText
            containerStyle={styles.titleBox}
            style={[styles.title, { color: colors.text }]}
          >
            {expense.title}
          </FadeText>
          <Text style={[styles.amount, { color: colors.text }]}>{amount}</Text>
        </View>
        <View style={styles.category}>
          <View
            accessible={false}
            style={[styles.dot, { backgroundColor: expense.category.color }]}
          />
          <FadeText
            containerStyle={styles.shrinks}
            style={[styles.detail, { color: colors.textMuted }]}
          >
            {expense.categoryLabel}
          </FadeText>
          <View style={styles.gap} />
          {right && (
            <FadeText
              containerStyle={styles.shrinks}
              style={[styles.detail, { color: colors.textMuted }]}
            >
              {right}
            </FadeText>
          )}
        </View>
        {marks.map((mark) => (
          <View key={mark} style={styles.mark}>
            <ReviewIcon size={16} />
            <Text style={[styles.markText, { color: colors.text }]}>
              {mark}
            </Text>
          </View>
        ))}
      </Pressable>
    </GroupedSection>
  );
  return (
    <View style={styles.card} {...(onDelete ? {} : dragIsNoPress)}>
      {onDelete ? (
        <SwipeAction
          caption="Delete"
          icon={{ ios: 'trash.fill', android: 'delete' }}
          accessibilityLabel={`Delete ${expense.title} expense`}
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
  content: { padding: 16 },
  main: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titleBox: { flex: 1 },
  title: { fontSize: 18, fontWeight: '700' },
  amount: { fontSize: 16, fontWeight: '600' },
  category: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
  shrinks: { flexShrink: 1 },
  gap: { flexGrow: 1, minWidth: 4 },
  detail: { fontSize: 14 },
  mark: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  // Wraps at large text sizes instead of fading out: the mark is read whole (LEDGER-155.1).
  markText: { flexShrink: 1, fontSize: 14 },
});
