import { useRef } from 'react';
import { View } from 'react-native';
import { Host, DatePicker } from '@expo/ui/swift-ui';
import {
  datePickerStyle,
  disabled as disabledModifier,
  environment,
  padding,
} from '@expo/ui/swift-ui/modifiers';
import { toLocalDate } from '@shared-expense/domain';
import type { DateFieldProps } from './date-field';
import { useDisplayLocale } from './use-display-locale';

export function DateField({
  label,
  value,
  maximumDate,
  disabled = false,
  onChange,
  onOpen,
}: DateFieldProps) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const width = useRef(0);
  const locale = useDisplayLocale();
  return (
    <View
      // The Host has no height in a sheet's first layout, which would make the sheet too short.
      style={{ minHeight: 54 }}
      onLayout={(event) => {
        width.current = event.nativeEvent.layout.width;
      }}
      onTouchEnd={(event) => {
        // ponytail: the compact picker reports neither opening nor closing, so a
        // press on the row's right half stands in for a press on its date. Missing
        // the date there costs one ignored press; report it if iOS adds an event.
        if (!disabled && event.nativeEvent.locationX > width.current / 2)
          onOpen?.();
      }}
    >
      <Host
        ignoreSafeArea="all"
        matchContents={{ vertical: true }}
        style={{ width: '100%' }}
      >
        <DatePicker
          title={label}
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
            padding({ horizontal: 16, vertical: 12 }),
          ]}
        />
      </Host>
    </View>
  );
}
