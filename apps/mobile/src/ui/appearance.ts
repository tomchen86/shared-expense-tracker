import { Appearance, type ColorValue } from 'react-native';

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
