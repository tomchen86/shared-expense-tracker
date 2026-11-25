import { Alert, StyleSheet, processColor } from 'react-native';
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';
import { barTitled } from './group-details-app';
import { inTreeOrder, nameOf } from './ledger-expense-app';
import { asRead, inContentOf, linesIn } from './ledger-expense-list-app';
import {
  closeFilters,
  filtersRoot,
  openFilters,
} from './ledger-list-period-app';
import { iconsIn } from './shell-actions-app';
import { settle } from './shell-appearance-app';
import { componentsIn, nativeViews } from './shell-tabs-app';
import type { MenuFieldProps } from '../../src/ui/menu-field';

// The filter tests read and change the filters of a list: the expense list, or a group's screen
// (LEDGER-129.1). Each helper about a list takes its native screen; the helpers about Filters
// read the open Filters (ledger-list-period-app).
//
// In Filters the rows of Category, Ledger, Paid by and Currency are the ui/ MenuField, read and
// pressed as the Date row is: on iOS through its props, since only an E2E flow can open a system
// menu, on Android through the row's button and the sheet it opens. Paid by Me is a switch, the
// amounts are two text fields, and the rest are buttons.
//
// The capsule row is the sideways scroll view among what a list shows itself (LEDGER-133.2). A
// capsule is read from the text it shows and from the fill behind that text. On iOS the capsules
// of Category, Ledger, Paid by and Currency are system menus (LEDGER-134.1): the tests read what
// the list gives the component that draws each one, a component that takes the props of the ui/
// MenuField with the condition's name as its label, the capsule's value as its value (nothing
// while the condition is off), its options and the ones chosen, and choose as the menu does. The
// popover of the Amount capsule (LEDGER-135.1) is left to the E2E flows. The capsules are read on
// iOS only: on Android they are Material chips with menus and a sheet (LEDGER-136.2,
// LEDGER-150.1), which only the E2E flows tagged android open.

type HostView = ReturnType<typeof nativeViews>[number];

const onAndroid = () =>
  /-android\.test\./.test(expect.getState().testPath ?? '');

const isSelected = (view: HostView) =>
  view.props.accessibilityState?.selected === true ||
  view.props['aria-selected'] === true;

const isDisabled = (view: HostView) =>
  view.props.accessibilityState?.disabled === true ||
  view.props['aria-disabled'] === true ||
  view.props.disabled === true;

const isOn = (view: HostView) =>
  view.props.value === true ||
  view.props.on === true ||
  view.props.accessibilityState?.checked === true ||
  view.props['aria-checked'] === true;

/** A condition that opens a list, by the label of its row in Filters and of its capsule. */
export type ListCondition = 'Category' | 'Ledger' | 'Paid by' | 'Currency';

/** A row of Filters that opens a list: a condition, or the period. */
type RowLabel = ListCondition | 'Date';

export const NO_MATCHES_TITLE = 'No Matching Expenses';
export const NO_MATCHES_HINT =
  'Your expenses are still here. No expense matches the filters that are on.';
export const NO_RESULTS_FILTERED_HINT =
  'Filters are on too. Check the spelling, or clear the filters to search every expense.';
export const SAVE_FILTER = 'Save Current Filter…';
export const FILTER_SAVED = 'Filter Saved';
export const CLEAR_FILTERS = 'Clear Filters';
export const SAVED_FILTERS = 'SAVED FILTERS';

// The rows of Filters that open a list

/** The ui/ MenuField of the row labelled `label` in Filters, on iOS; undefined while Filters has no such row. */
function rowMenu(label: RowLabel) {
  const found = componentsIn(
    filtersRoot(),
    (type) => typeof type === 'function' && type.name === 'MenuField',
  )
    .map(({ props, view }) => ({ props: props as MenuFieldProps, view }))
    .filter(({ props }) => props.label === label);
  if (found.length > 1)
    throw new Error(`Expected one ${label} row in Filters, found several`);
  return found[0];
}

/** The button of the row labelled `label` in Filters, on Android; undefined while Filters has no such row. */
const rowButton = (label: RowLabel) =>
  within(filtersRoot())
    .queryAllByRole('button')
    .find((button) => nameOf(button).startsWith(`${label}, `));

/** The view of the row labelled `label` in Filters, if Filters has one. */
export const rowView = (label: RowLabel) =>
  onAndroid() ? rowButton(label) : rowMenu(label)?.view;

/** Whether the list of the row labelled `label` in Filters stays open when an option is pressed, on iOS. */
export function rowTakesSeveral(label: ListCondition) {
  const menu = rowMenu(label);
  if (menu === undefined) throw new Error(`Filters has no ${label} row`);
  return menu.props.multiple === true;
}

/** What a screen reader reads for the row labelled `label` in Filters, such as Category, Any; undefined while Filters has no such row. */
export function conditionRow(label: ListCondition): string | undefined {
  if (onAndroid()) {
    const button = rowButton(label);
    return button && asRead(nameOf(button));
  }
  const menu = rowMenu(label);
  return menu && `${menu.props.label}, ${menu.props.value}`;
}

/** The open list titled `title` on Android: the sheet around a header of that name. */
function listSheet(title: string): HostView | undefined {
  const header = screen.queryAllByRole('header', { name: title }).at(-1);
  if (header === undefined) return undefined;
  for (let outer = header.parent; outer; outer = outer.parent)
    if (String(outer.type) === 'Modal') return outer;
  return header.parent ?? header;
}

/** Whether the list titled `title` is open, on Android. */
export const listOpen = (title: ListCondition) =>
  listSheet(title) !== undefined;

/** Presses the row labelled `label` in Filters on Android and waits for its list. */
export async function openList(label: ListCondition) {
  const button = rowButton(label);
  if (button === undefined) throw new Error(`Filters has no ${label} row`);
  await fireEvent.press(button);
  await waitFor(() => expect(listSheet(label)).toBeDefined());
  await settle();
  return listSheet(label)!;
}

/** The buttons of the open list titled `title` on Android, by name: its options, and Done or Cancel. */
export const listButtons = (title: ListCondition) =>
  within(listSheet(title)!)
    .queryAllByRole('button')
    .map((button) => asRead(nameOf(button)));

/** Presses the button named `name` of the open list titled `title`, on Android. */
export async function pressInList(title: ListCondition, name: string) {
  await fireEvent.press(
    within(listSheet(title)!).getByRole('button', { name }),
  );
  await settle();
}

/** Closes the open list titled `title` on Android with the button it has for that: Done, or Cancel. */
export async function closeList(title: ListCondition) {
  const closing = listButtons(title).find((name) =>
    ['Done', 'Cancel'].includes(name),
  );
  if (closing === undefined)
    throw new Error(`The ${title} list has neither Done nor Cancel`);
  await pressInList(title, closing);
  await waitFor(() => expect(listSheet(title)).toBeUndefined());
  await settle();
}

/**
 * What the list of the row labelled `label` in Filters holds, top to bottom, as [name, marked as
 * chosen]. On Android this opens the list and closes it again.
 */
export async function rowOptions(label: ListCondition) {
  if (!onAndroid()) {
    const menu = rowMenu(label);
    if (menu === undefined) throw new Error(`Filters has no ${label} row`);
    return menu.props.options.map(
      (option) =>
        [option.name, menu.props.selected.includes(option.id)] as const,
    );
  }
  const list = await openList(label);
  const options = within(list)
    .queryAllByRole('button')
    .filter((button) => !['Done', 'Cancel'].includes(nameOf(button)))
    .map((button) => [asRead(nameOf(button)), isSelected(button)] as const);
  await closeList(label);
  return options;
}

/** The names of the options in the list of the row labelled `label` in Filters, top to bottom. */
export const rowOptionNames = async (label: ListCondition) =>
  (await rowOptions(label)).map(([name]) => name);

/**
 * Presses the options named `names`, one after the other, in the list of the row labelled
 * `label` in Filters: each press chooses an option, or takes off one that is chosen. On Android
 * the list is closed afterwards, unless choosing closed it.
 */
export async function pressInRow(label: ListCondition, ...names: string[]) {
  if (!onAndroid()) {
    for (const name of names) {
      const menu = rowMenu(label);
      if (menu === undefined) throw new Error(`Filters has no ${label} row`);
      const option = menu.props.options.find(
        (candidate) => candidate.name === name,
      );
      if (option === undefined) throw new Error(`${label} has no ${name}`);
      await act(async () => menu.props.onSelect(option.id));
      await settle();
    }
    return;
  }
  await openList(label);
  for (const name of names) await pressInList(label, name);
  if (listOpen(label)) await closeList(label);
}

// Paid by Me, the amounts and the buttons of Filters

/** The Paid by Me switch of Filters, found among its native views as the form's switch is; undefined while Filters has none. */
export const paidByMeSwitch = (): HostView | undefined =>
  filtersRoot().queryAll(
    (view) =>
      typeof view.type === 'string' &&
      (view.props.accessibilityRole === 'switch' ||
        view.props.role === 'switch') &&
      nameOf(view) === 'Paid by Me',
  )[0];

/** Whether Paid by Me is on in Filters. */
export function paidByMeOn() {
  const control = paidByMeSwitch();
  if (control === undefined) throw new Error('Filters has no Paid by Me');
  return isOn(control);
}

/** Turns Paid by Me on or off in Filters, as the native switch reports a change, else with a press. */
export async function setPaidByMe(on: boolean) {
  const control = paidByMeSwitch();
  if (control === undefined) throw new Error('Filters has no Paid by Me');
  if (isOn(control) !== on) {
    if (typeof control.props.onChange === 'function')
      await fireEvent(control, 'change', { nativeEvent: { value: on } });
    else await fireEvent.press(control);
  }
  await settle();
}

type AmountField = 'Lowest amount' | 'Highest amount';

/** One of the two amount fields of Filters, if Filters shows it. */
export const amountField = (name: AmountField) =>
  within(filtersRoot()).queryByLabelText(name) ?? undefined;

/** Makes the text of an amount field of Filters be `text`, as typing or clearing it does. */
export async function typeAmount(name: AmountField, text: string) {
  const field = amountField(name);
  if (field === undefined) throw new Error(`Filters has no ${name}`);
  await fireEvent.changeText(field, text);
  await settle();
}

/** The texts of the two amount fields of Filters, lowest first. */
export const amountTexts = () =>
  (['Lowest amount', 'Highest amount'] as const).map((name) => {
    const field = amountField(name);
    return field && String(field.props.value ?? field.props.defaultValue ?? '');
  });

/** The button of Filters named `name`, such as Clear Filters; undefined while Filters has none. */
export const filtersButton = (name: string) =>
  within(filtersRoot())
    .queryAllByRole('button')
    .find((button) => asRead(nameOf(button)) === name);

/** Whether Filters shows the button named `name` and it can be pressed. */
export function filtersButtonEnabled(name: string) {
  const button = filtersButton(name);
  return button !== undefined && !isDisabled(button);
}

/** Presses the button of Filters named `name`; a disabled one takes no press. */
export async function pressInFilters(name: string) {
  const button = filtersButton(name);
  if (button === undefined) throw new Error(`Filters has no ${name}`);
  if (!isDisabled(button)) await fireEvent.press(button);
  await settle();
}

/** Whether the views come top to bottom in this order; a view Filters does not show fails it. */
export const inOrder = (...views: (HostView | undefined)[]) =>
  views.every((view) => view !== undefined) &&
  inTreeOrder(...(views as HostView[]));

// Changing the filters of a list from its Filters, which is opened and closed again

/** Opens Filters from the bar titled `barTitle`, does `change` there, and closes Filters with Done. */
export async function inFilters<T>(barTitle: string, change: () => Promise<T>) {
  await openFilters(barTitle);
  const result = await change();
  await closeFilters();
  return result;
}

/** Presses the options named `names` of the condition `label` in the Filters of the bar titled `barTitle`. */
export const choose = (
  barTitle: string,
  label: ListCondition,
  ...names: string[]
) => inFilters(barTitle, () => pressInRow(label, ...names));

/** Turns Paid by Me on or off in the Filters of the expense list. */
export const turnPaidByMe = (on: boolean) =>
  inFilters('Expenses', () => setPaidByMe(on));

/** Sets the lowest and highest amount in the Filters of the bar titled `barTitle`; undefined leaves a field as it is. */
export const setAmounts = (barTitle: string, min?: string, max?: string) =>
  inFilters(barTitle, async () => {
    if (min !== undefined) await typeAmount('Lowest amount', min);
    if (max !== undefined) await typeAmount('Highest amount', max);
  });

/** Presses Clear Filters in the Filters of the bar titled `barTitle`. */
export const clearInFilters = (barTitle: string) =>
  inFilters(barTitle, () => pressInFilters(CLEAR_FILTERS));

// The Filters action in a list's title bar

interface BarItem {
  type: string;
  title?: string;
  accessibilityLabel?: string;
  tintColor?: unknown;
}

const FILTERS_NAME = /^Filters(, on)?$/;

/**
 * The Filters action of the bar titled `barTitle`: what a screen reader reads for it, and the
 * color its icon is drawn in, which on iOS is undefined while the bar draws it as it draws its
 * other buttons.
 */
export function filtersAction(barTitle: string) {
  const bar = barTitled(barTitle);
  if (bar === undefined) throw new Error(`${barTitle} is not open`);
  const items: BarItem[] = bar.props.headerRightBarButtonItems ?? [];
  const item = items.find((candidate) =>
    FILTERS_NAME.test(candidate.accessibilityLabel || candidate.title || ''),
  );
  if (item !== undefined)
    return {
      name: item.accessibilityLabel || item.title,
      tint: item.tintColor,
    };
  const button = nativeViews(/^RNSScreenStackHeaderSubview$/, bar)
    .filter((subview) => subview.props.type === 'right')
    .flatMap((subview) => within(subview).queryAllByRole('button'))
    .find((candidate) => FILTERS_NAME.test(nameOf(candidate)));
  if (button === undefined)
    throw new Error(`The bar titled ${barTitle} has no Filters`);
  return {
    name: nameOf(button),
    tint: iconsIn(button, 'android')[0]?.color as unknown,
  };
}

/** A color as a value to compare: a string in lower case, a platform color as its JSON. */
const colorKey = (color: unknown) =>
  color == null
    ? undefined
    : JSON.stringify(typeof color === 'string' ? color.toLowerCase() : color);

/** Whether two colors are the same one: strings alike but for case, platform colors of the same name. */
export const sameColor = (one: unknown, other: unknown) =>
  colorKey(one) !== undefined && colorKey(one) === colorKey(other);

/** Whether `tint` is the color `color`, as a bar item holds it on iOS or as an icon is given it. */
export const isColor = (tint: unknown, color: unknown) =>
  sameColor(tint, color) ||
  (typeof color === 'string' && tint != null && tint === processColor(color));

// The capsule row

/** The capsule row of the list in `root`: the sideways scroll view among what the list shows itself, if it shows one. */
export const capsuleRow = (root: HostView): HostView | undefined =>
  root.queryAll(
    (view) =>
      typeof view.type === 'string' &&
      /ScrollView$/.test(view.type) &&
      (view.props.horizontal === true || /Horizontal/.test(view.type)) &&
      inContentOf(root, view),
  )[0];

const textOf = (node: HostView | string): string =>
  typeof node === 'string' ? node : node.children.map(textOf).join('');

function insideText(view: HostView, root: HostView) {
  for (let outer = view.parent; outer && outer !== root; outer = outer.parent)
    if (String(outer.type) === 'Text') return true;
  return false;
}

/** The fill behind a capsule's text: the background of the nearest view around it inside the row. */
function fillBehind(text: HostView, row: HostView): unknown {
  for (let node = text.parent; node && node !== row; node = node.parent) {
    const fill: unknown = StyleSheet.flatten(node.props.style)?.backgroundColor;
    if (fill != null && fill !== 'transparent') return fill;
  }
  return undefined;
}

/**
 * The capsules of the list in `root`, left to right: the text each one shows, the fill behind
 * it and the color of the text. Empty while the list shows no capsule row.
 */
export function capsules(root: HostView) {
  const row = capsuleRow(root);
  if (row === undefined) return [];
  return row
    .queryAll(
      (view) =>
        String(view.type) === 'Text' &&
        !insideText(view, row) &&
        asRead(textOf(view)) !== '',
    )
    .map((text) => ({
      text: asRead(textOf(text)),
      fill: fillBehind(text, row),
      ink: StyleSheet.flatten(text.props.style)?.color as unknown,
    }));
}

/** The texts of the capsules of the list in `root`, left to right. */
export const capsuleTexts = (root: HostView) =>
  capsules(root).map(({ text }) => text);

const AMOUNT_TEXT = /^Amount$| or more$| or less$| – /;

/**
 * The text on the capsule of one condition of the list in `root`: Category's is the first
 * capsule, Ledger's or Paid by's the second, and Amount's the one that reads Amount or an amount.
 */
export function capsuleOf(
  root: HostView,
  label: 'Category' | 'Ledger' | 'Paid by' | 'Amount',
) {
  const texts = capsuleTexts(root);
  if (label === 'Category') return texts[0];
  if (label === 'Amount') return texts.find((text) => AMOUNT_TEXT.test(text));
  return texts[1];
}

/** The texts of the capsules that are filled with `accent`, left to right: the conditions that are on. */
export const capsulesOn = (root: HostView, accent: unknown) =>
  capsules(root)
    .filter(({ fill }) => sameColor(fill, accent))
    .map(({ text }) => text);

const WHITE = ['#fff', '#ffffff', 'white'];

/** Whether a capsule's text is white. */
export const isWhite = (ink: unknown) =>
  typeof ink === 'string' && WHITE.includes(ink.toLowerCase());

/** What the list in `root` gives the component that draws the capsule of the condition `label`. */
function capsuleMenu(root: HostView, label: ListCondition) {
  const row = capsuleRow(root);
  if (row === undefined) return undefined;
  return componentsIn(row, (type) => typeof type === 'function')
    .map(({ props, view }) => ({ props: props as MenuFieldProps, view }))
    .find(
      ({ props, view }) =>
        props?.label === label &&
        Array.isArray(props.options) &&
        Array.isArray(props.selected) &&
        typeof props.onSelect === 'function' &&
        view !== undefined,
    );
}

/** The buttons of the capsule row of the list in `root`. */
const capsuleButtons = (root: HostView) => {
  const row = capsuleRow(root);
  return row === undefined ? [] : within(row).queryAllByRole('button');
};

/**
 * What a screen reader reads for the capsule of the condition `label` of the list in `root`:
 * the label alone while the condition is off, else the label, a comma and its value. Undefined
 * while the list shows no such capsule.
 */
export function capsuleName(root: HostView, label: ListCondition) {
  const menu = capsuleMenu(root, label);
  if (menu === undefined) return undefined;
  return menu.props.value ? `${label}, ${menu.props.value}` : label;
}

/** What the menu of the capsule of the condition `label` holds on iOS, top to bottom, as [name, ticked]. */
export function capsuleOptions(root: HostView, label: ListCondition) {
  const menu = capsuleMenu(root, label);
  if (menu === undefined) throw new Error(`The list shows no ${label} capsule`);
  return menu.props.options.map(
    (option) => [option.name, menu.props.selected.includes(option.id)] as const,
  );
}

/** Whether the menu of the capsule of the condition `label` stays open when an option is pressed, on iOS. */
export function capsuleTakesSeveral(root: HostView, label: ListCondition) {
  const menu = capsuleMenu(root, label);
  if (menu === undefined) throw new Error(`The list shows no ${label} capsule`);
  return menu.props.multiple === true;
}

/** Presses the options named `names`, one after the other, in the menu of the capsule of the condition `label`, on iOS. */
export async function pressInCapsule(
  root: () => HostView,
  label: ListCondition,
  ...names: string[]
) {
  for (const name of names) {
    const menu = capsuleMenu(root(), label);
    if (menu === undefined)
      throw new Error(`The list shows no ${label} capsule`);
    const option = menu.props.options.find(
      (candidate) => candidate.name === name,
    );
    if (option === undefined) throw new Error(`${label} has no ${name}`);
    await act(async () => menu.props.onSelect(option.id));
    await settle();
  }
}

/** The Paid by Me capsule of the list in `root`, a button, if the list shows one. */
export const paidByMeCapsule = (root: HostView) =>
  capsuleButtons(root).find(
    (button) => asRead(nameOf(button)) === 'Paid by Me',
  );

/** Whether a screen reader reads the Paid by Me capsule as selected. */
export function paidByMeCapsuleSelected(root: HostView) {
  const capsule = paidByMeCapsule(root);
  if (capsule === undefined)
    throw new Error('The list shows no Paid by Me capsule');
  return isSelected(capsule);
}

/** Presses the Paid by Me capsule of the list in `root`. */
export async function pressPaidByMeCapsule(root: HostView) {
  const capsule = paidByMeCapsule(root);
  if (capsule === undefined)
    throw new Error('The list shows no Paid by Me capsule');
  await fireEvent.press(capsule);
  await settle();
}

// A list that a filter leaves empty

/** The No Matching Expenses heading of the list in `root`, if it shows one (LEDGER-138.1). */
export const noMatchesTitle = (root: HostView) =>
  within(root)
    .queryAllByRole('header')
    .filter((view) => inContentOf(root, view))
    .map((view) => asRead(nameOf(view)))
    .find((name) => name === NO_MATCHES_TITLE);

/** The Clear Filters button the list in `root` shows itself, under a notice, if it shows one. */
export const clearFiltersButton = (root: HostView) =>
  within(root)
    .queryAllByRole('button')
    .find(
      (button) =>
        inContentOf(root, button) && asRead(nameOf(button)) === CLEAR_FILTERS,
    );

/** Presses the Clear Filters button the list in `root` shows under a notice. */
export async function pressClearFilters(root: HostView) {
  const button = clearFiltersButton(root);
  if (button === undefined) throw new Error('The list shows no Clear Filters');
  await fireEvent.press(button);
  await settle();
}

// Saved filters

const APPLY = 'Apply saved filter ';
const DELETE = 'Delete saved filter ';

/** The saved filters Filters lists, top to bottom, as [name, marked as the current one]. */
export const savedFilters = () =>
  within(filtersRoot())
    .queryAllByRole('button')
    .filter((button) => nameOf(button).startsWith(APPLY))
    .map(
      (button) =>
        [
          asRead(nameOf(button)).slice(APPLY.length),
          isSelected(button),
        ] as const,
    );

/** The names of the saved filters Filters lists, top to bottom. */
export const savedFilterNames = () => savedFilters().map(([name]) => name);

/** The names of the saved filters that Filters offers to delete, top to bottom. */
export const deletableFilters = () =>
  within(filtersRoot())
    .queryAllByRole('button')
    .filter((button) => nameOf(button).startsWith(DELETE))
    .map((button) => asRead(nameOf(button)).slice(DELETE.length));

/** Whether Filters shows the SAVED FILTERS heading. */
export const hasSavedSection = () =>
  linesIn(filtersRoot()).includes(SAVED_FILTERS);

/** Presses the saved filter named `name` in the open Filters, which applies it and closes Filters. */
export async function applySaved(name: string) {
  await pressInFilters(`${APPLY}${name}`);
}

/** Opens Filters from the bar titled `barTitle` and applies the saved filter named `name`. */
export async function applySavedFrom(barTitle: string, name: string) {
  await openFilters(barTitle);
  await applySaved(name);
}

/** Presses the delete button of the saved filter named `name` in the open Filters. */
export const pressDeleteSaved = (name: string) =>
  pressInFilters(`${DELETE}${name}`);

// Naming a filter to save it: a system prompt on iOS, a sheet on Android (LEDGER-143.3)

interface PromptButton {
  text?: string;
  style?: string;
  onPress?: (text?: string) => void;
}

/** Watches the system prompts the app shows on iOS; call it before the app starts. */
export function watchPrompts() {
  const prompt = jest
    .spyOn(Alert, 'prompt')
    .mockImplementation(() => undefined);
  const last = () => prompt.mock.calls.at(-1);
  const buttons = (): PromptButton[] => {
    const given = last()?.[2];
    return Array.isArray(given) ? (given as PromptButton[]) : [];
  };
  return {
    /** How many prompts were shown so far. */
    count: () => prompt.mock.calls.length,
    /** The last prompt, as [title, message]. */
    shown: () => last()?.slice(0, 2),
    /** The names of the last prompt's buttons. */
    buttons: () => buttons().map(({ text }) => text),
    /** The text the last prompt's field starts with. */
    suggested: () => last()?.[4],
    /** Presses a button of the last prompt with `text` in its field, and lets what it starts finish. */
    answer: async (button: string, text?: string) => {
      const found = buttons().find((candidate) => candidate.text === button);
      if (found === undefined)
        throw new Error(`The last prompt has no ${button}`);
      await act(async () => found.onPress?.(text));
      await settle();
    },
  };
}
