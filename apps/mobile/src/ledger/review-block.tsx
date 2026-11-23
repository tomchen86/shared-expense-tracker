import { useRef, type ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import {
  formatCurrency,
  type Share,
  type SyncMoney,
} from '@shared-expense/domain';
import { useLocalDatabase, useLocalIdentity } from '../shell';
import type { Database } from '../storage';
import { GroupedSection } from '../ui/grouped-section';
import { useThemeColors } from '../ui/theme';
import { useDisplayLocale } from '../ui/use-display-locale';
import { participantName } from './expense-card';
import { keepCurrentMoney, restoreOwnMoney } from './review';
import { POSSIBLE_DUPLICATE, REPLACED, ReviewIcon } from './review-mark';
import type { ExpenseView } from './use-expenses';

/**
 * The mark's block above the details of an expense that needs review (LEDGER-152.1): the
 * money the expense has now beside the money the user entered, and the two ways to settle
 * it (LEDGER-153.1, LEDGER-154.1).
 */
export function ReviewBlock({
  expense,
  yours,
}: {
  expense: ExpenseView;
  yours: SyncMoney;
}) {
  const locale = useDisplayLocale();
  const database = useLocalDatabase();
  const archived = expense.group?.archived === true;
  // A press while a choice is being saved does nothing (LEDGER-153.1, LEDGER-154.1).
  const saving = useRef(false);

  async function choose(
    save: (database: Database, expenseId: string) => Promise<void>,
  ) {
    if (saving.current) return;
    saving.current = true;
    try {
      await saveReviewChoice(() => save(database, expense.id));
    } finally {
      saving.current = false;
    }
  }

  const side = (heading: string, money: SyncMoney) => (
    <ReviewSide
      heading={heading}
      expense={expense}
      money={money}
      summary={formatCurrency(money.amountMinor, money.currency, locale)}
    />
  );
  return (
    <ReviewPanel
      title={REPLACED}
      explanation="This expense was changed on another phone before your change reached it. Choose which version to keep."
    >
      {side('CURRENT', expense)}
      {side('YOURS', yours)}
      <ReviewAction
        label="Keep Current"
        onPress={() => void choose(keepCurrentMoney)}
      />
      <ReviewAction
        label="Use Mine"
        disabled={archived}
        onPress={() => void choose(restoreOwnMoney)}
      />
    </ReviewPanel>
  );
}

export function DuplicateBlock({
  other,
  archived,
  onDistinct,
  onDelete,
}: {
  other: ExpenseView;
  archived: boolean;
  onDistinct: () => Promise<void>;
  onDelete: () => void;
}) {
  return (
    <ReviewPanel
      title={POSSIBLE_DUPLICATE}
      explanation="Another expense in this group has the same amount and date. If they are the same expense, delete one of them."
    >
      <ReviewSide
        heading="OTHER EXPENSE"
        expense={other}
        money={other}
        summary={other.title}
      />
      <ReviewAction
        label="View Other Expense"
        onPress={() =>
          router.navigate({ pathname: './[id]', params: { id: other.id } })
        }
      />
      <ReviewAction
        label="Not a Duplicate"
        disabled={archived}
        onPress={() => void saveReviewChoice(onDistinct)}
      />
      <ReviewAction
        label="Delete This Expense"
        destructive
        disabled={archived}
        onPress={onDelete}
      />
    </ReviewPanel>
  );
}

async function saveReviewChoice(save: () => Promise<void>) {
  try {
    await save();
  } catch {
    Alert.alert(
      'Unable to Save Expense',
      'Your expense could not be saved. Please try again.',
    );
  }
}

function ReviewSide({
  heading,
  expense,
  money,
  summary,
}: {
  heading: string;
  expense: ExpenseView;
  money: SyncMoney;
  summary: string;
}) {
  const colors = useThemeColors();
  const { userId } = useLocalIdentity();
  const names = (allocations: readonly Share<string>[]) =>
    allocations
      .map(({ participant }) => participantName(expense, participant, userId))
      .join(', ');
  return (
    <View style={[styles.side, { borderTopColor: colors.separator }]}>
      <Text style={[styles.heading, { color: colors.textMuted }]}>
        {heading}
      </Text>
      <Text style={[styles.amount, { color: colors.text }]}>{summary}</Text>
      <Text
        style={[styles.people, { color: colors.textMuted }]}
      >{`Paid by ${names(money.payments)}`}</Text>
      <Text
        style={[styles.people, { color: colors.textMuted }]}
      >{`Split between ${names(money.shares)}`}</Text>
    </View>
  );
}

function ReviewAction({
  label,
  onPress,
  disabled = false,
  destructive = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { borderTopColor: colors.separator },
        pressed && { backgroundColor: colors.pressedSurface },
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          {
            color: disabled
              ? colors.placeholder
              : destructive
                ? colors.error
                : colors.accent,
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function ReviewPanel({
  title,
  explanation,
  children,
}: {
  title: string;
  explanation: string;
  children: ReactNode;
}) {
  const colors = useThemeColors();
  return (
    <GroupedSection style={styles.block}>
      <View style={styles.top}>
        <View style={styles.title}>
          <ReviewIcon size={20} />
          <Text style={[styles.titleText, { color: colors.text }]}>
            {title}
          </Text>
        </View>
        <Text style={[styles.explanation, { color: colors.textMuted }]}>
          {explanation}
        </Text>
      </View>
      {children}
    </GroupedSection>
  );
}

const styles = StyleSheet.create({
  block: { marginBottom: 24 },
  top: { padding: 16, gap: 8 },
  title: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titleText: { flexShrink: 1, fontSize: 17, fontWeight: '600' },
  explanation: { fontSize: 15, lineHeight: 20 },
  side: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  heading: { fontSize: 13, marginBottom: 2 },
  amount: { fontSize: 20, fontWeight: '600' },
  people: { fontSize: 15 },
  button: {
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  buttonText: { fontSize: 17, textAlign: 'center' },
});
