import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useIsFocused, usePreventRemove } from 'expo-router/react-navigation';
import { getLocales } from 'expo-localization';
import {
  categoryNameKey,
  currencyDecimals,
  formatAmount,
  isLocalDate,
  parseAmount,
  toLocalDate,
} from '@shared-expense/domain';
import {
  isUncategorizedCategory,
  listCategories,
  type Category,
} from '../categories';
import {
  listFormerMembers,
  listGroups,
  type Group,
  type GroupMember,
} from '../groups';
import { useLocalDatabase, useLocalIdentity } from '../shell';
import { DateField } from '../ui/date-field';
import { GroupedSection } from '../ui/grouped-section';
import { HeaderActions } from '../ui/header-actions';
import { Sheet } from '../ui/sheet';
import { useThemeColors } from '../ui/theme';
import { useKeyboardScroll } from '../ui/use-keyboard-scroll';
import { formScrollInsetAdjustment } from '../ui/form-presentation';
import {
  ArchivedExpenseError,
  listExpenses,
  saveExpense,
  type Expense,
} from './expenses';

interface LoadedForm {
  categories: Category[];
  groups: Group[];
  formerMembers: GroupMember[];
  initialGroupId?: string;
  expense?: Expense;
}

export function NewExpenseScreen() {
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();
  return <ExpenseFormScreen initialGroupId={groupId} />;
}

export function EditExpenseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ExpenseFormScreen expenseId={id} />;
}

function ExpenseFormScreen({
  expenseId,
  initialGroupId,
}: {
  expenseId?: string;
  initialGroupId?: string;
}) {
  const database = useLocalDatabase();
  const focused = useIsFocused();
  const colors = useThemeColors();
  const [loaded, setLoaded] = useState<LoadedForm>();
  const [error, setError] = useState<unknown>();
  const latestRead = useRef<Promise<LoadedForm>>(undefined);
  useEffect(() => {
    let active = true;
    const read = Promise.all([
      listCategories(database),
      expenseId ? listExpenses(database) : Promise.resolve([] as Expense[]),
      listGroups(database),
    ]).then(async ([categories, expenses, groups]) => {
      const expense = expenses.find(
        (item) => item.id === expenseId && item.trashOrder === undefined,
      );
      const formerMembers = expense
        ? await listFormerMembers(database, expense.spaceId)
        : [];
      const form: LoadedForm = {
        categories,
        expense,
        groups,
        formerMembers,
        initialGroupId: groups.find(
          (group) => group.id === initialGroupId && !group.archived,
        )?.id,
      };
      if (active) setLoaded(form);
      return form;
    });
    latestRead.current = read;
    read.catch((failure: unknown) => {
      if (active) setError(failure);
    });
    return () => {
      active = false;
    };
  }, [database, expenseId, initialGroupId, focused]);
  if (error) throw error;
  if (!loaded)
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  if (expenseId && !loaded.expense)
    return (
      <>
        <Stack.Screen
          options={{ contentStyle: { backgroundColor: colors.background } }}
        />
        <HeaderActions
          cancel={{ label: 'Cancel', onPress: () => router.back() }}
        />
        <ScrollView
          contentInsetAdjustmentBehavior={formScrollInsetAdjustment}
          contentContainerStyle={styles.content}
        >
          <Text style={[styles.missing, { color: colors.textMuted }]}>
            Expense not found.
          </Text>
        </ScrollView>
      </>
    );
  return <ExpenseEditor {...loaded} latestRead={() => latestRead.current!} />;
}

function normalizeAmount(text: string) {
  return text
    .replace(/[０-９．，]/g, (character) =>
      String.fromCharCode(character.charCodeAt(0) - 0xfee0),
    )
    .replaceAll(',', '.');
}

function ExpenseEditor({
  categories,
  expense,
  groups,
  formerMembers,
  initialGroupId,
  latestRead,
}: LoadedForm & { latestRead: () => Promise<LoadedForm> }) {
  const database = useLocalDatabase();
  const identity = useLocalIdentity();
  const colors = useThemeColors();
  const keyboardScroll = useKeyboardScroll(formScrollInsetAdjustment);
  const groupLocked = !!expense && expense.spaceId !== identity.personalSpaceId;
  const today = toLocalDate(
    new Date(),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [initial] = useState(() => {
    const reported = getLocales()[0]?.currencyCode ?? 'USD';
    const groupId = groupLocked ? expense.spaceId : initialGroupId;
    const spaceId = groupId ?? identity.personalSpaceId;
    return {
      split: !!groupId,
      groupId,
      payerId: groupLocked ? expense.payments[0].participant : undefined,
      participants: groupLocked
        ? expense.shares.map((share) => share.participant)
        : ([] as string[]),
      currency:
        expense?.currency ??
        (currencyDecimals(reported) === undefined ? 'USD' : reported),
      amount: expense
        ? formatAmount(expense.amountMinor, expense.currency)!
        : '',
      title: expense?.title ?? '',
      categoryId:
        expense?.category.id ??
        categories.find(
          (category) => category.spaceId === spaceId && !category.isArchived,
        )!.id,
      date: expense?.date ?? today,
      note: expense?.note ?? '',
    };
  });
  const [form, setForm] = useState(initial);
  const [picker, setPicker] = useState<
    'Category' | 'Select Group' | 'Who Paid?' | 'Split Between'
  >();
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const savingRef = useRef(false);
  const closingRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const spaceId = form.groupId ?? identity.personalSpaceId;
  const spaceCategories = categories.filter((item) => item.spaceId === spaceId);
  const activeCategories = spaceCategories.filter((item) => !item.isArchived);
  const category =
    spaceCategories.find((item) => item.id === form.categoryId) ??
    spaceCategories.find(isUncategorizedCategory)!;
  const group = groups.find((item) => item.id === form.groupId);
  const members = group?.members ?? [];
  const financialLocked =
    groupLocked &&
    [...expense.payments, ...expense.shares].some(
      (share) => !members.some((member) => member.id === share.participant),
    );
  const memberName = (member: GroupMember) =>
    member.name + (member.userId === identity.userId ? ' (You)' : '');
  const payer = [...members, ...formerMembers].find(
    (member) => member.id === form.payerId,
  );
  const splitCount = form.participants.length;
  const dirty =
    form.amount.trim() !== initial.amount.trim() ||
    form.title.trim() !== initial.title.trim() ||
    form.note.trim() !== initial.note.trim() ||
    category.id !== initial.categoryId ||
    form.date !== initial.date ||
    form.split !== initial.split ||
    form.groupId !== initial.groupId ||
    form.payerId !== initial.payerId ||
    form.participants.length !== initial.participants.length ||
    form.participants.some((id) => !initial.participants.includes(id));
  const amountMinor = parseAmount(
    normalizeAmount(form.amount),
    initial.currency,
  );
  const canSave =
    dirty &&
    !!form.title.trim() &&
    amountMinor !== undefined &&
    (!form.split || (!!form.groupId && !!form.payerId && splitCount > 0));

  function openPicker(next: NonNullable<typeof picker>) {
    Keyboard.dismiss();
    setPicker(next);
  }

  function chooseGroup(groupId?: string) {
    if (savingRef.current || groupLocked) return;
    if (groupId !== form.groupId) {
      const target = categories.filter(
        (item) => item.spaceId === (groupId ?? identity.personalSpaceId),
      );
      const matching =
        target.find(
          (item) =>
            !item.isArchived &&
            categoryNameKey(item.name) === categoryNameKey(category.name),
        ) ?? target.find(isUncategorizedCategory)!;
      setForm((previous) => ({
        ...previous,
        groupId,
        categoryId: matching.id,
        payerId: undefined,
        participants: [],
      }));
    }
    setPicker(undefined);
  }

  function changeSplit(enabled: boolean) {
    if (savingRef.current || groupLocked) return;
    setForm((previous) => ({ ...previous, split: enabled }));
    if (enabled) openPicker('Select Group');
    else chooseGroup();
  }

  usePreventRemove((dirty || saving) && !leaving, ({ repeat }) => {
    if (savingRef.current) return;
    // Expo Router blocks the action again unless the prevention is off when it repeats.
    const leave = () => {
      setLeaving(true);
      repeat();
    };
    if (closingRef.current) {
      leave();
      return;
    }
    Alert.alert('Discard Changes?', 'Your changes will not be saved.', [
      { text: 'Keep Editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: leave },
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
      // A read made when the form came back may have dropped its category (SHELL-64.1).
      // When it fails, the form shows the read error, not a save alert (SHELL-60.1).
      const read = await latestRead().catch(() => undefined);
      if (!read) return;
      const inSpace = read.categories.filter(
        (item) => item.spaceId === spaceId,
      );
      const categoryId = (
        inSpace.find((item) => item.id === category.id) ??
        inSpace.find(isUncategorizedCategory)!
      ).id;
      await saveExpense(
        database,
        identity,
        {
          title: form.title,
          amountMinor,
          currency: initial.currency,
          date: form.date,
          categoryId,
          note: form.note,
        },
        expense,
        form.split
          ? {
              groupId: form.groupId!,
              payerId: form.payerId!,
              participants: form.participants,
            }
          : undefined,
      );
      savingRef.current = false;
      closingRef.current = true;
      close();
    } catch (error) {
      if (error instanceof ArchivedExpenseError)
        Alert.alert(
          'Historical Shared Expense',
          'Restore its group before editing this expense.',
        );
      else
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
    <>
      <Stack.Screen
        options={{ contentStyle: { backgroundColor: colors.background } }}
      />
      <HeaderActions
        cancel={{ label: 'Cancel', disabled: saving, onPress: close }}
        confirm={{
          label: expense ? 'Save' : 'Add',
          disabled: saving || !canSave,
          onPress: () => void save(),
        }}
      />
      <ScrollView
        {...keyboardScroll}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <Text style={[styles.currency, { color: colors.textMuted }]}>
          {initial.currency}
        </Text>
        <GroupedSection>
          <TextInput
            accessibilityLabel={`Amount in ${initial.currency}`}
            keyboardType="decimal-pad"
            editable={!saving && !financialLocked}
            placeholder="0"
            placeholderTextColor={colors.placeholder}
            style={[...inputStyle, styles.amount]}
            value={form.amount}
            onChangeText={(value) => change('amount', value)}
          />
          {financialLocked && (
            <Text style={[styles.lock, { color: colors.textMuted }]}>
              Someone in this expense was removed from this group, so its amount
              and split can't be changed here. Other details can still be saved.
            </Text>
          )}
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
            onPress={() => openPicker('Category')}
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
        <GroupedSection style={styles.section}>
          <View style={styles.row}>
            <Text style={{ color: colors.text }}>Split with others</Text>
            <Switch
              accessibilityRole="switch"
              accessibilityLabel="Split with others"
              value={form.split}
              disabled={saving || groupLocked}
              accessibilityState={{ disabled: saving || groupLocked }}
              onValueChange={changeSplit}
            />
          </View>
          {form.split && (
            <>
              <SplitRow
                label="Group"
                value={group?.name ?? 'not selected'}
                disabled={saving || groupLocked}
                onPress={() => openPicker('Select Group')}
              />
              {group && (
                <>
                  <SplitRow
                    label="Paid by"
                    value={payer ? memberName(payer) : 'not selected'}
                    disabled={saving || financialLocked}
                    onPress={() => openPicker('Who Paid?')}
                  />
                  <SplitRow
                    label="Split between"
                    value={
                      splitCount === 0
                        ? 'Choose people'
                        : splitCount === 1
                          ? '1 person'
                          : `${splitCount} people`
                    }
                    disabled={saving || financialLocked}
                    onPress={() => openPicker('Split Between')}
                  />
                </>
              )}
            </>
          )}
        </GroupedSection>
      </ScrollView>
      <Sheet
        key={picker}
        visible={picker !== undefined}
        title={picker ?? ''}
        list
        onClose={() => setPicker(undefined)}
        cancel={
          picker !== 'Split Between'
            ? { label: 'Cancel', onPress: () => setPicker(undefined) }
            : undefined
        }
        confirm={
          picker === 'Split Between'
            ? { label: 'Done', onPress: () => setPicker(undefined) }
            : undefined
        }
      >
        <GroupedSection>
          {picker === 'Category' &&
            activeCategories.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={item.name}
                accessibilityState={{
                  selected: item.id === form.categoryId,
                }}
                style={styles.row}
                onPress={() => {
                  change('categoryId', item.id);
                  setPicker(undefined);
                }}
              >
                <View style={styles.categoryValue}>
                  <View style={[styles.dot, { backgroundColor: item.color }]} />
                  <Text style={{ color: colors.text, flexShrink: 1 }}>
                    {item.name}
                  </Text>
                </View>
                {item.id === form.categoryId && (
                  <Text style={{ color: colors.accent }}>✓</Text>
                )}
              </Pressable>
            ))}
          {picker === 'Category' && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="+ Add New Category"
              style={styles.row}
              onPress={() => {
                setPicker(undefined);
                router.navigate(
                  form.groupId
                    ? {
                        pathname: '/manage-categories',
                        params: {
                          scopeKind: 'group',
                          spaceId: form.groupId,
                        },
                      }
                    : '/manage-categories',
                );
              }}
            >
              <Text style={{ color: colors.accent }}>+ Add New Category</Text>
            </Pressable>
          )}
          {picker === 'Select Group' &&
            groups
              .filter((item) => !item.archived)
              .map((item) => (
                <PickerRow
                  key={item.id}
                  label={item.name}
                  selected={item.id === form.groupId}
                  onPress={() => chooseGroup(item.id)}
                />
              ))}
          {(picker === 'Who Paid?' || picker === 'Split Between') &&
            members.map((member) => (
              <PickerRow
                key={member.id}
                label={memberName(member)}
                selected={
                  picker === 'Who Paid?'
                    ? member.id === form.payerId
                    : form.participants.includes(member.id)
                }
                onPress={() => {
                  if (savingRef.current || financialLocked) return;
                  if (picker === 'Who Paid?') {
                    setForm((previous) => ({
                      ...previous,
                      payerId: member.id,
                    }));
                    setPicker(undefined);
                  } else
                    setForm((previous) => ({
                      ...previous,
                      participants: previous.participants.includes(member.id)
                        ? previous.participants.filter((id) => id !== member.id)
                        : [...previous.participants, member.id],
                    }));
                }}
              />
            ))}
        </GroupedSection>
      </Sheet>
    </>
  );
}

function SplitRow({
  label,
  value,
  disabled,
  onPress,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={styles.row}
    >
      <Text style={{ color: colors.text, flex: 1 }}>{label}</Text>
      <Text style={{ color: colors.textMuted }}>{value}</Text>
    </Pressable>
  );
}

function PickerRow({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={styles.row}
    >
      <Text style={{ color: colors.text }}>{label}</Text>
      {selected && <Text style={{ color: colors.accent }}>✓</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40 },
  missing: { textAlign: 'center', marginTop: 48, fontSize: 16 },
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
  lock: { paddingHorizontal: 16, paddingBottom: 14, fontSize: 14 },
  row: {
    minHeight: 54,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
  categoryValue: {
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
});
