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
 * Compose publishes a Material surface's checked/enabled state and its text as separate
 * accessibility nodes. The visible Android text carries that state too. It doesn't take
 * focus or handle presses, so the Material surface owns the whole touch target.
 */
export function MaterialLabel({
  children,
  accessibilityLabel,
  accessibilityState,
  color,
  menu,
}: Pick<TextProps, 'accessibilityLabel' | 'accessibilityState'> & {
  children: string;
  color: keyof MaterialColors;
  menu?: boolean;
}) {
  const palette = useMaterialColors();
  return (
    <RNHostView matchContents>
      <Text
        accessible={false}
        importantForAccessibility="yes"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={accessibilityState}
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
