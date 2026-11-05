import { useEffect, useState, type ComponentRef, type RefObject } from 'react';
import { Keyboard, type ScrollView } from 'react-native';

// Edge-to-edge, Android no longer resizes the window for the keyboard. Shrinking the scroll view
// puts every row above it, and as it shrinks the native ScrollView keeps the focused field in view.
// ponytail: screenY is in display coordinates and this measures in the window, so the lower pane of
// a split screen undershoots; subtract the window's offset if that shows.
export function useKeyboardInset(
  scrollView: RefObject<ComponentRef<typeof ScrollView> | null>,
) {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const shown = Keyboard.addListener(
      'keyboardDidShow',
      ({ endCoordinates }) => {
        scrollView.current?.measureInWindow((_x, y, _width, height) => {
          setInset((current) =>
            Math.max(0, y + height + current - endCoordinates.screenY),
          );
        });
      },
    );
    const hidden = Keyboard.addListener('keyboardDidHide', () => setInset(0));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, [scrollView]);

  return inset > 0 ? { marginBottom: inset } : undefined;
}
