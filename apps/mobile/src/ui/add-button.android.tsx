import { Pressable, StyleSheet, Text } from 'react-native';
import { useNavigation } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AddButtonProps } from './add-button';
import { useThemeColors } from './theme';

export function AddButton({ label = 'Add expense', onPress }: AddButtonProps) {
  const colors = useThemeColors();
  const { bottom } = useSafeAreaInsets();
  let parent = useNavigation().getParent();
  while (parent && parent.getState().type !== 'tab')
    parent = parent.getParent();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      android_ripple={{ color: colors.pressedSurface }}
      onPress={onPress}
      style={[
        styles.button,
        { bottom: 16 + (parent ? 0 : bottom), backgroundColor: colors.surface },
      ]}
    >
      <Text
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.plus, { color: colors.text }]}
      >
        +
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    alignSelf: 'center',
    width: 60,
    height: 60,
    borderRadius: 30,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  plus: { fontSize: 32, lineHeight: 36 },
});
