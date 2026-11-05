import {
  KeyboardAvoidingView as NativeKeyboardAvoidingView,
  type ViewProps,
} from 'react-native';
import { useHeaderHeight } from 'expo-router/react-navigation';

export function KeyboardAvoidingView(props: ViewProps) {
  const headerHeight = useHeaderHeight();
  return (
    <NativeKeyboardAvoidingView
      {...props}
      behavior="height"
      keyboardVerticalOffset={headerHeight}
    />
  );
}
