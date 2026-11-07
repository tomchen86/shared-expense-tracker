import {
  Alert,
  Pressable,
  StyleSheet,
  View,
  type ColorValue,
} from 'react-native';
import { Stack } from 'expo-router';
import { SymbolView, type AndroidSymbol } from 'expo-symbols';
import type { HeaderAction, HeaderActionsProps } from './header-actions';
import { useThemeColors } from './theme';

function ActionButton({
  label,
  onPress,
  disabled,
  icon,
  color,
}: HeaderAction & {
  icon: AndroidSymbol;
  color: ColorValue;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      android_ripple={{ borderless: true, radius: 24 }}
      style={[styles.button, disabled && styles.disabled]}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <SymbolView name={{ android: icon }} tintColor={color} size={24} />
      </View>
    </Pressable>
  );
}

export function HeaderActions({
  cancel,
  confirm,
  edit,
  add,
  menu,
  choices,
}: HeaderActionsProps) {
  const colors = useThemeColors();
  const enabledActions =
    menu?.actions.filter((action) => !action.disabled) ?? [];
  const current = choices?.options.find((option) => option.selected);

  return (
    <Stack.Screen
      options={{
        headerLeft: cancel
          ? () => <ActionButton {...cancel} icon="close" color={colors.text} />
          : undefined,
        headerRight: () => (
          <View style={styles.row}>
            {edit && (
              <ActionButton {...edit} icon="edit" color={colors.accent} />
            )}
            {add && <ActionButton {...add} icon="add" color={colors.accent} />}
            {confirm && (
              <ActionButton {...confirm} icon="check" color={colors.accent} />
            )}
            {choices && (
              <ActionButton
                label={
                  current
                    ? `${choices.label}, ${current.label} selected`
                    : choices.label
                }
                icon={choices.icon.android as AndroidSymbol}
                color={colors.text}
                onPress={() =>
                  Alert.alert(
                    choices.label,
                    undefined,
                    choices.options.map((option) => ({
                      text: option.selected
                        ? `${option.label}, selected`
                        : option.label,
                      onPress: option.onPress,
                    })),
                    { cancelable: true },
                  )
                }
              />
            )}
            {menu && (
              <ActionButton
                label={menu.label}
                icon="more_vert"
                color={colors.text}
                disabled={enabledActions.length === 0}
                onPress={() =>
                  Alert.alert(
                    menu.label,
                    undefined,
                    [
                      ...enabledActions.map((action) => ({
                        text: action.label,
                        onPress: action.onPress,
                      })),
                      // A dialog holds three buttons and drops any others.
                      ...(enabledActions.length < 3
                        ? [{ text: 'Cancel', style: 'cancel' as const }]
                        : []),
                    ],
                    { cancelable: true },
                  )
                }
              />
            )}
          </View>
        ),
      }}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  button: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.38 },
});
