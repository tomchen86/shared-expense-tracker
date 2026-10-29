import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  CATEGORY_COLORS,
  MAX_CATEGORY_NAME_LENGTH,
  availableCategoryColors,
  categoryNameProblem,
} from '@shared-expense/domain';
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
    <Modal
      allowSwipeDismissal={!isSaving}
      animationType="slide"
      onRequestClose={handleCancel}
      presentationStyle="pageSheet"
      visible
    >
      <SafeAreaView style={styles.sheet}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Cancel"
            accessibilityRole="button"
            accessibilityState={{ disabled: isSaving }}
            disabled={isSaving}
            hitSlop={8}
            onPress={handleCancel}
            style={({ pressed }) => [
              styles.headerButton,
              pressed && !isSaving && styles.headerButtonPressed,
            ]}
          >
            <Text
              style={[styles.cancelText, isSaving && styles.disabledButtonText]}
            >
              Cancel
            </Text>
          </Pressable>
          <Text accessibilityRole="header" style={styles.headerTitle}>
            {title}
          </Text>
          <Pressable
            accessibilityLabel={submitLabel}
            accessibilityRole="button"
            accessibilityState={{ disabled: submitDisabled }}
            disabled={submitDisabled}
            hitSlop={8}
            onPress={() => void handleSubmit()}
            style={({ pressed }) => [
              styles.headerButton,
              styles.headerSubmitButton,
              pressed && !submitDisabled && styles.headerButtonPressed,
            ]}
          >
            <Text
              style={[
                styles.submitText,
                submitDisabled && styles.disabledButtonText,
              ]}
            >
              {submitLabel}
            </Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.sectionLabel}>NAME</Text>
          <View style={styles.section}>
            <TextInput
              accessibilityLabel="Category name"
              editable={!isSaving}
              maxLength={MAX_CATEGORY_NAME_LENGTH}
              onChangeText={(next) => {
                setName(next);
                if (duplicateError) setDuplicateError(false);
              }}
              placeholder="Category name"
              placeholderTextColor="#767680"
              style={styles.input}
              value={name}
            />
          </View>
          {duplicateError && <Text style={styles.error}>{ALREADY_EXISTS}</Text>}

          <Text style={[styles.sectionLabel, styles.nextSection]}>COLOR</Text>
          <View style={[styles.section, styles.colorSection]}>
            <View style={styles.colorGrid}>
              {CATEGORY_COLORS.map((color) => {
                const available = freeColorSet.has(color);
                const unavailable = !available;
                const selected =
                  available &&
                  selectedColor?.toUpperCase() === color.toUpperCase();
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
                    ]}
                  />
                );
              })}
            </View>
          </View>
          {allColorsUsed && <Text style={styles.note}>{ALL_COLORS_USED}</Text>}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: '#f2f2f7' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#c6c6c8',
    backgroundColor: '#fff',
  },
  headerButton: {
    minWidth: 64,
    minHeight: 36,
    justifyContent: 'center',
  },
  headerSubmitButton: {
    alignItems: 'flex-end',
  },
  headerButtonPressed: {
    opacity: 0.6,
  },
  headerTitle: {
    color: '#1c1c1e',
    fontSize: 17,
    fontWeight: '600',
  },
  cancelText: {
    color: '#007aff',
    fontSize: 17,
  },
  submitText: {
    color: '#007aff',
    fontSize: 17,
    fontWeight: '600',
  },
  disabledButtonText: {
    color: '#99999d',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
  },
  sectionLabel: {
    color: '#636366',
    fontSize: 13,
    marginLeft: 16,
    marginBottom: 8,
  },
  nextSection: {
    marginTop: 28,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
  },
  input: {
    color: '#1c1c1e',
    fontSize: 17,
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  error: {
    color: '#b42318',
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
    borderColor: '#007aff',
    borderWidth: 3,
  },
  unavailableColorButton: {
    opacity: 0.22,
  },
  note: {
    color: '#636366',
    fontSize: 13,
    marginHorizontal: 16,
    marginTop: 8,
  },
});
