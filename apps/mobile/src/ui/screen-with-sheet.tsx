import type { ReactElement, ReactNode } from 'react';
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
    <>
      {children}
      <Sheet
        visible={sheet !== null}
        title={title}
        cancel={{ label: 'Close', onPress: onClose }}
        onClose={onClose}
      >
        {sheet}
      </Sheet>
    </>
  );
}
