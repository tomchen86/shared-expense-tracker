import { memo, useCallback, useRef, useState } from 'react';
import { BackHandler } from 'react-native';
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
      // The IME consumes Back while open. The next Back clears the query and iconifies in one command.
      const back = BackHandler.addEventListener('hardwareBackPress', () => {
        field.current?.cancelSearch();
        return true;
      });
      return () => back.remove();
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
