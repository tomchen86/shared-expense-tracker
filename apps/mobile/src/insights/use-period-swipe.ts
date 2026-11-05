import { useEffect, useLayoutEffect, useRef } from 'react';
import { useWindowDimensions } from 'react-native';
import {
  GestureStateManager,
  useNativeGesture,
  usePanGesture,
} from 'react-native-gesture-handler';
import {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

interface PeriodSwipeOptions {
  selectedKey: string | undefined;
  previous: string | undefined;
  next: string | undefined;
  enabled: boolean;
  onSelect: (key: string) => void;
}

/** A swipe that follows the finger and pages to the previous or next period. */
export function usePeriodSwipe({
  selectedKey,
  previous,
  next,
  enabled,
  onSelect,
}: PeriodSwipeOptions) {
  const { width } = useWindowDimensions();
  const scrollGesture = useNativeGesture();
  const offset = useSharedValue(0);
  const origin = useSharedValue({ x: 0, y: 0 });
  const direction = useSharedValue<'pending' | 'horizontal' | 'vertical'>(
    'pending',
  );
  const available = useSharedValue({ previous: false, next: false });
  useEffect(() => {
    available.value = { previous: !!previous, next: !!next };
  }, [available, previous, next]);

  // The side the newly selected period slides in from, once it has rendered.
  const incoming = useRef(0);
  useLayoutEffect(() => {
    if (!incoming.current) return;
    cancelAnimation(offset);
    offset.value = incoming.current * width;
    offset.value = withTiming(0, { duration: 220 });
    incoming.current = 0;
  }, [offset, selectedKey, width]);

  /** Selects a period that slides in from `side`: -1 is the left, 1 the right. */
  function step(key: string, side: -1 | 1) {
    incoming.current = side;
    onSelect(key);
  }

  function release(projected: number) {
    const to = projected > 60 ? previous : projected < -60 ? next : undefined;
    if (!to) {
      offset.value = withTiming(0, { duration: 160 });
      return;
    }
    const side = projected > 0 ? 1 : -1;
    offset.value = withTiming(side * width, { duration: 140 }, (finished) => {
      if (finished) scheduleOnRN(step, to, side > 0 ? -1 : 1);
    });
  }

  const pan = usePanGesture({
    enabled,
    // Decide before the native scroll recognizer activates, and keep that
    // direction until release, as a category row does.
    manualActivation: true,
    block: scrollGesture,
    onTouchesDown: (event) => {
      const touch = event.changedTouches[0];
      origin.value = { x: touch.absoluteX, y: touch.absoluteY };
      direction.value = 'pending';
    },
    onTouchesMove: (event) => {
      if (direction.value !== 'pending') return;
      const touch = event.changedTouches[0];
      const dx = Math.abs(touch.absoluteX - origin.value.x);
      const dy = Math.abs(touch.absoluteY - origin.value.y);
      if (Math.max(dx, dy) <= 5) return;
      if (dx > dy) {
        direction.value = 'horizontal';
        GestureStateManager.activate(event.handlerTag);
      } else {
        direction.value = 'vertical';
        GestureStateManager.fail(event.handlerTag);
      }
    },
    onActivate: () => {
      cancelAnimation(offset);
    },
    onUpdate: (event) => {
      const open =
        event.translationX > 0
          ? available.value.previous
          : available.value.next;
      offset.value = event.translationX * (open ? 1 : 0.2);
    },
    onDeactivate: (event) => {
      // Where the page would come to rest, so a short flick also pages.
      const projected = event.canceled
        ? 0
        : event.translationX + event.velocityX * 0.15;
      scheduleOnRN(release, projected);
    },
  });

  const nameStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }));
  const pageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }));

  return { pan, scrollGesture, step, nameStyle, pageStyle };
}
