import { StyleSheet, Text, useColorScheme, type TextProps } from 'react-native';
import {
  getMaterialColors,
  Host,
  RNHostView,
  useMaterialColors,
  useNativeState,
  type HostProps,
  type MaterialColors,
} from '@expo/ui/jetpack-compose';
import { colorsForScheme } from './theme';

export function MaterialHost(props: HostProps) {
  // Appearance.setColorScheme applies the user's choice to this same React Native scheme.
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = colorsForScheme(scheme);
  const tones = getMaterialColors({ scheme, seedColor: colors.accent });
  return (
    <Host
      {...props}
      colorScheme={scheme}
      seedColor={colors.accent}
      colorOverrides={{
        primary: colors.accent,
        secondary: colors.accent,
        secondaryContainer: tones.primaryContainer,
        onSecondaryContainer: tones.onPrimaryContainer,
        tertiaryContainer: tones.primaryContainer,
        onTertiaryContainer: tones.onPrimaryContainer,
        background: colors.background,
        onBackground: colors.text,
        surface: colors.surface,
        surfaceContainer: colors.surface,
        surfaceContainerLow: colors.surface,
        surfaceContainerHigh: colors.surface,
        surfaceContainerHighest: colors.segmentedTrack,
        onSurface: colors.text,
        onSurfaceVariant: colors.textMuted,
        outline: colors.separator,
        outlineVariant: colors.separator,
        error: colors.error,
      }}
    />
  );
}

/**
 * The visible text carries the Material surface's checked or enabled state. In a menu
 * popup RNHostView receives the taps on that text, so the label also selects the item.
 */
export function MaterialLabel({
  children,
  accessibilityRole,
  accessibilityState,
  color,
  menu,
  onPress,
}: Pick<TextProps, 'accessibilityRole' | 'accessibilityState'> & {
  children: string;
  color: keyof MaterialColors;
  menu?: boolean;
  onPress?: () => void;
}) {
  const palette = useMaterialColors();
  return (
    <RNHostView matchContents>
      <Text
        accessible={false}
        importantForAccessibility="yes"
        accessibilityRole={accessibilityRole}
        accessibilityState={accessibilityState}
        onPress={onPress}
        disabled={accessibilityState?.disabled}
        numberOfLines={menu ? undefined : 1}
        style={[
          menu ? styles.bodyLarge : styles.labelLarge,
          { color: palette[color] },
          accessibilityState?.disabled && styles.disabled,
        ]}
      >
        {children}
      </Text>
    </RNHostView>
  );
}

const styles = StyleSheet.create({
  bodyLarge: {
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: 0.5,
    includeFontPadding: false,
  },
  labelLarge: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    letterSpacing: 0.1,
    includeFontPadding: false,
  },
  disabled: { opacity: 0.38 },
});

/** Compose owns both the text and selection for the lifetime of the open field. */
export function useTextWithCaretAtEnd(initial: string) {
  const value = useNativeState(initial);
  const selection = useNativeState({
    start: initial.length,
    end: initial.length,
  });
  return { value, selection };
}
