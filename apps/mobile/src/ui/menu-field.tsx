export interface MenuFieldOption {
  id: string;
  name: string;
  /** The color of the dot in front of the name, for a category. */
  color?: string;
}

/**
 * A form row that opens a system menu on iOS: what the row shows, what the menu
 * lists, and what it reports. The row's accessible name is `<label>, <value>`.
 */
export interface MenuFieldProps {
  label: string;
  value: string;
  disabled?: boolean;
  /** The color of the dot in front of the value, for a category. */
  dot?: string;
  options: MenuFieldOption[];
  /** The IDs of the options marked as selected. */
  selected: string[];
  /** Stays open when an option is pressed, for choosing several. */
  multiple?: boolean;
  /** The disabled row the menu shows when it has no options. */
  empty?: string;
  /** A last row that is not an option, such as + Add New Category. */
  action?: { label: string; onPress: () => void };
  onSelect: (id: string) => void;
}
