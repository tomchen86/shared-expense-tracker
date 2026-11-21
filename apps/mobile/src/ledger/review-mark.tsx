import { View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useThemeColors } from '../ui/theme';

/** What the mark of an expense that needs review says (LEDGER-151.1). */
export const REPLACED = 'Your change was replaced';

/** The mark's warning icon, which a screen reader skips: the words beside it say what it means. */
export function ReviewIcon({ size }: { size: number }) {
  const colors = useThemeColors();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <SymbolView
        name={{ ios: 'exclamationmark.triangle.fill', android: 'warning' }}
        size={size}
        tintColor={colors.warning}
      />
    </View>
  );
}
