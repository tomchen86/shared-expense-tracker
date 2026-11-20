import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  Box,
  DropdownMenuGroup,
  DropdownMenuPopup,
  Icon,
  RNHostView,
  SelectableDropdownMenuItem,
  Text,
} from '@expo/ui/jetpack-compose';
import {
  defaultMinSize,
  fillMaxSize,
  IntrinsicSize,
  verticalScroll,
  width,
} from '@expo/ui/jetpack-compose/modifiers';
import check from './check.xml';
import { MaterialHost } from './material.android';
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
            <DropdownMenuPopup
              expanded
              onDismissRequest={close}
              modifiers={[verticalScroll()]}
            >
              <DropdownMenuGroup>
                <MenuRows
                  options={options}
                  selected={selected}
                  multiple={multiple}
                  onSelect={(id) => {
                    if (!multiple) close();
                    onSelect(id);
                  }}
                />
              </DropdownMenuGroup>
            </DropdownMenuPopup>
          </Box>
        </MaterialHost>
      )}
    </View>
  );
}

function MenuRows({ options, selected, multiple, onSelect }: MenuProps) {
  const [menuWidth, setMenuWidth] = useState(0);
  return (
    <RNHostView matchContents>
      <View
        collapsable={false}
        onLayout={({ nativeEvent }) => setMenuWidth(nativeEvent.layout.width)}
      >
        {options.map(({ id, name }, index) => {
          const checked = selected.includes(id);
          const choose = () => onSelect(id);
          return (
            <Pressable
              key={id}
              accessibilityRole={multiple ? 'checkbox' : 'radio'}
              accessibilityLabel={name}
              accessibilityState={{ checked }}
              onPress={choose}
            >
              {/* TalkBack acts on the whole row. Direct touches go to the Material item. */}
              <View importantForAccessibility="no-hide-descendants">
                <MaterialHost matchContents>
                  <SelectableDropdownMenuItem
                    selected={checked}
                    shapes={{ index, count: options.length }}
                    onClick={choose}
                    modifiers={[
                      defaultMinSize({ minWidth: menuWidth }),
                      width(IntrinsicSize.Max),
                    ]}
                  >
                    <SelectableDropdownMenuItem.Text>
                      <Text style={{ typography: 'bodyLarge' }}>{name}</Text>
                    </SelectableDropdownMenuItem.Text>
                    <SelectableDropdownMenuItem.SelectedLeadingIcon>
                      <Icon source={check} size={20} />
                    </SelectableDropdownMenuItem.SelectedLeadingIcon>
                  </SelectableDropdownMenuItem>
                </MaterialHost>
              </View>
            </Pressable>
          );
        })}
      </View>
    </RNHostView>
  );
}

const styles = StyleSheet.create({ anchor: { maxWidth: '100%' } });
