import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
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
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useThemeColors } from './theme';

const WIDTH = 96;
const GAP = 8;
const OPEN = -(WIDTH + GAP);
const SETTLE = { duration: 160 };

const SwipeList = createContext<{
  scrollGesture: NativeGesture;
  openRows: Set<() => void>;
} | null>(null);

/** The scroll view for SwipeAction rows: a row keeps a drag from it, and it closes them as it scrolls. */
export function SwipeScrollView(props: ScrollViewProps) {
  const [openRows] = useState(() => new Set<() => void>());
  const scrollGesture = useNativeGesture({
    // Otherwise Android stops scrolling when the finger leaves the list.
    shouldCancelWhenOutside: false,
    runOnJS: true,
    // Not onScrollBeginDrag: Android sends that as soon as the scroll view would take the drag,
    // even when the row is about to keep it.
    onActivate: () => openRows.forEach((close) => close()),
  });
  return (
    <GestureHandlerRootView style={styles.list}>
      <SwipeList.Provider value={{ scrollGesture, openRows }}>
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
  const { scrollGesture, openRows } = useContext(SwipeList)!;
  const translation = useSharedValue(0);
  const start = useSharedValue(0);
  const origin = useSharedValue({ x: 0, y: 0 });
  const decided = useSharedValue(false);
  const [open, setOpen] = useState(false);
  const pan = usePanGesture({
    enabled: !disabled,
    // Decide before the native scroll recognizer takes the drag, and keep that direction until
    // release, as a category row does.
    manualActivation: true,
    block: scrollGesture,
    onTouchesDown: (event) => {
      const touch = event.changedTouches[0];
      origin.value = { x: touch.absoluteX, y: touch.absoluteY };
      decided.value = false;
    },
    onTouchesMove: (event) => {
      if (decided.value) return;
      const touch = event.changedTouches[0];
      const dx = Math.abs(touch.absoluteX - origin.value.x);
      const dy = Math.abs(touch.absoluteY - origin.value.y);
      if (Math.max(dx, dy) <= 5) return;
      decided.value = true;
      if (dx > dy) GestureStateManager.activate(event.handlerTag);
      else GestureStateManager.fail(event.handlerTag);
    },
    onActivate: () => {
      cancelAnimation(translation);
      start.value = translation.value;
    },
    onUpdate: (event) => {
      translation.value = Math.max(
        OPEN,
        Math.min(0, start.value + event.translationX),
      );
    },
    onDeactivate: (event) => {
      const next =
        event.velocityX > 500
          ? 0
          : translation.value < OPEN / 2 || event.velocityX < -500
            ? OPEN
            : 0;
      translation.value = withTiming(next, SETTLE);
      scheduleOnRN(setOpen, next !== 0);
    },
  });
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translation.value }],
  }));
  useEffect(() => {
    if (!open) return;
    const close = () => {
      translation.value = withTiming(0, SETTLE);
      setOpen(false);
    };
    openRows.add(close);
    return () => {
      openRows.delete(close);
    };
  }, [open, openRows, translation]);

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
            { backgroundColor: colors.background },
            animatedStyle,
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
