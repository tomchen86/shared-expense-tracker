import type { ReactNode } from 'react';

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
}

/**
 * A form row for a calendar date, chosen in the platform's own date picker.
 * Acceptance tests find it by this name, so each platform's file exports a plain
 * function component called DateField.
 */
export const DateField: (props: DateFieldProps) => ReactNode = () => null;
