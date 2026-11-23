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
  if (inline) {
    return (
      <NativeText
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        style={[
          styles.button,
          styles.inline,
          { color: colors.accent },
          disabled && styles.disabled,
        ]}
      >
        {label}
      </NativeText>
    );
  }
  const Action = destructive ? TextButton : Button;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={styles.button}
    >
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
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignSelf: 'center' },
  inline: {
    minHeight: 48,
    paddingHorizontal: 12,
    textAlignVertical: 'center',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    letterSpacing: 0.1,
  },
  disabled: { opacity: 0.38 },
});
