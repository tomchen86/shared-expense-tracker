import { StyleSheet } from 'react-native';
import { act, fireEvent, waitFor, within } from '@testing-library/react-native';
import { nameOf, phoneDatabase, setPhoneClock } from './ledger-expense-app';
import { settle } from './shell-appearance-app';
import { nativeViews, navigationBars, startApp, tab } from './shell-tabs-app';
import type { Database, SqlValue } from '../../src/storage';

// The expense list tests start the app as the expense form tests do
// (ledger-expense-app) and add expenses through New Expense. They read the expense
// list and an expense's details from what the app shows: the lines of text, top to
// bottom, the color dots, the buttons and the names a screen reader reads, and the items the
// details hand to the native navigation bar on iOS. A test can hold the app's reads
// to see a screen before its data arrives.

type HostView = ReturnType<typeof nativeViews>[number];

export const EMPTY_LIST =
  'No expenses to display. Add a personal expense or get involved in a group expense.';
export const NOT_FOUND = 'Expense not found.';
export const NO_EXPENSE_ID = '00000000-0000-4000-8000-000000000000';

// The phone database

let beforeRead: (sql: string) => Promise<void> = () => Promise.resolve();
const damaged = () => new Error('database disk image is malformed');

/** The phone database in `file`, as ledger-expense-app opens it, its reads behind a gate. */
export function phoneDatabaseWithReads(file: string): Database {
  const database = phoneDatabase(file);
  return {
    ...database,
    all: async <T,>(sql: string, parameters?: readonly SqlValue[]) => {
      await beforeRead(sql);
      return database.all<T>(sql, parameters);
    },
  };
}

export function allowReads() {
  beforeRead = () => Promise.resolve();
}

/**
 * Fails every read outside a transaction, or only those of the table `table`, as
 * a damaged database does, until the test allows reads again.
 */
export function failReads(table?: string) {
  beforeRead = (sql) =>
    table === undefined || new RegExp(`\\b${table}\\b`).test(sql)
      ? Promise.reject(damaged())
      : Promise.resolve();
}

/** Holds every read outside a transaction until the test lets the reads through or fails them. */
export function holdReads() {
  let release!: () => void;
  let fail!: () => void;
  const held = new Promise<void>((resolve, reject) => {
    release = resolve;
    fail = () => reject(damaged());
  });
  held.catch(() => undefined);
  beforeRead = () => held;
  return {
    release: () => act(async () => release()),
    fail: () => act(async () => fail()),
  };
}

/** Starts the app at `url`, in Taipei on 2026-10-30, as startExpenses does at `/`. */
export async function startExpensesAt(url: string) {
  const app = await startApp(url);
  setPhoneClock('Asia/Taipei', '2026-10-30T04:00:00Z');
  await settle();
  return app;
}

// Texts

const textOf = (node: HostView | string): string =>
  typeof node === 'string' ? node : node.children.map(textOf).join('');

/** A text as a reader sees it: any run of spaces, no-break ones too, as one space. */
export const asRead = (text: string) => text.replace(/\s+/g, ' ').trim();

function insideText(view: HostView, root: HostView) {
  for (let outer = view.parent; outer && outer !== root; outer = outer.parent)
    if (String(outer.type) === 'Text') return true;
  return false;
}

/** The lines of text shown inside `root`, top to bottom. */
export const linesIn = (root: HostView) =>
  root
    .queryAll(
      (view) => String(view.type) === 'Text' && !insideText(view, root),
      { includeSelf: true },
    )
    .flatMap((view) => textOf(view).split('\n'))
    .map(asRead)
    .filter((line) => line !== '');

/**
 * How much of `expected`, from its start, `lines` shows in this order; a line may
 * hold more than one of them.
 */
export function shownInOrder(
  lines: readonly string[],
  expected: readonly string[],
) {
  const shown: string[] = [];
  let line = 0;
  let from = 0;
  for (const text of expected) {
    while (line < lines.length && !lines[line].includes(text, from)) {
      line += 1;
      from = 0;
    }
    if (line === lines.length) break;
    from = lines[line].indexOf(text, from) + text.length;
    shown.push(text);
  }
  return shown;
}

// The expense list

/** The bottom screen of the Expenses tab's stack: the expense list. */
export const expensesRoot = () =>
  nativeViews(/^RNSScreen$/, tab('Expenses'))[0];

/** The cards on the expense list, top to bottom: its buttons besides the + button. */
export const cards = () =>
  within(expensesRoot())
    .queryAllByRole('button')
    .filter((button) => nameOf(button) !== 'Add expense');

/** The card whose first line is `title`. */
export function card(title: string) {
  const found = cards().find((candidate) => linesIn(candidate)[0] === title);
  if (found === undefined) throw new Error(`No card for ${title}`);
  return found;
}

/** The titles of the cards, top to bottom. */
export const cardTitles = () => cards().map((shown) => linesIn(shown)[0]);

/** What a screen reader reads for a card: its name. */
export const readOut = (shown: HostView) => asRead(nameOf(shown));

/** The Your Total Share lines on the expense list, top to bottom. */
export const totalShareLines = () =>
  linesIn(expensesRoot()).filter((line) => line.startsWith('Your Total Share'));

// Category color dots

/** The palette (CATEGORIES-1.1). */
const PALETTE = [
  '#D81B60',
  '#1E88E5',
  '#FBC02D',
  '#00897B',
  '#8E24AA',
  '#F4511E',
  '#3949AB',
  '#6D4C41',
  '#757575',
  '#43A047',
  '#00ACC1',
  '#C62828',
  '#9E9D24',
];

function backgroundOf(view: HostView): string | undefined {
  const color = StyleSheet.flatten(view.props.style)?.backgroundColor;
  return typeof color === 'string' ? color.toUpperCase() : undefined;
}

/** The color dots inside `root`, top to bottom: every view filled with a palette color is one. */
export const colorDots = (root: HostView) =>
  nativeViews(/./, root).filter((view) =>
    PALETTE.includes(backgroundOf(view) ?? ''),
  );

/** The colors of the color dots inside `root`, top to bottom. */
export const dotColors = (root: HostView) => colorDots(root).map(backgroundOf);

/** Whether a screen reader skips `view`: it has no name and is no accessibility element. */
export const isUnread = (view: HostView) =>
  nameOf(view) === '' && view.props.accessible !== true;

/** The opacity `view` is drawn with inside `root`: its own and that of every view around it up to `root`. */
export function opacityIn(root: HostView, view: HostView) {
  let opacity = 1;
  for (let at: HostView | null = view; at; at = at.parent) {
    opacity *= StyleSheet.flatten(at.props.style)?.opacity ?? 1;
    if (at === root) break;
  }
  return opacity;
}

/** The first native subview of `view`; components that render nothing add none. */
function firstSubview(view: HostView): HostView | undefined {
  for (const child of view.children) {
    if (typeof child === 'string') return undefined;
    if (typeof child.type === 'string') return child;
    const subview = firstSubview(child);
    if (subview) return subview;
  }
  return undefined;
}

/** UIKit ties a large title to the scroll view it reaches through first subviews. */
export function scrollViewTheTitleFollows() {
  let view = firstSubview(expensesRoot());
  while (view !== undefined && String(view.type) !== 'RCTScrollView') {
    view = firstSubview(view);
  }
  return view;
}

// The details

/** The navigation bars of the expense details open on the Expenses tab. */
export const detailBars = () =>
  navigationBars(tab('Expenses')).filter(
    (bar) => bar.props.title === 'Expense',
  );

function detailBar() {
  const bar = detailBars().at(-1);
  if (bar === undefined) throw new Error('No expense details are open');
  return bar;
}

/** The native screen of the open details. */
export function detailScreen(): HostView {
  for (let outer = detailBar().parent; outer; outer = outer.parent)
    if (String(outer.type) === 'RNSScreen') return outer;
  throw new Error('The details are not a screen');
}

/** The lines of text on the open details, top to bottom. */
export const detailLines = () => linesIn(detailScreen());

export async function expectDetails(title: string) {
  await waitFor(() => expect(detailBars()).toHaveLength(1));
  await waitFor(() => expect(detailLines()).toContain(title));
  await settle();
}

/** Opens the details of the expense titled `title` from its card. */
export async function openDetails(title: string) {
  await fireEvent.press(card(title));
  await expectDetails(title);
}

/** Goes back from the details, as the native back button reports it on iOS. */
export async function goBackFromDetails() {
  await act(async () => {
    await fireEvent(detailScreen(), 'dismissed', {
      nativeEvent: { dismissCount: 1 },
    });
  });
  await settle();
}

interface BarItem {
  type: string;
  title?: string;
  accessibilityLabel?: string;
  variant?: string;
  disabled?: boolean;
  buttonId?: string;
}

const rightBarItems = (): BarItem[] =>
  detailBar().props.headerRightBarButtonItems ?? [];

/** The iOS bar items at the right of the details' navigation bar, from the trailing edge. */
export const detailBarItems = () =>
  rightBarItems().map((item) => ({
    type: item.type,
    title: item.title,
    variant: item.variant ?? 'plain',
  }));

/** The Android header buttons at the right of the details' bar, left to right. */
export const detailHeaderButtons = () =>
  nativeViews(/^RNSScreenStackHeaderSubview$/, detailBar())
    .filter((subview) => subview.props.type === 'right')
    .flatMap((subview) => within(subview).queryAllByRole('button'));

/** The details' Edit, as an iOS bar item or as a button in the header. */
function editItem() {
  const item = rightBarItems().find(
    (candidate) =>
      candidate.type === 'button' &&
      (candidate.accessibilityLabel || candidate.title) === 'Edit',
  );
  const button = within(detailBar()).queryByRole('button', { name: 'Edit' });
  return { item, button };
}

export const hasEdit = () => {
  const { item, button } = editItem();
  return item !== undefined || button !== null;
};

/** Presses Edit on the details, as the native bar reports a press on iOS. */
export async function pressEdit() {
  const { item, button } = editItem();
  if (item !== undefined) {
    if (!item.disabled)
      await fireEvent(detailBar(), 'pressHeaderBarButtonItem', {
        nativeEvent: { buttonId: item.buttonId },
      });
  } else if (button !== null) await fireEvent.press(button);
  else throw new Error('No Edit on the details');
}
