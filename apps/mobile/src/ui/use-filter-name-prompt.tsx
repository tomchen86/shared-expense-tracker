import { useState } from 'react';
import { TextInput } from 'react-native';
import { GroupedSection } from './grouped-section';
import { Sheet } from './sheet';
import { useThemeColors } from './theme';

export function useFilterNamePrompt(onSave: (name: string) => void) {
  const colors = useThemeColors();
  const [name, setName] = useState<string>();
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
      >
        <GroupedSection>
          <TextInput
            accessibilityLabel="Filter name"
            placeholder="Filter name"
            placeholderTextColor={colors.placeholder}
            autoFocus
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
