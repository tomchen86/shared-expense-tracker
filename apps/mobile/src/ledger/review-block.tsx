import { useRef } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
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
import { REPLACED, ReviewIcon } from './review-mark';
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
  const colors = useThemeColors();
  const locale = useDisplayLocale();
  const database = useLocalDatabase();
  const { userId } = useLocalIdentity();
  const archived = expense.group?.archived === true;
  // A press while a choice is being saved does nothing (LEDGER-153.1, LEDGER-154.1).
  const saving = useRef(false);

  async function choose(
    save: (database: Database, expenseId: string) => Promise<void>,
  ) {
    if (saving.current) return;
    saving.current = true;
    try {
      await save(database, expense.id);
    } catch {
      Alert.alert(
        'Unable to Save Expense',
        'Your expense could not be saved. Please try again.',
      );
    } finally {
      saving.current = false;
    }
  }

  const names = (shares: readonly Share<string>[]) =>
    shares
      .map(({ participant }) => participantName(expense, participant, userId))
      .join(', ');
  const side = (heading: string, money: SyncMoney) => (
    <View style={[styles.side, { borderTopColor: colors.separator }]}>
      <Text style={[styles.heading, { color: colors.textMuted }]}>
        {heading}
      </Text>
      <Text style={[styles.amount, { color: colors.text }]}>
        {formatCurrency(money.amountMinor, money.currency, locale)}
      </Text>
      <Text style={[styles.people, { color: colors.textMuted }]}>
        {`Paid by ${names(money.payments)}`}
      </Text>
      <Text style={[styles.people, { color: colors.textMuted }]}>
        {`Split between ${names(money.shares)}`}
      </Text>
    </View>
  );
  const button = (
    label: string,
    save: Parameters<typeof choose>[0],
    disabled = false,
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => void choose(save)}
      style={({ pressed }) => [
        styles.button,
        { borderTopColor: colors.separator },
        pressed && { backgroundColor: colors.pressedSurface },
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          { color: disabled ? colors.placeholder : colors.accent },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );

  return (
    <GroupedSection style={styles.block}>
      <View style={styles.top}>
        <View style={styles.title}>
          <ReviewIcon size={20} />
          <Text style={[styles.titleText, { color: colors.text }]}>
            {REPLACED}
          </Text>
        </View>
        <Text style={[styles.explanation, { color: colors.textMuted }]}>
          This expense was changed on another phone before your change reached
          it. Choose which version to keep.
        </Text>
      </View>
      {side('CURRENT', expense)}
      {side('YOURS', yours)}
      {button('Keep Current', keepCurrentMoney)}
      {button('Use Mine', restoreOwnMoney, archived)}
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
