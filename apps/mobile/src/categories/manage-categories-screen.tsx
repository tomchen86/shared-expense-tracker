import { Fragment, useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { useLocalDatabase } from '../shell';
import { CategoryForm } from './category-form';
import {
  createCategory,
  isUncategorizedCategory,
  listCategories,
  updateCategory,
  type Category,
} from './repository';

type FormState = { kind: 'add' } | { kind: 'edit'; category: Category };

export function ManageCategoriesScreen() {
  const database = useLocalDatabase();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [formState, setFormState] = useState<FormState | null>(null);

  useEffect(() => {
    let active = true;
    void listCategories(database)
      .then((rows) => {
        if (active) {
          setCategories(rows);
          setLoaded(true);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [database]);

  const openAddForm = useCallback(() => {
    if (loaded) {
      setFormState({ kind: 'add' });
      return;
    }
    void listCategories(database)
      .then((rows) => {
        setCategories(rows);
        setLoaded(true);
        setFormState({ kind: 'add' });
      })
      .catch(() => undefined);
  }, [database, loaded]);

  async function handleSave(input: { name: string; color: string }) {
    if (formState?.kind === 'edit') {
      await updateCategory(database, {
        id: formState.category.id,
        name: input.name,
        color: input.color,
      });
    } else {
      await createCategory(database, input);
    }
    const refreshed = await listCategories(database);
    setCategories(refreshed);
    setFormState(null);
  }

  const editingCategory =
    formState?.kind === 'edit' ? formState.category : null;
  const otherCategories = editingCategory
    ? categories.filter((category) => category.id !== editingCategory.id)
    : categories;

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.screen}>
      <Stack.Screen
        options={{
          headerRight: () => (
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
              <Text accessible={false} style={styles.addIcon}>
                +
              </Text>
            </Pressable>
          ),
        }}
      />

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        <Text accessibilityRole="header" style={styles.sectionLabel}>
          CATEGORIES
        </Text>
        <View style={styles.section}>
          {categories.map((category, index) => {
            const uncategorized = isUncategorizedCategory(category);
            return (
              <Fragment key={category.id}>
                {index > 0 && <View style={styles.separator} />}
                {uncategorized ? (
                  <View style={styles.row}>
                    <View
                      style={[
                        styles.colorDot,
                        { backgroundColor: category.color },
                      ]}
                    />
                    <Text style={styles.rowLabel}>{category.name}</Text>
                  </View>
                ) : (
                  <Pressable
                    accessibilityLabel={category.name}
                    accessibilityRole="button"
                    onPress={() => setFormState({ kind: 'edit', category })}
                    style={({ pressed }) => [
                      styles.row,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View
                      style={[
                        styles.colorDot,
                        { backgroundColor: category.color },
                      ]}
                    />
                    <Text style={styles.rowLabel}>{category.name}</Text>
                  </Pressable>
                )}
              </Fragment>
            );
          })}
        </View>
      </ScrollView>

      {formState !== null && (
        <CategoryForm
          editingCategory={editingCategory}
          onCancel={() => setFormState(null)}
          onSave={handleSave}
          otherCategories={otherCategories}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f2f2f7' },
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32 },
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
    color: '#007aff',
    fontSize: 28,
    lineHeight: 30,
  },
  sectionLabel: {
    color: '#636366',
    fontSize: 13,
    marginLeft: 16,
    marginBottom: 8,
  },
  section: { backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden' },
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
  rowLabel: { color: '#1c1c1e', fontSize: 17, flex: 1 },
  pressed: { backgroundColor: '#e5e5ea' },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#c6c6c8',
    marginLeft: 50,
  },
});
