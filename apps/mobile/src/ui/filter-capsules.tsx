import { CapsuleButton } from './capsule';
import type { MenuFieldProps } from './menu-field';

interface CapsuleActions {
  label: string;
  value: string;
  onOpenFilters: () => void;
}

export interface CapsuleMenuProps extends MenuFieldProps, CapsuleActions {
  text?: string;
}

export interface AmountCapsuleProps extends CapsuleActions {
  min: string;
  max: string;
  onAmount: (side: 'min' | 'max', text: string) => void;
  onPresented: (open: boolean) => void;
}

/** A tap on an Android capsule takes the user to the corresponding list's Filters. */
export function CapsuleMenu({
  label,
  value,
  text,
  onOpenFilters,
}: CapsuleMenuProps) {
  return (
    <CapsuleButton
      label={label}
      value={value}
      text={text}
      onPress={onOpenFilters}
    />
  );
}

export function AmountCapsule({
  label,
  value,
  onOpenFilters,
}: AmountCapsuleProps) {
  return <CapsuleButton label={label} value={value} onPress={onOpenFilters} />;
}
