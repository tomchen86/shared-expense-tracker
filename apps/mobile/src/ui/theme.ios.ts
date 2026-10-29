import { PlatformColor } from 'react-native';
import type { ThemeColors } from './appearance';

const IOS_COLORS: ThemeColors = {
  background: PlatformColor('systemGroupedBackgroundColor'),
  surface: PlatformColor('secondarySystemGroupedBackgroundColor'),
  pressedSurface: PlatformColor('systemFillColor'),
  segmentedTrack: PlatformColor('secondarySystemFillColor'),
  segmentedThumb: PlatformColor('tertiarySystemGroupedBackgroundColor'),
  text: PlatformColor('labelColor'),
  textMuted: PlatformColor('secondaryLabelColor'),
  placeholder: PlatformColor('placeholderTextColor'),
  separator: PlatformColor('separatorColor'),
  accent: PlatformColor('systemBlueColor'),
  error: PlatformColor('systemRedColor'),
};

export function useThemeColors(): ThemeColors {
  return IOS_COLORS;
}
