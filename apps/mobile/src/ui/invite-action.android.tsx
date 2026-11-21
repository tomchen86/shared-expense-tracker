import { Button, Text, TextButton } from '@expo/ui/jetpack-compose';
import { semantics } from '@expo/ui/jetpack-compose/modifiers';
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
    <MaterialHost matchContents style={{ alignSelf: 'center' }}>
      <Action
        onClick={onPress}
        modifiers={[semantics({ contentDescription: label })]}
        colors={destructive ? { contentColor: colors.error } : undefined}
      >
        <Text style={{ typography: 'labelLarge' }}>{label}</Text>
      </Action>
    </MaterialHost>
  );
}
