import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { SymbolView } from 'expo-symbols';
import {
  BottomSheet,
  Button,
  Form,
  HStack,
  Host,
  Image,
  List,
  NavigationStack,
  Picker,
  Section,
  Spacer,
  Text as SwiftText,
  Toolbar,
  ToolbarItem,
} from '@expo/ui/swift-ui';
import {
  buttonStyle,
  labelStyle,
  navigationBarTitleDisplayMode,
  navigationTitle,
  pickerStyle,
  presentationDetents,
  tag,
} from '@expo/ui/swift-ui/modifiers';
import type { PeriodPickerProps } from './period-picker';
import { useThemeColors } from './theme';

const sheetTitle = [
  navigationTitle('Period'),
  navigationBarTitleDisplayMode('inline'),
];

/**
 * The period name: a system menu of 2 to 8 years (INSIGHTS-37.1), or a button
 * that raises the Period sheet (INSIGHTS-36.2, INSIGHTS-38.2).
 */
export function PeriodPicker({
  kind,
  periods,
  selectedKey,
  onSelect,
}: PeriodPickerProps) {
  const colors = useThemeColors();
  // The period on the open sheet; undefined while it is closed.
  const [draft, setDraft] = useState<string>();
  const label = periods.find((period) => period.key === selectedKey)?.label;
  if (periods.length < 2)
    return <Text style={[styles.name, { color: colors.text }]}>{label}</Text>;

  const newestFirst = [...periods].reverse();
  if (kind === 'year' && periods.length <= 8)
    return (
      <Host matchContents>
        <Picker<string>
          label={label}
          selection={selectedKey}
          onSelectionChange={onSelect}
          modifiers={[pickerStyle('menu')]}
        >
          {newestFirst.map(({ key, label: name }) => (
            <SwiftText key={key} modifiers={[tag(key)]}>
              {name}
            </SwiftText>
          ))}
        </Picker>
      </Host>
    );

  const close = () => setDraft(undefined);
  const choose = (key: string) => {
    close();
    onSelect(key);
  };
  const shown = draft ?? selectedKey;
  const asList = kind === 'year' && periods.length > 24;
  let content: ReactNode;
  if (kind === 'month') {
    const year = shown.slice(0, 4);
    const years = [...new Set(newestFirst.map(({ key }) => key.slice(0, 4)))];
    const inYear = (of: string) =>
      periods.filter(({ key }) => key.startsWith(`${of}-`));
    content = (
      <Form modifiers={sheetTitle}>
        <Picker<string>
          label="Year"
          selection={year}
          onSelectionChange={(next) =>
            setDraft(
              (
                inYear(next).find(
                  ({ key }) => key.slice(5) === shown.slice(5),
                ) ?? inYear(next).at(-1)
              )?.key,
            )
          }
          modifiers={[pickerStyle('menu')]}
        >
          {years.map((item) => (
            <SwiftText key={item} modifiers={[tag(item)]}>
              {item}
            </SwiftText>
          ))}
        </Picker>
        <Picker<string>
          label="Month"
          selection={shown}
          onSelectionChange={setDraft}
          modifiers={[pickerStyle('menu')]}
        >
          {inYear(year).map(({ key, label: name }) => (
            <SwiftText key={key} modifiers={[tag(key)]}>
              {name.slice(0, name.lastIndexOf(' '))}
            </SwiftText>
          ))}
        </Picker>
      </Form>
    );
  } else if (!asList) {
    content = (
      <Picker<string>
        selection={shown}
        onSelectionChange={setDraft}
        modifiers={[pickerStyle('wheel'), ...sheetTitle]}
      >
        {periods.map(({ key, label: name }) => (
          <SwiftText key={key} modifiers={[tag(key)]}>
            {name}
          </SwiftText>
        ))}
      </Picker>
    );
  } else {
    content = (
      <List modifiers={sheetTitle}>
        <Section title="AVAILABLE PERIODS">
          {newestFirst.map(({ key, label: name }) => (
            <Button key={key} onPress={() => choose(key)}>
              <HStack>
                <SwiftText>{name}</SwiftText>
                <Spacer />
                {key === selectedKey && <Image systemName="checkmark" />}
              </HStack>
            </Button>
          ))}
        </Section>
      </List>
    );
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Choose period. ${label}`}
        onPress={() => setDraft(selectedKey)}
        style={styles.nameButton}
      >
        <Text style={[styles.name, { color: colors.text }]}>{label}</Text>
        <SymbolView
          name="chevron.down"
          tintColor={colors.textMuted}
          size={15}
          weight="semibold"
        />
      </Pressable>
      <Host matchContents>
        <BottomSheet
          isPresented={draft !== undefined}
          onIsPresentedChange={(presented) => {
            if (!presented) close();
          }}
        >
          <NavigationStack
            modifiers={[
              presentationDetents(asList ? ['medium', 'large'] : ['medium']),
            ]}
          >
            <Toolbar>
              {content}
              <Toolbar.Content>
                <ToolbarItem placement="cancellationAction">
                  <Button
                    label={asList ? 'Close' : 'Cancel'}
                    systemImage="xmark"
                    modifiers={[labelStyle('iconOnly')]}
                    onPress={close}
                  />
                </ToolbarItem>
                {!asList && (
                  <ToolbarItem placement="confirmationAction">
                    <Button
                      label="Done"
                      systemImage="checkmark"
                      modifiers={[
                        labelStyle('iconOnly'),
                        buttonStyle('borderedProminent'),
                      ]}
                      onPress={() => choose(shown)}
                    />
                  </ToolbarItem>
                )}
              </Toolbar.Content>
            </Toolbar>
          </NavigationStack>
        </BottomSheet>
      </Host>
    </>
  );
}

const styles = StyleSheet.create({
  name: { fontSize: 20, fontWeight: '700' },
  nameButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
});
