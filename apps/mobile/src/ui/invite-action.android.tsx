import { Pressable, StyleSheet, Text as NativeText, View } from 'react-native';
import { Button, Text, TextButton } from '@expo/ui/jetpack-compose';
import type { InviteActionProps } from './invite-action';
import { MaterialHost } from './material.android';
import { useThemeColors } from './theme';

export function InviteAction({
  label,
  destructive,
  inline,
  disabled = false,
  onPress,
}: InviteActionProps) {
  const colors = useThemeColors();
  const Action = destructive ? TextButton : Button;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      android_ripple={inline ? { color: colors.pressedSurface } : undefined}
      style={[styles.button, inline && styles.inline]}
    >
      {inline ? (
        <NativeText
          style={[
            styles.label,
            { color: colors.accent },
            disabled && styles.disabled,
          ]}
        >
          {label}
        </NativeText>
      ) : (
        <View importantForAccessibility="no-hide-descendants">
          <MaterialHost matchContents>
            <Action
              onClick={onPress}
              enabled={!disabled}
              colors={destructive ? { contentColor: colors.error } : undefined}
            >
              <Text style={{ typography: 'labelLarge' }}>{label}</Text>
            </Action>
          </MaterialHost>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignSelf: 'center' },
  inline: {
    minHeight: 48,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderRadius: 24,
    overflow: 'hidden',
  },
  label: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    letterSpacing: 0.1,
  },
  disabled: { opacity: 0.38 },
});
