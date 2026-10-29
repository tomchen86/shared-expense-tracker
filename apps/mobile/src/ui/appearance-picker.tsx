import { Pressable, StyleSheet, Text, View } from 'react-native';
import { APPEARANCE_OPTIONS, type AppearanceOption } from './appearance';
import { useThemeColors } from './theme';

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
  const colors = useThemeColors();
  return (
    <View
      accessibilityLabel="Appearance"
      accessibilityRole="radiogroup"
      style={[styles.group, { backgroundColor: colors.segmentedTrack }]}
    >
      {APPEARANCE_OPTIONS.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityLabel={option.label}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected, disabled }}
            disabled={disabled}
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
  group: {
    borderRadius: 12,
    flexDirection: 'row',
    padding: 2,
  },
  option: {
    alignItems: 'center',
    borderRadius: 10,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 8,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
  },
});
