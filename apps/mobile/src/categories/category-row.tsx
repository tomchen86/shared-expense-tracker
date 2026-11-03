import { useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useThemeColors } from '../ui/theme';
import { isUncategorizedCategory, type Category } from './repository';

interface CategoryRowProps {
  category: Category;
  used: boolean;
  onPress?: () => void;
  onRemove: () => void;
}

const ACTION_WIDTH = 88;

export function CategoryRow({
  category,
  used,
  onPress,
  onRemove,
}: CategoryRowProps) {
  const colors = useThemeColors();
  const reserved = isUncategorizedCategory(category);
  const action =
    reserved || (category.isArchived && used)
      ? undefined
      : category.isArchived
        ? 'Delete'
        : 'Remove';
  const translation = useRef(new Animated.Value(0)).current;
  const offset = useRef(0);
  const start = useRef(0);
  const [revealed, setRevealed] = useState(false);
  const responder = useMemo(() => {
    function finish(open: boolean) {
      offset.current = open ? -ACTION_WIDTH : 0;
      Animated.timing(translation, {
        toValue: offset.current,
        duration: 160,
        useNativeDriver: true,
      }).start();
      setRevealed(open);
    }
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 10 &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
      onPanResponderGrant: () => {
        translation.stopAnimation();
        start.current = offset.current;
        // Even a row without a swipe action must consume the drag, so releasing
        // it does not press Restore.
        setRevealed(!!action);
      },
      onPanResponderMove: (_, gesture) => {
        if (!action) return;
        offset.current = Math.max(
          -ACTION_WIDTH,
          Math.min(0, start.current + gesture.dx),
        );
        translation.setValue(offset.current);
      },
      onPanResponderRelease: (_, gesture) =>
        finish(
          !!action && (offset.current < -ACTION_WIDTH / 2 || gesture.vx < -0.5),
        ),
      onPanResponderTerminate: () => finish(false),
    });
  }, [action, translation]);

  function close() {
    translation.stopAnimation();
    translation.setValue(0);
    offset.current = 0;
    setRevealed(false);
  }

  function remove() {
    close();
    onRemove();
  }

  const content = (
    <>
      <View style={[styles.dot, { backgroundColor: category.color }]} />
      <Text
        style={[styles.label, category.isArchived && { color: colors.text }]}
      >
        {category.name}
      </Text>
      {category.isArchived && (
        <Text style={{ color: colors.accent }}>Restore</Text>
      )}
    </>
  );

  if (reserved) return <View style={styles.row}>{content}</View>;

  return (
    <View style={styles.swipe} {...responder.panHandlers}>
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
      <Animated.View
        style={{ transform: [{ translateX: action ? translation : 0 }] }}
      >
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
            { backgroundColor: category.isArchived ? colors.surface : '#fff' },
            pressed && {
              backgroundColor: category.isArchived
                ? colors.pressedSurface
                : '#e5e5ea',
            },
          ]}
        >
          {content}
        </Pressable>
      </Animated.View>
    </View>
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
  label: { color: '#1c1c1e', fontSize: 17, flex: 1 },
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
