import { Button } from 'react-native';
import { useThemeColors } from './theme';

export interface InviteActionProps {
  label: string;
  destructive?: boolean;
  inline?: boolean;
  disabled?: boolean;
  onPress: () => void;
}

export function InviteAction({
  label,
  destructive,
  disabled,
  onPress,
}: InviteActionProps) {
  const colors = useThemeColors();
  return (
    <Button
      title={label}
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      color={destructive ? colors.error : colors.accent}
    />
  );
}
