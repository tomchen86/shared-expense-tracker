import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from './theme';

export interface SegmentedControlProps<T extends string> {
  /** The accessible name of the group. */
  label: string;
  options: readonly { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
}

/** Options side by side, the current one checked for screen readers. */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  const colors = useThemeColors();
  return (
    <View
      accessibilityLabel={label}
      accessibilityRole="radiogroup"
      style={[styles.group, { backgroundColor: colors.segmentedTrack }]}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityLabel={option.label}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(option.value)}
            style={[
              styles.option,
              selected && { backgroundColor: colors.segmentedThumb },
            ]}
          >
            <Text
              style={[
                styles.label,
                { color: selected ? colors.accent : colors.textMuted },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { borderRadius: 12, flexDirection: 'row', padding: 2 },
  option: {
    alignItems: 'center',
    borderRadius: 10,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 8,
  },
  label: { fontSize: 15, fontWeight: '600' },
});
