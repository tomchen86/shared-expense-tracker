import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';
import { barActionOn, barTitled } from './group-details-app';
import { nameOf, pressBack, presentedScreen } from './ledger-expense-app';
import { asRead, inContentOf, linesIn } from './ledger-expense-list-app';
import { settle } from './shell-appearance-app';
import { componentsIn, nativeViews, navigationBars } from './shell-tabs-app';
import type { DateFieldProps } from '../../src/ui/date-field';
import type { MenuFieldProps } from '../../src/ui/menu-field';

// The period tests read and change the period of a list that shows one period at a time
// (LEDGER-107.1): the expense list, or a group's screen. Each helper takes the list's native
// screen. They read the period row, the total under it and the words of a period with no expense
// from what the list shows and from the names a screen reader reads, and press the arrows as
// buttons. The name on the period row is a system menu on iOS (LEDGER-110.1), which only an E2E
// flow can open, so the tests choose a period in Filters (LEDGER-109.1): its Date row is the ui/
// MenuField, read and pressed as the expense form's rows are (ledger-expense-app), and the dates
// of a custom range are the ui/ DateField, whose props the tests read and call. Filters is found
// by its title: a navigation bar, or on Android the header of the sheet it is drawn in.

type HostView = ReturnType<typeof nativeViews>[number];

/** The periods a list offers by name, in the order of the Date list (LEDGER-109.1). */
export const PERIOD_OPTIONS = [
  'This Month',
  'Last Month',
  'Last 3 Months',
  'This Year',
  'All Time',
  'Custom Range',
];

const onAndroid = () =>
  /-android\.test\./.test(expect.getState().testPath ?? '');

const isDisabled = (view: HostView) =>
  view.props.accessibilityState?.disabled === true ||
  view.props['aria-disabled'] === true;

const isSelected = (view: HostView) =>
  view.props.accessibilityState?.selected === true ||
  view.props['aria-selected'] === true;

/** The buttons the list in `root` shows itself: not those of its title bar, nor of a sheet over it. */
const ownButtons = (root: HostView) =>
  within(root)
    .queryAllByRole('button')
    .filter((button) => inContentOf(root, button));

// The period row

const MONTH =
  '(January|February|March|April|May|June|July|August|September|October|November|December)';
const SHORT = '[A-Z][a-z]{2}';
/** A line that is the name of a period (LEDGER-108.1). */
const PERIOD_NAME = new RegExp(
  `^(${MONTH} \\d{4}|\\d{4}|${SHORT}( \\d{4})? – ${SHORT} \\d{4}|Custom Range|All Time|Group Total)$`,
);

/**
 * The name on the period row of the list in `root`: from what a screen reader reads as
 * Choose period. <name> where the test can see it, else from the first line that is a period's
 * name. Undefined while the list shows no period row.
 */
export function periodName(root: HostView): string | undefined {
  const [named] = root.queryAll(
    (view) =>
      typeof view.type === 'string' &&
      /^Choose period\. /.test(String(view.props.accessibilityLabel ?? '')) &&
      inContentOf(root, view),
  );
  if (named !== undefined)
    return asRead(nameOf(named)).replace(/^Choose period\. /, '');
  return linesIn(root).find((line) => PERIOD_NAME.test(line));
}

/** Waits until the period row of the list in `root()` names `name`. */
export const expectPeriod = (root: () => HostView, name: string) =>
  waitFor(() => expect(periodName(root())).toBe(name));

/** The Previous period button on the period row, if it shows one. */
export const previousPeriod = (root: HostView) =>
  ownButtons(root).find((button) => nameOf(button) === 'Previous period');

/** The Next period button on the period row, if it shows one. */
export const nextPeriod = (root: HostView) =>
  ownButtons(root).find((button) => nameOf(button) === 'Next period');

/** The period row's arrows that can be pressed, left to right. */
export const enabledArrows = (root: HostView) =>
  [previousPeriod(root), nextPeriod(root)]
    .filter((button) => button !== undefined && !isDisabled(button))
    .map((button) => nameOf(button!));

/** The period row's arrows, left to right, whether or not they can be pressed. */
export const arrows = (root: HostView) =>
  [previousPeriod(root), nextPeriod(root)]
    .filter((button) => button !== undefined)
    .map((button) => nameOf(button));

async function pressArrow(button: HostView | undefined, name: string) {
  if (button === undefined) throw new Error(`The period row has no ${name}`);
  // A disabled button takes no press.
  if (!isDisabled(button)) await fireEvent.press(button);
  await settle();
}

export const pressPreviousPeriod = (root: HostView) =>
  pressArrow(previousPeriod(root), 'Previous period');

export const pressNextPeriod = (root: HostView) =>
  pressArrow(nextPeriod(root), 'Next period');

// The total under the period row

/** The buttons of the list in `root` that open Insights: its total (LEDGER-35.4, GROUPS-68.4). */
export const totalButtons = (root: HostView) =>
  ownButtons(root).filter(
    (button) => button.props.accessibilityHint === 'Opens Insights',
  );

/** What the total under the period row shows, without the › at its right. */
export const totalLines = (root: HostView) =>
  totalButtons(root)
    .flatMap(linesIn)
    .filter((line) => line !== '›');

/** What a screen reader reads for the total under the period row. */
export const totalRead = (root: HostView) =>
  totalButtons(root).map((button) => asRead(nameOf(button)));

/** Presses the total under the period row. */
export async function pressTotal(root: HostView) {
  const [button] = totalButtons(root);
  if (button === undefined) throw new Error('The list shows no total');
  await fireEvent.press(button);
}

// A period with no expense

/** The No Expenses in <period> heading of the list in `root`, if it shows one (LEDGER-116.1). */
export const emptyPeriodTitle = (root: HostView) =>
  within(root)
    .queryAllByRole('header')
    .filter((view) => inContentOf(root, view))
    .map((view) => asRead(nameOf(view)))
    .find((name) => name.startsWith('No Expenses in '));

/** The Show <period> button under that heading, if there is one. */
export const showEarlierButton = (root: HostView) =>
  ownButtons(root).find((button) => /^Show /.test(nameOf(button)));

/** Presses the Show <period> button. */
export async function pressShowEarlier(root: HostView) {
  const button = showEarlierButton(root);
  if (button === undefined) throw new Error('The list shows no Show button');
  await fireEvent.press(button);
  await settle();
}

// The dates of a custom range

/** The ui/ DateField named `label` that `root` shows itself, if it shows one. */
function dateField(root: HostView, label: string) {
  return componentsIn(
    root,
    (type) => typeof type === 'function' && type.name === 'DateField',
  )
    .map(({ props, view }) => ({ props: props as DateFieldProps, view }))
    .find(
      ({ props, view }) =>
        props.label === label && view !== undefined && inContentOf(root, view),
    );
}

/**
 * The From and To of a custom range that `root` shows itself, a list or Filters: what each date
 * field is told, as YYYY-MM-DD. Undefined while `root` shows neither.
 */
export function rangeDates(root: HostView) {
  const from = dateField(root, 'From');
  const to = dateField(root, 'To');
  if (from === undefined || to === undefined) return undefined;
  return {
    from: from.props.value,
    to: to.props.value,
    latest: [from.props.maximumDate, to.props.maximumDate],
  };
}

/** Chooses `date` in the From or To date field that `root` shows itself. */
export async function chooseRangeDate(
  root: HostView,
  label: 'From' | 'To',
  date: string,
) {
  const field = dateField(root, label);
  if (field === undefined) throw new Error(`No ${label} date to choose`);
  await act(async () => field.props.onChange(date));
  await settle();
}

// The Filters header action

interface BarItem {
  type: string;
  title?: string;
  accessibilityLabel?: string;
  variant?: string;
  icon?: { type?: string; name?: string };
}

const itemName = (item: BarItem) => item.accessibilityLabel || item.title;

/**
 * What stands at the right of the navigation bar titled `barTitle`, from the leading side to the
 * trailing edge: the iOS bar items, which the bar holds from the trailing edge, or the Android
 * header buttons.
 */
export function rightOfBar(barTitle: string) {
  const bar = barTitled(barTitle);
  if (bar === undefined) throw new Error(`${barTitle} is not open`);
  const items: BarItem[] = bar.props.headerRightBarButtonItems ?? [];
  const onIos = [...items].reverse().map((item) => ({
    name: itemName(item),
    icon: item.icon?.type === 'sfSymbol' ? item.icon.name : undefined,
    variant: item.type === 'button' ? (item.variant ?? 'plain') : item.type,
  }));
  const onAndroidHeader = nativeViews(/^RNSScreenStackHeaderSubview$/, bar)
    .filter((subview) => subview.props.type === 'right')
    .flatMap((subview) => within(subview).queryAllByRole('button'));
  return { items: onIos, buttons: onAndroidHeader };
}

/** Whether the bar titled `barTitle` offers Filters. */
export function hasFilters(barTitle: string) {
  const { items, buttons } = rightOfBar(barTitle);
  return [...items.map(({ name }) => name), ...buttons.map(nameOf)].includes(
    'Filters',
  );
}

// Filters

/** Filters, if it is open: a screen titled Filters, or the sheet around a Filters header. */
function filtersView(): { root: HostView; bar?: HostView } | undefined {
  const bar = navigationBars()
    .filter((candidate) => candidate.props.title === 'Filters')
    .at(-1);
  if (bar !== undefined) return { root: presentedScreen(bar) ?? bar, bar };
  const header = screen.queryAllByRole('header', { name: 'Filters' }).at(-1);
  if (header === undefined) return undefined;
  for (let outer = header.parent; outer; outer = outer.parent)
    if (String(outer.type) === 'Modal') return { root: outer };
  return { root: header.parent ?? header };
}

export const filtersOpen = () => filtersView() !== undefined;

/** The view that holds the open Filters. */
export function filtersRoot(): HostView {
  const open = filtersView();
  if (open === undefined) throw new Error('Filters is not open');
  return open.root;
}

/** Waits until Filters is open and has drawn its rows. */
export async function expectFilters() {
  await waitFor(() => expect(filtersOpen()).toBe(true));
  await settle();
}

/** Presses Filters on the navigation bar titled `barTitle`: Expenses, or a group's name. */
export async function openFilters(barTitle: string) {
  if (!hasFilters(barTitle))
    throw new Error(`The bar titled ${barTitle} has no Filters`);
  await barActionOn(barTitled(barTitle)!, 'Filters').press();
  await expectFilters();
}

/** The buttons of Filters' own title bar, by name: bar items on iOS, the sheet's header buttons on Android. */
export function filtersBarButtons() {
  const { root, bar } = filtersView() ?? {};
  if (root === undefined) throw new Error('Filters is not open');
  if (bar !== undefined)
    return (['Left', 'Right'] as const).flatMap((side) =>
      ((bar.props[`header${side}BarButtonItems`] as BarItem[]) ?? []).map(
        itemName,
      ),
    );
  const header = within(root).getByRole('header', { name: 'Filters' });
  return within(header.parent ?? root)
    .queryAllByRole('button')
    .map(nameOf);
}

/** Presses Done on Filters and waits until it has closed. */
export async function closeFilters() {
  const open = filtersView();
  if (open === undefined) throw new Error('Filters is not open');
  if (open.bar !== undefined) await barActionOn(open.bar, 'Done').press();
  else
    await fireEvent.press(
      within(open.root).getByRole('button', { name: 'Done' }),
    );
  await settle();
  await waitFor(() => expect(filtersOpen()).toBe(false));
}

/** Swipes Filters down, as iOS reports a sheet the app lets go. */
export async function swipeFiltersDown() {
  await act(async () => {
    await fireEvent(filtersRoot(), 'dismissed', {
      nativeEvent: { dismissCount: 1 },
    });
  });
  await settle();
}

/** Presses Android's back button while Filters is open. */
export async function pressBackOnFilters() {
  const root = filtersRoot();
  if (typeof root.props.onRequestClose === 'function')
    await act(async () => {
      await fireEvent(root, 'requestClose');
    });
  else await pressBack();
  await settle();
}

// The Date row of Filters

/** The Date row's ui/ MenuField on iOS, where its list is a system menu. */
function dateMenu() {
  const found = componentsIn(
    filtersRoot(),
    (type) => typeof type === 'function' && type.name === 'MenuField',
  )
    .map(({ props }) => props as MenuFieldProps)
    .filter((props) => props.label === 'Date');
  if (found.length !== 1)
    throw new Error(`Expected one Date row in Filters, found ${found.length}`);
  return found[0];
}

/** The Date row's button on Android. */
const dateButton = () =>
  within(filtersRoot()).getByRole('button', { name: /^Date, / });

/** What a screen reader reads for the Date row of Filters: Date, <value>. */
export const dateRow = () =>
  onAndroid()
    ? asRead(nameOf(dateButton()))
    : `${dateMenu().label}, ${dateMenu().value}`;

/** The open Date list on Android: the sheet around a Date header. */
function dateList(): HostView | undefined {
  const header = screen.queryAllByRole('header', { name: 'Date' }).at(-1);
  if (header === undefined) return undefined;
  for (let outer = header.parent; outer; outer = outer.parent)
    if (String(outer.type) === 'Modal') return outer;
  return header.parent ?? header;
}

async function openDateList() {
  await fireEvent.press(dateButton());
  await waitFor(() => expect(dateList()).toBeDefined());
  await settle();
  return dateList()!;
}

/**
 * What the Date list holds, top to bottom, as [name, marked as the current one]. On Android this
 * opens the list and closes it again with Cancel.
 */
export async function dateOptions() {
  if (!onAndroid()) {
    const { options, selected } = dateMenu();
    return options.map(
      (option) => [option.name, selected.includes(option.id)] as const,
    );
  }
  const list = await openDateList();
  const options = within(list)
    .queryAllByRole('button')
    .filter((button) => nameOf(button) !== 'Cancel')
    .map((button) => [asRead(nameOf(button)), isSelected(button)] as const);
  await fireEvent.press(within(list).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(dateList()).toBeUndefined());
  return options;
}

/** Chooses the period named `name` in the Date list of the open Filters. */
export async function chooseDateOption(name: string) {
  if (!onAndroid()) {
    const { options, onSelect } = dateMenu();
    const option = options.find((candidate) => candidate.name === name);
    if (option === undefined) throw new Error(`Date has no ${name}`);
    await act(async () => onSelect(option.id));
    await settle();
    return;
  }
  const list = await openDateList();
  await fireEvent.press(within(list).getByRole('button', { name }));
  await waitFor(() => expect(dateList()).toBeUndefined());
  await settle();
}

/**
 * Changes the period of the list under the bar titled `barTitle` to the one named `name` in
 * Filters' Date list, and closes Filters.
 */
export async function choosePeriod(barTitle: string, name: string) {
  await openFilters(barTitle);
  await chooseDateOption(name);
  await closeFilters();
}
