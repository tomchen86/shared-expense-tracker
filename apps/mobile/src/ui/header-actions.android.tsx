import {
  Alert,
  Pressable,
  StyleSheet,
  View,
  type ColorValue,
} from 'react-native';
import { Stack } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import type { HeaderAction, HeaderActionsProps } from './header-actions';
import { useThemeColors } from './theme';

function ActionButton({
  label,
  onPress,
  disabled,
  icon,
  color,
}: HeaderAction & {
  icon: 'close' | 'check' | 'more_vert';
  color: ColorValue;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
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

export function HeaderActions({ cancel, confirm, menu }: HeaderActionsProps) {
  const colors = useThemeColors();
  const enabledActions =
    menu?.actions.filter((action) => !action.disabled) ?? [];

  return (
    <Stack.Screen
      options={{
        headerLeft: cancel
          ? () => <ActionButton {...cancel} icon="close" color={colors.text} />
          : undefined,
        headerRight: () => (
          <View style={styles.row}>
            {confirm && (
              <ActionButton {...confirm} icon="check" color={colors.accent} />
            )}
            {menu && (
              <ActionButton
                label={menu.label}
                icon="more_vert"
                color={colors.text}
                disabled={enabledActions.length === 0}
                onPress={() =>
                  Alert.alert(menu.label, undefined, [
                    ...enabledActions.map((action) => ({
                      text: action.label,
                      onPress: action.onPress,
                    })),
                    { text: 'Cancel', style: 'cancel' },
                  ])
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
