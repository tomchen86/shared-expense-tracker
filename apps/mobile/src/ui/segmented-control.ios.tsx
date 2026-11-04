import { Host, Picker, Text } from '@expo/ui/swift-ui';
import {
  accessibilityElement,
  accessibilityLabel,
  pickerStyle,
  tag,
} from '@expo/ui/swift-ui/modifiers';
import type { SegmentedControlProps } from './segmented-control';

/** The system segmented control. */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <Host
      ignoreSafeArea="all"
      matchContents={{ vertical: true }}
      style={{ width: '100%' }}
    >
      <Picker<number>
        label={label}
        selection={options.findIndex((option) => option.value === value)}
        onSelectionChange={(index) => {
          const next = options[index];
          if (next) onChange(next.value);
        }}
        modifiers={[
          pickerStyle('segmented'),
          // The segmented style hides the label from VoiceOver too, so name the group.
          accessibilityElement('contain'),
          accessibilityLabel(label),
        ]}
      >
        {options.map((option, index) => (
          <Text key={option.value} modifiers={[tag(index)]}>
            {option.label}
          </Text>
        ))}
      </Picker>
    </Host>
  );
}
