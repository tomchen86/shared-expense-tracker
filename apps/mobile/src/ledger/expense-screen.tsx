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
import { listGroups } from '../groups';
import { useLocalDatabase, useLocalIdentity } from '../shell';
import { listExpenses } from './expenses';
import { GroupedSection } from '../ui/grouped-section';
import { HeaderActions } from '../ui/header-actions';
import { useThemeColors } from '../ui/theme';
import { formatExpenseDate } from './format-date';
import { useExpenses, type ExpenseView } from './use-expenses';
import { useTrashActions } from './trash-provider';

export function ExpenseScreen({ trashed = false }: { trashed?: boolean }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useThemeColors();
  const locale = useLocales()[0].languageTag;
  const expenses = useExpenses(trashed);
  const actions = useTrashActions();
  const database = useLocalDatabase();
  const saving = useRef(false);
  const [leavingExpense, setLeavingExpense] = useState<ExpenseView>();
  const expense = leavingExpense ?? expenses?.find((item) => item.id === id);
  const { userId, personalSpaceId } = useLocalIdentity();
  const position = expense ? expense.yourPaid - expense.yourShare : 0;

  async function changeAndReturn(change: () => Promise<boolean>) {
    if (!expense || saving.current) return;
    saving.current = true;
    setLeavingExpense(expense);
    if (await change()) router.back();
    else setLeavingExpense(undefined);
    saving.current = false;
  }

  /** Opens Edit Expense if the expense, read now, is still in an unarchived space (SHELL-64.1). */
  async function editIfAllowed() {
    const [rows, groups] = await Promise.all([
      listExpenses(database),
      listGroups(database),
    ]);
    const archived = new Set(
      groups.filter((group) => group.archived).map((group) => group.id),
    );
    if (rows.some((item) => item.id === id && !archived.has(item.spaceId)))
      router.navigate(`/expenses/${id}/edit`);
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
                  disabled: expense.group?.archived,
                  onPress: () => void editIfAllowed().catch(() => undefined),
                }
          }
          menu={
            expense.spaceId === personalSpaceId
              ? {
                  label: 'Expense actions',
                  actions: [
                    {
                      label: trashed ? 'Delete Permanently' : 'Delete',
                      destructive: true,
                      onPress: trashed
                        ? deletePermanently
                        : () =>
                            void changeAndReturn(() => actions.move(expense)),
                    },
                  ],
                }
              : undefined
          }
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
            {expense.group?.archived && (
              <GroupedSection style={styles.history}>
                <Text style={{ color: colors.text }}>Shared history</Text>
                <Text style={{ color: colors.textMuted }}>
                  Payments and shares are preserved as read-only history.
                  Restore this group before editing.
                </Text>
              </GroupedSection>
            )}
            {expense.group && (
              <>
                <Text style={[styles.heading, { color: colors.textMuted }]}>
                  YOUR POSITION
                </Text>
                <GroupedSection>
                  <DetailRow
                    label="You paid"
                    value={formatCurrency(
                      expense.yourPaid,
                      expense.currency,
                      locale,
                    )}
                  />
                  <DetailRow
                    label="Your share"
                    value={formatCurrency(
                      expense.yourShare,
                      expense.currency,
                      locale,
                    )}
                  />
                  <DetailRow
                    label={
                      position > 0
                        ? 'You are owed'
                        : position < 0
                          ? 'You owe'
                          : 'Settled up'
                    }
                    value={formatCurrency(
                      Math.abs(position),
                      expense.currency,
                      locale,
                    )}
                  />
                </GroupedSection>
                {(
                  [
                    ['PAID BY', expense.payments],
                    ['SPLIT', expense.shares],
                  ] as const
                ).map(([heading, allocations]) => (
                  <View key={heading}>
                    <Text style={[styles.heading, { color: colors.textMuted }]}>
                      {heading}
                    </Text>
                    <GroupedSection>
                      {allocations.map((share) => {
                        const member = expense.members.find(
                          (item) => item.id === share.participant,
                        );
                        return (
                          <DetailRow
                            key={share.participant}
                            label={
                              (member?.name ?? share.participant) +
                              (member?.userId === userId ? ' (You)' : '')
                            }
                            value={formatCurrency(
                              share.amountMinor,
                              expense.currency,
                              locale,
                            )}
                          />
                        );
                      })}
                    </GroupedSection>
                  </View>
                ))}
              </>
            )}
            <Text style={[styles.heading, { color: colors.textMuted }]}>
              DETAILS
            </Text>
            <GroupedSection>
              {expense.group && (
                <DetailRow label="Group" value={expense.group.name} />
              )}
              {expense.group?.archived && (
                <DetailRow label="Status" value="Archived · Read-only" />
              )}
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

function DetailRow({ label, value }: { label: string; value: string }) {
  const colors = useThemeColors();
  return (
    <View style={styles.row}>
      <Text style={{ color: colors.text }}>{label}</Text>
      <Text style={[styles.value, { color: colors.textMuted }]}>{value}</Text>
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
  history: { padding: 16, marginTop: 20, gap: 8 },
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
