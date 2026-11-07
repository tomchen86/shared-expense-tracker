import { useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function useSheetScroll(enabled = true) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const [contentHeight, setContentHeight] = useState(0);
  // The native sheet's scroll frame extends past its visible bottom by its
  // header height. Add scrollable space only when the content needs scrolling.
  const overflowing =
    enabled &&
    contentHeight + headerHeight + insets.bottom > height - insets.top;
  const bottomPadding = overflowing ? headerHeight + insets.bottom : 0;
  return {
    screenOptions: enabled
      ? {
          sheetAllowedDetents: overflowing ? [1] : ('fitToContents' as const),
          sheetInitialDetentIndex: 0,
          sheetExpandsWhenScrolledToEdge: false,
        }
      : {},
    scrollProps: {
      contentInsetAdjustmentBehavior: enabled
        ? ('never' as const)
        : ('automatic' as const),
      onContentSizeChange: (_width: number, size: number) =>
        setContentHeight(size - bottomPadding),
    },
    bottomPadding,
  };
}
