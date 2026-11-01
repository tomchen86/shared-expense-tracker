import { Stack } from 'expo-router';
import type { HeaderActionsProps } from './header-actions';

export function HeaderActions({ cancel, confirm, menu }: HeaderActionsProps) {
  return (
    <>
      <Stack.Toolbar placement="left">
        {cancel && (
          <Stack.Toolbar.Button
            variant="plain"
            accessibilityLabel={cancel.label}
            disabled={cancel.disabled}
            onPress={cancel.onPress}
          >
            {cancel.label}
          </Stack.Toolbar.Button>
        )}
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        {menu && (
          <Stack.Toolbar.Menu
            icon="ellipsis.circle"
            accessibilityLabel={menu.label}
          >
            {menu.actions.map((action, index) => (
              <Stack.Toolbar.MenuAction
                key={index}
                disabled={action.disabled}
                onPress={action.onPress}
              >
                {action.label}
              </Stack.Toolbar.MenuAction>
            ))}
          </Stack.Toolbar.Menu>
        )}
        {confirm && (
          <Stack.Toolbar.Button
            variant="prominent"
            accessibilityLabel={confirm.label}
            disabled={confirm.disabled}
            onPress={confirm.onPress}
          >
            {confirm.label}
          </Stack.Toolbar.Button>
        )}
      </Stack.Toolbar>
    </>
  );
}
