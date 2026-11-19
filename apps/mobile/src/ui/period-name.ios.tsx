import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SymbolView } from 'expo-symbols';
import { FadeText } from './fade-text';
import { MenuOverlay } from './menu-field.ios';
import type { PeriodNameProps } from './period-name';
import { useThemeColors } from './theme';

/**
 * React Native draws the name and the arrow after it, and an invisible system menu lies over
 * them. Only what is drawn slides with the periods: a menu that had been moved is found where it
 * was moved from, off the screen.
 */
export function PeriodName({
  name,
  options,
  selected,
  slideStyle,
  onSelect,
}: PeriodNameProps) {
  const colors = useThemeColors();
  return (
    <View style={styles.name}>
      <Animated.View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={[styles.drawn, slideStyle]}
      >
        <FadeText
          containerStyle={styles.shrinks}
          style={[styles.text, { color: colors.text }]}
        >
          {name}
        </FadeText>
        <SymbolView
          name="chevron.down"
          size={11}
          weight="semibold"
          tintColor={colors.textMuted}
        />
      </Animated.View>
      <MenuOverlay
        accessibilityLabel={`Choose period. ${name}`}
        label="Period"
        options={options}
        selected={selected === undefined ? [] : [selected]}
        onSelect={onSelect}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  name: { maxWidth: '100%' },
  drawn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 44,
    paddingHorizontal: 12,
  },
  shrinks: { flexShrink: 1 },
  text: { fontSize: 16, fontWeight: '600' },
});
