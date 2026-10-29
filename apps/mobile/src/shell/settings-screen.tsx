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
import { useTabRootBack } from '../ui/use-tab-root-back';
import { useLocalIdentity, useSaveLocalName } from './local-data-gate';

const ASK_FOR_NAME = 'Please enter your name';

export function SettingsScreen() {
  useTabRootBack('/');
  const identity = useLocalIdentity();
  const saveName = useSaveLocalName();
  const [name, setName] = useState(identity.name);
  const [isSaving, setIsSaving] = useState(false);
  const [needsName, setNeedsName] = useState(false);
  const saving = useRef(false);
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
      Alert.alert(
        'Unable to Save Settings',
        'Your settings could not be saved. Please try again.',
      );
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  }

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.screen}>
      <ScrollView
        automaticallyAdjustKeyboardInsets
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <Text accessibilityRole="header" style={styles.sectionLabel}>
          PROFILE
        </Text>
        <View style={styles.section}>
          <View style={styles.profile}>
            <Text style={styles.label}>Your Name</Text>
            <TextInput
              accessibilityLabel="Your name"
              autoCapitalize="words"
              editable={!isSaving}
              onBlur={() => void finishEditing()}
              onChangeText={setName}
              onSubmitEditing={() => void finishEditing()}
              placeholder="Enter your name"
              placeholderTextColor="#767680"
              returnKeyType="done"
              style={styles.input}
              value={name}
            />
            {needsName && <Text style={styles.error}>{ASK_FOR_NAME}</Text>}
          </View>
        </View>
        <Text style={styles.note}>
          Used to identify you in shared expenses and balances.
        </Text>

        <Text
          accessibilityRole="header"
          style={[styles.sectionLabel, styles.nextSection]}
        >
          APP
        </Text>
        <View style={styles.section}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Manage Categories"
            onPress={() => router.push('/settings/manage-categories')}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <Text style={styles.rowLabel}>Manage Categories</Text>
            <Text accessible={false} style={styles.chevron}>
              ›
            </Text>
          </Pressable>
          <View style={styles.separator} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Archived Groups"
            onPress={() => router.push('/settings/archived-groups')}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <Text style={styles.rowLabel}>Archived Groups</Text>
            <Text accessible={false} style={styles.chevron}>
              ›
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f2f2f7' },
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32 },
  sectionLabel: {
    color: '#636366',
    fontSize: 13,
    marginLeft: 16,
    marginBottom: 8,
  },
  nextSection: { marginTop: 32 },
  section: { backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden' },
  profile: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  label: { color: '#1c1c1e', fontSize: 17 },
  input: { color: '#1c1c1e', fontSize: 17, minHeight: 44, paddingVertical: 8 },
  error: { color: '#b42318', fontSize: 15, marginBottom: 8 },
  note: { color: '#636366', fontSize: 13, marginHorizontal: 16, marginTop: 8 },
  row: {
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowLabel: { color: '#1c1c1e', fontSize: 17, flex: 1 },
  chevron: { color: '#636366', fontSize: 22, marginLeft: 12 },
  pressed: { backgroundColor: '#e5e5ea' },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#c6c6c8',
    marginLeft: 16,
  },
});
