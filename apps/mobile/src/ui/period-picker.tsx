import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useThemeColors } from './theme';

export interface PeriodPickerProps {
  kind: 'month' | 'year';
  /** The periods of this kind, oldest first: `key` is YYYY-MM or YYYY, `label` the period's name. */
  periods: readonly { key: string; label: string }[];
  /** The key of the selected period, one of `periods`. */
  selectedKey: string;
  onSelect: (key: string) => void;
}

/** The period name, which opens the Select Month or Select Year dialog when there is more than one period. */
export function PeriodPicker({
  kind,
  periods,
  selectedKey,
  onSelect,
}: PeriodPickerProps) {
  const colors = useThemeColors();
  // The year whose months the open dialog lists; undefined while it is closed.
  const [viewedYear, setViewedYear] = useState<string>();
  const label = periods.find((period) => period.key === selectedKey)?.label;
  if (periods.length < 2)
    return <Text style={[styles.name, { color: colors.text }]}>{label}</Text>;

  const title = kind === 'month' ? 'Select Month' : 'Select Year';
  const newestFirst = [...periods].reverse();
  const years = [...new Set(newestFirst.map(({ key }) => key.slice(0, 4)))];
  const close = () => setViewedYear(undefined);
  const choose = (key: string) => {
    close();
    onSelect(key);
  };
  const option = (
    name: string,
    shown: string,
    selected: boolean,
    onPress: () => void,
    checked = selected,
  ) => (
    <Pressable
      key={name}
      accessibilityRole="button"
      accessibilityLabel={name}
      accessibilityState={{ selected }}
      android_ripple={{ color: colors.pressedSurface }}
      onPress={onPress}
      style={styles.option}
    >
      <Text
        style={[
          styles.optionText,
          { color: selected ? colors.accent : colors.text },
        ]}
      >
        {shown}
      </Text>
      {checked && (
        <SymbolView
          name={{ ios: 'checkmark', android: 'check' }}
          tintColor={colors.accent}
          size={20}
        />
      )}
    </Pressable>
  );
  const section = (text: string) => (
    <Text style={[styles.section, { color: colors.textMuted }]}>{text}</Text>
  );

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Choose period. ${label}`}
        onPress={() => setViewedYear(selectedKey.slice(0, 4))}
        style={styles.nameButton}
      >
        <Text style={[styles.name, { color: colors.text }]}>{label}</Text>
        <SymbolView
          name={{ ios: 'chevron.down', android: 'arrow_drop_down' }}
          tintColor={colors.textMuted}
          size={20}
        />
      </Pressable>
      <Modal
        transparent
        animationType="fade"
        visible={viewedYear !== undefined}
        onRequestClose={close}
      >
        <View style={styles.backdrop}>
          <Pressable
            accessible={false}
            importantForAccessibility="no"
            onPress={close}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.dialog, { backgroundColor: colors.surface }]}>
            <View style={styles.header}>
              <Text
                accessibilityRole="header"
                style={[styles.title, { color: colors.text }]}
              >
                {title}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Close ${title}`}
                android_ripple={{ borderless: true, radius: 24 }}
                onPress={close}
                style={styles.close}
              >
                <SymbolView
                  name={{ ios: 'xmark', android: 'close' }}
                  tintColor={colors.text}
                  size={24}
                />
              </Pressable>
            </View>
            <ScrollView>
              {kind === 'year' ? (
                <>
                  {section('YEAR')}
                  {newestFirst.map(({ key, label: name }) =>
                    option(name, name, key === selectedKey, () => choose(key)),
                  )}
                </>
              ) : (
                <>
                  {years.length > 1 && section('YEAR')}
                  {years.length > 1 &&
                    years.map((year) =>
                      option(
                        `Year ${year}`,
                        year,
                        year === viewedYear,
                        () => setViewedYear(year),
                        false,
                      ),
                    )}
                  {section('MONTH')}
                  <Text style={[styles.year, { color: colors.text }]}>
                    {viewedYear}
                  </Text>
                  {newestFirst
                    .filter(({ key }) => key.startsWith(`${viewedYear}-`))
                    .map(({ key, label: name }) =>
                      option(
                        name,
                        name.slice(0, name.lastIndexOf(' ')),
                        key === selectedKey,
                        () => choose(key),
                      ),
                    )}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  name: { fontSize: 20, fontWeight: '700' },
  nameButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.32)',
  },
  dialog: { borderRadius: 28, maxHeight: '80%', paddingBottom: 12 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 24,
    paddingRight: 4,
    paddingTop: 12,
  },
  title: { flex: 1, fontSize: 22 },
  close: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: { fontSize: 13, marginTop: 16, marginHorizontal: 24 },
  year: { fontSize: 17, fontWeight: '600', marginHorizontal: 24, marginTop: 8 },
  option: {
    minHeight: 48,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionText: { fontSize: 17 },
});
