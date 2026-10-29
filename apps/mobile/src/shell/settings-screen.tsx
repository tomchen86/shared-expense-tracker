import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import type { AppearanceOption } from '../ui/appearance';
import { AppearancePicker } from '../ui/appearance-picker';
import { GroupedSection } from '../ui/grouped-section';
import { useThemeColors } from '../ui/theme';
import { useTabRootBack } from '../ui/use-tab-root-back';
import {
  useAppearanceOption,
  useLocalIdentity,
  useSaveAppearanceOption,
  useSaveLocalName,
} from './local-data-gate';

const ASK_FOR_NAME = 'Please enter your name';

function alertSaveFailed() {
  Alert.alert(
    'Unable to Save Settings',
    'Your settings could not be saved. Please try again.',
  );
}

export function SettingsScreen() {
  useTabRootBack('/');
  const colors = useThemeColors();
  const identity = useLocalIdentity();
  const saveName = useSaveLocalName();
  const appearance = useAppearanceOption();
  const saveAppearance = useSaveAppearanceOption();
  const [name, setName] = useState(identity.name);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingAppearance, setIsSavingAppearance] = useState(false);
  const [needsName, setNeedsName] = useState(false);
  const saving = useRef(false);
  const savingAppearance = useRef(false);
  const savedName = useRef(identity.name);

  useEffect(() => {
    if (needsName) AccessibilityInfo.announceForAccessibility(ASK_FOR_NAME);
  }, [needsName]);

  async function finishEditing() {
    // Return and blur can arrive together, before React renders the locked field.
    if (saving.current) return;
    const trimmed = name.trim();
    if (trimmed) setNeedsName(false);
    if (trimmed === savedName.current) {
      setName(trimmed);
      return;
    }
    if (!trimmed) {
      setNeedsName(true);
      return;
    }

    saving.current = true;
    setIsSaving(true);
    try {
      await saveName(trimmed);
      savedName.current = trimmed;
      setName(trimmed);
    } catch {
      alertSaveFailed();
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  }

  async function selectAppearance(next: AppearanceOption) {
    if (savingAppearance.current || next === appearance) return;
    savingAppearance.current = true;
    setIsSavingAppearance(true);
    try {
      await saveAppearance(next);
    } catch {
      alertSaveFailed();
    } finally {
      savingAppearance.current = false;
      setIsSavingAppearance(false);
    }
  }

  return (
    <SafeAreaView
      edges={['left', 'right']}
      style={[styles.screen, { backgroundColor: colors.background }]}
    >
      <ScrollView
        automaticallyAdjustKeyboardInsets
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <Text
          accessibilityRole="header"
          style={[styles.sectionLabel, { color: colors.textMuted }]}
        >
          PROFILE
        </Text>
        <GroupedSection>
          <View style={styles.profile}>
            <Text style={[styles.label, { color: colors.text }]}>
              Your Name
            </Text>
            <TextInput
              accessibilityLabel="Your name"
              autoCapitalize="words"
              editable={!isSaving}
              onBlur={() => void finishEditing()}
              onChangeText={setName}
              onSubmitEditing={() => void finishEditing()}
              placeholder="Enter your name"
              placeholderTextColor={colors.placeholder}
              returnKeyType="done"
              style={[styles.input, { color: colors.text }]}
              value={name}
            />
            {needsName && (
              <Text style={[styles.error, { color: colors.error }]}>
                {ASK_FOR_NAME}
              </Text>
            )}
          </View>
        </GroupedSection>
        <Text style={[styles.note, { color: colors.textMuted }]}>
          Used to identify you in shared expenses and balances.
        </Text>

        <Text
          accessibilityRole="header"
          style={[
            styles.sectionLabel,
            styles.nextSection,
            { color: colors.textMuted },
          ]}
        >
          APPEARANCE
        </Text>
        <AppearancePicker
          disabled={isSavingAppearance}
          onChange={(next) => void selectAppearance(next)}
          value={appearance}
        />

        <Text
          accessibilityRole="header"
          style={[
            styles.sectionLabel,
            styles.nextSection,
            { color: colors.textMuted },
          ]}
        >
          APP
        </Text>
        <GroupedSection>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Manage Categories"
            onPress={() => router.push('/settings/manage-categories')}
            style={({ pressed }) => [
              styles.row,
              pressed && { backgroundColor: colors.pressedSurface },
            ]}
          >
            <Text style={[styles.rowLabel, { color: colors.text }]}>
              Manage Categories
            </Text>
            <Text
              accessible={false}
              style={[styles.chevron, { color: colors.textMuted }]}
            >
              ›
            </Text>
          </Pressable>
          <View
            style={[styles.separator, { backgroundColor: colors.separator }]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Archived Groups"
            onPress={() => router.push('/settings/archived-groups')}
            style={({ pressed }) => [
              styles.row,
              pressed && { backgroundColor: colors.pressedSurface },
            ]}
          >
            <Text style={[styles.rowLabel, { color: colors.text }]}>
              Archived Groups
            </Text>
            <Text
              accessible={false}
              style={[styles.chevron, { color: colors.textMuted }]}
            >
              ›
            </Text>
          </Pressable>
        </GroupedSection>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32 },
  sectionLabel: {
    fontSize: 13,
    marginLeft: 16,
    marginBottom: 8,
  },
  nextSection: { marginTop: 32 },
  profile: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  label: { fontSize: 17 },
  input: { fontSize: 17, minHeight: 44, paddingVertical: 8 },
  error: { fontSize: 15, marginBottom: 8 },
  note: { fontSize: 13, marginHorizontal: 16, marginTop: 8 },
  row: {
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowLabel: { fontSize: 17, flex: 1 },
  chevron: { fontSize: 22, marginLeft: 12 },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
  },
});
