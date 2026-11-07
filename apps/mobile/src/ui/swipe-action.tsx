import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
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
import { useSharedValue, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { impactAsync, ImpactFeedbackStyle } from 'expo-haptics';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useThemeColors } from './theme';

/** How a card, which has a caption under its action, and a row of a list, which has none, are drawn. */
const CARD = { width: 72, gap: 8, circle: 44, icon: 20, radius: 12 };
const LIST_ROW = { width: 60, gap: 0, circle: 36, icon: 17, radius: 0 };

// Past this share of the row's width, letting go runs the action.
const FULL_SWIPE = 0.6;

const SwipeList = createContext<{
  scrollGesture: NativeGesture;
  openRows: Set<() => void>;
  backSwipe: boolean;
  touch: SharedValue<{ x: number; y: number; decided: boolean }>;
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
  // ponytail: one touch per list, so a second finger on another row can pick the wrong direction;
  // make it per row, which mounts slower, if that shows.
  const touch = useSharedValue({ x: 0, y: 0, decided: false });
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
          touch,
        }}
      >
        <GestureDetector gesture={scrollGesture}>
          <ScrollView {...props} />
        </GestureDetector>
      </SwipeList.Provider>
    </GestureHandlerRootView>
  );
}

/** Closes the rows of the surrounding SwipeScrollView that show their action. */
export function useCloseSwipeRows() {
  const { openRows } = useContext(SwipeList)!;
  return () => openRows.forEach((close) => close());
}

export function SwipeAction({
  children,
  caption,
  icon,
  accessibilityLabel,
  disabled = false,
  staysInList = false,
  onPress,
}: {
  children: ReactNode;
  /** The text under the action's circle. A row without one is drawn as a row of a list. */
  caption?: string;
  icon: SymbolViewProps['name'];
  accessibilityLabel?: string;
  /** The row moves nothing, and a sideways drag on it stays a drag. */
  disabled?: boolean;
  /** The row is still there after its action, so it closes then, as opposed to leaving the list. */
  staysInList?: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const { scrollGesture, openRows, backSwipe, touch } = useContext(SwipeList)!;
  const metrics = caption ? CARD : LIST_ROW;
  const openOffset = -(metrics.width + metrics.gap);
  const [translation] = useState(() => new Animated.Value(0));
  // 0 at rest, 1 once a full swipe would run the action.
  const [armedProgress] = useState(() => new Animated.Value(0));
  const offset = useRef(0);
  const rowWidth = useRef(0);
  const armed = useRef(false);
  const comeBackTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(comeBackTimer.current), []);
  const latestPress = useRef(onPress);
  useLayoutEffect(() => {
    latestPress.current = onPress;
  });
  // The action is only there once the row moves, since a long list has many rows that never do.
  const [revealed, setRevealed] = useState(false);
  const [open, setOpen] = useState(false);

  const setArmed = useCallback(
    (next: boolean) => {
      if (armed.current === next) return;
      armed.current = next;
      if (next)
        void impactAsync(ImpactFeedbackStyle.Medium).catch(() => undefined);
      Animated.timing(armedProgress, {
        toValue: next ? 1 : 0,
        duration: 140,
        useNativeDriver: false,
      }).start();
    },
    [armedProgress],
  );
  const finish = useCallback(
    (next: number) => {
      setArmed(false);
      offset.current = next;
      setOpen(next !== 0);
      Animated.spring(translation, {
        toValue: next,
        useNativeDriver: false,
        overshootClamping: true,
      }).start(({ finished }) => {
        if (finished && next === 0) setRevealed(false);
      });
    },
    [setArmed, translation],
  );
  const runAction = useCallback(() => {
    Animated.timing(translation, {
      toValue: -rowWidth.current,
      duration: 160,
      useNativeDriver: false,
    }).start(() => {
      latestPress.current();
      if (staysInList) finish(0);
      // ponytail: the row normally leaves the list once the action is saved; if it stays (a failed
      // save), it comes back after this pause. Have onPress report the save if the pause shows.
      else comeBackTimer.current = setTimeout(() => finish(0), 800);
    });
  }, [finish, staysInList, translation]);
  const follow = useCallback(
    (moved: number) => {
      if (disabled) return;
      const next = Math.max(
        -rowWidth.current,
        Math.min(0, offset.current + moved),
      );
      translation.setValue(next);
      setArmed(next < -rowWidth.current * FULL_SWIPE);
    },
    [disabled, setArmed, translation],
  );
  const release = useCallback(
    (canceled: boolean, velocityX: number, moved: number) => {
      if (disabled) return;
      if (!canceled && armed.current) {
        runAction();
        return;
      }
      finish(
        canceled
          ? offset.current
          : velocityX > 500
            ? 0
            : offset.current + moved < openOffset / 2 || velocityX < -500
              ? openOffset
              : 0,
      );
    },
    [disabled, finish, openOffset, runAction],
  );
  const leavesRightDrag = backSwipe && !open;
  const pan = usePanGesture({
    // Decide on the UI thread, before the native scroll recognizer takes the drag, and keep that
    // direction until release. From JavaScript, a quick drag can end before the answer arrives and
    // count as a tap. The row itself follows from JavaScript, since animated styles on every row
    // take a long list half as long again to mount.
    manualActivation: true,
    block: scrollGesture,
    onTouchesDown: (event) => {
      const { absoluteX: x, absoluteY: y } = event.changedTouches[0];
      touch.value = { x, y, decided: false };
    },
    onTouchesMove: (event) => {
      if (touch.value.decided) return;
      const { absoluteX, absoluteY } = event.changedTouches[0];
      const moved = absoluteX - touch.value.x;
      const dx = Math.abs(moved);
      const dy = Math.abs(absoluteY - touch.value.y);
      if (Math.max(dx, dy) <= 5) return;
      touch.value = { ...touch.value, decided: true };
      if (dx > dy && !(leavesRightDrag && moved > 0))
        GestureStateManager.activate(event.handlerTag);
      else GestureStateManager.fail(event.handlerTag);
    },
    onActivate: () => {
      scheduleOnRN(setRevealed, !disabled);
    },
    onUpdate: (event) => {
      scheduleOnRN(follow, event.translationX);
    },
    onDeactivate: (event) => {
      scheduleOnRN(
        release,
        event.canceled,
        event.velocityX,
        event.translationX,
      );
    },
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
      <View
        onLayout={(event) => {
          rowWidth.current = event.nativeEvent.layout.width;
        }}
        style={[styles.container, { borderRadius: metrics.radius }]}
      >
        {revealed && (
          <ActionButton
            metrics={metrics}
            caption={caption}
            icon={icon}
            accessibilityLabel={accessibilityLabel}
            enabled={!disabled && open}
            shown={open}
            translation={translation}
            armedProgress={armedProgress}
            onPress={() => {
              if (staysInList) finish(0);
              onPress();
            }}
          />
        )}
        <Animated.View
          style={[
            styles.row,
            {
              borderRadius: metrics.radius,
              backgroundColor: caption ? colors.background : colors.surface,
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

/**
 * What a row reveals: a red circle with a white symbol, over its caption. Once a full swipe would
 * run the action, the circle becomes a capsule that follows the row's edge, growing to the left past
 * this button. The button itself is only the revealed part, since its middle is where a screen
 * reader presses.
 */
function ActionButton({
  metrics,
  caption,
  icon,
  accessibilityLabel,
  enabled,
  shown,
  translation,
  armedProgress,
  onPress,
}: {
  metrics: typeof CARD;
  caption?: string;
  icon: SymbolViewProps['name'];
  accessibilityLabel?: string;
  enabled: boolean;
  shown: boolean;
  translation: Animated.Value;
  armedProgress: Animated.Value;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const { width, gap, circle, icon: iconSize } = metrics;
  const [pillWidth] = useState(() =>
    Animated.add(
      circle,
      Animated.multiply(
        armedProgress,
        Animated.add(Animated.multiply(translation, -1), -(width + gap)),
      ),
    ),
  );
  const [captionOpacity] = useState(() =>
    armedProgress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={!shown}
      importantForAccessibility={shown ? 'auto' : 'no-hide-descendants'}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={onPress}
      style={[styles.action, { width }]}
    >
      {({ pressed }) => (
        <>
          <Animated.View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[
              styles.pill,
              {
                width: pillWidth,
                height: circle,
                marginRight: (width - circle) / 2,
                paddingLeft: (circle - iconSize) / 2,
                borderRadius: circle / 2,
                backgroundColor: colors.error,
              },
              pressed && styles.pressed,
            ]}
          >
            <SymbolView name={icon} size={iconSize} tintColor="#FFFFFF" />
          </Animated.View>
          {caption && (
            <Animated.Text
              numberOfLines={1}
              style={[
                styles.caption,
                { width, color: colors.textMuted, opacity: captionOpacity },
              ]}
            >
              {caption}
            </Animated.Text>
          )}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  container: { overflow: 'hidden', borderCurve: 'continuous' },
  // The row matches the card's shape, so no square corner shows behind it.
  row: { borderCurve: 'continuous' },
  action: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'flex-end',
    gap: 4,
  },
  pill: { justifyContent: 'center', alignItems: 'flex-start' },
  pressed: { opacity: 0.6 },
  caption: { fontSize: 12, textAlign: 'center' },
});
