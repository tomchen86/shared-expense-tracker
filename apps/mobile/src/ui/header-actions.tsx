export interface HeaderAction {
  /** The text of an iOS button or of a menu item, and the accessible name. */
  label: string;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
}

/** An option of a choice menu; `selected` marks the current one. */
export interface HeaderChoice {
  label: string;
  selected: boolean;
  onPress: () => void;
}

export interface HeaderActionsProps {
  cancel?: HeaderAction;
  confirm?: HeaderAction;
  edit?: HeaderAction;
  /** The other actions, at most two, in a menu whose accessible name is `label`. */
  menu?: {
    label: string;
    actions: [HeaderAction] | [HeaderAction, HeaderAction];
  };
  /**
   * A choice menu (SHELL-54.1, SHELL-55.1): `label` is its accessible name and the
   * title of its Android dialog, `title` the title of the iOS menu, `icon` an SF
   * Symbol on iOS and a Material Symbol on Android; at most three options.
   */
  choices?: {
    label: string;
    title: string;
    icon: { ios: string; android: string };
    options:
      [HeaderChoice, HeaderChoice] | [HeaderChoice, HeaderChoice, HeaderChoice];
  };
}

/** Puts the actions in the header of the screen that renders it. */
export { HeaderActions } from './header-actions.android';
