import { fireEvent, waitFor, within } from '@testing-library/react-native';
import { nameOf } from './ledger-expense-app';
import { asRead, linesIn, shownInOrder } from './ledger-expense-list-app';
import {
  addGroupExpense,
  detailLinesOn,
  detailScreenOn,
  expectDetailsOn,
  groupCard,
  groupCards,
} from './ledger-group-expense-app';
import { showGroup } from './group-balances-app';
import { goBackFrom, screenOf } from './group-details-app';
import { settle } from './shell-appearance-app';
import { YOU, members } from './sync-app';

// What the app shows of an expense that needs review (sync spec): an expense whose amount
// group this phone changed, and that an event from another phone, written without having
// seen that change, has overridden since. The tests make such an expense as the sync tests
// do (sync-app): they change an expense through its form, and hand the app the other
// phone's event.

type HostView = ReturnType<typeof screenOf>;

/** The line a card of an expense that needs review shows under its category (LEDGER-151.1). */
export const MARK = 'Your change was replaced';
/** What the mark's block on the details says under that line (LEDGER-152.1). */
export const MARK_TEXT =
  'This expense was changed on another phone before your change reached it. Choose which version to keep.';
export const KEEP_CURRENT = 'Keep Current';
export const USE_MINE = 'Use Mine';
/** What a screen reader reads after the button that counts the expenses to review (GROUPS-107.2). */
export const REVIEW_HINT = 'Opens the first one';

/** What the button under a group's large title says when `count` of its expenses need review (GROUPS-107.2). */
export const needsReview = (count: number) =>
  count === 1 ? '1 expense needs review' : `${count} expenses need review`;

/** The name of the mark's icon on each platform (LEDGER-151.1). */
export const MARK_ICON = {
  ios: 'exclamationmark.triangle.fill',
  android: 'warning',
} as const;

/** Adds Brisbane's Dinner for 100.01: Casey pays, split between Blake, Taylor and Casey in that order. */
export const addDinner = (title = 'Dinner', date?: string) =>
  addGroupExpense({
    group: 'Brisbane',
    title,
    date,
    payer: 'Casey',
    sharers: ['Blake', YOU, 'Casey'],
  });

/**
 * An amount group of a Brisbane expense: `amountMinor` USD, paid by Casey and split evenly
 * between Blake, Taylor and Casey in that order, unless `parts` says otherwise. The first
 * sharers take the minor units left over, as the form splits (LEDGER-6.1).
 */
export async function moneyOf(
  amountMinor: number,
  parts: { payer?: string; sharers?: string[]; currency?: string } = {},
) {
  const {
    payer = 'Casey',
    sharers = ['Blake', 'Taylor', 'Casey'],
    currency = 'USD',
  } = parts;
  const ids = await members('Brisbane');
  const each = Math.floor(amountMinor / sharers.length);
  const left = amountMinor - each * sharers.length;
  return {
    amountMinor,
    currency,
    payments: [{ participant: ids[payer], amountMinor }],
    shares: sharers.map((name, index) => ({
      participant: ids[name],
      amountMinor: each + (index < left ? 1 : 0),
    })),
  };
}

// Cards and the number under a group's title

/** The titles of the cards on the group's screen that show the mark, top to bottom. */
export const markedOn = (group: string) =>
  groupCards(group)
    .filter((shown) => linesIn(shown).includes(MARK))
    .map((shown) => linesIn(shown)[0]);

/** The button on the group's screen that counts its expenses to review, if it shows one. */
export const reviewButton = (group: string): HostView | undefined =>
  within(screenOf(group))
    .queryAllByRole('button')
    .find((button) => /^\d+ expenses? needs? review$/.test(nameOf(button)));

/** What a screen reader reads for that button; undefined while the screen shows none. */
export function reviewCount(group: string) {
  const button = reviewButton(group);
  return button === undefined ? undefined : asRead(nameOf(button));
}

/**
 * Shows the group's screen and waits until it says that exactly the expenses titled
 * `titles` need review: the mark on their cards, top to bottom, and their number under
 * the group's title, or no such button when there are none.
 */
export async function expectToReview(group: string, titles: string[]) {
  await showGroup(group);
  await waitFor(() => expect(markedOn(group)).toEqual(titles));
  expect(reviewCount(group)).toBe(
    titles.length === 0 ? undefined : needsReview(titles.length),
  );
}

// The mark's block on the details

/** The lines the details show above the expense's title `title`: the mark's block, or none. */
export const blockOf = (lines: string[], title: string) =>
  lines.slice(0, Math.max(lines.indexOf(title), 0));

/** The three lines the block shows under CURRENT and under YOURS. */
export function sidesIn(lines: string[]) {
  const side = (heading: string) => {
    const at = lines.indexOf(heading);
    return at < 0 ? undefined : lines.slice(at + 1, at + 4);
  };
  return { current: side('CURRENT'), yours: side('YOURS') };
}

/** What a side of the block shows for an amount group: its amount, who paid, and who shares it. */
export const sideOf = (amount: string, payer: string, sharers: string[]) => [
  amount,
  `Paid by ${payer}`,
  `Split between ${sharers.join(', ')}`,
];

/** How the block names the sharers of a Dinner nobody changed the split of. */
export const SHARERS = ['Blake', YOU, 'Casey'];

/** Waits until the details open on the tab `tabName` show the mark's block from its first line to its two buttons. */
export async function expectBlockOn(tabName: string) {
  const whole = [MARK, MARK_TEXT, 'CURRENT', 'YOURS', KEEP_CURRENT, USE_MINE];
  await waitFor(() =>
    expect(shownInOrder(detailLinesOn(tabName), whole)).toEqual(whole),
  );
}

/** The button named `name` of the mark's block on the details open on the tab `tabName`. */
export const blockButtonOn = (tabName: string, name: string) =>
  within(detailScreenOn(tabName))
    .queryAllByRole('button')
    .find((button) => nameOf(button) === name);

/** Presses that button and lets the save, if any, finish. Fails while the block does not show it. */
export async function pressInBlockOn(tabName: string, name: string) {
  await waitFor(() => expect(blockButtonOn(tabName, name)).toBeDefined());
  await fireEvent.press(blockButtonOn(tabName, name)!);
  await settle();
}

/** Opens the details of the expense titled `title` from its card on the group's screen, on the Groups tab. */
export async function openFromGroup(group: string, title: string) {
  await showGroup(group);
  await waitFor(() => expect(() => groupCard(group, title)).not.toThrow());
  await fireEvent.press(groupCard(group, title));
  await expectDetailsOn('Groups', title);
}

/**
 * The two sides the mark's block shows for the expense titled `title`, read on its
 * details opened from the group's screen; goes back to that screen afterwards.
 */
export async function sidesOf(group: string, title: string) {
  await openFromGroup(group, title);
  await expectBlockOn('Groups');
  const sides = sidesIn(detailLinesOn('Groups'));
  await goBackFrom('Expense');
  return sides;
}
