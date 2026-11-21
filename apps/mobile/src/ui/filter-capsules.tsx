import type { MenuFieldProps } from './menu-field';

export interface CapsuleMenuProps extends MenuFieldProps {
  text?: string;
}

export interface AmountCapsuleProps extends Pick<
  MenuFieldProps,
  'label' | 'value'
> {
  min: string;
  max: string;
  onAmount: (side: 'min' | 'max', text: string) => void;
  onPresented: (open: boolean) => void;
}

export {
  AmountCapsule,
  CapsuleButton,
  CapsuleMenu,
} from './filter-capsules.android';
