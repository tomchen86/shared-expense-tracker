import { ActionSheetIOS } from 'react-native';
import type { ActionMenuOptions } from './action-menu';

export function showActionMenu({ title, message, actions }: ActionMenuOptions) {
  ActionSheetIOS.showActionSheetWithOptions(
    {
      title,
      message,
      options: [...actions.map((action) => action.label), 'Cancel'],
      cancelButtonIndex: actions.length,
      destructiveButtonIndex: actions.flatMap((action, index) =>
        action.destructive ? [index] : [],
      ),
    },
    (index) => actions[index]?.onPress(),
  );
}
