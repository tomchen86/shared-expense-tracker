export interface DateFieldProps {
  /** The field's name, shown and announced with the date. */
  label: string;
  /** The date shown, as YYYY-MM-DD. */
  value: string;
  /** The latest date the picker offers, as YYYY-MM-DD. */
  maximumDate: string;
  disabled?: boolean;
  /** Shows the date alone, for a date beside another one; `label` is still its accessible name. */
  bare?: boolean;
  /** Receives the date chosen in the picker, as YYYY-MM-DD. */
  onChange: (date: string) => void;
  /** Called on iOS when a press opens the picker's calendar. */
  onOpen?: () => void;
}

export { DateField } from './date-field.android';
