import { useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useLocales } from 'expo-localization';
import { formatCurrency } from '@shared-expense/domain';
import { GroupedSection } from '../ui/grouped-section';
import { HeaderActions } from '../ui/header-actions';
import { useThemeColors } from '../ui/theme';
import { formatExpenseDate } from './format-date';
import { useExpenses } from './use-expenses';
import type { Expense } from './expenses';
import { useTrashActions } from './trash-provider';

export function ExpenseScreen({ trashed = false }: { trashed?: boolean }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useThemeColors();
  const locale = useLocales()[0].languageTag;
  const expenses = useExpenses(trashed);
  const actions = useTrashActions();
  const saving = useRef(false);
  const [leavingExpense, setLeavingExpense] = useState<Expense>();
  const expense = leavingExpense ?? expenses?.find((item) => item.id === id);

  async function changeAndReturn(change: () => Promise<boolean>) {
    if (!expense || saving.current) return;
    saving.current = true;
    setLeavingExpense(expense);
    if (await change()) router.back();
    else setLeavingExpense(undefined);
    saving.current = false;
  }

  function deletePermanently() {
    Alert.alert('Delete Expense?', 'This permanently deletes the expense.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => void changeAndReturn(() => actions.remove(id)),
      },
    ]);
  }
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {expense && (
        <HeaderActions
          edit={
            trashed
              ? undefined
              : {
                  label: 'Edit',
                  onPress: () => router.navigate(`/expenses/${id}/edit`),
                }
          }
          menu={{
            label: 'Expense actions',
            actions: [
              {
                label: trashed ? 'Delete Permanently' : 'Delete',
                destructive: true,
                onPress: trashed
                  ? deletePermanently
                  : () => void changeAndReturn(() => actions.move(expense)),
              },
            ],
          }}
        />
      )}
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        {expense ? (
          <>
            {trashed && (
              <>
                <Text style={{ color: colors.textMuted, fontSize: 17 }}>
                  This expense is in the Trash.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Restore"
                  style={styles.restore}
                  onPress={() =>
                    void changeAndReturn(() => actions.restore(id))
                  }
                >
                  <Text style={{ color: colors.accent, fontSize: 17 }}>
                    Restore
                  </Text>
                </Pressable>
              </>
            )}
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
                <Text style={[styles.value, { color: colors.textMuted }]}>
                  {expense.category.name}
                </Text>
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
  restore: {
    minHeight: 48,
    justifyContent: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    marginVertical: 12,
  },
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
  note: { padding: 16, fontSize: 17 },
  missing: { textAlign: 'center', marginTop: 48, fontSize: 16 },
});
