import { fireEvent, waitFor, within } from '@testing-library/react-native';
import { listUnappliedChanges, type ReceivedSyncEvent } from '../../src/sync';
import { nameOf } from './ledger-expense-app';
import { asRead, linesIn } from './ledger-expense-list-app';
import { showGroup } from './group-balances-app';
import {
  expectClosed,
  expectOpen,
  pressOnBar,
  screenOf,
} from './group-details-app';
import { settle } from './shell-appearance-app';
import {
  MINUTE,
  PHONE,
  START,
  appDatabase,
  at,
  categoryOf,
  created,
  members,
  receive,
  receiveEvents,
  relayed,
  unsent,
} from './sync-app';

// What the app does with a change of its own that no phone applies (sync spec, SYNC-350.1
// to SYNC-352.1): an event this phone uploaded and that is refused when it comes back in a
// download. The tests make one as the sync tests hand the app events (sync-app): they
// change the ledger through the app's screens, which leaves an unsent event, and hand the
// app that same event as received, uploaded by this phone, with an envelope that makes
// every phone refuse it.

type HostView = ReturnType<typeof screenOf>;
type Unsent = Awaited<ReturnType<typeof unsent>>[number];

export const HOUR = 60 * MINUTE;

/** The sheet's title (GROUPS-171.1). */
export const SHEET = 'Changes Not Applied';
export const DISMISS = 'Dismiss';
/** What a block says under its heading when the change was refused for its clock (GROUPS-171.1). */
export const CLOCK_TEXT =
  "This phone's clock was too far ahead when you made this change, so the other phones in this group didn't accept it. It was undone on this phone. Check the date and time, then make the change again.";
/** What it says for every other reason. */
export const OTHER_TEXT =
  "The other phones in this group couldn't accept this change, so it was undone on this phone. Make the change again if you still need it.";
/** What a screen reader reads after the button that counts them (GROUPS-170.1). */
export const LIST_HINT = 'Opens the list';
/** The alert when a dismissal cannot be saved (GROUPS-171.1). */
export const DISMISS_FAILED = [
  'Unable to Dismiss',
  'Your change could not be saved. Please try again.',
];

/** The headings of a block (LEDGER-230.1, GROUPS-172.1). */
export const NOT_ADDED = 'Expense not added';
export const EXPENSE_CHANGE = 'Expense change not applied';
export const GROUP_CHANGE = 'Group change not applied';
export const UNREADABLE_CHANGE = 'Change not applied';

/** What the button under a group's large title says for `count` changes (GROUPS-170.1). */
export const notApplied = (count: number) =>
  count === 1 ? "1 change wasn't applied" : `${count} changes weren't applied`;

// Lunch and Taxi, as phone-b adds them

export const LUNCH = 'b0000000-0000-4000-8000-000000000001';
export const TAXI = 'b0000000-0000-4000-8000-000000000002';
/** The stamp of Lunch's first event in these scenarios: T+10000/0/phone-b. */
export const LUNCH_STAMP = at(START + 10_000);

/** Lunch's six units: 30.00 that Casey pays, split between Taylor and Casey. */
export async function lunchUnits(overrides: Record<string, unknown> = {}) {
  const ids = await members('Brisbane');
  return {
    title: 'Lunch',
    date: '2026-10-30',
    note: null,
    category: await categoryOf('Brisbane', 'Food & Dining'),
    money: {
      amountMinor: 3000,
      currency: 'USD',
      payments: [{ participant: ids.Casey, amountMinor: 3000 }],
      shares: [
        { participant: ids.Taylor, amountMinor: 1500 },
        { participant: ids.Casey, amountMinor: 1500 },
      ],
    },
    trashed: false,
    ...overrides,
  };
}

/** "有 Lunch": hands the app phone-b's first event of Lunch, stamped T+10000/0/phone-b. */
export async function haveLunch(
  brisbane: string,
  overrides: Record<string, unknown> = {},
) {
  await receive(
    brisbane,
    created('expense', LUNCH, LUNCH_STAMP, await lunchUnits(overrides)),
  );
}

/** Taxi's first event as phone-b writes it: 25.00 that Casey pays for Taylor alone. */
export async function taxiCreated(stamp = at(START + 20_000)) {
  const ids = await members('Brisbane');
  return created('expense', TAXI, stamp, {
    title: 'Taxi',
    date: '2026-10-30',
    note: null,
    category: await categoryOf('Brisbane', 'Transportation'),
    money: {
      amountMinor: 2500,
      currency: 'USD',
      payments: [{ participant: ids.Casey, amountMinor: 2500 }],
      shares: [{ participant: ids.Taylor, amountMinor: 2500 }],
    },
    trashed: false,
  });
}

// The phone's own events, coming back

/** The event the phone wrote last and has not uploaded. */
export async function lastUnsent(): Promise<Unsent> {
  const event = (await unsent()).at(-1);
  if (event === undefined) throw new Error('The phone has no unsent event');
  return event;
}

/**
 * The unsent event `event` as it comes back in a download that every phone refuses:
 * under its own ID, uploaded by this phone, received an hour before its stamp, so it
 * does not apply for its clock (SYNC-9.1).
 */
export const asRefused = ({ id, content }: Unsent): ReceivedSyncEvent =>
  relayed(content, {
    id,
    device: PHONE,
    receivedAtMs: content.stamp.ms - HOUR,
  });

/** The same event as it comes back when it applies: received at the moment of its stamp. */
export const asReceived = ({ id, content }: Unsent): ReceivedSyncEvent =>
  relayed(content, { id, device: PHONE });

/** "自己的事件不套用": hands the app `event`, the last unsent one unless given, as refused. Returns what was handed over. */
export async function refuseOwn(groupId: string, event?: Unsent) {
  const handed = asRefused(event ?? (await lastUnsent()));
  await receiveEvents(groupId, handed);
  return handed;
}

/** "自己的事件收到了": hands the app `event`, the last unsent one unless given, as applicable. */
export async function receiveOwn(groupId: string, event?: Unsent) {
  await receiveEvents(groupId, asReceived(event ?? (await lastUnsent())));
}

/**
 * An event this phone uploaded and does not remember writing, with a new event ID:
 * `content` received at the moment of its stamp unless `receivedAtMs` says otherwise.
 */
export const uploadedHere = (content: unknown, receivedAtMs?: number) =>
  relayed(content, {
    device: PHONE,
    ...(receivedAtMs === undefined ? {} : { receivedAtMs }),
  });

/** A stamp of this phone an hour ahead of START, for an event to be refused for its clock when received at START. */
export const aheadStamp = (counter = 0) => ({
  ms: START + HOUR,
  counter,
  device: PHONE,
});

/** The changes of this phone that were not applied and are not dismissed, in order (SYNC-350.1). */
export const unapplied = () => listUnappliedChanges(appDatabase());

// The button under a group's title

/** The button on the group's screen that counts the changes that were not applied, if it shows one. */
export const notAppliedButton = (group: string): HostView | undefined =>
  within(screenOf(group))
    .queryAllByRole('button')
    .find((button) =>
      /^\d+ changes? (wasn't|weren't) applied$/.test(asRead(nameOf(button))),
    );

/** What a screen reader reads for that button; undefined while the screen shows none. */
export function notAppliedCount(group: string) {
  const button = notAppliedButton(group);
  return button === undefined ? undefined : asRead(nameOf(button));
}

/** Shows the group's screen and waits until its button counts `count` changes, or is gone when `count` is 0. */
export async function expectNotApplied(group: string, count: number) {
  await showGroup(group);
  await waitFor(() =>
    expect(notAppliedCount(group)).toBe(
      count === 0 ? undefined : notApplied(count),
    ),
  );
}

// Changes Not Applied

/** Presses the button on the group's screen, which is open, and waits for the sheet. */
export async function openSheet(group: string) {
  await waitFor(() => expect(notAppliedButton(group)).toBeDefined());
  await fireEvent.press(notAppliedButton(group)!);
  await expectOpen(SHEET);
  await settle();
}

/** Closes the sheet with Close. */
export async function closeSheet() {
  await pressOnBar(SHEET, 'Close');
  await expectClosed(SHEET);
}

/** The lines of text the open sheet shows, top to bottom. */
export const sheetLines = () => linesIn(screenOf(SHEET));

/** The sheet's blocks, top to bottom: each the lines from its heading to its Dismiss. */
export function blocks(): string[][] {
  const found: string[][] = [];
  let current: string[] = [];
  for (const line of sheetLines()) {
    current.push(line);
    if (line === DISMISS) {
      found.push(current);
      current = [];
    }
  }
  if (current.length > 0) found.push(current);
  return found;
}

/** Waits until the open sheet shows exactly these blocks, top to bottom. */
export const expectBlocks = (expected: string[][]) =>
  waitFor(() => expect(blocks()).toEqual(expected));

/** The lines a block shows between its sentence and its Dismiss: what the change was. */
export const contentOf = (block: string[]) => block.slice(2, -1);

/** The sheet's Dismiss buttons, top to bottom. */
export const dismissButtons = () =>
  within(screenOf(SHEET))
    .queryAllByRole('button')
    .filter((button) => nameOf(button) === DISMISS);

/** Presses the Dismiss of the block `index` from the top and lets the save, if any, finish. */
export async function pressDismiss(index = 0) {
  await waitFor(() => expect(dismissButtons().length).toBeGreaterThan(index));
  await fireEvent.press(dismissButtons()[index]);
  await settle();
}
