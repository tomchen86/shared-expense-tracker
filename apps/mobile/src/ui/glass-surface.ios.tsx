import { View } from 'react-native';
import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from 'expo-glass-effect';
import type { GlassSurfaceProps } from './glass-surface';
import { useReduceTransparency } from './reduce-transparency';
import { useThemeColors } from './theme';

export function GlassSurface({
  style,
  opaqueStyle,
  children,
}: GlassSurfaceProps) {
  const colors = useThemeColors();
  const reduceTransparency = useReduceTransparency();
  return !reduceTransparency &&
    isGlassEffectAPIAvailable() &&
    isLiquidGlassAvailable() ? (
    <GlassView isInteractive glassEffectStyle="regular" style={style}>
      {children}
    </GlassView>
  ) : (
    <View style={[style, { backgroundColor: colors.surface }, opaqueStyle]}>
      {children}
    </View>
  );
}
