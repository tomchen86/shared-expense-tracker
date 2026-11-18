import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';
import { barTitled } from './group-details-app';
import { nameOf } from './ledger-expense-app';
import { asRead, inContentOf, linesIn } from './ledger-expense-list-app';
import { iconsIn } from './shell-actions-app';
import { settle } from './shell-appearance-app';
import { componentsIn, nativeViews } from './shell-tabs-app';
import type { MenuFieldProps } from '../../src/ui/menu-field';

// The search and sorting tests read and change the order and the search of a list: the expense
// list, or a group's screen. Each helper takes the list's native screen, or the title of its
// navigation bar.
//
// The sort button opens a system menu on iOS (LEDGER-123.1), which only an E2E flow can open, so
// on iOS the tests read what the list gives the component that draws the button, and choose as
// the menu does: a component that takes the props of the ui/ MenuField, with the label Sort By,
// the order's name as its value, the five orders as its options and the current one selected. On
// Android the button is read as Sort By, <order> and opens a sheet titled Sort By (LEDGER-122.1).
//
// The search field is the system's, in the navigation bar (SHELL-73.1): react-native-screens'
// search bar. The tests type by reporting the text the way that field does, and end a search as
// it reports its cancel button on iOS and its closing on Android.

type HostView = ReturnType<typeof nativeViews>[number];

const onAndroid = () =>
  /-android\.test\./.test(expect.getState().testPath ?? '');

const isSelected = (view: HostView) =>
  view.props.accessibilityState?.selected === true ||
  view.props['aria-selected'] === true;

/** The orders a list offers, in the order of the Sort By list (LEDGER-122.1). */
export const SORT_ORDERS = [
  'Newest First',
  'Oldest First',
  'Recently Edited',
  'Highest Amount',
  'Lowest Amount',
];

// The sort button

/** On iOS: what the list in `root` gives the component that draws its sort button, and that component's view. */
function sortMenu(root: HostView) {
  return componentsIn(root, (type) => typeof type === 'function')
    .map(({ props, view }) => ({ props: props as MenuFieldProps, view }))
    .find(
      ({ props, view }) =>
        props?.label === 'Sort By' &&
        Array.isArray(props.options) &&
        typeof props.onSelect === 'function' &&
        view !== undefined &&
        inContentOf(root, view),
    );
}

/** On Android: the button of the list in `root` that is read as Sort By, <order>. */
const sortButtonView = (root: HostView) =>
  within(root)
    .queryAllByRole('button')
    .find(
      (button) =>
        /^Sort By, /.test(nameOf(button)) && inContentOf(root, button),
    );

/** The view of the sort button of the list in `root`, if it shows one. */
export const sortView = (root: HostView) =>
  onAndroid() ? sortButtonView(root) : sortMenu(root)?.view;

/** What a screen reader reads for the sort button, Sort By, <order>; undefined while the list shows none. */
export function sortName(root: HostView): string | undefined {
  if (onAndroid()) {
    const button = sortButtonView(root);
    return button && asRead(nameOf(button));
  }
  const menu = sortMenu(root);
  return menu && `${menu.props.label}, ${menu.props.value}`;
}

/** Waits until the sort button of the list in `root()` is read as Sort By, `order`. */
export const expectSort = (root: () => HostView, order: string) =>
  waitFor(() => expect(sortName(root())).toBe(`Sort By, ${order}`));

/** The two arrows of the sort button: their symbol's name on this platform and their color. */
export function sortArrows(root: HostView) {
  const platform = onAndroid() ? 'android' : 'ios';
  const name = onAndroid() ? 'swap_vert' : 'arrow.up.arrow.down';
  return iconsIn(root, platform)
    .filter(
      (icon) =>
        icon.name === name &&
        icon.view !== undefined &&
        inContentOf(root, icon.view),
    )
    .map((icon) => ({ name: icon.name, color: icon.color }));
}

/** The open Sort By list on Android: the sheet around a Sort By header. */
function sortList(): HostView | undefined {
  const header = screen.queryAllByRole('header', { name: 'Sort By' }).at(-1);
  if (header === undefined) return undefined;
  for (let outer = header.parent; outer; outer = outer.parent)
    if (String(outer.type) === 'Modal') return outer;
  return header.parent ?? header;
}

/** Whether the Sort By sheet is open, on Android. */
export const sortListOpen = () => sortList() !== undefined;

/** Presses the sort button on Android and waits for the Sort By sheet. */
export async function openSortList(root: HostView) {
  const button = sortButtonView(root);
  if (button === undefined) throw new Error('The list shows no sort button');
  await fireEvent.press(button);
  await waitFor(() => expect(sortList()).toBeDefined());
  await settle();
  return sortList()!;
}

/** The buttons of the open Sort By sheet on Android, by name, its options and Cancel alike. */
export const sortListButtons = () =>
  within(sortList()!)
    .queryAllByRole('button')
    .map((button) => asRead(nameOf(button)));

/** Presses Cancel on the open Sort By sheet, on Android. */
export async function cancelSortList() {
  await fireEvent.press(
    within(sortList()!).getByRole('button', { name: 'Cancel' }),
  );
  await waitFor(() => expect(sortList()).toBeUndefined());
  await settle();
}

/**
 * What the Sort By list of the list in `root` holds, top to bottom, as [name, marked as the
 * current one]. On Android this opens the sheet and closes it again with Cancel.
 */
export async function sortOptions(root: HostView) {
  if (!onAndroid()) {
    const menu = sortMenu(root);
    if (menu === undefined) throw new Error('The list shows no sort button');
    return menu.props.options.map(
      (option) =>
        [option.name, menu.props.selected.includes(option.id)] as const,
    );
  }
  const list = await openSortList(root);
  const options = within(list)
    .queryAllByRole('button')
    .filter((button) => nameOf(button) !== 'Cancel')
    .map((button) => [asRead(nameOf(button)), isSelected(button)] as const);
  await cancelSortList();
  return options;
}

/** Chooses the order named `order` in the Sort By list of the list in `root`. */
export async function chooseSort(root: HostView, order: string) {
  if (!onAndroid()) {
    const menu = sortMenu(root);
    if (menu === undefined) throw new Error('The list shows no sort button');
    const option = menu.props.options.find(
      (candidate) => candidate.name === order,
    );
    if (option === undefined) throw new Error(`Sort By has no ${order}`);
    await act(async () => menu.props.onSelect(option.id));
    await settle();
    return;
  }
  const list = await openSortList(root);
  await fireEvent.press(within(list).getByRole('button', { name: order }));
  await waitFor(() => expect(sortList()).toBeUndefined());
  await settle();
}

// The line above the cards

const COUNT = /^\d+ items?$/;

const textOf = (node: HostView | string): string =>
  typeof node === 'string' ? node : node.children.map(textOf).join('');

/** The text of the list in `root` that says how many expenses it lists, such as 22 items, if it shows one. */
export const countView = (root: HostView): HostView | undefined =>
  root.queryAll(
    (view) =>
      String(view.type) === 'Text' &&
      COUNT.test(asRead(textOf(view))) &&
      inContentOf(root, view),
  )[0];

/** How many expenses the line above the cards says the list holds, such as 22 items; undefined while it says none. */
export const listCount = (root: HostView) =>
  linesIn(root).find((line) => COUNT.test(line));

/** The headings of the list in `root` that are dates, top to bottom, with the cards' titles between them left out. */
export const dateHeadings = (root: HostView) =>
  within(root)
    .queryAllByRole('header')
    .filter((view) => inContentOf(root, view))
    .map((view) => asRead(nameOf(view)))
    .filter((name) => /\d{4}$/.test(name) && !name.startsWith('No '));

// Search

/** The system search field of the navigation bar titled `barTitle`, if the bar has one. */
export function searchField(barTitle: string): HostView | undefined {
  const bar = barTitled(barTitle);
  if (bar === undefined) throw new Error(`${barTitle} is not open`);
  return nativeViews(/^RNSSearchBar$/, bar)[0];
}

/** Whether the bar titled `barTitle` offers a search. */
export const hasSearch = (barTitle: string) =>
  searchField(barTitle) !== undefined;

function field(barTitle: string) {
  const found = searchField(barTitle);
  if (found === undefined)
    throw new Error(`The bar titled ${barTitle} has no search field`);
  return found;
}

/** Makes the text of the search field of the bar titled `barTitle` be `text`, as typing or clearing it does. */
export async function typeSearch(barTitle: string, text: string) {
  await act(async () => {
    await fireEvent(field(barTitle), 'changeText', { nativeEvent: { text } });
  });
  await settle();
}

/** Ends the search of the bar titled `barTitle`: the field's cancel button on iOS, closing the field on Android. */
export async function endSearch(barTitle: string) {
  await act(async () => {
    await fireEvent(
      field(barTitle),
      onAndroid() ? 'close' : 'cancelButtonPress',
      { nativeEvent: {} },
    );
  });
  await settle();
}

/** The No Results for “<text>” heading of the list in `root`, if it shows one (LEDGER-127.1). */
export const noResultsTitle = (root: HostView) =>
  within(root)
    .queryAllByRole('header')
    .filter((view) => inContentOf(root, view))
    .map((view) => asRead(nameOf(view)))
    .find((name) => name.startsWith('No Results for '));

/** What the screen says under that heading. */
export const NO_RESULTS_HINT = 'Check the spelling or try a new search.';
