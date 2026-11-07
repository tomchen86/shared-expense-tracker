import { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { CategoryForm } from '../categories/category-form';
import { DateField } from '../ui/date-field';
import { formScrollInsetAdjustment } from '../ui/form-presentation';
import { GroupedSection } from '../ui/grouped-section';
import { HeaderActions } from '../ui/header-actions';
import { MenuField } from '../ui/menu-field';
import { useThemeColors } from '../ui/theme';
import { useKeyboardScroll } from '../ui/use-keyboard-scroll';
import { useSheetScroll } from '../ui/use-sheet-scroll';
import {
  useExpenseForm,
  useExpenseFormData,
  type ExpenseFormEditor,
  type ExpenseFormProps,
} from './use-expense-form';

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
  const colors = useThemeColors();
  const { loaded, latestRead, reread } = useExpenseFormData(
    expenseId,
    initialGroupId,
  );
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
  return <ExpenseEditor {...loaded} latestRead={latestRead} reread={reread} />;
}

function ExpenseEditor(props: ExpenseFormProps) {
  const colors = useThemeColors();
  const sheetScroll = useSheetScroll();
  const keyboardScroll = useKeyboardScroll(
    sheetScroll.scrollProps.contentInsetAdjustmentBehavior,
  );
  const editor = useExpenseForm(props);
  const { form, saving, currency, financialLocked, change } = editor;
  const [addingCategory, setAddingCategory] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const inputStyle = [styles.input, { color: colors.text }];
  return (
    <>
      <Stack.Screen
        options={{
          ...sheetScroll.screenOptions,
          contentStyle: { backgroundColor: colors.background },
        }}
      />
      <HeaderActions
        cancel={{ label: 'Cancel', disabled: saving, onPress: editor.close }}
        confirm={{
          label: editor.isEdit ? 'Save' : 'Add',
          disabled: saving || !editor.canSave,
          onPress: () => void editor.save(),
        }}
      />
      <ScrollView
        {...keyboardScroll}
        {...sheetScroll.scrollProps}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 40 + sheetScroll.bottomPadding },
        ]}
      >
        <GroupedSection>
          <TextInput
            accessibilityLabel="Expense title"
            editable={!saving}
            placeholder="Title"
            placeholderTextColor={colors.placeholder}
            style={[...inputStyle, form.title ? styles.typedTitle : undefined]}
            value={form.title}
            onChangeText={(value) => change('title', value)}
          />
          <View style={styles.amountRow}>
            <Text style={[styles.currency, { color: colors.textMuted }]}>
              {currency}
            </Text>
            <TextInput
              accessibilityLabel={`Amount in ${currency}`}
              keyboardType="decimal-pad"
              editable={!saving && !financialLocked}
              placeholder="0"
              placeholderTextColor={colors.placeholder}
              style={[...inputStyle, styles.amount]}
              value={form.amount}
              onChangeText={(value) => change('amount', value)}
            />
          </View>
          {financialLocked && (
            <Text style={[styles.lock, { color: colors.textMuted }]}>
              Someone in this expense was removed from this group, so its amount
              and split can't be changed here. Other details can still be saved.
            </Text>
          )}
        </GroupedSection>
        <GroupedSection style={styles.section}>
          <CategoryField
            editor={editor}
            onAdd={() => setAddingCategory(true)}
          />
          <DateField
            label="Date"
            value={form.date}
            maximumDate={editor.today}
            disabled={saving}
            onChange={editor.changeDate}
            onOpen={() => setDateOpen(true)}
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
        <SplitSection editor={editor} />
        {/* iOS hands the press that closes the calendar to the form as well. */}
        {dateOpen && (
          <View
            collapsable={false}
            onTouchStart={() => setDateOpen(false)}
            style={StyleSheet.absoluteFill}
          />
        )}
      </ScrollView>
      {addingCategory && (
        <CategoryForm
          editingCategory={null}
          otherCategories={editor.spaceCategories}
          onCancel={() => setAddingCategory(false)}
          onSave={async (input) => {
            await editor.addCategory(input);
            setAddingCategory(false);
          }}
        />
      )}
    </>
  );
}

function CategoryField({
  editor: { form, saving, category, spaceCategories, group, change },
  onAdd,
}: {
  editor: ExpenseFormEditor;
  onAdd: () => void;
}) {
  return (
    <MenuField
      title="Category"
      label="Category"
      value={category.name}
      dot={category.color}
      disabled={saving}
      options={spaceCategories
        .filter((item) => !item.isArchived)
        .map(({ id, name, color }) => ({ id, name, color }))}
      selected={[form.categoryId]}
      onSelect={(id) => change('categoryId', id)}
      action={
        group?.archived
          ? undefined
          : { label: '+ Add New Category', onPress: onAdd }
      }
    />
  );
}

function SplitSection({
  editor: {
    form,
    saving,
    groups,
    group,
    members,
    payer,
    groupLocked,
    financialLocked,
    memberName,
    changeSplit,
    chooseGroup,
    choosePayer,
    toggleParticipant,
  },
}: {
  editor: ExpenseFormEditor;
}) {
  const colors = useThemeColors();
  const splitCount = form.participants.length;
  const memberOptions = members.map((member) => ({
    id: member.id,
    name: memberName(member),
  }));
  return (
    <GroupedSection style={styles.section}>
      <View style={styles.row}>
        <Text style={[styles.rowLabel, { color: colors.text }]}>
          Split with others
        </Text>
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
          <MenuField
            title="Select Group"
            label="Group"
            value={group?.name ?? 'not selected'}
            disabled={saving || groupLocked}
            options={groups
              .filter((item) => !item.archived)
              .map(({ id, name }) => ({ id, name }))}
            selected={form.groupId ? [form.groupId] : []}
            empty="No Groups"
            openOnMount={!form.groupId}
            onSelect={chooseGroup}
          />
          {group && (
            <>
              <MenuField
                title="Who Paid?"
                label="Paid by"
                value={payer ? memberName(payer) : 'not selected'}
                disabled={saving || financialLocked}
                options={memberOptions}
                selected={form.payerId ? [form.payerId] : []}
                onSelect={choosePayer}
              />
              <MenuField
                multiple
                title="Split Between"
                label="Split between"
                value={
                  splitCount === 0
                    ? 'Choose people'
                    : splitCount === 1
                      ? '1 person'
                      : `${splitCount} people`
                }
                disabled={saving || financialLocked}
                options={memberOptions}
                selected={form.participants}
                onSelect={toggleParticipant}
              />
            </>
          )}
        </>
      )}
    </GroupedSection>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40 },
  missing: { textAlign: 'center', marginTop: 48, fontSize: 16 },
  section: { marginTop: 24 },
  input: {
    fontSize: 17,
    minHeight: 54,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  typedTitle: { fontWeight: '600' },
  amountRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16 },
  currency: { fontSize: 17 },
  amount: { flex: 1, fontSize: 32, minHeight: 72 },
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
  rowLabel: { flex: 1, fontSize: 17 },
});
