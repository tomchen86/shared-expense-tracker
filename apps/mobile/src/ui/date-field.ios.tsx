import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Host, DatePicker } from '@expo/ui/swift-ui';
import {
  datePickerStyle,
  disabled as disabledModifier,
  dynamicTypeSize,
  environment,
} from '@expo/ui/swift-ui/modifiers';
import { toLocalDate } from '@shared-expense/domain';
import type { DateFieldProps } from './date-field';
import { useThemeColors } from './theme';
import { useDisplayLocale } from './use-display-locale';

/**
 * The label beside the date, or above it from the first accessibility text size (1.786), as in a
 * stock form. SwiftUI draws only the date: a picker with no title hides its label.
 */
export function DateField({
  label,
  value,
  maximumDate,
  disabled = false,
  onChange,
  onOpen,
}: DateFieldProps) {
  const colors = useThemeColors();
  const { fontScale } = useWindowDimensions();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const locale = useDisplayLocale();
  return (
    <View style={[styles.row, fontScale >= 1.5 && styles.stacked]}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <View
        // The compact picker reports neither opening nor closing. The host is as big as the
        // date, so a press that ends on it is a press on the date.
        onTouchEnd={() => {
          if (!disabled) onOpen?.();
        }}
      >
        <Host ignoreSafeArea="all" matchContents>
          <DatePicker
            selection={new Date(`${value}T12:00:00`)}
            range={{ end: new Date(`${maximumDate}T23:59:59.999`) }}
            displayedComponents={['date']}
            onDateChange={(date) => onChange(toLocalDate(date, timeZone))}
            modifiers={[
              datePickerStyle('compact'),
              disabledModifier(disabled),
              environment('timeZone', timeZone),
              // Expo UI matches Foundation identifiers, such as en_AU.
              environment('locale', locale.replaceAll('-', '_')),
              // The compact picker never narrows its date. At the largest size Oct 30, 2026 is
              // 326 pt wide, and a 375 pt iPhone leaves the row 303 pt; capped here, the widest
              // dates measured 259 pt (299 pt at the next size up).
              dynamicTypeSize({ max: 'accessibility3' }),
            ]}
          />
        </Host>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    // The Host has no size in a sheet's first layout, which would make the sheet too short.
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  // A stock form's gap between the label and the date at these sizes.
  stacked: { flexDirection: 'column', alignItems: 'flex-start', gap: 4 },
  label: { fontSize: 17 },
});
