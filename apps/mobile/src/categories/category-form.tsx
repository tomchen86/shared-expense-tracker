import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  CATEGORY_COLORS,
  MAX_CATEGORY_NAME_LENGTH,
  availableCategoryColors,
  categoryNameProblem,
} from '@shared-expense/domain';
import { useThemeColors } from '../ui/theme';
import { Sheet } from '../ui/sheet';
import type { Category } from './repository';

const ALREADY_EXISTS = 'A category with this name already exists.';
const ALL_COLORS_USED = 'All category colors are already in use.';

export interface CategoryFormProps {
  editingCategory: Category | null;
  otherCategories: readonly Category[];
  onCancel: () => void;
  onSave: (input: { name: string; color: string }) => Promise<void>;
}

export function CategoryForm({
  editingCategory,
  otherCategories,
  onCancel,
  onSave,
}: CategoryFormProps) {
  const colors = useThemeColors();
  const freeColors = availableCategoryColors(otherCategories);
  const freeColorSet = new Set(freeColors);

  const [name, setName] = useState(editingCategory ? editingCategory.name : '');
  const [selectedColor, setSelectedColor] = useState<string | undefined>(() => {
    if (editingCategory) {
      return (
        CATEGORY_COLORS.find(
          (paletteColor) =>
            paletteColor.toUpperCase() === editingCategory.color.toUpperCase(),
        ) ?? editingCategory.color
      );
    }
    return freeColors[0];
  });
  const [duplicateError, setDuplicateError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  function handleCancel() {
    if (savingRef.current) return;
    onCancel();
  }

  async function handleSubmit() {
    if (savingRef.current) return;
    const trimmed = name.trim();
    if (!trimmed || !selectedColor) return;

    const problem = categoryNameProblem(trimmed, otherCategories);
    if (problem === 'duplicate') {
      setDuplicateError(true);
      AccessibilityInfo.announceForAccessibility(ALREADY_EXISTS);
      return;
    }
    if (problem !== undefined) return;

    savingRef.current = true;
    setIsSaving(true);
    try {
      await onSave({ name: trimmed, color: selectedColor });
    } catch {
      Alert.alert(
        'Unable to Save Category',
        'Your category could not be saved. Please try again.',
      );
    } finally {
      savingRef.current = false;
      if (mountedRef.current) {
        setIsSaving(false);
      }
    }
  }

  const title = editingCategory ? 'Edit Category' : 'New Category';
  const submitLabel = editingCategory ? 'Save' : 'Add';
  const submitDisabled = isSaving || name.trim().length === 0 || !selectedColor;
  const allColorsUsed = freeColors.length === 0;

  return (
    <Sheet
      visible
      title={title}
      onClose={handleCancel}
      dismissible={!isSaving}
      cancel={{ label: 'Cancel', disabled: isSaving, onPress: handleCancel }}
      confirm={{
        label: submitLabel,
        disabled: submitDisabled,
        onPress: () => void handleSubmit(),
      }}
    >
      <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
        NAME
      </Text>
      <View style={[styles.section, { backgroundColor: colors.surface }]}>
        <TextInput
          accessibilityLabel="Category name"
          editable={!isSaving}
          maxLength={MAX_CATEGORY_NAME_LENGTH}
          onChangeText={(next) => {
            setName(next);
            if (duplicateError) setDuplicateError(false);
          }}
          placeholder="Category name"
          placeholderTextColor={colors.placeholder}
          style={[styles.input, { color: colors.text }]}
          value={name}
        />
      </View>
      {duplicateError && (
        <Text style={[styles.error, { color: colors.error }]}>
          {ALREADY_EXISTS}
        </Text>
      )}

      <Text
        style={[
          styles.sectionLabel,
          styles.nextSection,
          { color: colors.textMuted },
        ]}
      >
        COLOR
      </Text>
      <View
        style={[
          styles.section,
          styles.colorSection,
          { backgroundColor: colors.surface },
        ]}
      >
        <View style={styles.colorGrid}>
          {CATEGORY_COLORS.map((color) => {
            const available = freeColorSet.has(color);
            const unavailable = !available;
            const selected =
              available && selectedColor?.toUpperCase() === color.toUpperCase();
            return (
              <Pressable
                key={color}
                accessibilityLabel={
                  unavailable
                    ? `Color ${color} already in use`
                    : `Select color ${color}`
                }
                accessibilityRole="button"
                accessibilityState={{ disabled: unavailable, selected }}
                disabled={unavailable}
                hitSlop={4}
                onPress={() => {
                  if (!unavailable && !savingRef.current) {
                    setSelectedColor(color);
                  }
                }}
                style={[
                  styles.colorButton,
                  { backgroundColor: color },
                  unavailable && styles.unavailableColorButton,
                  selected && styles.selectedColorButton,
                  selected && { borderColor: colors.accent },
                ]}
              />
            );
          })}
        </View>
      </View>
      {allColorsUsed && (
        <Text style={[styles.note, { color: colors.textMuted }]}>
          {ALL_COLORS_USED}
        </Text>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    fontSize: 13,
    marginLeft: 16,
    marginBottom: 8,
  },
  nextSection: {
    marginTop: 28,
  },
  section: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  input: {
    fontSize: 17,
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  error: {
    fontSize: 15,
    marginHorizontal: 16,
    marginTop: 8,
  },
  colorSection: {
    padding: 16,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  colorButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedColorButton: {
    borderWidth: 3,
  },
  unavailableColorButton: {
    opacity: 0.22,
  },
  note: {
    fontSize: 13,
    marginHorizontal: 16,
    marginTop: 8,
  },
});
