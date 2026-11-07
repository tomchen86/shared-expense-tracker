import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useThemeColors } from '../ui/theme';
import { DatedCards } from './dated-cards';
import { ExpenseCard } from './expense-card';
import { useExpenses } from './use-expenses';
import { useTrashActions } from './trash-provider';

export function TrashScreen() {
  const colors = useThemeColors();
  const expenses = useExpenses(true);
  const { remove } = useTrashActions();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        {expenses &&
          (expenses.length === 0 ? (
            <Text style={[styles.empty, { color: colors.textMuted }]}>
              No deleted expenses.
            </Text>
          ) : (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Empty Trash"
                style={styles.emptyButton}
                onPress={() =>
                  Alert.alert(
                    'Empty Trash?',
                    'This permanently deletes the expenses in the Trash.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Empty Trash',
                        style: 'destructive',
                        onPress: () => void remove(),
                      },
                    ],
                  )
                }
              >
                <Text style={{ color: colors.error, fontSize: 17 }}>
                  Empty Trash
                </Text>
              </Pressable>
              <DatedCards
                expenses={expenses}
                card={(expense) => (
                  <ExpenseCard
                    expense={expense}
                    onPress={() =>
                      router.navigate(`/settings/trash/${expense.id}`)
                    }
                  />
                )}
              />
            </>
          ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40 },
  empty: { textAlign: 'center', marginTop: 48, fontSize: 16 },
  emptyButton: {
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
});
