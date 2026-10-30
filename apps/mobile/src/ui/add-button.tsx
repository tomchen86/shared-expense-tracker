import type { ReactNode } from 'react';

export interface AddButtonProps {
  /** The button's accessible name. */
  label?: string;
  onPress: () => void;
}

export const AddButton: (props: AddButtonProps) => ReactNode = () => null;
