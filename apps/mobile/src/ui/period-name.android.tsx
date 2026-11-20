import { Pressable, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { SymbolView } from 'expo-symbols';
import { FadeText } from './fade-text';
import { MaterialMenu } from './material-menu.android';
import type { PeriodNameProps } from './period-name';
import { useThemeColors } from './theme';

export function PeriodName({
  name,
  selected,
  options,
  onSelect,
  slideStyle,
}: PeriodNameProps) {
  const colors = useThemeColors();
  return (
    <MaterialMenu
      options={options}
      selected={selected === undefined ? [] : [selected]}
      onSelect={onSelect}
    >
      {(open) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Choose period. ${name}`}
          android_ripple={{ color: colors.pressedSurface }}
          onPress={open}
        >
          <Animated.View style={[styles.name, slideStyle]}>
            <FadeText
              containerStyle={styles.shrinks}
              style={[styles.text, { color: colors.text }]}
            >
              {name}
            </FadeText>
            <SymbolView
              name={{ android: 'arrow_drop_down' }}
              size={18}
              tintColor={colors.textMuted}
            />
          </Animated.View>
        </Pressable>
      )}
    </MaterialMenu>
  );
}

const styles = StyleSheet.create({
  name: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 12,
  },
  shrinks: { flexShrink: 1 },
  text: { fontSize: 16, fontWeight: '600' },
});
