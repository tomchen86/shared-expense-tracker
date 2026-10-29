import { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Host, Picker, Text } from '@expo/ui/swift-ui';
import {
  accessibilityElement,
  accessibilityLabel,
  controlSize,
  disabled as disabledModifier,
  pickerStyle,
  tag,
} from '@expo/ui/swift-ui/modifiers';
import { APPEARANCE_OPTIONS, type AppearanceOption } from './appearance';

export interface AppearancePickerProps {
  value: AppearanceOption;
  disabled?: boolean;
  onChange: (value: AppearanceOption) => void;
}

export function AppearancePicker({
  value,
  disabled = false,
  onChange,
}: AppearancePickerProps) {
  const selectedIndex = Math.max(
    0,
    APPEARANCE_OPTIONS.findIndex((option) => option.value === value),
  );
  const [resetCount, setResetCount] = useState(0);
  const pendingIndex = useRef<number | null>(null);
  const wasDisabled = useRef(disabled);

  useEffect(() => {
    if (wasDisabled.current && !disabled && pendingIndex.current !== null) {
      if (pendingIndex.current !== selectedIndex) {
        setResetCount((count) => count + 1);
      }
      pendingIndex.current = null;
    }
    wasDisabled.current = disabled;
  }, [disabled, selectedIndex]);

  const modifiers = [
    pickerStyle('segmented'),
    controlSize('large'),
    // The segmented style hides the label from VoiceOver too, so name the group.
    accessibilityElement('contain'),
    accessibilityLabel('Appearance'),
    // Toggle, never add or remove: @expo/ui wraps each modifier in an AnyView, so
    // a change in their number rebuilds the control and cuts its slide short.
    disabledModifier(disabled),
  ];

  function handleSelectionChange(index: number) {
    if (disabled) return;
    const next = APPEARANCE_OPTIONS[index]?.value;
    if (!next) return;
    pendingIndex.current = index;
    onChange(next);
  }

  return (
    <Host
      ignoreSafeArea="all"
      matchContents={{ vertical: true }}
      style={styles.host}
    >
      <Picker<number>
        key={resetCount}
        label="Appearance"
        modifiers={modifiers}
        onSelectionChange={handleSelectionChange}
        selection={selectedIndex}
      >
        {APPEARANCE_OPTIONS.map((option, index) => (
          <Text key={option.value} modifiers={[tag(index)]}>
            {option.label}
          </Text>
        ))}
      </Picker>
    </Host>
  );
}

const styles = StyleSheet.create({
  host: { width: '100%' },
});
