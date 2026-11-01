import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { useReduceTransparency } from './reduce-transparency';
import { useThemeColors } from './theme';

export interface GroupedSectionProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function GroupedSection({ children, style }: GroupedSectionProps) {
  const colors = useThemeColors();
  const reduceTransparency = useReduceTransparency();

  if (reduceTransparency) {
    return (
      <View
        style={[styles.section, { backgroundColor: colors.surface }, style]}
      >
        {children}
      </View>
    );
  }

  return (
    <View
      style={[
        styles.section,
        styles.blurred,
        { borderColor: colors.separator },
        style,
      ]}
    >
      <BlurView
        intensity={100}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
        tint="systemMaterial"
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    borderCurve: 'continuous',
    borderRadius: 12,
    overflow: 'hidden',
  },
  blurred: {
    borderWidth: StyleSheet.hairlineWidth,
  },
});
