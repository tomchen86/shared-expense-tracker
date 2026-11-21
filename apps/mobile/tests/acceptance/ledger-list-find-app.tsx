import { act, fireEvent, waitFor, within } from '@testing-library/react-native';
import { barTitled } from './group-details-app';
import { nameOf } from './ledger-expense-app';
import { asRead, inContentOf } from './ledger-expense-list-app';
import { iconsIn } from './shell-actions-app';
import { settle } from './shell-appearance-app';
import { componentsIn, nativeViews } from './shell-tabs-app';
import type { MenuFieldProps } from '../../src/ui/menu-field';

// The search and sorting tests read and change the order and the search of a list: the expense
// list, or a group's screen. Each helper takes the list's native screen, or the title of its
// navigation bar.
//
// The sort button opens a system menu on iOS (LEDGER-123.1) and a Material menu on Android
// (LEDGER-149.1), which only an E2E flow can open, so the tests read what the list gives the
// component that draws the button, and choose as the menu does: a component that takes the props
// of the ui/ MenuField, with the label Sort By, the order's name as its value, the five orders as
// its options and the current one selected.
//
// The search field is the system's, in the navigation bar (SHELL-73.2): react-native-screens'
// search bar. The tests type by reporting the text the way that field does, and end a search as
// it reports its cancel button on iOS and its closing on Android.

type HostView = ReturnType<typeof nativeViews>[number];

const onAndroid = () =>
  /-android\.test\./.test(expect.getState().testPath ?? '');

/** The orders a list offers, in the order of the Sort By list (LEDGER-122.3). */
export const SORT_ORDERS = [
  'Newest First',
  'Oldest First',
  'Recently Edited',
  'Highest Amount',
  'Lowest Amount',
];

// The sort button

/** What the list in `root` gives the component that draws its sort button, and that component's view. */
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

/** The view of the sort button of the list in `root`, if it shows one. */
export const sortView = (root: HostView) => sortMenu(root)?.view;

/** What a screen reader reads for the sort button, Sort By, <order>; undefined while the list shows none. */
export function sortName(root: HostView): string | undefined {
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

/** What the Sort By list of the list in `root` holds, top to bottom, as [name, marked as the current one]. */
export async function sortOptions(root: HostView) {
  const menu = sortMenu(root);
  if (menu === undefined) throw new Error('The list shows no sort button');
  return menu.props.options.map(
    (option) => [option.name, menu.props.selected.includes(option.id)] as const,
  );
}

/** Chooses the order named `order` in the Sort By list of the list in `root`. */
export async function chooseSort(root: HostView, order: string) {
  const menu = sortMenu(root);
  if (menu === undefined) throw new Error('The list shows no sort button');
  const option = menu.props.options.find(
    (candidate) => candidate.name === order,
  );
  if (option === undefined) throw new Error(`Sort By has no ${order}`);
  await act(async () => menu.props.onSelect(option.id));
  await settle();
}

// The line above the cards

// The digits are grouped as the phone's region groups them: 1,000 items, 1.000 items.
const COUNT = /^\d[\d.,\s'’]* items?$/;

const textOf = (node: HostView | string): string =>
  typeof node === 'string' ? node : node.children.map(textOf).join('');

/** Whether `view` is part of the total above the cards, which on All Time is a number of items too (LEDGER-35.6). */
function inTotal(view: HostView, root: HostView) {
  for (let outer = view.parent; outer && outer !== root; outer = outer.parent)
    if (nameOf(outer).startsWith('View expense insights.')) return true;
  return false;
}

/** The text of the list in `root` that says how many expenses it lists, such as 22 items, if it shows one. */
export const countView = (root: HostView): HostView | undefined =>
  root.queryAll(
    (view) =>
      String(view.type) === 'Text' &&
      COUNT.test(asRead(textOf(view))) &&
      inContentOf(root, view) &&
      !inTotal(view, root),
  )[0];

/** How many expenses the line above the cards says the list holds, such as 22 items; undefined while it says none. */
export const listCount = (root: HostView) => {
  const view = countView(root);
  return view === undefined ? undefined : asRead(textOf(view));
};

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

/** The No Results for “<text>” heading of the list in `root`, if it shows one (LEDGER-127.2). */
export const noResultsTitle = (root: HostView) =>
  within(root)
    .queryAllByRole('header')
    .filter((view) => inContentOf(root, view))
    .map((view) => asRead(nameOf(view)))
    .find((name) => name.startsWith('No Results for '));

/** What the screen says under that heading. */
export const NO_RESULTS_HINT = 'Check the spelling or try a new search.';
