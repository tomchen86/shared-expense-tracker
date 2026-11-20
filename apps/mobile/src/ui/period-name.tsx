import type { ComponentProps } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { FadeText } from './fade-text';
import { useThemeColors } from './theme';

export interface PeriodNameProps {
  /** The name of the period a list shows. A screen reader reads it as Choose period. <name>. */
  name: string;
  /** The periods the name's menu offers, on iOS. */
  options: { id: string; name: string }[];
  /** The ID of the option that is the period shown, when one is. */
  selected?: string;
  /**
   * Moves the name as drawn while the periods are paged. What takes the presses, the menu or the
   * button, stays where it is: a screen reader and the next press find it there (LEDGER-110.1).
   */
  slideStyle?: ComponentProps<typeof Animated.View>['style'];
  /** Receives the ID of the option chosen in the menu, on iOS. */
  onSelect: (id: string) => void;
  /** Called on Android, where a press on the name opens Filters (LEDGER-111.1). */
  onOpenFilters: () => void;
}

/** The name on a list's period row: a system menu of periods on iOS, a button that opens Filters on Android. */
export function PeriodName({
  name,
  slideStyle,
  onOpenFilters,
}: PeriodNameProps) {
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Choose period. ${name}`}
      android_ripple={{ color: colors.pressedSurface }}
      onPress={onOpenFilters}
      style={styles.button}
    >
      <Animated.View style={slideStyle}>
        <FadeText style={[styles.name, { color: colors.text }]}>
          {name}
        </FadeText>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    maxWidth: '100%',
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  name: { fontSize: 16, fontWeight: '600' },
});
