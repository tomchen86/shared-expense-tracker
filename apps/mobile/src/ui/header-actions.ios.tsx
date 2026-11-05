import { Stack } from 'expo-router';
import type { SFSymbol } from 'expo-symbols';
import type { HeaderActionsProps } from './header-actions';
import { nativeConfirmTint } from './native-confirm-tint.ios';

export function HeaderActions({
  cancel,
  confirm,
  edit,
  menu,
  choices,
}: HeaderActionsProps) {
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
        {edit && (
          <Stack.Toolbar.Button
            variant="plain"
            accessibilityLabel={edit.label}
            disabled={edit.disabled}
            onPress={edit.onPress}
          >
            {edit.label}
          </Stack.Toolbar.Button>
        )}
        {menu && (
          <Stack.Toolbar.Menu
            icon="ellipsis.circle"
            accessibilityLabel={menu.label}
          >
            {menu.actions.map((action, index) => (
              <Stack.Toolbar.MenuAction
                key={index}
                disabled={action.disabled}
                destructive={action.destructive}
                onPress={action.onPress}
              >
                {action.label}
              </Stack.Toolbar.MenuAction>
            ))}
          </Stack.Toolbar.Menu>
        )}
        {choices && (
          <Stack.Toolbar.Menu
            icon={choices.icon.ios as SFSymbol}
            title={choices.title}
            accessibilityLabel={choices.label}
          >
            {choices.options.map((option) => (
              <Stack.Toolbar.MenuAction
                key={option.label}
                isOn={option.selected}
                onPress={option.onPress}
              >
                {option.label}
              </Stack.Toolbar.MenuAction>
            ))}
          </Stack.Toolbar.Menu>
        )}
        {confirm && (
          <Stack.Toolbar.Button
            variant="prominent"
            tintColor={nativeConfirmTint}
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
