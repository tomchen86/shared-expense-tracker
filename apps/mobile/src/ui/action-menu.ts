import { Alert } from 'react-native';
import type { HeaderAction } from './header-actions';

export interface ActionMenuOptions {
  title: string;
  message?: string;
  actions: (HeaderAction & { destructive?: boolean })[];
}

export function showActionMenu({ title, message, actions }: ActionMenuOptions) {
  Alert.alert(
    title,
    message,
    [
      ...actions.map((action) => ({
        text: action.label,
        onPress: action.onPress,
      })),
      { text: 'Cancel', style: 'cancel' },
    ],
    { cancelable: true },
  );
}
