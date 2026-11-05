import type { ComponentRef, RefObject } from 'react';
import type { ScrollView, ViewStyle } from 'react-native';

// iOS insets the scroll view itself (automaticallyAdjustKeyboardInsets).
export const useKeyboardInset: (
  scrollView: RefObject<ComponentRef<typeof ScrollView> | null>,
) => ViewStyle | undefined = () => undefined;
