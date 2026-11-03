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
      onMoveShouldSetPanResponder: (_, gesture) =>
        !disabled &&
        Math.abs(gesture.dx) > 10 &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderGrant: () => translation.stopAnimation(),
      onPanResponderMove: (_, gesture) =>
        translation.setValue(
          Math.max(-WIDTH, Math.min(0, offset.current + gesture.dx)),
        ),
      onPanResponderRelease: (_, gesture) =>
        finish(
          offset.current + gesture.dx < -WIDTH / 2 || gesture.vx < -0.5
            ? -WIDTH
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
        style={{
          backgroundColor: colors.background,
          transform: [{ translateX: translation }],
        }}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden', borderRadius: 12 },
  action: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
