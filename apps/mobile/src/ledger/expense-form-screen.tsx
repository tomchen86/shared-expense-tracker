import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getLocales } from 'expo-localization';
import {
  currencyDecimals,
  formatAmount,
  isLocalDate,
  parseAmount,
  toLocalDate,
} from '@shared-expense/domain';
import { listCategories, type Category } from '../categories';
import { useLocalDatabase, useLocalIdentity } from '../shell';
import { DateField } from '../ui/date-field';
import { GroupedSection } from '../ui/grouped-section';
import { HeaderActions } from '../ui/header-actions';
import { useThemeColors } from '../ui/theme';
import { listExpenses, savePersonalExpense, type Expense } from './expenses';

interface LoadedForm {
  categories: Category[];
  expense?: Expense;
}

export function NewExpenseScreen() {
  return <ExpenseFormScreen />;
}

export function EditExpenseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ExpenseFormScreen expenseId={id} />;
}

function ExpenseFormScreen({ expenseId }: { expenseId?: string }) {
  const database = useLocalDatabase();
  const colors = useThemeColors();
  const [loaded, setLoaded] = useState<LoadedForm>();
  const [error, setError] = useState<unknown>();
  useEffect(() => {
    let active = true;
    void Promise.all([
      listCategories(database),
      expenseId ? listExpenses(database) : Promise.resolve([] as Expense[]),
    ]).then(
      ([categories, expenses]) => {
        if (active)
          setLoaded({
            categories,
            expense: expenses.find((expense) => expense.id === expenseId),
          });
      },
      (failure: unknown) => {
        if (active) setError(failure);
      },
    );
    return () => {
      active = false;
    };
  }, [database, expenseId]);
  if (error) throw error;
  if (!loaded || (expenseId && !loaded.expense))
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  return <ExpenseEditor {...loaded} />;
}

function normalizeAmount(text: string) {
  return text
    .replace(/[０-９．，]/g, (character) =>
      String.fromCharCode(character.charCodeAt(0) - 0xfee0),
    )
    .replaceAll(',', '.');
}

function ExpenseEditor({ categories, expense }: LoadedForm) {
  const database = useLocalDatabase();
  const identity = useLocalIdentity();
  const navigation = useNavigation();
  const colors = useThemeColors();
  const today = toLocalDate(
    new Date(),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [initial] = useState(() => {
    const reported = getLocales()[0]?.currencyCode ?? 'USD';
    return {
      currency:
        expense?.currency ??
        (currencyDecimals(reported) === undefined ? 'USD' : reported),
      amount: expense
        ? formatAmount(expense.amountMinor, expense.currency)!
        : '',
      title: expense?.title ?? '',
      categoryId: expense?.category.id ?? categories[0].id,
      date: expense?.date ?? today,
      note: expense?.note ?? '',
    };
  });
  const [form, setForm] = useState(initial);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const closingRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const category =
    categories.find((item) => item.id === form.categoryId) ??
    expense?.category ??
    categories[0];
  const dirty =
    form.amount.trim() !== initial.amount.trim() ||
    form.title.trim() !== initial.title.trim() ||
    form.note.trim() !== initial.note.trim() ||
    form.categoryId !== initial.categoryId ||
    form.date !== initial.date;
  const amountMinor = parseAmount(
    normalizeAmount(form.amount),
    initial.currency,
  );
  const canSave = dirty && !!form.title.trim() && amountMinor !== undefined;

  usePreventRemove(dirty || saving, ({ data }) => {
    if (savingRef.current) return;
    if (closingRef.current) {
      navigation.dispatch(data.action);
      return;
    }
    Alert.alert('Discard Changes?', 'Your changes will not be saved.', [
      { text: 'Keep Editing', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => navigation.dispatch(data.action),
      },
    ]);
  });

  function close() {
    if (savingRef.current) return;
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  function change(
    key: 'amount' | 'title' | 'note' | 'categoryId' | 'date',
    value: string,
  ) {
    if (!savingRef.current)
      setForm((previous) => ({ ...previous, [key]: value }));
  }

  async function save() {
    if (
      closingRef.current ||
      savingRef.current ||
      !canSave ||
      amountMinor === undefined
    )
      return;
    savingRef.current = true;
    setSaving(true);
    try {
      await savePersonalExpense(
        database,
        identity,
        {
          title: form.title,
          amountMinor,
          currency: initial.currency,
          date: form.date,
          categoryId: form.categoryId,
          note: form.note,
        },
        expense,
      );
      savingRef.current = false;
      closingRef.current = true;
      close();
    } catch {
      Alert.alert(
        'Unable to Save Expense',
        'Your expense could not be saved. Please try again.',
      );
    } finally {
      savingRef.current = false;
      if (mountedRef.current) setSaving(false);
    }
  }

  const inputStyle = [styles.input, { color: colors.text }];
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <HeaderActions
        cancel={{ label: 'Cancel', disabled: saving, onPress: close }}
        confirm={{
          label: expense ? 'Save' : 'Add',
          disabled: saving || !canSave,
          onPress: () => void save(),
        }}
      />
      <ScrollView
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        <Text style={[styles.currency, { color: colors.textMuted }]}>
          {initial.currency}
        </Text>
        <GroupedSection>
          <TextInput
            accessibilityLabel={`Amount in ${initial.currency}`}
            keyboardType="decimal-pad"
            editable={!saving}
            placeholder="0"
            placeholderTextColor={colors.placeholder}
            style={[...inputStyle, styles.amount]}
            value={form.amount}
            onChangeText={(value) => change('amount', value)}
          />
          <TextInput
            accessibilityLabel="Expense title"
            editable={!saving}
            placeholder="Title"
            placeholderTextColor={colors.placeholder}
            style={inputStyle}
            value={form.title}
            onChangeText={(value) => change('title', value)}
          />
        </GroupedSection>
        <GroupedSection style={styles.section}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Category, ${category.name}`}
            disabled={saving}
            accessibilityState={{ disabled: saving }}
            onPress={() => setCategoryOpen(true)}
            style={styles.row}
          >
            <Text style={{ color: colors.text }}>Category</Text>
            <View style={styles.categoryValue}>
              <View style={[styles.dot, { backgroundColor: category.color }]} />
              <Text style={{ color: colors.textMuted }}>{category.name}</Text>
            </View>
          </Pressable>
          <DateField
            label="Date"
            value={form.date}
            maximumDate={today}
            disabled={saving}
            onChange={(value) => {
              if (isLocalDate(value) && value <= today) change('date', value);
            }}
          />
        </GroupedSection>
        <GroupedSection style={styles.section}>
          <TextInput
            accessibilityLabel="Expense note"
            editable={!saving}
            multiline
            placeholder="Note"
            placeholderTextColor={colors.placeholder}
            style={[...inputStyle, styles.note]}
            value={form.note}
            onChangeText={(value) => change('note', value)}
          />
        </GroupedSection>
      </ScrollView>
      <Modal
        visible={categoryOpen}
        animationType="slide"
        onRequestClose={() => setCategoryOpen(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View
            style={[
              styles.pickerHeader,
              { borderBottomColor: colors.separator },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              onPress={() => setCategoryOpen(false)}
              style={styles.cancel}
            >
              <Text style={{ color: colors.accent }}>Cancel</Text>
            </Pressable>
            <Text
              accessibilityRole="header"
              style={[styles.pickerTitle, { color: colors.text }]}
            >
              Category
            </Text>
          </View>
          <ScrollView contentContainerStyle={styles.content}>
            <GroupedSection>
              {categories.map((item) => (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={item.name}
                  accessibilityState={{ selected: item.id === form.categoryId }}
                  style={styles.row}
                  onPress={() => {
                    change('categoryId', item.id);
                    setCategoryOpen(false);
                  }}
                >
                  <View style={styles.categoryValue}>
                    <View
                      style={[styles.dot, { backgroundColor: item.color }]}
                    />
                    <Text style={{ color: colors.text }}>{item.name}</Text>
                  </View>
                  {item.id === form.categoryId && (
                    <Text style={{ color: colors.accent }}>✓</Text>
                  )}
                </Pressable>
              ))}
            </GroupedSection>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40 },
  currency: { fontSize: 13, marginLeft: 16, marginBottom: 8 },
  section: { marginTop: 24 },
  input: {
    fontSize: 17,
    minHeight: 54,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  amount: { fontSize: 32, minHeight: 72 },
  note: { minHeight: 100, textAlignVertical: 'top' },
  row: {
    minHeight: 54,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
  categoryValue: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  pickerHeader: {
    minHeight: 56,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cancel: { minHeight: 48, minWidth: 64, justifyContent: 'center' },
  pickerTitle: { fontWeight: '600', fontSize: 17 },
});
