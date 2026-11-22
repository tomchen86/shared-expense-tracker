import { Pressable, View } from 'react-native';
import { Button, Text, TextButton } from '@expo/ui/jetpack-compose';
import type { InviteActionProps } from './invite-action';
import { MaterialHost } from './material.android';
import { useThemeColors } from './theme';

export function InviteAction({
  label,
  destructive,
  onPress,
}: InviteActionProps) {
  const colors = useThemeColors();
  const Action = destructive ? TextButton : Button;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{ alignSelf: 'center' }}
    >
      <View importantForAccessibility="no-hide-descendants">
        <MaterialHost matchContents>
          <Action
            onClick={onPress}
            colors={destructive ? { contentColor: colors.error } : undefined}
          >
            <Text style={{ typography: 'labelLarge' }}>{label}</Text>
          </Action>
        </MaterialHost>
      </View>
    </Pressable>
  );
}
