import { memo, useCallback, useRef, useState } from 'react';
import { BackHandler, Keyboard } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import type { SearchBarCommands } from 'react-native-screens';
import type { HeaderSearchProps } from './header-search';

export const HeaderSearch = memo(function HeaderSearch({
  placeholder,
  onChangeText,
}: HeaderSearchProps) {
  const field = useRef<SearchBarCommands>(null);
  const [open, setOpen] = useState(false);
  useFocusEffect(
    useCallback(() => {
      if (!open) return;
      // A focused SearchAutoComplete consumes Back before React Native, even with the IME hidden.
      const hide = Keyboard.addListener('keyboardDidHide', () => {
        field.current?.blur();
      });
      const back = BackHandler.addEventListener('hardwareBackPress', () => {
        if (!field.current) return false;
        field.current.cancelSearch();
        return true;
      });
      return () => {
        hide.remove();
        back.remove();
      };
    }, [open]),
  );
  return (
    <Stack.SearchBar
      ref={field}
      placeholder={placeholder}
      placement="integratedButton"
      allowToolbarIntegration={false}
      hideWhenScrolling={false}
      disableBackButtonOverride
      onOpen={() => setOpen(true)}
      onClose={() => {
        setOpen(false);
        onChangeText('');
      }}
      onChangeText={(event) => onChangeText(event.nativeEvent.text)}
      onSearchButtonPress={() => field.current?.blur()}
    />
  );
});
