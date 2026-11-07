import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SwipeAction, useCloseSwipeRows } from '../ui/swipe-action';
import { useThemeColors } from '../ui/theme';
import { isUncategorizedCategory, type Category } from './repository';

interface CategoryRowProps {
  category: Category;
  used: boolean;
  readOnly?: boolean;
  onPress?: () => void;
  onRemove: () => void;
}

export function CategoryRow({
  category,
  used,
  readOnly = false,
  onPress,
  onRemove,
}: CategoryRowProps) {
  const colors = useThemeColors();
  const closeRows = useCloseSwipeRows();
  const reserved = isUncategorizedCategory(category);
  const action =
    reserved || readOnly || (category.isArchived && used)
      ? undefined
      : category.isArchived
        ? 'Delete'
        : 'Remove';
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
    <SwipeAction
      icon={{ ios: 'trash.fill', android: 'delete' }}
      accessibilityLabel={action}
      disabled={!action}
      staysInList
      onPress={onRemove}
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
          if (action && event.nativeEvent.actionName === 'remove') {
            closeRows();
            onRemove();
          }
        }}
        onPress={() => {
          closeRows();
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
    </SwipeAction>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: { width: 20, height: 20, borderRadius: 10, marginRight: 14 },
  label: { fontSize: 17, flex: 1 },
});
