import {
  Appearance,
  Platform,
  type ColorSchemeName,
  type ColorValue,
} from 'react-native';

export type AppearanceOption = 'system' | 'light' | 'dark';

export const APPEARANCE_OPTIONS: readonly {
  label: string;
  value: AppearanceOption;
}[] = [
  { label: 'System', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
];

export function applyAppearanceOption(option: AppearanceOption): void {
  Appearance.setColorScheme(option === 'system' ? 'unspecified' : option);
}

export function nativeStatusBarStyle(
  scheme: ColorSchemeName | null,
): 'light' | 'dark' | undefined {
  // iOS keeps its existing app-managed status bar; native-stack controls it on Android.
  if (Platform.OS !== 'android') return undefined;
  return scheme === 'dark' ? 'light' : 'dark';
}

export interface ThemeColors {
  background: ColorValue;
  surface: ColorValue;
  pressedSurface: ColorValue;
  segmentedTrack: ColorValue;
  segmentedThumb: ColorValue;
  text: ColorValue;
  textMuted: ColorValue;
  placeholder: ColorValue;
  separator: ColorValue;
  accent: ColorValue;
  error: ColorValue;
}
