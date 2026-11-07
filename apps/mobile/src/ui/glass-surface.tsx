import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useThemeColors } from './theme';

export interface GlassSurfaceProps {
  style?: StyleProp<ViewStyle>;
  /** Added to `style` when the surface is not glass. */
  opaqueStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
}

/** Liquid Glass on an iOS that has it with transparency on, otherwise the surface color. */
export function GlassSurface({
  style,
  opaqueStyle,
  children,
}: GlassSurfaceProps) {
  const colors = useThemeColors();
  return (
    <View style={[style, { backgroundColor: colors.surface }, opaqueStyle]}>
      {children}
    </View>
  );
}
