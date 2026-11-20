import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Box,
  DropdownMenuGroup,
  DropdownMenuPopup,
  Icon,
  SelectableDropdownMenuItem,
} from '@expo/ui/jetpack-compose';
import {
  fillMaxSize,
  selectable,
  semantics,
} from '@expo/ui/jetpack-compose/modifiers';
import check from './check.xml';
import { MaterialHost, MaterialLabel } from './material.android';
import type { MenuFieldProps } from './menu-field';

type MenuProps = Pick<
  MenuFieldProps,
  'options' | 'selected' | 'multiple' | 'onSelect'
>;

/** The popup anchors to the button's bounds. The button keeps handling taps and swipes in the list. */
export function MaterialMenu({
  options,
  selected,
  multiple,
  onSelect,
  children,
}: MenuProps & { children: (open: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <View style={styles.anchor}>
      {children(() => setOpen(true))}
      {open && (
        <MaterialHost style={StyleSheet.absoluteFill}>
          <Box modifiers={[fillMaxSize()]}>
            <DropdownMenuPopup expanded onDismissRequest={close}>
              <DropdownMenuGroup>
                {options.map(({ id, name }, index) => {
                  const checked = selected.includes(id);
                  function choose() {
                    if (!multiple) close();
                    onSelect(id);
                  }
                  return (
                    <SelectableDropdownMenuItem
                      key={id}
                      selected={checked}
                      shapes={{ index, count: options.length }}
                      onClick={choose}
                      modifiers={[
                        semantics({ contentDescription: name }),
                        // A checked checkbox remains actionable to TalkBack for deselection.
                        ...(multiple
                          ? [selectable(checked, choose, 'checkbox')]
                          : []),
                      ]}
                    >
                      <SelectableDropdownMenuItem.Text>
                        <MaterialLabel
                          menu
                          color={checked ? 'onTertiaryContainer' : 'onSurface'}
                          accessibilityRole={multiple ? 'checkbox' : 'radio'}
                          accessibilityState={{ checked }}
                          onPress={choose}
                        >
                          {name}
                        </MaterialLabel>
                      </SelectableDropdownMenuItem.Text>
                      <SelectableDropdownMenuItem.SelectedLeadingIcon>
                        <Icon source={check} size={20} />
                      </SelectableDropdownMenuItem.SelectedLeadingIcon>
                    </SelectableDropdownMenuItem>
                  );
                })}
              </DropdownMenuGroup>
            </DropdownMenuPopup>
          </Box>
        </MaterialHost>
      )}
    </View>
  );
}

const styles = StyleSheet.create({ anchor: { maxWidth: '100%' } });
