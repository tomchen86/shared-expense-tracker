import { AccessibilityInfo, Alert } from 'react-native';
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';
import { doAction, nameOf } from './ledger-expense-app';
import { card, cards, linesIn } from './ledger-expense-list-app';
import { contentButtons, settingsRoot } from './group-archive-app';
import {
  alertsShown,
  expectOpen,
  goBackFrom,
  pressAlertButton,
} from './group-details-app';
import { settle } from './shell-appearance-app';
import {
  TAB_NAMES,
  nativeViews,
  navigationBars,
  tab,
  tapTab,
} from './shell-tabs-app';

// The trash tests start the app as the expense list tests do and move expenses to
// the trash through the card's Delete expense action, which Jest can deliver;
// swiping a card to show Delete is a gesture only the E2E flow makes (ADR-0008).
// They read the Undo notice wherever the app shows it, open Trash from its row on
// the Settings root, and find the details and the read-only details by the
// navigation bars titled Expense on the Expenses and Settings tabs.

type HostView = ReturnType<typeof tab>;

export const MOVED = 'Moved to Trash';
export const NO_DELETED = 'No deleted expenses.';
export const IN_TRASH = 'This expense is in the Trash.';
export const TRASH_FAILED = [
  'Unable to Update Trash',
  'Your change could not be saved. Please try again.',
];
export const DELETE_EXPENSE = [
  'Delete Expense?',
  'This permanently deletes the expense.',
];
export const EMPTY_TRASH = [
  'Empty Trash?',
  'This permanently deletes the expenses in the Trash.',
];

/** What the screen reader says when the expense titled `title` moves to the trash. */
export const movedAnnouncement = (title: string) =>
  `${title} moved to Trash. Undo available.`;

const textOf = (view: HostView): string =>
  view.children
    .map((child) => (typeof child === 'string' ? child : textOf(child)))
    .join('');

const isInside = (view: HostView, root: HostView) => {
  for (let node = view.parent; node; node = node.parent)
    if (node === root) return true;
  return false;
};

// The screen reader and the clock

const listeners = new Map<string, Set<(enabled: boolean) => void>>();

/** Whether VoiceOver or TalkBack is on when the app asks; keeps the app's listeners for changes. */
export function fakeScreenReader(enabled: boolean) {
  listeners.clear();
  jest
    .mocked(AccessibilityInfo.isScreenReaderEnabled)
    .mockImplementation(() => Promise.resolve(enabled));
  jest.mocked(AccessibilityInfo.addEventListener).mockImplementation(((
    event: string,
    handler: (enabled: boolean) => void,
  ) => {
    const handlers = listeners.get(event) ?? new Set();
    listeners.set(event, handlers);
    handlers.add(handler);
    return {
      remove: () => {
        handlers.delete(handler);
      },
    };
  }) as typeof AccessibilityInfo.addEventListener);
}

/** The user turns VoiceOver or TalkBack on or off while the app runs. */
export async function changeScreenReader(enabled: boolean) {
  jest
    .mocked(AccessibilityInfo.isScreenReaderEnabled)
    .mockImplementation(() => Promise.resolve(enabled));
  await act(async () =>
    listeners
      .get('screenReaderChanged')
      ?.forEach((listener) => listener(enabled)),
  );
}

/** What the app asked the screen reader to say, in order. */
export const announcements = () =>
  [
    ...jest.mocked(AccessibilityInfo.announceForAccessibility).mock.calls,
    ...jest.mocked(AccessibilityInfo.announceForAccessibilityWithOptions).mock
      .calls,
  ].map(([message]) => message);

/** Moves the faked clock on by `ms` milliseconds. */
export const wait = (ms: number) => act(() => jest.advanceTimersByTime(ms));

// Cards on the expense list

interface ScreenReaderAction {
  name: string;
  label?: string;
}

const actionsOf = (view: HostView): ScreenReaderAction[] =>
  view.props.accessibilityActions ?? [];

/** What a screen reader offers for the card: the labels of its actions. */
export const actionLabels = (view: HostView) =>
  actionsOf(view).map((action) => action.label ?? action.name);

/** Uses the Delete expense action of the card titled `title`, as VoiceOver or TalkBack does. */
export async function deleteByAction(title: string) {
  const view = card(title);
  const action = actionsOf(view).find(
    (candidate) => (candidate.label ?? candidate.name) === 'Delete expense',
  );
  if (action === undefined)
    throw new Error(`The card of ${title} has no Delete expense action`);
  await fireEvent(view, 'accessibilityAction', {
    nativeEvent: { actionName: action.name },
  });
  await settle();
}

/** Waits until the expense list shows exactly the cards titled `titles`, top to bottom. */
export const expectCards = (titles: string[]) =>
  waitFor(() =>
    expect(cards().map((shown) => linesIn(shown)[0])).toEqual(titles),
  );

// The Undo notice

/** Whether the app shows the Undo notice anywhere. */
export const noticeShown = () => screen.queryByText(MOVED) !== null;

/** The Undo button of the notice for the expense titled `title`, if the app shows one. */
export const undoButton = (title: string) =>
  screen.queryByRole('button', { name: `Undo deletion of ${title}` });

/** The view that holds both the notice's text and its Undo button. */
export function noticeView() {
  const text = screen.getByText(MOVED);
  for (let view = text.parent; view; view = view.parent)
    if (
      within(view)
        .queryAllByRole('button')
        .some((button) => nameOf(button).startsWith('Undo deletion of '))
    )
      return view;
  throw new Error('The notice has no Undo button');
}

/** The lines of text on the notice, in order. */
export const noticeLines = () => linesIn(noticeView());

/** Whether the notice is part of what the tab named `name` shows: outside every tab, or inside that one. */
export function noticeShownOn(name: string) {
  const text = screen.queryByText(MOVED);
  if (text === null) return false;
  const owners = TAB_NAMES.filter((other) => isInside(text, tab(other)));
  return owners.length === 0 || owners.includes(name);
}

/** Presses Undo on the notice for the expense titled `title` and lets the save, if any, finish. */
export async function pressUndo(title: string) {
  const button = undoButton(title);
  if (button === null) throw new Error(`No Undo for ${title}`);
  await fireEvent.press(button);
  await settle();
}

// Bars titled Expense: the details on the Expenses tab or on a group's tab, the
// read-only details on Settings

type ExpenseTab = 'Expenses' | 'Groups' | 'Settings';

interface BarMenuItem {
  type: string;
  title?: string;
  menuId?: string;
  disabled?: boolean;
  destructive?: boolean;
}

interface BarItem {
  type: string;
  title?: string;
  accessibilityLabel?: string;
  variant?: string;
  icon?: { type?: string; name?: string };
  menu?: { items: BarMenuItem[] };
}

/** The navigation bars titled Expense on the tab, bottom first. */
export const expenseBars = (on: ExpenseTab) =>
  navigationBars(tab(on)).filter((bar) => bar.props.title === 'Expense');

function expenseBar(on: ExpenseTab) {
  const bar = expenseBars(on).at(-1);
  if (bar === undefined) throw new Error(`No Expense is open on ${on}`);
  return bar;
}

/** The native screen of the open details on the tab. */
export function expenseScreen(on: ExpenseTab): HostView {
  for (let view = expenseBar(on).parent; view; view = view.parent)
    if (String(view.type) === 'RNSScreen') return view;
  throw new Error('The details are not a screen');
}

/** The lines of text on the open details on the tab, top to bottom. */
export const expenseLines = (on: ExpenseTab) => linesIn(expenseScreen(on));

const rightItems = (on: ExpenseTab): BarItem[] =>
  expenseBar(on).props.headerRightBarButtonItems ?? [];

/** The iOS bar items at the right of the open details' bar on the tab, from the trailing edge. */
export const expenseBarItems = (on: ExpenseTab) =>
  rightItems(on).map((item) =>
    item.type === 'menu'
      ? {
          menu: item.accessibilityLabel,
          icon: item.icon?.type === 'sfSymbol' ? item.icon.name : item.icon,
          items: (item.menu?.items ?? []).map((entry) => ({
            title: entry.title,
            destructive: entry.destructive === true,
          })),
        }
      : {
          button: item.accessibilityLabel || item.title,
          variant: item.variant,
        },
  );

/** The items of the Expense actions menu on the open details' bar on the tab, as iOS shows them. */
export const expenseMenuItems = (on: ExpenseTab) =>
  rightItems(on)
    .filter((item) => item.type === 'menu')
    .flatMap((item) => item.menu?.items ?? [])
    .map((entry) => ({
      title: entry.title,
      disabled: entry.disabled === true,
    }));

/** The Android header buttons at the right of the open details' bar on the tab, left to right. */
export const expenseHeaderButtons = (on: ExpenseTab) =>
  nativeViews(/^RNSScreenStackHeaderSubview$/, expenseBar(on))
    .filter((subview) => subview.props.type === 'right')
    .flatMap((subview) => within(subview).queryAllByRole('button'));

/** Whether the open details' bar on the tab offers the Expense actions menu, on iOS or Android. */
export const hasExpenseActions = (on: ExpenseTab) =>
  rightItems(on).some(
    (item) =>
      item.type === 'menu' && item.accessibilityLabel === 'Expense actions',
  ) ||
  within(expenseBar(on)).queryByRole('button', { name: 'Expense actions' }) !==
    null;

/**
 * Chooses `action` in the Expense actions menu of the open details on the tab: an
 * iOS menu item, as the native menu reports it, or a button of the Android dialog.
 */
export async function chooseExpenseAction(on: ExpenseTab, action: string) {
  const bar = expenseBar(on);
  const entry = rightItems(on)
    .flatMap((item) => item.menu?.items ?? [])
    .find((candidate) => candidate.title === action);
  if (entry !== undefined) {
    if (!entry.disabled)
      await fireEvent(bar, 'pressHeaderBarButtonMenuItem', {
        nativeEvent: { menuId: entry.menuId },
      });
    await settle();
    return;
  }
  await fireEvent.press(
    within(bar).getByRole('button', { name: 'Expense actions' }),
  );
  await settle();
  await pressAlertButton(action);
}

/** The buttons of the last alert, as [text, style]. */
export const lastAlertButtonStyles = () =>
  (jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] ?? []).map(
    ({ text, style }) => [text, style],
  );

// Settings and Trash

/** The Trash row on the Settings root, found by the text it shows. */
export function trashRow() {
  const label = within(settingsRoot()).getByText('Trash');
  for (let view = label.parent; view; view = view.parent)
    if (
      view.props.accessibilityRole === 'button' ||
      view.props.role === 'button'
    )
      return view;
  throw new Error('Trash is not in a button');
}

/** The numbers that the Trash row shows. */
export const trashRowCounts = () =>
  within(trashRow())
    .queryAllByText(/^\d+$/)
    .map((view) => textOf(view));

const trashIsOpen = () =>
  navigationBars(tab('Settings')).some((bar) => bar.props.title === 'Trash');

/** Selects Settings and opens Trash from its row on the Settings root, unless Trash is open there. */
export async function openTrash() {
  await tapTab('Settings');
  if (!trashIsOpen()) {
    await fireEvent.press(within(settingsRoot()).getByText('Trash'));
    await settle();
  }
  await expectOpen('Trash');
}

/** The buttons Trash shows itself, top to bottom. */
const trashButtons = () => contentButtons('Trash');

/** The cards on Trash, top to bottom: its buttons besides Empty Trash. */
export const trashCards = () =>
  trashButtons().filter((button) => nameOf(button) !== 'Empty Trash');

/** The titles of the cards on Trash, top to bottom. */
export const trashTitles = () => trashCards().map((shown) => linesIn(shown)[0]);

/** The card on Trash whose first line is `title`. */
export function trashCard(title: string) {
  const found = trashCards().find(
    (candidate) => linesIn(candidate)[0] === title,
  );
  if (found === undefined) throw new Error(`No card for ${title} on Trash`);
  return found;
}

/** The names of the buttons Trash shows itself, top to bottom. */
export const trashButtonNames = () => trashButtons().map(nameOf);

/** The lines of text Trash shows, top to bottom. */
export function trashLines() {
  const bar = navigationBars(tab('Settings')).find(
    (candidate) => candidate.props.title === 'Trash',
  );
  if (bar === undefined) throw new Error('Trash is not open');
  for (let view = bar.parent; view; view = view.parent)
    if (String(view.type) === 'RNSScreen') return linesIn(view);
  throw new Error('Trash is not a screen');
}

/** Waits until Trash shows exactly the cards titled `titles`, top to bottom. */
export const expectTrash = (titles: string[]) =>
  waitFor(() => expect(trashTitles()).toEqual(titles));

/** Presses Empty Trash on Trash, which asks first. */
export async function pressEmptyTrash() {
  const button = trashButtons().find(
    (candidate) => nameOf(candidate) === 'Empty Trash',
  );
  if (button === undefined) throw new Error('Trash has no Empty Trash');
  await fireEvent.press(button);
  await settle();
}

/** Opens the read-only details of the expense titled `title` from its card on Trash. */
export async function openTrashed(title: string) {
  await waitFor(() => expect(trashTitles()).toContain(title));
  await fireEvent.press(trashCard(title));
  await waitFor(() => expect(expenseBars('Settings')).toHaveLength(1));
  await waitFor(() => expect(expenseLines('Settings')).toContain(title));
  await settle();
}

/** Presses Restore on the open read-only details and lets the save, if any, finish. */
export async function pressRestore() {
  await fireEvent.press(
    within(expenseScreen('Settings')).getByRole('button', { name: 'Restore' }),
  );
  await settle();
}

/** Opens the read-only details of `title` from Trash and restores it. */
export async function restoreFromTrash(title: string) {
  await openTrash();
  await openTrashed(title);
  await pressRestore();
}

/** Goes back from the open read-only details, as the native back button reports it on iOS. */
export async function goBackFromTrashed() {
  await act(async () => {
    await fireEvent(expenseScreen('Settings'), 'dismissed', {
      nativeEvent: { dismissCount: 1 },
    });
  });
  await settle();
}

// Manage Categories

/**
 * Removes the category named `name` in Manage Categories, and returns the alert it
 * shows as [title, message]; then closes it with Cancel and goes back to Expenses.
 */
export async function removeCategory(name: string) {
  await tapTab('Settings');
  await fireEvent.press(within(settingsRoot()).getByText('Manage Categories'));
  await expectOpen('Manage Categories');
  await settle();
  const before = alertsShown().length;
  await doAction(tab('Settings'), name, 'Remove');
  const shown = alertsShown().slice(before);
  if (shown.length !== 1)
    throw new Error(`Removing ${name} showed ${shown.length} alerts`);
  await pressAlertButton('Cancel');
  await goBackFrom('Manage Categories');
  await tapTab('Expenses');
  await settle();
  return shown[0];
}

/** The open list of where Move Expenses… can move the expenses of `name`: a screen with its title, or the view around a header with it. */
function moveList(name: string): HostView | undefined {
  const title = `Move ${name} Expenses`;
  const bar = navigationBars()
    .filter((candidate) => candidate.props.title === title)
    .at(-1);
  if (bar !== undefined)
    for (let view = bar.parent; view; view = view.parent)
      if (/^RNS(Modal)?Screen$/.test(String(view.type))) return view;
  const header = screen.queryAllByRole('header', { name: title }).at(-1);
  for (let outer = header?.parent; outer; outer = outer.parent)
    if (within(outer).queryAllByRole('button').length > 1) return outer;
  return undefined;
}

/**
 * Removes the category named `name` in Manage Categories, chooses Move Expenses…
 * and then `target`, and leaves Manage Categories open.
 */
export async function moveCategoryExpenses(name: string, target: string) {
  await tapTab('Settings');
  await fireEvent.press(within(settingsRoot()).getByText('Manage Categories'));
  await expectOpen('Manage Categories');
  await settle();
  await doAction(tab('Settings'), name, 'Remove');
  await pressAlertButton('Move Expenses…');
  await waitFor(() => expect(moveList(name)).toBeDefined());
  await settle();
  await fireEvent.press(
    within(moveList(name)!).getByRole('button', { name: target }),
  );
  await settle();
  await waitFor(() => expect(moveList(name)).toBeUndefined());
}
