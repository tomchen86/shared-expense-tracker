import { Pressable, StyleSheet } from 'react-native';
import { impactAsync, ImpactFeedbackStyle } from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AddButtonProps } from './add-button';
import { GlassSurface } from './glass-surface';
import { useThemeColors } from './theme';

export function AddButton({ label = 'Add expense', onPress }: AddButtonProps) {
  const colors = useThemeColors();
  const { bottom } = useSafeAreaInsets();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        void impactAsync(ImpactFeedbackStyle.Light).catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        { bottom: bottom + 16 },
        pressed && styles.pressed,
      ]}
    >
      <GlassSurface style={styles.surface}>
        <SymbolView
          name="plus"
          size={28}
          tintColor={colors.text}
          accessibilityElementsHidden
          accessible={false}
        />
      </GlassSurface>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    alignSelf: 'center',
    width: 60,
    height: 60,
  },
  surface: {
    flex: 1,
    borderRadius: 30,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { transform: [{ scale: 0.96 }] },
});
