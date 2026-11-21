import { useWindowDimensions, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useThemeColors } from '../ui/theme';

/** What the mark of an expense that needs review says (LEDGER-151.1). */
export const REPLACED = 'Your change was replaced';

/**
 * The mark's warning icon, `size` points at the standard text size and as much larger as
 * the system's text is (LEDGER-155.1). A screen reader skips it: the words beside it say
 * what it means.
 */
export function ReviewIcon({ size }: { size: number }) {
  const colors = useThemeColors();
  // On Android the symbol is a glyph, which grows with the text; its box has to grow too,
  // or the glyph is cut off. On iOS the symbol fills the box.
  const box = size * useWindowDimensions().fontScale;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <SymbolView
        name={{ ios: 'exclamationmark.triangle.fill', android: 'warning' }}
        size={size}
        style={{ width: box, height: box }}
        tintColor={colors.warning}
      />
    </View>
  );
}
