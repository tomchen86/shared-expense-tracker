import { memo, useRef } from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import type { SearchBarCommands } from 'react-native-screens';

export interface HeaderSearchProps {
  placeholder: string;
  onChangeText: (text: string) => void;
}

/** The system search field in the screen's navigation bar (SHELL-73.2). */
export const HeaderSearch = memo(function HeaderSearch({
  placeholder,
  onChangeText,
}: HeaderSearchProps) {
  const field = useRef<SearchBarCommands>(null);
  const close = () => onChangeText('');
  return (
    <Stack.SearchBar
      ref={field}
      placeholder={placeholder}
      placement={
        Platform.OS === 'ios' && parseInt(Platform.Version, 10) < 26
          ? 'automatic'
          : 'integratedButton'
      }
      allowToolbarIntegration={false}
      hideWhenScrolling={false}
      onChangeText={(event) => onChangeText(event.nativeEvent.text)}
      onSearchButtonPress={() => field.current?.blur()}
      onCancelButtonPress={close}
      onClose={close}
    />
  );
});
