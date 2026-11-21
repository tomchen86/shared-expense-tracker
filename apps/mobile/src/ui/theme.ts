import { useColorScheme, type ColorSchemeName } from 'react-native';
import type { ThemeColors } from './appearance';

type AndroidColors = Record<keyof ThemeColors, `#${string}`>;

const LIGHT_COLORS: AndroidColors = {
  background: '#f2f2f7',
  surface: '#ffffff',
  pressedSurface: '#e5e5ea',
  segmentedTrack: '#e5e5ea',
  segmentedThumb: '#ffffff',
  text: '#1c1c1e',
  textMuted: '#636366',
  placeholder: '#767680',
  separator: '#c6c6c8',
  accent: '#007aff',
  error: '#b42318',
};

const DARK_COLORS: AndroidColors = {
  background: '#000000',
  surface: '#1c1c1e',
  pressedSurface: '#2c2c2e',
  segmentedTrack: '#2c2c2e',
  segmentedThumb: '#3a3a3c',
  text: '#f2f2f7',
  textMuted: '#98989d',
  placeholder: '#8e8e93',
  separator: '#38383a',
  accent: '#0a84ff',
  error: '#ff453a',
};

export function colorsForScheme(scheme: ColorSchemeName | null): AndroidColors {
  return scheme === 'dark' ? DARK_COLORS : LIGHT_COLORS;
}

export function useThemeColors(): ThemeColors {
  return colorsForScheme(useColorScheme());
}
