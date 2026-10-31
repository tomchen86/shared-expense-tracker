import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { getLocales } from 'expo-localization';
import { toLocalDate } from '@shared-expense/domain';
import type { DateFieldProps } from './date-field';
import { useThemeColors } from './theme';

export function DateField({
  label,
  value,
  maximumDate,
  disabled = false,
  onChange,
}: DateFieldProps) {
  const colors = useThemeColors();
  const [open, setOpen] = useState(false);
  const date = new Date(`${value}T12:00:00`);
  const formattedDate = new Intl.DateTimeFormat(getLocales()[0].languageTag, {
    dateStyle: 'medium',
  }).format(date);
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: formattedDate }}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={{
          minHeight: 54,
          padding: 16,
          flexDirection: 'row',
          justifyContent: 'space-between',
        }}
      >
        <Text style={{ color: colors.text }}>{label}</Text>
        <Text style={{ color: colors.textMuted }}>{formattedDate}</Text>
      </Pressable>
      {open && !disabled && (
        <DateTimePicker
          value={date}
          maximumDate={new Date(`${maximumDate}T23:59:59.999`)}
          mode="date"
          onDismiss={() => setOpen(false)}
          onValueChange={(_, date) => {
            setOpen(false);
            onChange(
              toLocalDate(
                date,
                Intl.DateTimeFormat().resolvedOptions().timeZone,
              ),
            );
          }}
        />
      )}
    </View>
  );
}
