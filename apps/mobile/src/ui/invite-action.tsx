import { Button } from 'react-native';
import { useThemeColors } from './theme';

export interface InviteActionProps {
  label: string;
  destructive?: boolean;
  onPress: () => void;
}

export function InviteAction({
  label,
  destructive,
  onPress,
}: InviteActionProps) {
  const colors = useThemeColors();
  return (
    <Button
      title={label}
      accessibilityLabel={label}
      onPress={onPress}
      color={destructive ? colors.error : colors.accent}
    />
  );
}
