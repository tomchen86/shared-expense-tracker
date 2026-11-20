import type { ReactElement } from 'react';

export interface MenuFieldOption {
  id: string;
  name: string;
  /** The color of the dot in front of the name, for a category. */
  color?: string;
}

/**
 * A form row that opens a list of options: a system menu on iOS, a sheet on Android. What the row
 * shows, what the list holds, and what it reports. The row's accessible name is `<label>, <value>`.
 */
export interface MenuFieldProps {
  label: string;
  value: string;
  /** A custom button face, with its own size and its decoration hidden from screen readers. */
  trigger?: ReactElement;
  /** The sheet's title on Android and the menu heading for a custom trigger on iOS. */
  title: string;
  disabled?: boolean;
  /** The color of the dot in front of the value, for a category. */
  dot?: string;
  options: MenuFieldOption[];
  /** The IDs of the options marked as selected. */
  selected: string[];
  /** Stays open when an option is pressed, for choosing several. */
  multiple?: boolean;
  /** The disabled row the menu shows when it has no options, on iOS. */
  empty?: string;
  /** A last row that is not an option, such as + Add New Category. */
  action?: { label: string; onPress: () => void };
  /** Opens the list as the row appears, on Android: a system menu can't be opened from code. */
  openOnMount?: boolean;
  onSelect: (id: string) => void;
}

export { MenuField } from './menu-field.android';
