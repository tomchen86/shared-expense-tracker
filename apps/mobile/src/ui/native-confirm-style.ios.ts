import { PlatformColor } from 'react-native';
import { isLiquidGlassAvailable } from 'expo-glass-effect';

// Prominent iOS 26 items have an accent-filled background. Keep their labels
// readable instead of inheriting the navigation bar's accent text color.
export const nativeConfirmStyle = isLiquidGlassAvailable()
  ? { color: PlatformColor('whiteColor') }
  : undefined;
