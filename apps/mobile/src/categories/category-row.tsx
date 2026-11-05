import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import {
  GestureDetector,
  GestureStateManager,
  usePanGesture,
  type NativeGesture,
} from 'react-native-gesture-handler';
import { useThemeColors } from '../ui/theme';
import { isUncategorizedCategory, type Category } from './repository';

interface CategoryRowProps {
  category: Category;
  used: boolean;
  readOnly?: boolean;
  onPress?: () => void;
  onRemove: () => void;
  scrollGesture: NativeGesture;
}

const ACTION_WIDTH = 88;

export function CategoryRow({
  category,
  used,
  readOnly = false,
  onPress,
  onRemove,
  scrollGesture,
}: CategoryRowProps) {
  const colors = useThemeColors();
  const reserved = isUncategorizedCategory(category);
  const action =
    reserved || readOnly || (category.isArchived && used)
      ? undefined
      : category.isArchived
        ? 'Delete'
        : 'Remove';
  const translation = useSharedValue(0);
  const start = useSharedValue(0);
  const origin = useSharedValue({ x: 0, y: 0 });
  const direction = useSharedValue<'pending' | 'horizontal' | 'vertical'>(
    'pending',
  );
  const [revealed, setRevealed] = useState(false);
  const pan = usePanGesture({
    // Decide before the native scroll recognizer activates; retain that
    // direction until release, including rows that only offer Restore on tap.
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
      cancelAnimation(translation);
      start.value = translation.value;
      scheduleOnRN(setRevealed, !!action);
    },
    onUpdate: (event) => {
      if (action)
        translation.value = Math.max(
          -ACTION_WIDTH,
          Math.min(0, start.value + event.translationX),
        );
    },
    onDeactivate: (event) => {
      const open =
        !event.canceled &&
        !!action &&
        (translation.value < -ACTION_WIDTH / 2 || event.velocityX < -500);
      translation.value = withTiming(open ? -ACTION_WIDTH : 0, {
        duration: 160,
      });
      scheduleOnRN(setRevealed, open);
    },
  });
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: action ? translation.value : 0 }],
  }));

  function close() {
    cancelAnimation(translation);
    translation.value = 0;
    setRevealed(false);
  }

  function remove() {
    close();
    onRemove();
  }

  const content = (
    <>
      <View style={[styles.dot, { backgroundColor: category.color }]} />
      <Text style={[styles.label, { color: colors.text }]}>
        {category.name}
      </Text>
      {category.isArchived && !readOnly && (
        <Text style={{ color: colors.accent }}>Restore</Text>
      )}
    </>
  );

  if (reserved) return <View style={styles.row}>{content}</View>;
  if (readOnly)
    return (
      <View accessible accessibilityLabel={category.name} style={styles.row}>
        {content}
      </View>
    );

  return (
    <GestureDetector gesture={pan}>
      <View style={styles.swipe}>
        {action && revealed && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={action}
            onPress={remove}
            style={[styles.action, { backgroundColor: colors.error }]}
          >
            <Text style={[styles.actionText, { color: colors.background }]}>
              {action}
            </Text>
          </Pressable>
        )}
        <Animated.View style={animatedStyle}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              category.isArchived ? `Restore ${category.name}` : category.name
            }
            accessibilityActions={
              action ? [{ name: 'remove', label: action }] : undefined
            }
            onAccessibilityAction={(event) => {
              if (action && event.nativeEvent.actionName === 'remove') remove();
            }}
            onPress={() => {
              close();
              onPress?.();
            }}
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: colors.surface },
              pressed && { backgroundColor: colors.pressedSurface },
            ]}
          >
            {content}
          </Pressable>
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  swipe: { overflow: 'hidden' },
  row: {
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: { width: 20, height: 20, borderRadius: 10, marginRight: 14 },
  label: { fontSize: 17, flex: 1 },
  action: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: ACTION_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { fontSize: 15, fontWeight: '600' },
});
