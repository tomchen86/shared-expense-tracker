import { useRef, useState, type ComponentRef } from 'react';
import { TextInput } from 'react-native';
import { GroupedSection } from './grouped-section';
import { Sheet } from './sheet';
import { useThemeColors } from './theme';

export function useFilterNamePrompt(onSave: (name: string) => void) {
  const colors = useThemeColors();
  const [name, setName] = useState<string>();
  const nameField = useRef<ComponentRef<typeof TextInput>>(null);
  const close = () => setName(undefined);
  return {
    prompt: (suggested: string) => setName(suggested),
    sheet: name !== undefined && (
      <Sheet
        visible
        title="Save Filter"
        cancel={{ label: 'Cancel', onPress: close }}
        confirm={{
          label: 'Save',
          disabled: !name.trim(),
          onPress: () => {
            close();
            onSave(name);
          },
        }}
        onClose={close}
        onShow={() => {
          const field = nameField.current;
          // Give the shown dialog a frame to take window focus before requesting the keyboard.
          requestAnimationFrame(() => {
            if (!field || nameField.current !== field) return;
            // A field Android already focused needs a fresh native focus command.
            field.blur();
            field.focus();
            field.setSelection(name.length, name.length);
          });
        }}
      >
        <GroupedSection>
          <TextInput
            ref={nameField}
            accessibilityLabel="Filter name"
            placeholder="Filter name"
            placeholderTextColor={colors.placeholder}
            value={name}
            onChangeText={setName}
            style={{
              minHeight: 52,
              paddingHorizontal: 16,
              fontSize: 17,
              color: colors.text,
            }}
          />
        </GroupedSection>
      </Sheet>
    ),
  };
}
