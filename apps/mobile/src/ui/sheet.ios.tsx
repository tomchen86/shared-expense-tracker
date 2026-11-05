import { useId, useLayoutEffect, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ScreenStack,
  ScreenStackItem,
  type HeaderBarButtonItem,
} from 'react-native-screens';
import type { HeaderAction } from './header-actions';
import type { SheetProps } from './sheet';
import { useThemeColors } from './theme';
import { nativeConfirmTint } from './native-confirm-tint.ios';

/** A local native sheet keeps its parent's route and scroll view mounted. */
export function Sheet({
  visible,
  title,
  cancel,
  confirm,
  onClose,
  onAfterClose,
  dismissible = true,
  list,
  children,
}: SheetProps) {
  const id = useId();
  const colors = useThemeColors();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [contentHeight, setContentHeight] = useState(0);
  const [presented, setPresented] = useState(visible);
  useLayoutEffect(() => {
    if (visible) setPresented(true);
    else setContentHeight(0);
  }, [visible]);
  const [headerHeight, setHeaderHeight] = useState(0);
  const longList = list && contentHeight + 80 > height / 2;
  // RNS sizes a modal's native scroll view to the sheet, while its origin stays
  // below the header. Reserve that overrun when the sheet is shorter than its
  // content so the last row can scroll above the header and bottom safe area.
  const scrollEndSpace =
    longList ||
    contentHeight + headerHeight + insets.bottom > height - insets.top
      ? headerHeight + insets.bottom
      : 0;
  const button = (
    action: HeaderAction | undefined,
    variant: 'plain' | 'prominent',
  ): HeaderBarButtonItem[] =>
    action
      ? [
          {
            type: 'button',
            title: action.label,
            accessibilityLabel: action.label,
            disabled: !!action.disabled,
            onPress: action.onPress,
            variant,
            tintColor: variant === 'prominent' ? nativeConfirmTint : undefined,
          },
        ]
      : [];

  if (!visible && !presented) return null;

  return (
    <ScreenStack
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
      onFinishTransitioning={() => {
        if (!visible) {
          setPresented(false);
          onAfterClose?.();
        }
      }}
    >
      <ScreenStackItem
        screenId={`${id}-base`}
        activityState={2}
        pointerEvents="none"
        headerConfig={{ hidden: true }}
        style={StyleSheet.absoluteFill}
      />
      {visible && (
        <ScreenStackItem
          screenId={id}
          activityState={2}
          stackPresentation="formSheet"
          sheetAllowedDetents={longList ? [0.5, 1] : 'fitToContents'}
          sheetInitialDetentIndex={0}
          sheetGrabberVisible
          sheetExpandsWhenScrolledToEdge={false}
          gestureEnabled={dismissible}
          preventNativeDismiss={!dismissible}
          onDismissed={() => {
            setPresented(false);
            onClose();
          }}
          onHeaderHeightChange={({ nativeEvent }) =>
            setHeaderHeight(nativeEvent.headerHeight)
          }
          headerConfig={{
            title,
            titleColor: colors.text,
            hideBackButton: true,
            headerLeftBarButtonItems: button(cancel, 'plain'),
            headerRightBarButtonItems: button(confirm, 'prominent'),
          }}
          contentStyle={{ backgroundColor: colors.background }}
          style={StyleSheet.absoluteFill}
        >
          <ScrollView
            automaticallyAdjustKeyboardInsets
            contentInsetAdjustmentBehavior="never"
            keyboardShouldPersistTaps="handled"
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ paddingBottom: scrollEndSpace }}
          >
            <View
              style={styles.content}
              onLayout={({ nativeEvent }) =>
                setContentHeight(nativeEvent.layout.height)
              }
            >
              {children}
            </View>
          </ScrollView>
        </ScreenStackItem>
      )}
    </ScreenStack>
  );
}

const styles = StyleSheet.create({ content: { padding: 20 } });
