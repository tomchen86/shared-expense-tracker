import { randomUUID } from 'node:crypto';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import type { SyncStamp } from '@shared-expense/domain';
import { applySyncEvents } from '../../src/sync';
import { linesIn, shownInOrder } from './ledger-expense-list-app';
import {
  detailBarsOn,
  detailLinesOn,
  detailScreenOn,
  groupCards,
} from './ledger-group-expense-app';
import { showGroup } from './group-balances-app';
import { settle } from './shell-appearance-app';
import {
  LATER,
  MINUTE,
  appDatabase,
  at,
  categoryOf,
  members,
  relayed,
} from './sync-app';
import { needsReview, reviewCount } from './sync-conflict-app';

// What the app shows of a possible duplicate (sync spec, ADR-0035): an expense of a shared
// ledger whose date, amount and currency equal those of an earlier expense that another
// phone recorded, when this phone recorded one of the two and nobody has said they are
// not duplicates. The tests add Dinner through its form, and hand the app the first event
// of an alike expense that another phone added, Supper, as the sync tests do (sync-app).

/** The line a card of a possible duplicate shows under its category (LEDGER-156.1). */
export const DUPLICATE = 'Possible duplicate';
/** What the block on its details says under that line (LEDGER-157.1). */
export const DUPLICATE_TEXT =
  'Another expense in this group has the same amount and date. If they are the same expense, delete one of them.';
export const OTHER_EXPENSE = 'OTHER EXPENSE';
export const VIEW_OTHER = 'View Other Expense';
export const NOT_A_DUPLICATE = 'Not a Duplicate';
export const DELETE_THIS = 'Delete This Expense';

/** T+120000, T+150000 and T+180000 of the sync spec's scenarios: LATER is T+60000. */
export const T120 = LATER + MINUTE;
export const T150 = LATER + 90_000;
export const T180 = LATER + 2 * MINUTE;
/** T+30000: after Brisbane became a shared ledger, before this phone's first change. */
export const T30 = LATER - 30_000;

interface Alike {
  id?: string;
  title?: string;
  /** phone-b at T+120000, later than this phone's Dinner, unless said otherwise. */
  stamp?: SyncStamp;
  amountMinor?: number;
  currency?: string;
  date?: string;
}

/**
 * The first event of an expense another phone added to Brisbane, as the spec's Supper:
 * 100.01 USD on 2026-10-30, Food & Dining, no note, paid by Blake and split between Blake
 * and Taylor in that order, so it is on your expense list too.
 */
export async function alikeCreated({
  id = randomUUID(),
  title = 'Supper',
  stamp = at(T120),
  amountMinor = 10001,
  currency = 'USD',
  date = '2026-10-30',
}: Alike = {}) {
  const ids = await members('Brisbane');
  const half = Math.floor(amountMinor / 2);
  return {
    version: 1,
    stamp,
    type: 'expense',
    id,
    units: {
      title: { value: title },
      date: { value: date },
      note: { value: null },
      category: { value: await categoryOf('Brisbane', 'Food & Dining') },
      money: {
        value: {
          amountMinor,
          currency,
          payments: [{ participant: ids.Blake, amountMinor }],
          shares: [
            { participant: ids.Blake, amountMinor: amountMinor - half },
            { participant: ids.Taylor, amountMinor: half },
          ],
        },
      },
      trashed: { value: false },
    },
  };
}

/**
 * The first event of a "not a duplicate" record that names the two expenses, as another
 * phone writes it when its user chooses Not a Duplicate (SYNC-200.1): phone-b at T+180000
 * unless said otherwise.
 */
export const distinctCreated = (
  first: string,
  second: string,
  stamp: SyncStamp = at(T180),
  id: string = randomUUID(),
) => ({
  version: 1,
  stamp,
  type: 'distinct',
  id,
  units: { expenses: { value: [first, second] } },
});

/**
 * Starts handing the app these contents as received events and does not wait: while the
 * test holds the writes (holdWrites), the app is inside the transaction that stores them
 * and stops at its first write, so whatever saves next waits behind it. Returns what
 * waits until the app has stored them, for after the writes are released.
 */
export function startReceiving(id: string, ...contents: unknown[]) {
  const stored = applySyncEvents(
    appDatabase(),
    id,
    contents.map((content) => relayed(content)),
  );
  stored.catch(() => undefined);
  return async () => {
    await act(async () => {
      await stored;
    });
    await settle();
  };
}

// Cards and the number under a group's title

/** The titles of the cards on the group's screen that show the line of a possible duplicate, top to bottom. */
export const duplicatesOn = (group: string) =>
  groupCards(group)
    .filter((shown) => linesIn(shown).includes(DUPLICATE))
    .map((shown) => linesIn(shown)[0]);

/**
 * Shows the group's screen and waits until it says that exactly the expenses titled
 * `titles` are possible duplicates: the line on their cards, top to bottom. Unless
 * `count` says otherwise, the group has no other expense to review, so the number under
 * its title is theirs, or the screen shows no such button when there are none.
 */
export async function expectDuplicates(
  group: string,
  titles: string[],
  count = titles.length,
) {
  await showGroup(group);
  await waitFor(() => expect(duplicatesOn(group)).toEqual(titles));
  await waitFor(() =>
    expect(reviewCount(group)).toBe(
      count === 0 ? undefined : needsReview(count),
    ),
  );
}

// The block on the details

/** The lines the block shows from its first line to its last button, for the other expense given. */
export const duplicateBlock = (
  other: string,
  payer: string,
  sharers: string[],
) => [
  DUPLICATE,
  DUPLICATE_TEXT,
  OTHER_EXPENSE,
  other,
  `Paid by ${payer}`,
  `Split between ${sharers.join(', ')}`,
  VIEW_OTHER,
  NOT_A_DUPLICATE,
  DELETE_THIS,
];

/** The three lines the block shows under OTHER EXPENSE on the details open on the tab; undefined while it shows no block. */
export function otherOn(tabName: string) {
  const lines = detailLinesOn(tabName);
  const from = lines.indexOf(OTHER_EXPENSE);
  return from < 0 ? undefined : lines.slice(from + 1, from + 4);
}

/** Waits until the details open on the tab `tabName` show the block, from its first line to its three buttons. */
export async function expectDuplicateBlockOn(tabName: string) {
  const whole = [
    DUPLICATE,
    DUPLICATE_TEXT,
    OTHER_EXPENSE,
    VIEW_OTHER,
    NOT_A_DUPLICATE,
    DELETE_THIS,
  ];
  await waitFor(() =>
    expect(shownInOrder(detailLinesOn(tabName), whole)).toEqual(whole),
  );
}

/** Waits until the details open on the tab `tabName` show no block of a possible duplicate. */
export const expectNoDuplicateBlockOn = (tabName: string) =>
  waitFor(() => expect(detailLinesOn(tabName)).not.toContain(DUPLICATE));

/** Waits until `count` details are open on the tab, one above the other, and the top one shows `title`. */
export async function expectDetailsStackedOn(
  tabName: string,
  count: number,
  title: string,
) {
  await waitFor(() => expect(detailBarsOn(tabName)).toHaveLength(count));
  await waitFor(() => expect(detailLinesOn(tabName)).toContain(title));
  await settle();
}

/** Goes back from the details on top on the tab `tabName`, as the native back button reports it on iOS. */
export async function goBackFromDetailsOn(tabName: string) {
  await act(async () => {
    await fireEvent(detailScreenOn(tabName), 'dismissed', {
      nativeEvent: { dismissCount: 1 },
    });
  });
  await settle();
}
