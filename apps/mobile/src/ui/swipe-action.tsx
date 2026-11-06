import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewProps,
} from 'react-native';
import {
  GestureDetector,
  GestureHandlerRootView,
  GestureStateManager,
  useNativeGesture,
  usePanGesture,
  type NativeGesture,
} from 'react-native-gesture-handler';
import { useThemeColors } from './theme';

const WIDTH = 96;
const GAP = 8;
const OPEN = -(WIDTH + GAP);

const SwipeList = createContext<{
  scrollGesture: NativeGesture;
  openRows: Set<() => void>;
  backSwipe: boolean;
} | null>(null);

/**
 * The scroll view for SwipeAction rows: a row keeps a drag from it, and it closes them as it scrolls.
 * With backSwipe, on a pushed screen, iOS's full-screen back gesture gets the drags to the right
 * that a closed row has no use for.
 */
export function SwipeScrollView({
  backSwipe = false,
  ...props
}: ScrollViewProps & { backSwipe?: boolean }) {
  const [openRows] = useState(() => new Set<() => void>());
  const scrollGesture = useNativeGesture({
    // Otherwise Android stops scrolling when the finger leaves the list.
    shouldCancelWhenOutside: false,
    runOnJS: true,
    disableReanimated: true,
    // Not onScrollBeginDrag: Android sends that as soon as the scroll view would take the drag,
    // even when the row is about to keep it.
    onActivate: () => openRows.forEach((close) => close()),
  });
  return (
    <GestureHandlerRootView style={styles.list}>
      <SwipeList.Provider
        value={{
          scrollGesture,
          openRows,
          backSwipe: backSwipe && Platform.OS === 'ios',
        }}
      >
        <GestureDetector gesture={scrollGesture}>
          <ScrollView {...props} />
        </GestureDetector>
      </SwipeList.Provider>
    </GestureHandlerRootView>
  );
}

export function SwipeAction({
  children,
  label,
  accessibilityLabel,
  disabled,
  onPress,
}: {
  children: ReactNode;
  label: string;
  accessibilityLabel: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const { scrollGesture, openRows, backSwipe } = useContext(SwipeList)!;
  const [translation] = useState(() => new Animated.Value(0));
  const offset = useRef(0);
  const origin = useRef({ x: 0, y: 0 });
  const decided = useRef(false);
  const [open, setOpen] = useState(false);
  const finish = useCallback(
    (next: number) => {
      offset.current = next;
      setOpen(next !== 0);
      Animated.spring(translation, {
        toValue: next,
        useNativeDriver: true,
        overshootClamping: true,
      }).start();
    },
    [translation],
  );
  const pan = usePanGesture({
    // Worklets on every row take twice as long to mount a long list.
    runOnJS: true,
    disableReanimated: true,
    enabled: !disabled,
    // Decide before the native scroll recognizer takes the drag, and keep that direction until
    // release, as a category row does.
    manualActivation: true,
    block: scrollGesture,
    onTouchesDown: (event) => {
      const touch = event.changedTouches[0];
      origin.current = { x: touch.absoluteX, y: touch.absoluteY };
      decided.current = false;
    },
    onTouchesMove: (event) => {
      if (decided.current) return;
      const touch = event.changedTouches[0];
      const moved = touch.absoluteX - origin.current.x;
      const dx = Math.abs(moved);
      const dy = Math.abs(touch.absoluteY - origin.current.y);
      if (Math.max(dx, dy) <= 5) return;
      decided.current = true;
      if (dx > dy && !(backSwipe && moved > 0 && offset.current === 0))
        GestureStateManager.activate(event.handlerTag);
      else GestureStateManager.fail(event.handlerTag);
    },
    onActivate: () => translation.stopAnimation(),
    // From where the finger came down, not from activation, which comes a moment later.
    onUpdate: (event) =>
      translation.setValue(
        Math.max(
          OPEN,
          Math.min(0, offset.current + event.absoluteX - origin.current.x),
        ),
      ),
    onDeactivate: (event) =>
      finish(
        event.canceled
          ? offset.current
          : event.velocityX > 500
            ? 0
            : offset.current + event.absoluteX - origin.current.x < OPEN / 2 ||
                event.velocityX < -500
              ? OPEN
              : 0,
      ),
  });
  useEffect(() => {
    if (!open) return;
    const close = () => finish(0);
    openRows.add(close);
    return () => {
      openRows.delete(close);
    };
  }, [open, openRows, finish]);

  return (
    <GestureDetector gesture={pan}>
      <View style={styles.container}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          accessibilityElementsHidden={!open}
          importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
          accessibilityState={{ disabled }}
          disabled={disabled || !open}
          onPress={onPress}
          style={({ pressed }) => [
            styles.action,
            {
              backgroundColor: pressed ? colors.pressedSurface : colors.surface,
            },
          ]}
        >
          <Text style={{ color: colors.accent, fontSize: 17 }}>{label}</Text>
        </Pressable>
        <Animated.View
          style={[
            styles.row,
            {
              backgroundColor: colors.background,
              transform: [{ translateX: translation }],
            },
          ]}
        >
          {children}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  container: {
    overflow: 'hidden',
    borderCurve: 'continuous',
    borderRadius: 12,
  },
  // The row and the action match the card's shape, so no square corner shows between them.
  row: { borderCurve: 'continuous', borderRadius: 12 },
  action: {
    borderCurve: 'continuous',
    borderRadius: 12,
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
