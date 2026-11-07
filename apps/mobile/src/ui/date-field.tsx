export interface DateFieldProps {
  /** The field's name, shown and announced with the date. */
  label: string;
  /** The date shown, as YYYY-MM-DD. */
  value: string;
  /** The latest date the picker offers, as YYYY-MM-DD. */
  maximumDate: string;
  disabled?: boolean;
  /** Receives the date chosen in the picker, as YYYY-MM-DD. */
  onChange: (date: string) => void;
  /** Called on iOS when a press opens the picker's calendar. */
  onOpen?: () => void;
}

export { DateField } from './date-field.android';
