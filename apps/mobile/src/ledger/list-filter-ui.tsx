import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CapsuleButton } from '../ui/capsule';
import { AmountCapsule, CapsuleMenu } from '../ui/filter-capsules';
import { GroupedSection } from '../ui/grouped-section';
import { MenuField } from '../ui/menu-field';
import { useThemeColors } from '../ui/theme';
import { NO_FILTER, filterAmount, type ListFilter } from './list-filter';
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

export function FilterRows({
  state,
  change,
}: {
  state: ListFilterState;
  change: ChangeFilter;
}) {
  const colors = useThemeColors();
  const { filter } = state;
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
          accessibilityLabel="Save Current Filter…"
          disabled={!state.active}
          accessibilityState={{ disabled: !state.active }}
          style={styles.row}
        >
          <Text
            style={[
              styles.label,
              { color: state.active ? colors.accent : colors.placeholder },
            ]}
          >
            Save Current Filter…
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
  const { min, max } = filter;
  const amount =
    min && max
      ? `${min} – ${max}`
      : min
        ? `${min} or more`
        : max
          ? `${max} or less`
          : '';
  function capsule(menu: FilterMenu) {
    const text =
      menu.label === 'Paid by' && menu.selected.length === 1
        ? `Paid by ${menu.value}`
        : menu.value;
    return (
      <CapsuleMenu
        {...menuProps(menu, change)}
        text={text}
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
        value={amount}
        min={min}
        max={max}
        onAmount={(side, text) => change(setAmount(side, text))}
        onOpenFilters={openFilters}
        onPresented={(open) => onPresented('Amount', open)}
      />
      {state.currency && capsule(state.currency)}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
