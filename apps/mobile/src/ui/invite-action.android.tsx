import { Pressable, View } from 'react-native';
import { Button, Text, TextButton } from '@expo/ui/jetpack-compose';
import { semantics } from '@expo/ui/jetpack-compose/modifiers';
import type { InviteActionProps } from './invite-action';
import { MaterialHost, MaterialLabel } from './material.android';
import { useThemeColors } from './theme';

export function InviteAction({
  label,
  destructive,
  inline,
  disabled = false,
  onPress,
}: InviteActionProps) {
  const colors = useThemeColors();
  if (inline)
    return (
      <View style={{ alignSelf: 'center' }}>
        <MaterialHost matchContents>
          <TextButton
            enabled={!disabled}
            onClick={onPress}
            modifiers={[semantics({ contentDescription: label })]}
          >
            <MaterialLabel color="primary" accessibilityState={{ disabled }}>
              {label}
            </MaterialLabel>
          </TextButton>
        </MaterialHost>
      </View>
    );
  const Action = destructive ? TextButton : Button;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{ alignSelf: 'center' }}
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
