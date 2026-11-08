import { useEffect, useState } from 'react';
import {
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { GroupedSection } from './grouped-section';
import type { MenuFieldOption, MenuFieldProps } from './menu-field';
import { Sheet } from './sheet';
import { useThemeColors } from './theme';

export function MenuField({
  label,
  value,
  title,
  disabled = false,
  dot,
  options,
  selected,
  multiple = false,
  action,
  openOnMount = false,
  onSelect,
}: MenuFieldProps) {
  const colors = useThemeColors();
  const { fontScale } = useWindowDimensions();
  const [open, setOpen] = useState(openOnMount);
  useEffect(() => {
    if (open) Keyboard.dismiss();
  }, [open]);
  const close = () => setOpen(false);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${value}`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[styles.row, fontScale > 1.3 && styles.stacked]}
      >
        <Text style={[styles.text, { color: colors.text }]}>{label}</Text>
        <View style={styles.value}>
          {dot && <View style={[styles.dot, { backgroundColor: dot }]} />}
          <Text style={[styles.valueText, { color: colors.textMuted }]}>
            {value}
          </Text>
        </View>
      </Pressable>
      <Sheet
        visible={open}
        title={title}
        onClose={close}
        cancel={multiple ? undefined : { label: 'Cancel', onPress: close }}
        confirm={multiple ? { label: 'Done', onPress: close } : undefined}
      >
        <GroupedSection>
          {options.map((option) => (
            <OptionRow
              key={option.id}
              {...option}
              selected={selected.includes(option.id)}
              onPress={() => {
                onSelect(option.id);
                if (!multiple) close();
              }}
            />
          ))}
          {action && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={action.label}
              onPress={() => {
                close();
                action.onPress();
              }}
              style={styles.row}
            >
              <Text style={[styles.text, { color: colors.accent }]}>
                {action.label}
              </Text>
            </Pressable>
          )}
        </GroupedSection>
      </Sheet>
    </>
  );
}

function OptionRow({
  name,
  color,
  selected,
  onPress,
}: MenuFieldOption & { selected: boolean; onPress: () => void }) {
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={styles.row}
    >
      <View style={styles.option}>
        {color && <View style={[styles.dot, { backgroundColor: color }]} />}
        <Text style={[styles.valueText, { color: colors.text }]}>{name}</Text>
      </View>
      {selected && <Text style={{ color: colors.accent }}>✓</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 54,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  stacked: { flexDirection: 'column', alignItems: 'stretch' },
  text: { fontSize: 17 },
  value: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
  },
  option: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  valueText: { flexShrink: 1, fontSize: 17 },
  dot: { width: 12, height: 12, borderRadius: 6 },
});
