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
}: DateFieldProps) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  // Expo UI ignores an identifier iOS does not list, such as en_VN, which leaves the picker in the
  // phone's language. Intl resolves to one it does list.
  const locale = new Intl.DateTimeFormat(useDisplayLocale()).resolvedOptions()
    .locale;
  return (
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
          // Expo UI matches Foundation identifiers, such as zh_Hant_TW.
          environment('locale', locale.replaceAll('-', '_')),
          padding({ horizontal: 16, vertical: 12 }),
        ]}
      />
    </Host>
  );
}
