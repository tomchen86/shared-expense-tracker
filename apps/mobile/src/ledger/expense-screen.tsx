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
import { formatCurrency } from '@shared-expense/domain';
import { isReadOnlyGroup, listGroups } from '../groups';
import { useLocalDatabase, useLocalIdentity } from '../shell';
import { markExpensesDistinct } from '../sync/duplicates';
import { listExpenses } from './expenses';
import { GroupedSection } from '../ui/grouped-section';
import { HeaderActions } from '../ui/header-actions';
import { useThemeColors } from '../ui/theme';
import { useDisplayLocale } from '../ui/use-display-locale';
import { participantName } from './expense-card';
import { formatExpenseDate } from './format-date';
import { DuplicateBlock, ReviewBlock } from './review-block';
import { useExpenses, type ExpenseView } from './use-expenses';
import { useTrashActions } from './trash-provider';

export function ExpenseScreen({ trashed = false }: { trashed?: boolean }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useThemeColors();
  const locale = useDisplayLocale();
  const expenses = useExpenses(trashed);
  const actions = useTrashActions();
  const database = useLocalDatabase();
  const saving = useRef(false);
  const [leavingExpense, setLeavingExpense] = useState<ExpenseView>();
  const [, showReadError] = useState();
  const expense = leavingExpense ?? expenses?.find((item) => item.id === id);
  const otherId = expense?.duplicateOf;
  const other = otherId && expenses?.find((item) => item.id === otherId);
  const { userId, personalSpaceId } = useLocalIdentity();
  const position = expense ? expense.yourPaid - expense.yourShare : 0;
  // A read-only copy is shown as an archived group's expenses are, in its own words,
  // whether or not it is archived too (LEDGER-220.1).
  const copy = expense?.group?.readOnlyCopy !== undefined;
  const locked = expense?.group ? isReadOnlyGroup(expense.group) : false;

  async function saveOnce(change: () => Promise<void>) {
    if (saving.current) return;
    saving.current = true;
    try {
      await change();
    } finally {
      saving.current = false;
    }
  }

  function changeAndReturn(
    current: ExpenseView,
    change: () => Promise<boolean>,
  ) {
    return saveOnce(async () => {
      setLeavingExpense(current);
      if (await change()) router.back();
      else setLeavingExpense(undefined);
    });
  }

  function moveToTrash(current: ExpenseView) {
    return changeAndReturn(current, () => actions.move(current));
  }

  /** Opens Edit Expense if the expense, read now, is out of the trash and in an unarchived space (SHELL-64.1). */
  async function editIfAllowed() {
    const [rows, groups] = await Promise.all([
      listExpenses(database),
      listGroups(database),
    ]);
    const archived = new Set(
      groups.filter(isReadOnlyGroup).map((group) => group.id),
    );
    if (
      rows.some(
        (item) =>
          item.id === id &&
          item.trashOrder === undefined &&
          !archived.has(item.spaceId),
      )
    )
      router.navigate(`/expenses/${id}/edit`);
  }

  function deletePermanently(current: ExpenseView) {
    Alert.alert('Delete Expense?', 'This permanently deletes the expense.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          void changeAndReturn(current, () => actions.remove(current.id)),
      },
    ]);
  }
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <HeaderActions
        edit={
          trashed || !expense
            ? undefined
            : {
                label: 'Edit',
                disabled: locked,
                onPress: () =>
                  void editIfAllowed().catch((failure: unknown) =>
                    // Thrown in the next render, so the screen shows the read error (SHELL-60.1).
                    showReadError(() => {
                      throw failure;
                    }),
                  ),
              }
        }
        menu={
          expense && (!trashed || expense.spaceId === personalSpaceId)
            ? {
                label: 'Expense actions',
                actions: [
                  {
                    label: trashed ? 'Delete Permanently' : 'Delete',
                    destructive: true,
                    disabled: !trashed && locked,
                    onPress: trashed
                      ? () => deletePermanently(expense)
                      : () => void moveToTrash(expense),
                  },
                ],
              }
            : undefined
        }
      />
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
                  accessibilityState={{ disabled: copy }}
                  disabled={copy}
                  style={styles.restore}
                  onPress={() =>
                    void changeAndReturn(expense, () =>
                      actions.restore(expense.id),
                    )
                  }
                >
                  <Text style={{ color: colors.accent, fontSize: 17 }}>
                    Restore
                  </Text>
                </Pressable>
              </>
            )}
            {expense.yours && (
              <ReviewBlock expense={expense} yours={expense.yours} />
            )}
            {other && (
              <DuplicateBlock
                other={other}
                archived={locked}
                onDistinct={() =>
                  saveOnce(() =>
                    markExpensesDistinct(
                      database,
                      expense.spaceId,
                      expense.id,
                      other.id,
                    ),
                  )
                }
                onDelete={() => void moveToTrash(expense)}
              />
            )}
            <Text style={[styles.title, { color: colors.text }]}>
              {expense.title}
            </Text>
            <View style={styles.amountRow}>
              <Text style={[styles.amount, { color: colors.text }]}>
                {formatCurrency(expense.amountMinor, expense.currency, locale)}
              </Text>
              <Text style={[styles.date, { color: colors.textMuted }]}>
                {formatExpenseDate(expense.date, locale)}
              </Text>
            </View>
            <CategoryTag
              color={expense.category.color}
              name={expense.categoryLabel}
            />
            {locked && !trashed && (
              <GroupedSection style={styles.history}>
                <Text style={{ color: colors.text }}>Shared history</Text>
                <Text style={{ color: colors.textMuted }}>
                  {copy
                    ? 'Payments and shares are preserved as read-only history.'
                    : 'Payments and shares are preserved as read-only history. Restore this group before editing.'}
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
                      {allocations.map((share) => (
                        <DetailRow
                          key={share.participant}
                          label={participantName(
                            expense,
                            share.participant,
                            userId,
                          )}
                          value={formatCurrency(
                            share.amountMinor,
                            expense.currency,
                            locale,
                          )}
                        />
                      ))}
                    </GroupedSection>
                  </View>
                ))}
              </>
            )}
            {expense.group && (
              <GroupedSection style={styles.groupRows}>
                <DetailRow label="Group" value={expense.group.name} />
                {locked && (
                  <DetailRow
                    label="Status"
                    value={copy ? 'Read-only copy' : 'Archived · Read-only'}
                  />
                )}
              </GroupedSection>
            )}
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

/** The expense's category as a capsule tinted with its color. */
function CategoryTag({ color, name }: { color: string; name: string }) {
  const colors = useThemeColors();
  return (
    <View
      accessible
      accessibilityLabel={`Category, ${name}`}
      style={[styles.tag, { backgroundColor: `${color}2E` }]}
    >
      <View style={[styles.tagDot, { backgroundColor: color }]} />
      <Text style={[styles.tagName, { color: colors.text }]}>{name}</Text>
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
  amountRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    columnGap: 12,
  },
  amount: { fontSize: 32, fontWeight: '600' },
  date: { fontSize: 15 },
  tag: {
    marginTop: 12,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  tagDot: { width: 10, height: 10, borderRadius: 5 },
  tagName: { flexShrink: 1, fontSize: 15, fontWeight: '500' },
  groupRows: { marginTop: 28 },
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
  note: { padding: 16, fontSize: 17 },
  missing: { textAlign: 'center', marginTop: 48, fontSize: 16 },
});
