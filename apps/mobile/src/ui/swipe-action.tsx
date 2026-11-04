import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useThemeColors } from './theme';

const WIDTH = 96;
const GAP = 8;
const OPEN = -(WIDTH + GAP);

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
  const [translation] = useState(() => new Animated.Value(0));
  const offset = useRef(0);
  const [open, setOpen] = useState(false);
  const responder = useMemo(() => {
    const finish = (next: number) => {
      offset.current = next;
      setOpen(next !== 0);
      Animated.spring(translation, {
        toValue: next,
        useNativeDriver: true,
        overshootClamping: true,
      }).start();
    };
    return PanResponder.create({
      // An open row closes on a looser, diagonal swipe, so a thumb's drift does not hand it to the list.
      onMoveShouldSetPanResponderCapture: (_, gesture) =>
        !disabled &&
        offset.current !== 0 &&
        gesture.dx > 10 &&
        gesture.dx > Math.abs(gesture.dy) / 2,
      onMoveShouldSetPanResponder: (_, gesture) =>
        !disabled &&
        Math.abs(gesture.dx) > 10 &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => translation.stopAnimation(),
      onPanResponderMove: (_, gesture) =>
        translation.setValue(
          Math.max(OPEN, Math.min(0, offset.current + gesture.dx)),
        ),
      onPanResponderRelease: (_, gesture) =>
        finish(
          gesture.vx > 0.5
            ? 0
            : offset.current + gesture.dx < OPEN / 2 || gesture.vx < -0.5
              ? OPEN
              : 0,
        ),
      onPanResponderTerminate: () => finish(offset.current),
    });
  }, [disabled, translation]);

  return (
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
          { backgroundColor: pressed ? colors.pressedSurface : colors.surface },
        ]}
      >
        <Text style={{ color: colors.accent, fontSize: 17 }}>{label}</Text>
      </Pressable>
      <Animated.View
        {...responder.panHandlers}
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
  );
}

const styles = StyleSheet.create({
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
