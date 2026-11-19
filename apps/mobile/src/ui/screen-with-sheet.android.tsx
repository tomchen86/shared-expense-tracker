import { useEffect } from 'react';
import {
  BackHandler,
  ScrollView,
  StyleSheet,
  useColorScheme,
  View,
} from 'react-native';
import {
  ScreenStack,
  ScreenStackHeaderLeftView,
  ScreenStackItem,
} from 'react-native-screens';
import { useTheme } from 'expo-router';
import { HeaderTitle } from 'expo-router/react-navigation';
import { ActionButton } from './header-actions.android';
import { formPresentation } from './form-presentation';
import { nativeStatusBarStyle } from './appearance';
import { useThemeColors } from './theme';
import type { ScreenWithSheetProps } from './screen-with-sheet';

/** Keep the running app on the first native screen, under the slide-up sheet. */
export function ScreenWithSheet({
  children,
  title,
  sheet,
  onClose,
}: ScreenWithSheetProps) {
  const visible = sheet !== null;
  const colors = useThemeColors();
  const theme = useTheme();
  const statusBarStyle = nativeStatusBarStyle(useColorScheme());
  useEffect(() => {
    if (!visible) return;
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => back.remove();
  }, [visible, onClose]);

  return (
    <ScreenStack style={{ flex: 1 }}>
      <ScreenStackItem
        screenId="app"
        activityState={2}
        style={StyleSheet.absoluteFill}
        headerConfig={{ hidden: true }}
        aria-hidden={visible}
      >
        {children}
      </ScreenStackItem>
      {visible && (
        <ScreenStackItem
          screenId="sheet"
          activityState={2}
          style={StyleSheet.absoluteFill}
          stackPresentation={formPresentation.presentation}
          stackAnimation={formPresentation.animation}
          nativeBackButtonDismissalEnabled={false}
          onDismissed={onClose}
          statusBarStyle={statusBarStyle}
          contentStyle={{ backgroundColor: colors.background }}
          headerConfig={{
            title,
            titleColor: colors.text,
            backgroundColor: theme.colors.card,
            hideBackButton: true,
            children: (
              // Android replaces the native title when a left header view is set.
              <ScreenStackHeaderLeftView style={{ flex: 1 }}>
                <ActionButton
                  label="Close"
                  onPress={onClose}
                  icon="close"
                  color={colors.text}
                />
                <View style={{ flex: 1 }}>
                  <HeaderTitle>{title}</HeaderTitle>
                </View>
              </ScreenStackHeaderLeftView>
            ),
          }}
        >
          <ScrollView contentContainerStyle={{ padding: 20 }}>
            {sheet}
          </ScrollView>
        </ScreenStackItem>
      )}
    </ScreenStack>
  );
}
