import { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import { CapsuleButton } from '../ui/capsule';
import { FadeText } from '../ui/fade-text';
import { AmountCapsule, CapsuleMenu } from '../ui/filter-capsules';
import { GroupedSection } from '../ui/grouped-section';
import { MenuField } from '../ui/menu-field';
import { useThemeColors } from '../ui/theme';
import { useFilterNamePrompt } from '../ui/use-filter-name-prompt';
import {
  NO_FILTER,
  filterAmount,
  type ListFilter,
  type SavedFilter,
} from './list-filter';
import type {
  ChangeFilter,
  FilterMenu,
  ListFilterState,
} from './use-list-filter';

function menuProps(menu: FilterMenu, change: ChangeFilter) {
  return {
    label: menu.label,
    title: menu.label,
    value: menu.value,
    options: menu.options,
    selected: menu.selected,
    multiple: menu.multiple,
    onSelect: (id: string) => change(menu.select(id)),
  };
}

function setAmount(side: 'min' | 'max', text: string) {
  const amount = filterAmount(text);
  return (filter: ListFilter) =>
    filter[side] === amount ? filter : { ...filter, [side]: amount };
}

function menuText(menu: FilterMenu) {
  return menu.label === 'Paid by' && menu.selected.length === 1
    ? `Paid by ${menu.value}`
    : menu.value;
}

function amountText({ min, max }: ListFilter) {
  if (min && max) return `${min} – ${max}`;
  if (min) return `${min} or more`;
  if (max) return `${max} or less`;
  return '';
}

export function SavedFilterRows({
  state,
  onApply,
}: {
  state: ListFilterState;
  onApply: (item: SavedFilter) => void;
}) {
  const colors = useThemeColors();
  if (!state.savedFilters.length) return null;
  function confirmDelete(name: string) {
    Alert.alert(`Delete “${name}”?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => state.editSaved(name, 'delete'),
      },
    ]);
  }
  return (
    <>
      <Text
        accessibilityRole="header"
        style={[styles.heading, { color: colors.textMuted }]}
      >
        SAVED FILTERS
      </Text>
      <GroupedSection style={styles.savedSection}>
        {state.savedFilters.map((item) => {
          const { name } = item;
          const selected = state.selectedNames.has(name);
          return (
            <View key={name} style={styles.savedRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Apply saved filter ${name}`}
                accessibilityState={{ selected }}
                onPress={() => onApply(item)}
                style={({ pressed }) => [
                  styles.apply,
                  pressed && { backgroundColor: colors.pressedSurface },
                ]}
              >
                <FadeText
                  containerStyle={styles.shrinks}
                  style={{ fontSize: 17, color: colors.text }}
                >
                  {name}
                </FadeText>
                {selected && (
                  <SymbolView
                    name={{ ios: 'checkmark', android: 'check' }}
                    size={16}
                    tintColor={colors.accent}
                  />
                )}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Delete saved filter ${name}`}
                onPress={() => confirmDelete(name)}
                style={({ pressed }) => [
                  styles.remove,
                  pressed && { backgroundColor: colors.pressedSurface },
                ]}
              >
                <SymbolView
                  name={{
                    ios: 'minus.circle',
                    android: 'remove_circle_outline',
                  }}
                  size={20}
                  tintColor={colors.textMuted}
                />
              </Pressable>
            </View>
          );
        })}
      </GroupedSection>
    </>
  );
}

export function FilterRows({
  state,
  change,
}: {
  state: ListFilterState;
  change: ChangeFilter;
}) {
  const colors = useThemeColors();
  const { filter } = state;
  const { prompt, sheet } = useFilterNamePrompt((name) =>
    state.editSaved(name, 'save'),
  );
  const alreadySaved = state.selectedNames.size > 0;
  const canSave = state.active && !alreadySaved;
  const saveLabel = alreadySaved ? 'Filter Saved' : 'Save Current Filter…';
  // Preserve what the keyboard typed until the sheet closes. Only valid, normalized bounds are stored.
  const [raw, setRaw] = useState({ min: filter.min, max: filter.max });
  function amountField(
    side: 'min' | 'max',
    label: string,
    placeholder: string,
  ) {
    return (
      <TextInput
        accessibilityLabel={label}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        keyboardType="decimal-pad"
        style={[
          styles.input,
          { color: colors.text, backgroundColor: colors.segmentedTrack },
        ]}
        value={raw[side]}
        onChangeText={(text) => {
          setRaw((current) => ({ ...current, [side]: text }));
          change(setAmount(side, text));
        }}
      />
    );
  }
  const row = (menu: FilterMenu) => (
    <MenuField
      {...menuProps(menu, change)}
      showMenuTitle
      value={menu.value || menu.placeholder}
    />
  );
  return (
    <>
      <GroupedSection style={styles.section}>
        {row(state.category)}
        {row(state.scope)}
        {state.scope.label === 'Ledger' && (
          <View style={styles.row}>
            <Text style={[styles.label, { color: colors.text }]}>
              Paid by Me
            </Text>
            <Switch
              accessibilityLabel="Paid by Me"
              accessibilityRole="switch"
              value={filter.paidByMe}
              onValueChange={(paidByMe) =>
                change((current) => ({ ...current, paidByMe }))
              }
            />
          </View>
        )}
        <View style={styles.row}>
          <Text style={[styles.label, { color: colors.text }]}>Amount</Text>
          {amountField('min', 'Lowest amount', 'Min')}
          <Text style={{ color: colors.textMuted }}>–</Text>
          {amountField('max', 'Highest amount', 'Max')}
        </View>
        {state.currency && row(state.currency)}
      </GroupedSection>
      <GroupedSection style={styles.section}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={saveLabel}
          disabled={!canSave}
          accessibilityState={{ disabled: !canSave }}
          onPress={() =>
            prompt(
              [
                menuText(state.category),
                menuText(state.scope),
                filter.paidByMe && 'Paid by Me',
                amountText(filter),
                filter.currency,
              ]
                .filter(Boolean)
                .join(', '),
            )
          }
          style={styles.row}
        >
          <Text
            style={[
              styles.label,
              { color: canSave ? colors.accent : colors.placeholder },
            ]}
          >
            {saveLabel}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear Filters"
          disabled={!state.active}
          accessibilityState={{ disabled: !state.active }}
          style={styles.row}
          onPress={() => {
            setRaw({ min: '', max: '' });
            change(() => NO_FILTER);
          }}
        >
          <Text
            style={[
              styles.label,
              { color: state.active ? colors.accent : colors.placeholder },
            ]}
          >
            Clear Filters
          </Text>
        </Pressable>
      </GroupedSection>
      {sheet}
    </>
  );
}

export function FilterCapsules({
  state,
  openFilters,
  onPresented,
}: {
  state: ListFilterState;
  openFilters: () => void;
  onPresented: (label: string, open: boolean) => void;
}) {
  const { filter, change } = state;
  function capsule(menu: FilterMenu) {
    return (
      <CapsuleMenu
        {...menuProps(menu, change)}
        text={menuText(menu)}
        onOpenFilters={openFilters}
        onPresented={(open) => onPresented(menu.label, open)}
      />
    );
  }
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={styles.capsules}
      contentContainerStyle={styles.capsuleContent}
    >
      {capsule(state.category)}
      {capsule(state.scope)}
      {state.scope.label === 'Ledger' && (
        <CapsuleButton
          label="Paid by Me"
          value=""
          selected={filter.paidByMe}
          onPress={() =>
            change((current) => ({ ...current, paidByMe: !current.paidByMe }))
          }
        />
      )}
      <AmountCapsule
        label="Amount"
        value={amountText(filter)}
        min={filter.min}
        max={filter.max}
        onAmount={(side, text) => change(setAmount(side, text))}
        onOpenFilters={openFilters}
        onPresented={(open) => onPresented('Amount', open)}
      />
      {state.currency && capsule(state.currency)}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  heading: { fontSize: 13, marginHorizontal: 16, marginBottom: 8 },
  savedSection: { marginBottom: 16 },
  savedRow: { flexDirection: 'row' },
  apply: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: 16,
    gap: 8,
  },
  shrinks: { flexShrink: 1 },
  remove: { width: 48, alignItems: 'center', justifyContent: 'center' },
  section: { marginTop: 16 },
  row: {
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: { flex: 1, fontSize: 17 },
  input: {
    width: '25%',
    maxWidth: 100,
    minHeight: 36,
    borderRadius: 8,
    paddingHorizontal: 4,
    textAlign: 'center',
    fontSize: 17,
  },
  capsules: { marginHorizontal: -20, flexGrow: 0 },
  capsuleContent: { gap: 8, paddingHorizontal: 20, alignItems: 'center' },
});
