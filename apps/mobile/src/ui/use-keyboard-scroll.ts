import { useEffect, useRef, type ComponentRef } from 'react';
import {
  Keyboard,
  ScrollView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useHeaderHeight } from 'expo-router/react-navigation';

// Props for a form's ScrollView under a native header without a large title, keeping the focused
// field above the keyboard. React Native's keyboard scroll clamps to contentInset, which leaves out
// the header's automatic inset, so the clamp is off (scrollToOverflowEnabled) and this puts the
// bounds back when the keyboard hides. A large title would expand on that scroll and stick stretched.
export function useKeyboardScroll(
  contentInsetAdjustmentBehavior: 'automatic' | 'never' = 'automatic',
) {
  const ref = useRef<ComponentRef<typeof ScrollView>>(null);
  const headerHeight = useHeaderHeight();
  const metrics = useRef({ offset: 0, content: 0, height: 0 });

  useEffect(() => {
    const subscription = Keyboard.addListener('keyboardDidHide', () => {
      const { offset, content, height } = metrics.current;
      // ponytail: leaves out the bottom automatic inset (home indicator), so a form scrolled to its
      // very end settles that much short of it; read it from native if that shows.
      const bottom = Math.max(
        contentInsetAdjustmentBehavior === 'automatic' ? -headerHeight : 0,
        content - height,
      );
      if (offset > bottom) ref.current?.scrollTo({ y: bottom });
    });
    return () => subscription.remove();
  }, [headerHeight, contentInsetAdjustmentBehavior]);

  return {
    ref,
    automaticallyAdjustKeyboardInsets: true,
    contentInsetAdjustmentBehavior,
    scrollToOverflowEnabled: true,
    scrollEventThrottle: 16,
    onScroll: ({
      nativeEvent: { contentOffset, contentSize, layoutMeasurement },
    }: NativeSyntheticEvent<NativeScrollEvent>) => {
      metrics.current = {
        offset: contentOffset.y,
        content: contentSize.height,
        height: layoutMeasurement.height,
      };
    },
  };
}
