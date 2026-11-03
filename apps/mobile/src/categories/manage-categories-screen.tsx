import { Fragment, useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { listGroups } from '../groups';
import { categoryExpenseCounts } from '../ledger/expenses';
import { useLocalDatabase, useLocalIdentity } from '../shell';
import { useThemeColors } from '../ui/theme';
import { CategoryForm } from './category-form';
import { CategoryRow } from './category-row';
import {
  createCategory,
  deleteCategory,
  isUncategorizedCategory,
  listCategories,
  moveAndArchiveCategory,
  setCategoryArchived,
  updateCategory,
  type Category,
} from './repository';

type FormState = { kind: 'add' } | { kind: 'edit'; category: Category };

export function ManageCategoriesScreen() {
  const database = useLocalDatabase();
  const identity = useLocalIdentity();
  const colors = useThemeColors();
  const { scopeKind, spaceId } = useLocalSearchParams();
  const groupId =
    scopeKind === 'group' && typeof spaceId === 'string' && spaceId
      ? spaceId
      : undefined;
  const managedSpaceId = groupId ?? identity.personalSpaceId;
  const [checkedGroup, setCheckedGroup] = useState<{
    id: string | undefined;
    exists: boolean;
    archived: boolean;
  }>();
  const groupExists = groupId
    ? checkedGroup?.id === groupId
      ? checkedGroup.exists
      : undefined
    : true;
  const groupArchived =
    !!groupId && checkedGroup?.id === groupId && checkedGroup.archived;
  const [categories, setCategories] = useState<Category[]>([]);
  const [expenseCounts, setExpenseCounts] = useState(new Map<string, number>());
  const loadedRef = useRef(false);
  const [formState, setFormState] = useState<FormState | null>(null);
  const [movingCategory, setMovingCategory] = useState<Category | null>(null);
  const updatingRef = useRef(false);
  const [updating, setUpdating] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadedRef.current = false;
      let active = true;
      void Promise.all([
        listCategories(database, managedSpaceId),
        categoryExpenseCounts(database),
        groupId ? listGroups(database) : Promise.resolve([]),
      ])
        .then(([rows, counts, groups]) => {
          if (active) {
            loadedRef.current = true;
            setCategories(rows);
            setExpenseCounts(counts);
            const group = groups.find((group) => group.id === groupId);
            setCheckedGroup({
              id: groupId,
              exists: group !== undefined,
              archived: group?.archived ?? false,
            });
          }
        })
        .catch(() => undefined);
      return () => {
        active = false;
      };
    }, [database, groupId, managedSpaceId]),
  );

  const openAddForm = useCallback(() => {
    if (loadedRef.current) {
      setFormState({ kind: 'add' });
      return;
    }
    void listCategories(database, managedSpaceId)
      .then((rows) => {
        loadedRef.current = true;
        setCategories(rows);
        setFormState({ kind: 'add' });
      })
      .catch(() => undefined);
  }, [database, managedSpaceId]);

  async function handleSave(input: { name: string; color: string }) {
    if (formState?.kind === 'edit') {
      const editingId = formState.category.id;
      await updateCategory(database, {
        id: editingId,
        name: input.name,
        color: input.color,
      });
      setCategories((current) =>
        current.map((category) =>
          category.id === editingId
            ? { ...category, name: input.name, color: input.color }
            : category,
        ),
      );
    } else {
      const created = await createCategory(database, {
        ...input,
        createdByUserId: identity.userId,
        spaceId: managedSpaceId,
      });
      setCategories((current) => [...current, created]);
    }
    setFormState(null);
  }

  function updateFailed() {
    Alert.alert(
      'Unable to Update Category',
      'Your change could not be saved. Please try again.',
    );
  }

  async function update(write: () => Promise<void>, saved: () => void) {
    if (updatingRef.current) return;
    updatingRef.current = true;
    setUpdating(true);
    try {
      await write();
      saved();
    } catch {
      updateFailed();
    } finally {
      updatingRef.current = false;
      setUpdating(false);
    }
  }

  function showArchived(id: string, isArchived: boolean) {
    setCategories((current) =>
      current.map((category) =>
        category.id === id ? { ...category, isArchived } : category,
      ),
    );
  }

  function archive(category: Category, archived: boolean) {
    void update(
      () => setCategoryArchived(database, category.id, archived),
      () => showArchived(category.id, archived),
    );
  }

  async function remove(category: Category) {
    if (updatingRef.current) return;
    updatingRef.current = true;
    try {
      const counts = await categoryExpenseCounts(database);
      setExpenseCounts(counts);
      const count = counts.get(category.id) ?? 0;
      if (count === 0) {
        Alert.alert(
          'Delete Category?',
          'This permanently removes the category.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () =>
                void update(
                  () => deleteCategory(database, category.id),
                  () =>
                    setCategories((current) =>
                      current.filter((item) => item.id !== category.id),
                    ),
                ),
            },
          ],
        );
      } else if (!category.isArchived) {
        Alert.alert(
          `Archive “${category.name}”?`,
          `This category is used by ${count} ${count === 1 ? 'expense' : 'expenses'}. Existing expenses will keep their category, but it will no longer appear for new expenses.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Move Expenses…',
              onPress: () => setMovingCategory(category),
            },
            { text: 'Archive', onPress: () => archive(category, true) },
          ],
        );
      }
    } catch {
      updateFailed();
    } finally {
      updatingRef.current = false;
    }
  }

  function move(target: Category) {
    if (!movingCategory) return;
    const sourceId = movingCategory.id;
    void update(
      () => moveAndArchiveCategory(database, sourceId, target.id),
      () => {
        showArchived(sourceId, true);
        setExpenseCounts((current) => {
          const next = new Map(current);
          next.set(
            target.id,
            (next.get(target.id) ?? 0) + (next.get(sourceId) ?? 0),
          );
          next.delete(sourceId);
          return next;
        });
        setMovingCategory(null);
      },
    );
  }

  function cancelMove() {
    if (!updatingRef.current) setMovingCategory(null);
  }

  const editingCategory =
    formState?.kind === 'edit' ? formState.category : null;
  const otherCategories = editingCategory
    ? categories.filter((category) => category.id !== editingCategory.id)
    : categories;
  const screenOptions = useMemo(
    () => ({
      title: groupId ? 'Group Categories' : 'Manage Categories',
      headerRight:
        groupExists && !groupArchived
          ? () => (
              <Pressable
                accessibilityLabel="Add category"
                accessibilityRole="button"
                hitSlop={8}
                onPress={openAddForm}
                style={({ pressed }) => [
                  styles.addButton,
                  pressed && styles.addButtonPressed,
                ]}
              >
                <Text
                  accessible={false}
                  style={[styles.addIcon, { color: colors.accent }]}
                >
                  +
                </Text>
              </Pressable>
            )
          : undefined,
    }),
    [openAddForm, groupId, groupExists, groupArchived, colors.accent],
  );

  const activeCategories = categories.filter(
    (category) => !category.isArchived,
  );
  const archivedCategories = categories.filter(
    (category) => category.isArchived,
  );

  function rows(items: Category[], readOnly = false) {
    return items.map((category, index) => (
      <Fragment key={category.id}>
        {index > 0 && (
          <View
            style={[styles.separator, { backgroundColor: colors.separator }]}
          />
        )}
        <CategoryRow
          category={category}
          used={(expenseCounts.get(category.id) ?? 0) > 0}
          readOnly={readOnly}
          onPress={
            isUncategorizedCategory(category)
              ? undefined
              : () =>
                  category.isArchived
                    ? archive(category, false)
                    : setFormState({ kind: 'edit', category })
          }
          onRemove={() => void remove(category)}
        />
      </Fragment>
    ));
  }

  return (
    <SafeAreaView
      edges={['left', 'right']}
      style={[styles.screen, { backgroundColor: colors.background }]}
    >
      <Stack.Screen options={screenOptions} />

      {groupExists === false && (
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.content}
        >
          <Text style={{ color: colors.text }}>Group not found.</Text>
        </ScrollView>
      )}
      {groupExists && (
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.content}
        >
          {groupArchived && (
            <Text style={[styles.readOnlyNotice, { color: colors.text }]}>
              Archived group. Categories are read-only.
            </Text>
          )}
          <View style={styles.sectionHeader}>
            <Text
              accessibilityRole="header"
              style={[styles.sectionLabel, { color: colors.textMuted }]}
            >
              CATEGORIES
            </Text>
            {!groupArchived && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="About categories"
                hitSlop={8}
                style={styles.about}
                onPress={() =>
                  Alert.alert(
                    'About Categories',
                    'Tap a category to edit it. Swipe left to remove a category. Categories used by expenses can be archived or moved, so historical classifications stay intact. Uncategorized is reserved and cannot be renamed or removed.',
                  )
                }
              >
                <Text style={{ color: colors.accent }}>ⓘ</Text>
              </Pressable>
            )}
          </View>
          {/* Reset open swipes when the group's archived state changes. */}
          <View
            key={groupArchived ? 'read-only' : 'editable'}
            style={[styles.section, { backgroundColor: colors.surface }]}
          >
            {rows(activeCategories, groupArchived)}
          </View>
          {archivedCategories.length > 0 && (
            <View
              style={[styles.archived, { backgroundColor: colors.background }]}
            >
              <Text
                accessibilityRole="header"
                style={[styles.sectionLabel, { color: colors.textMuted }]}
              >
                ARCHIVED
              </Text>
              <View
                style={[styles.section, { backgroundColor: colors.surface }]}
              >
                {rows(archivedCategories)}
              </View>
              <Text style={[styles.footer, { color: colors.textMuted }]}>
                Archived categories remain on historical expenses and in
                Insights.
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      {groupExists && formState !== null && (
        <CategoryForm
          editingCategory={editingCategory}
          onCancel={() => setFormState(null)}
          onSave={handleSave}
          otherCategories={otherCategories}
        />
      )}
      {groupExists && movingCategory && (
        <Modal visible animationType="slide" onRequestClose={cancelMove}>
          <SafeAreaProvider>
            <SafeAreaView
              style={{ flex: 1, backgroundColor: colors.background }}
            >
              <View
                style={[
                  styles.moveHeader,
                  { borderBottomColor: colors.separator },
                ]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Cancel"
                  disabled={updating}
                  accessibilityState={{ disabled: updating }}
                  onPress={cancelMove}
                  style={styles.cancel}
                >
                  <Text style={{ color: colors.accent }}>Cancel</Text>
                </Pressable>
                <Text
                  accessibilityRole="header"
                  style={[styles.moveTitle, { color: colors.text }]}
                >
                  Move {movingCategory.name} Expenses
                </Text>
              </View>
              <ScrollView contentContainerStyle={styles.content}>
                <View
                  style={[styles.section, { backgroundColor: colors.surface }]}
                >
                  {activeCategories
                    .filter((category) => category.id !== movingCategory.id)
                    .map((category) => (
                      <Pressable
                        key={category.id}
                        accessibilityRole="button"
                        accessibilityLabel={category.name}
                        accessibilityState={{ disabled: updating }}
                        disabled={updating}
                        onPress={() => move(category)}
                        style={({ pressed }) => [
                          styles.row,
                          pressed && { backgroundColor: colors.pressedSurface },
                        ]}
                      >
                        <View
                          style={[
                            styles.colorDot,
                            { backgroundColor: category.color },
                          ]}
                        />
                        <Text style={[styles.rowLabel, { color: colors.text }]}>
                          {category.name}
                        </Text>
                      </Pressable>
                    ))}
                </View>
              </ScrollView>
            </SafeAreaView>
          </SafeAreaProvider>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32 },
  readOnlyNotice: { fontSize: 16, marginBottom: 20 },
  addButton: {
    minWidth: 36,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonPressed: {
    opacity: 0.6,
  },
  addIcon: {
    fontSize: 28,
    lineHeight: 30,
  },
  sectionLabel: {
    fontSize: 13,
    marginLeft: 16,
    marginBottom: 8,
  },
  section: { borderRadius: 12, overflow: 'hidden' },
  row: {
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  colorDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginRight: 14,
  },
  rowLabel: { fontSize: 17, flex: 1 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  about: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  archived: { marginTop: 28 },
  footer: { fontSize: 13, marginHorizontal: 16, marginTop: 8 },
  moveHeader: {
    minHeight: 56,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  moveTitle: { fontSize: 17, fontWeight: '600', flex: 1 },
  cancel: { minHeight: 48, minWidth: 64, justifyContent: 'center' },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 50,
  },
});
