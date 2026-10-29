import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useThemeColors } from './theme';

export interface GroupedSectionProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function GroupedSection({ children, style }: GroupedSectionProps) {
  const colors = useThemeColors();
  return (
    <View style={[styles.section, { backgroundColor: colors.surface }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { borderRadius: 12, overflow: 'hidden' },
});
