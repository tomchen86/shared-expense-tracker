export interface HeaderAction {
  /** The text of an iOS button or of a menu item, and the accessible name. */
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

export interface HeaderActionsProps {
  cancel?: HeaderAction;
  confirm?: HeaderAction;
  /** The other actions, at most two, in a menu whose accessible name is `label`. */
  menu?: {
    label: string;
    actions: [HeaderAction] | [HeaderAction, HeaderAction];
  };
}

/** Puts the actions in the header of the screen that renders it. */
export { HeaderActions } from './header-actions.android';
