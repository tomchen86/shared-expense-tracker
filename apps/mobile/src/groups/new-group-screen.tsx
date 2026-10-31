import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, Stack } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useLocalDatabase, useLocalIdentity } from '../shell';
import { GroupedSection } from '../ui/grouped-section';
import { HeaderActions } from '../ui/header-actions';
import { useThemeColors } from '../ui/theme';
import { createGroup } from './index';
import { useRequireName } from './use-require-name';

export function NewGroupScreen() {
  const database = useLocalDatabase();
  const identity = useLocalIdentity();
  const requireName = useRequireName();
  const colors = useThemeColors();
  const [name, setName] = useState('');
  const [status, setStatus] = useState<'editing' | 'saving' | 'saved'>(
    'editing',
  );
  const submitting = useRef(false);
  const saving = status === 'saving';
  usePreventRemove(saving, () => {});
  // Release the navigation guard before dismissing the successfully saved form.
  useEffect(() => {
    if (status === 'saved') router.back();
  }, [status]);

  async function submit() {
    if (submitting.current || !name.trim() || requireName()) return;
    submitting.current = true;
    setStatus('saving');
    try {
      await createGroup(database, name.trim(), identity);
      setStatus('saved');
    } catch {
      submitting.current = false;
      setStatus('editing');
      Alert.alert(
        'Unable to Create Group',
        'Your group could not be saved. Please try again.',
      );
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ gestureEnabled: !saving }} />
      <HeaderActions
        cancel={{
          label: 'Cancel',
          disabled: saving,
          onPress: () => router.back(),
        }}
        confirm={{
          label: 'Create',
          disabled: saving || !name.trim(),
          onPress: () => void submit(),
        }}
      />
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
          GROUP DETAILS
        </Text>
        <GroupedSection>
          <View style={styles.row}>
            <Text style={[styles.label, { color: colors.text }]}>Name</Text>
            <TextInput
              accessibilityLabel="Group name"
              autoCapitalize="words"
              autoCorrect={false}
              autoFocus
              editable={!saving}
              onChangeText={setName}
              onSubmitEditing={() => void submit()}
              placeholder="Group name"
              placeholderTextColor={colors.placeholder}
              returnKeyType="done"
              style={[styles.input, { color: colors.text }]}
              value={name}
            />
          </View>
        </GroupedSection>
        <Text style={[styles.note, { color: colors.textMuted }]}>
          Members can be added after the group is created.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32 },
  sectionLabel: { fontSize: 13, marginHorizontal: 16, marginBottom: 8 },
  row: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  label: { fontSize: 17 },
  input: {
    minHeight: 44,
    flex: 1,
    marginLeft: 16,
    fontSize: 17,
    textAlign: 'right',
  },
  note: { fontSize: 13, marginHorizontal: 16, marginTop: 8, lineHeight: 18 },
});
