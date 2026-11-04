import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';
import {
  componentsIn,
  nativeViews,
  navigationBars,
  push,
  tab,
  tapTab,
} from './shell-tabs-app';
import { settle } from './shell-appearance-app';
import { nameOf, pressBack } from './ledger-expense-app';
import { asRead, expensesRoot, linesIn } from './ledger-expense-list-app';
import { isSelected } from './ledger-group-expense-app';
import type { CategoryChartProps } from '../../src/ui/category-chart';

// The Insights tests start the app as the expense list tests do
// (ledger-expense-list-app), add personal expenses through New Expense and group
// expenses as the group expense tests do (ledger-group-expense-app), and open
// Insights from Total Spent or by its URL. They read Insights from what the app
// shows: the lines of text, top to bottom, the names a screen reader reads, the items
// Insights hands to the native navigation bar on iOS and the buttons in its header
// on Android. Each currency's chart is the ui/ CategoryChart: the tests read what
// Insights tells it to draw, as the expense form tests read the DateField's props,
// and whether screen readers skip what it draws; how it looks is a hand check
// (INSIGHTS-25.1). The Android period picker is a dialog the tests find by its
// title; a back press reaches it as Android reaches React Native's Modal.

type HostView = ReturnType<typeof nativeViews>[number];

export const NO_EXPENSES = [
  'No expenses yet',
  'Add an expense to see spending insights.',
];
export const TOO_LARGE = [
  'Totals Too Large',
  'These totals are too large to show.',
];
export const GROUP_NOT_FOUND = 'Group not found.';
export const SETTINGS_FAILED = [
  'Unable to Save Settings',
  'Your settings could not be saved. Please try again.',
];
export const CHART_MENU = 'Chart visualization';

// The screen

/** The navigation bars of the Insights open on the tab `on`. */
export const insightsBars = (on = 'Expenses') =>
  navigationBars(tab(on)).filter((bar) => bar.props.title === 'Insights');

function insightsBar(on: string) {
  const bar = insightsBars(on).at(-1);
  if (bar === undefined) throw new Error(`No Insights is open on ${on}`);
  return bar;
}

/** The native screen of the Insights open on the tab `on`. */
export function insightsScreen(on = 'Expenses'): HostView {
  for (let outer = insightsBar(on).parent; outer; outer = outer.parent)
    if (String(outer.type) === 'RNSScreen') return outer;
  throw new Error('Insights is not a screen');
}

/** The lines of text on the Insights open on the tab `on`, top to bottom. */
export const insightsLines = (on = 'Expenses') => linesIn(insightsScreen(on));

/** Waits until Insights is open on the tab `on` and has read what it shows. */
export async function expectInsights(on = 'Expenses') {
  await waitFor(() => expect(insightsBars(on)).toHaveLength(1));
  await settle();
}

/** The Total Spent button on the expense list. */
export const totalSpentButton = () =>
  within(expensesRoot()).getByRole('button', {
    name: /^View expense insights\./,
  });

/** Opens the personal Insights from Total Spent on the expense list. */
export async function openInsights() {
  await tapTab('Expenses');
  await fireEvent.press(totalSpentButton());
  await expectInsights();
}

/** Opens the Insights of the group `groupId` on the Groups tab, as a link in the app would. */
export async function openGroupInsights(groupId: string) {
  await tapTab('Groups');
  await push(`/groups/insights?groupId=${groupId}`);
  await expectInsights('Groups');
}

/** Goes back from Insights, as the native back button reports it on iOS. */
export async function goBackFromInsights(on = 'Expenses') {
  await act(async () => {
    await fireEvent(insightsScreen(on), 'dismissed', {
      nativeEvent: { dismissCount: 1 },
    });
  });
  await settle();
}

// Total cards

const totalCardViews = (on: string) =>
  within(insightsScreen(on)).queryAllByLabelText(/^Total spent /);

/** The lines each total card shows, top to bottom. */
export const totalCards = (on = 'Expenses') => totalCardViews(on).map(linesIn);

/** What a screen reader reads for each total card, top to bottom. */
export const totalCardsRead = (on = 'Expenses') =>
  totalCardViews(on).map((view) => asRead(nameOf(view)));

/** The totals the cards show, top to bottom. */
export const totals = (on = 'Expenses') =>
  totalCards(on).map((lines) => lines[1]);

/** Waits until the total cards show `expected`. */
export const expectTotals = (expected: string[], on = 'Expenses') =>
  waitFor(() => expect(totals(on)).toEqual(expected));

// Categories

/** The headings a screen reader finds on Insights, top to bottom. */
export const headings = (on = 'Expenses') =>
  within(insightsScreen(on))
    .queryAllByRole('header')
    .map((view) => asRead(nameOf(view)));

/** The category rows, top to bottom: the elements a screen reader reads as `<name>, <amount>, <percentage> percent`. */
export const rowViews = (on = 'Expenses') =>
  within(insightsScreen(on)).queryAllByLabelText(/ percent$/);

/** The lines each category row shows, top to bottom. */
export const rows = (on = 'Expenses') => rowViews(on).map(linesIn);

/** What a screen reader reads for each category row, top to bottom. */
export const rowsRead = (on = 'Expenses') =>
  rowViews(on).map((view) => asRead(nameOf(view)));

// Charts

const chartComponents = (on: string) =>
  componentsIn(
    insightsScreen(on),
    (type) => typeof type === 'function' && type.name === 'CategoryChart',
  );

/** What Insights tells each currency's CategoryChart to draw, top to bottom. */
export const charts = (on = 'Expenses') =>
  chartComponents(on).map(({ props }) => props as CategoryChartProps);

/** The kind of each currency's chart, top to bottom. */
export const chartKinds = (on = 'Expenses') =>
  charts(on).map(({ kind }) => kind);

/** The categories each chart draws, as [name, color, amount]. */
export const chartCategories = (on = 'Expenses') =>
  charts(on).map(({ categories }) =>
    categories.map(({ name, color, amountMinor }) => [
      name,
      color,
      amountMinor,
    ]),
  );

/** The outermost native view each currency's chart draws, top to bottom. */
export const chartViews = (on = 'Expenses') =>
  chartComponents(on).map(({ view }) => view as HostView | undefined);

// The chart menu

interface MenuEntry {
  type: string;
  title?: string;
  state?: string;
  menuId?: string;
}

interface BarItem {
  type: string;
  accessibilityLabel?: string;
  icon?: { type?: string; name?: string };
  menu?: { title?: string; items: MenuEntry[] };
}

const rightBarItems = (on: string): BarItem[] =>
  insightsBar(on).props.headerRightBarButtonItems ?? [];

const chartMenuItem = (on: string) =>
  rightBarItems(on).find(
    (item) => item.type === 'menu' && item.accessibilityLabel === CHART_MENU,
  );

/** The chart menu on the iOS navigation bar of Insights, if it has one. */
export function chartMenu(on = 'Expenses') {
  const item = chartMenuItem(on);
  if (item === undefined) return undefined;
  const entries = item.menu?.items ?? [];
  return {
    icon: item.icon?.type === 'sfSymbol' ? item.icon.name : item.icon,
    title: item.menu?.title,
    options: entries.map((entry) => entry.title),
    checked: entries
      .filter((entry) => entry.state === 'on')
      .map((entry) => entry.title),
  };
}

/** Chooses an option of the iOS chart menu, as the native menu reports it. */
export async function chooseChart(option: string, on = 'Expenses') {
  const entry = chartMenuItem(on)?.menu?.items.find(
    (candidate) => candidate.title === option,
  );
  if (entry === undefined) throw new Error(`No ${option} in the chart menu`);
  await fireEvent(insightsBar(on), 'pressHeaderBarButtonMenuItem', {
    nativeEvent: { menuId: entry.menuId },
  });
  await settle();
}

/** The Android chart button in the header of Insights, if it has one. */
export const chartButton = (on = 'Expenses') =>
  within(insightsBar(on))
    .queryAllByRole('button')
    .find((button) => nameOf(button).startsWith(`${CHART_MENU}, `));

// The period controls

const inInsights = (on: string) => within(insightsScreen(on));

export const previousButton = (on = 'Expenses') =>
  inInsights(on).queryByRole('button', { name: 'Previous period' });

export const nextButton = (on = 'Expenses') =>
  inInsights(on).queryByRole('button', { name: 'Next period' });

/** The period name as a button that opens the period picker, if it is one. */
export const periodButton = (on = 'Expenses') =>
  inInsights(on).queryByRole('button', { name: /^Choose period\. / });

const PERIOD_NAME =
  /^((January|February|March|April|May|June|July|August|September|October|November|December) )?\d{4}$/;

/** The name of the selected period, from its button or else from the text that shows it. */
export function selectedPeriod(on = 'Expenses') {
  const button = periodButton(on);
  if (button !== null) return nameOf(button).replace(/^Choose period\. /, '');
  return insightsLines(on).find((line) => PERIOD_NAME.test(line));
}

/** Waits until the selected period is `name`. */
export const expectPeriod = (name: string, on = 'Expenses') =>
  waitFor(() => expect(selectedPeriod(on)).toBe(name));

async function pressIn(on: string, button: HostView | null, name: string) {
  if (button === null) throw new Error(`No ${name} on Insights`);
  await fireEvent.press(button);
  await settle();
}

export const pressPrevious = (on = 'Expenses') =>
  pressIn(on, previousButton(on), 'Previous period');

export const pressNext = (on = 'Expenses') =>
  pressIn(on, nextButton(on), 'Next period');

export const pressPeriod = (on = 'Expenses') =>
  pressIn(on, periodButton(on), 'Choose period');

/** The options of the Period aggregation radio group, as screen readers find them. */
export function aggregationOptions(on = 'Expenses') {
  const group = inInsights(on).getByLabelText('Period aggregation');
  expect(group.props.role ?? group.props.accessibilityRole).toBe('radiogroup');
  return within(group).getAllByRole('radio');
}

const isChecked = (view: HostView) =>
  view.props.accessibilityState?.checked === true ||
  view.props['aria-checked'] === true;

/** The checked option of Period aggregation. */
export const checkedAggregation = (on = 'Expenses') =>
  aggregationOptions(on).filter(isChecked).map(nameOf);

/** Chooses Month or Year in Period aggregation. */
export async function chooseAggregation(
  name: 'Month' | 'Year',
  on = 'Expenses',
) {
  const option = aggregationOptions(on).find((view) => nameOf(view) === name);
  if (option === undefined) throw new Error(`No ${name} in Period aggregation`);
  await fireEvent.press(option);
  await settle();
}

// The Android period picker

function pickerTitleView() {
  return screen.queryAllByText(/^Select (Month|Year)$/).at(-1);
}

/** The title of the open period picker dialog, if one is open. */
export const pickerTitle = () => {
  const title = pickerTitleView();
  return title === undefined ? undefined : linesIn(title)[0];
};

/** What holds the open period picker: the modal around its title. */
function pickerRoot(): HostView {
  const title = pickerTitleView();
  if (title === undefined) throw new Error('No period picker is open');
  let root: HostView = title;
  for (let outer = title.parent; outer; outer = outer.parent) {
    root = outer;
    if (typeof outer.props.onRequestClose === 'function') break;
  }
  return root;
}

/** The lines of text in the open period picker, top to bottom. */
export const pickerLines = () => linesIn(pickerRoot());

/** The names of the buttons in the open period picker, top to bottom. */
export const pickerButtons = () =>
  within(pickerRoot()).queryAllByRole('button').map(nameOf);

/** The buttons in the open period picker that are marked selected. */
export const pickerSelected = () =>
  within(pickerRoot()).queryAllByRole('button').filter(isSelected).map(nameOf);

/** What the button named `name` in the open period picker shows. */
export const pickerButtonLines = (name: string) =>
  linesIn(within(pickerRoot()).getByRole('button', { name }));

/** Presses the button named `name` in the open period picker. */
export async function pressInPicker(name: string) {
  await fireEvent.press(within(pickerRoot()).getByRole('button', { name }));
  await settle();
}

/** Presses Android's back button while the period picker is open. */
export async function pressBackOnPicker() {
  const root = pickerRoot();
  if (typeof root.props.onRequestClose === 'function')
    await act(async () => {
      await fireEvent(root, 'requestClose');
    });
  else await pressBack();
  await settle();
}
