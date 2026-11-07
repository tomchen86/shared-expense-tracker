import {
  StyleSheet,
  Text as NativeText,
  View,
  useWindowDimensions,
} from 'react-native';
import { useAssets } from 'expo-asset';
import { SymbolView } from 'expo-symbols';
import {
  Button,
  Host,
  Image,
  Label,
  Menu,
  Picker,
  Rectangle,
  Text,
  Toggle,
} from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  buttonStyle,
  disabled as disabledModifier,
  foregroundStyle,
  frame,
  menuActionDismissBehavior,
  menuIndicator,
  pickerStyle,
  tag,
} from '@expo/ui/swift-ui/modifiers';
import { CATEGORY_DOT_IMAGES } from './category-dot-images';
import { FadeText } from './fade-text';
import type { MenuFieldOption, MenuFieldProps } from './menu-field';
import { useThemeColors } from './theme';

/**
 * React Native draws the row, so its height never depends on SwiftUI, and an invisible system menu
 * lies on top of it. A row that was itself a Host would have no height in a sheet's first layout,
 * and the sheet would cut off the bottom of the form.
 */
export function MenuField({
  label,
  value,
  disabled = false,
  dot,
  options,
  selected,
  multiple = false,
  empty,
  action,
  onSelect,
}: MenuFieldProps) {
  const colors = useThemeColors();
  const { fontScale } = useWindowDimensions();
  return (
    // A press on a native view counts as unhandled: without a responder, a scroll view that keeps
    // the keyboard only for handled presses would blur the field, and the menu would open behind
    // the keyboard.
    <View onStartShouldSetResponder={() => true} style={styles.row}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={[
          styles.visual,
          fontScale > 1.3 && styles.stacked,
          disabled && styles.disabled,
        ]}
      >
        <NativeText style={[styles.text, { color: colors.text }]}>
          {label}
        </NativeText>
        <View style={styles.value}>
          {dot && <View style={[styles.dot, { backgroundColor: dot }]} />}
          <FadeText
            containerStyle={styles.valueText}
            style={[styles.text, { color: colors.textMuted }]}
          >
            {value}
          </FadeText>
          <SymbolView
            name="chevron.up.chevron.down"
            size={13}
            tintColor={colors.textMuted}
          />
        </View>
      </View>
      <Host ignoreSafeArea="all" style={StyleSheet.absoluteFill}>
        <Menu
          modifiers={[
            buttonStyle('plain'),
            menuIndicator('hidden'),
            menuActionDismissBehavior(multiple ? 'disabled' : 'automatic'),
            disabledModifier(disabled),
            accessibilityLabel(`${label}, ${value}`),
          ]}
          label={
            <Rectangle
              modifiers={[
                foregroundStyle('rgba(127,127,127,0.002)'),
                frame({
                  maxWidth: Number.MAX_SAFE_INTEGER,
                  maxHeight: Number.MAX_SAFE_INTEGER,
                }),
              ]}
            />
          }
        >
          {multiple ? (
            options.map((option) => (
              <Toggle
                key={option.id}
                label={option.name}
                isOn={selected.includes(option.id)}
                onIsOnChange={() => onSelect(option.id)}
              />
            ))
          ) : options.length === 0 && empty ? (
            <Button label={empty} modifiers={[disabledModifier(true)]} />
          ) : (
            <Picker<string>
              label={label}
              selection={selected[0] ?? ''}
              onSelectionChange={onSelect}
              modifiers={[pickerStyle('inline')]}
            >
              {options.map((option) => (
                <PickerOption key={option.id} {...option} />
              ))}
            </Picker>
          )}
          {action && <Button label={action.label} onPress={action.onPress} />}
        </Menu>
      </Host>
    </View>
  );
}

function PickerOption({ id, name, color }: MenuFieldOption) {
  const image = color && CATEGORY_DOT_IMAGES[color.toUpperCase()];
  return image ? (
    <DotOption id={id} name={name} image={image} />
  ) : (
    <Text modifiers={[tag(id)]}>{name}</Text>
  );
}

/** An option with a dot in front of it: a menu ignores a symbol's color, but keeps an image's. */
function DotOption({
  id,
  name,
  image,
}: {
  id: string;
  name: string;
  image: number;
}) {
  const [assets] = useAssets(image);
  const uri = assets?.[0].localUri;
  return (
    <Label
      title={name}
      modifiers={[tag(id)]}
      icon={uri ? <Image uiImage={uri} /> : undefined}
    />
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 52, justifyContent: 'center' },
  visual: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  stacked: { flexDirection: 'column', alignItems: 'stretch' },
  disabled: { opacity: 0.4 },
  text: { fontSize: 17 },
  value: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  valueText: { flexShrink: 1 },
  dot: { width: 12, height: 12, borderRadius: 6 },
});
