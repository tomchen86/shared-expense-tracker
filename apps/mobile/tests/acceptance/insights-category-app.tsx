import { act, fireEvent, waitFor, within } from '@testing-library/react-native';
import { nameOf } from './ledger-expense-app';
import { asRead, inContentOf, linesIn } from './ledger-expense-list-app';
import { detailScreenOn } from './ledger-group-expense-app';
import { rowViews } from './insights-app';
import { settle } from './shell-appearance-app';
import { nativeViews, navigationBars, tab } from './shell-tabs-app';

// The tests of a category's expenses open Insights as the Insights tests do (insights-app),
// press a category row and read the screen that opens from what the app shows: its navigation
// bar, the lines of text top to bottom, the headings and the buttons. The screen is found by
// its title, the category's name, on the tab Insights is on. Everything it shows under its bar
// that is a button is a card: the screen has no other control (INSIGHTS-51.1).

type HostView = ReturnType<typeof nativeViews>[number];

export const ROW_HINT = 'Shows these expenses';

// The rows of Insights

/**
 * The category row of the Insights on the tab `on` that shows `name`; where several
 * currencies have a row of that name, the one of the `nth` currency from the top.
 */
export function categoryRow(name: string, on = 'Expenses', nth = 0) {
  const found = rowViews(on).filter((row) => linesIn(row)[0] === name);
  if (found[nth] === undefined)
    throw new Error(`No row for ${name} on the Insights on ${on}`);
  return found[nth];
}

/** Presses a category row of Insights, without waiting for what it opens. */
export async function pressCategoryRow(name: string, on = 'Expenses', nth = 0) {
  await fireEvent.press(categoryRow(name, on, nth));
  await settle();
}

// The category's expenses

/** The navigation bars of the screens titled `name` open on the tab `on`. */
export const categoryBars = (name: string, on = 'Expenses') =>
  navigationBars(tab(on)).filter((bar) => bar.props.title === name);

function categoryBar(name: string, on: string) {
  const bar = categoryBars(name, on).at(-1);
  if (bar === undefined)
    throw new Error(`The expenses of ${name} are not open on ${on}`);
  return bar;
}

/** The native screen of the category's expenses open on the tab `on`. */
export function categoryScreen(name: string, on = 'Expenses'): HostView {
  for (let outer = categoryBar(name, on).parent; outer; outer = outer.parent)
    if (String(outer.type) === 'RNSScreen') return outer;
  throw new Error(`The expenses of ${name} are not a screen`);
}

/** Waits until the expenses of the category `name` are open on the tab `on` and have read what they show. */
export async function expectCategory(name: string, on = 'Expenses') {
  await waitFor(() => expect(categoryBars(name, on)).toHaveLength(1));
  await settle();
}

/** Presses a category row of Insights and waits for the category's expenses. */
export async function openCategory(name: string, on = 'Expenses', nth = 0) {
  await pressCategoryRow(name, on, nth);
  await expectCategory(name, on);
}

/** Goes back from the category's expenses, as the native back button reports it on iOS. */
export async function goBackFromCategory(name: string, on = 'Expenses') {
  await act(async () => {
    await fireEvent(categoryScreen(name, on), 'dismissed', {
      nativeEvent: { dismissCount: 1 },
    });
  });
  await settle();
}

/** The lines of text on the category's expenses, top to bottom. */
export const categoryLines = (name: string, on = 'Expenses') =>
  linesIn(categoryScreen(name, on));

/** The three lines at the top of the category's expenses: its period, amount and count. */
export const categorySummary = (name: string, on = 'Expenses') =>
  categoryLines(name, on).slice(0, 3);

/** Waits until the top of the category's expenses shows `expected`: its period, amount and count. */
export const expectCategorySummary = (
  expected: string[],
  name: string,
  on = 'Expenses',
) => waitFor(() => expect(categorySummary(name, on)).toEqual(expected));

/** The headings a screen reader finds on the category's expenses, top to bottom: the dates over its cards. */
export const categoryDates = (name: string, on = 'Expenses') =>
  within(categoryScreen(name, on))
    .queryAllByRole('header')
    .map((view) => asRead(nameOf(view)));

/** The buttons the category's expenses show under their bar, top to bottom: the cards, and nothing else. */
export function categoryCards(name: string, on = 'Expenses') {
  const root = categoryScreen(name, on);
  return within(root)
    .queryAllByRole('button')
    .filter((button) => inContentOf(root, button));
}

/** The lines each card of the category's expenses shows, top to bottom. */
export const categoryCardLines = (name: string, on = 'Expenses') =>
  categoryCards(name, on).map(linesIn);

/** The titles of the cards of the category's expenses, top to bottom. */
export const categoryCardTitles = (name: string, on = 'Expenses') =>
  categoryCardLines(name, on).map(([title]) => title);

/** The card titled `title` on the category's expenses. */
export function categoryCard(name: string, title: string, on = 'Expenses') {
  const found = categoryCards(name, on).find(
    (candidate) => linesIn(candidate)[0] === title,
  );
  if (found === undefined)
    throw new Error(`No card for ${title} on the expenses of ${name}`);
  return found;
}

interface BarItem {
  title?: string;
  accessibilityLabel?: string;
}

/**
 * What the bar of the category's expenses offers besides the system's Back: the iOS bar items
 * at its left and right, and the buttons in the right of its Android header.
 */
export function categoryBarActions(name: string, on = 'Expenses') {
  const bar = categoryBar(name, on);
  const items: BarItem[] = [
    ...(bar.props.headerLeftBarButtonItems ?? []),
    ...(bar.props.headerRightBarButtonItems ?? []),
  ];
  return [
    ...items.map((item) => item.accessibilityLabel || item.title),
    ...nativeViews(/^RNSScreenStackHeaderSubview$/, bar)
      .filter((subview) => subview.props.type === 'right')
      .flatMap((subview) => within(subview).queryAllByRole('button'))
      .map(nameOf),
  ];
}

/** Goes back from the expense details open on the tab `on`, as the native back button reports it on iOS. */
export async function goBackFromDetailsOn(on: string) {
  await act(async () => {
    await fireEvent(detailScreenOn(on), 'dismissed', {
      nativeEvent: { dismissCount: 1 },
    });
  });
  await settle();
}
