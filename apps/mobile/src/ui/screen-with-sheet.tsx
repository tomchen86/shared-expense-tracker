import type { ReactElement, ReactNode } from 'react';
import { View } from 'react-native';
import { PopoverBackdropProvider } from './popover-backdrop';
import { Sheet } from './sheet';

export interface ScreenWithSheetProps {
  children: ReactNode;
  title: string;
  sheet: ReactElement | null;
  onClose: () => void;
}

export function ScreenWithSheet({
  children,
  title,
  sheet,
  onClose,
}: ScreenWithSheetProps) {
  return (
    <PopoverBackdropProvider>
      <View style={{ flex: 1 }} aria-hidden={sheet !== null}>
        {children}
      </View>
      <Sheet
        measureDetent
        visible={sheet !== null}
        title={title}
        cancel={{ label: 'Close', onPress: onClose }}
        onClose={onClose}
      >
        {sheet}
      </Sheet>
    </PopoverBackdropProvider>
  );
}
