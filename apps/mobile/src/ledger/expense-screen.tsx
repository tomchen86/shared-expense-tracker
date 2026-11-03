import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useLocales } from 'expo-localization';
import { formatCurrency } from '@shared-expense/domain';
import { useLocalIdentity } from '../shell';
import { GroupedSection } from '../ui/grouped-section';
import { HeaderActions } from '../ui/header-actions';
import { useThemeColors } from '../ui/theme';
import { formatExpenseDate } from './format-date';
import { useExpenses } from './use-expenses';

export function ExpenseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useThemeColors();
  const locale = useLocales()[0].languageTag;
  const expenses = useExpenses();
  const expense = expenses?.find((item) => item.id === id);
  const { userId } = useLocalIdentity();
  const position = expense ? expense.yourPaid - expense.yourShare : 0;
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {expense && (
        <HeaderActions
          edit={{
            label: 'Edit',
            disabled: expense.group?.archived,
            onPress: () => router.navigate(`/expenses/${id}/edit`),
          }}
        />
      )}
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        {expense ? (
          <>
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
  note: { padding: 16, fontSize: 17 },
  missing: { textAlign: 'center', marginTop: 48, fontSize: 16 },
});
