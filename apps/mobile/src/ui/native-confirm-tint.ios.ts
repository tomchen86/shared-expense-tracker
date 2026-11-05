import { PlatformColor } from 'react-native';
import { isLiquidGlassAvailable } from 'expo-glass-effect';

// Use the system label tint for prominent buttons. UIKit supplies the contrasting
// foreground in both appearances, including when Reduce Transparency is enabled.
export const nativeConfirmTint = isLiquidGlassAvailable()
  ? PlatformColor('labelColor')
  : undefined;
