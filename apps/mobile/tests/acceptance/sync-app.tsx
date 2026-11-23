import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ActionSheetIOS, Alert, StyleSheet } from 'react-native';
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';
import { router } from 'expo-router';
import {
  checkSyncEvent,
  compareSyncStamps,
  type SyncEvent,
  type SyncStamp,
} from '@shared-expense/domain';
import {
  applySyncEvents,
  listRefusedSyncEvents,
  listUnsentSyncEvents,
  shareGroup,
  type ReceivedSyncEvent,
} from '../../src/sync';
import { listCategories } from '../../src/categories';
import { listFormerMembers } from '../../src/groups';
import type { Database } from '../../src/storage';
import { openNodeDatabase } from '../../src/storage/node';
import {
  doAction,
  expectFormClosed,
  nameOf,
  openEditExpense,
  press,
  resetPhone,
  storedExpenses,
} from './ledger-expense-app';
import {
  PALETTE,
  allowReads,
  linesIn,
  phoneDatabaseWithReads,
} from './ledger-expense-list-app';
import {
  categoryIn,
  startWithGroups,
  storedGroup,
} from './ledger-group-expense-app';
import {
  alertsShown,
  expectClosed,
  goBackFrom,
  groupNameField,
  openGroup,
  openMembers,
  openRenameGroup,
  pressAlertButton,
  pressOnBar,
} from './group-details-app';
import {
  chooseExpenseAction,
  openTrash,
  openTrashed,
} from './ledger-trash-app';
import { localData } from './groups-app';
import { allowWrites, settle } from './shell-appearance-app';
import {
  nativeViews,
  navigationBarTitles,
  navigationBars,
  push,
  tab,
  tapTab,
} from './shell-tabs-app';

// The sync tests start the whole app as the group expense tests do
// (ledger-group-expense-app) and change its data as a person would, through its
// screens. Around the app they stand in for what its sync and its first Invite will
// do, through the sync capability's own functions: they make a group a shared ledger
// (shareGroup), read the events the phone has not uploaded yet
// (listUnsentSyncEvents), hand the app events another phone wrote (applySyncEvents),
// and read the ones it did not apply (listRefusedSyncEvents). What they hand the app
// goes through the app's own database connection, as its sync will, so the screens
// that are open hear of it. The phone's clock is Jest's faked one: it stands still
// unless a test moves it.

type HostView = ReturnType<typeof nativeViews>[number];

/** This phone's device ID, and another phone's. */
export const PHONE = 'phone-a';
export const OTHER = 'phone-b';

/** When the app starts (startExpenses): noon in Taipei on 2026-10-30. */
export const START = Date.parse('2026-10-30T04:00:00Z');
export const MINUTE = 60_000;
/** A minute after the start, where startShared leaves the clock. */
export const LATER = START + MINUTE;

/** Brisbane, with Casey and Blake added after you. */
export const BRISBANE = { Brisbane: ['Casey', 'Blake'] };
/** You as the app's lists name you. */
export const YOU = 'Taylor (You)';

/** The alert for an expense whose event would be too large (SYNC-27.1). */
export const EXPENSE_TOO_LARGE = [
  'Unable to Save Expense',
  'This expense is too large to sync. Shorten the title or note and try again.',
];
/** What the alert says for a group or member name whose event would be too large (SYNC-27.1). */
export const NAME_TOO_LONG =
  'This name is too long to sync. Shorten it and try again.';

/** The alert when archiving, restoring, deleting or moving a category cannot be saved (CATEGORIES-41.1). */
export const CATEGORY_UPDATE_FAILED = [
  'Unable to Update Category',
  'Your change could not be saved. Please try again.',
];

/** What Members shows in place of Add Member while a shared ledger has 20 members or more (GROUPS-105.1). */
export const MEMBER_LIMIT_NOTE = 'A shared group can have up to 20 members.';

/** An event's size (sync spec): its content as JSON in UTF-8, plus the 41 bytes encryption adds. */
export const encryptedSize = (content: unknown) =>
  Buffer.byteLength(JSON.stringify(content), 'utf8') + 41;

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// The phone

let directory = '';
let file = '';
let phone: Database | undefined;

/**
 * Gives each test of the file that calls it a phone database file of its own, with
 * writes and reads allowed, alerts and iOS action sheets recorded instead of shown,
 * and the phone as resetPhone leaves it. The test file itself replaces
 * `openPhoneDatabase` with `openPhone`, as Jest needs.
 */
export function eachTestGetsAPhone(prefix: string) {
  beforeEach(() => {
    jest.clearAllMocks();
    directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    file = path.join(directory, 'app.db');
    phone = undefined;
    allowWrites();
    allowReads();
    resetPhone();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(directory, { recursive: true, force: true });
  });
}

/** Opens the running test's phone database for the app, and keeps the connection for what the tests hand the app. */
export function openPhone(): Database {
  phone = phoneDatabaseWithReads(file);
  return phone;
}

/** Every row of every table of the phone database, read without the app. */
export const everything = () => localData(file);

/** The app's own connection to the running test's phone database, for what a test hands the app. */
export function appDatabase(): Database {
  if (phone === undefined) throw new Error('The app has not opened its data');
  return phone;
}

/** Sets the phone's clock, without running any timer. */
export function setClock(ms: number) {
  jest.setSystemTime(ms);
}

async function read<T>(query: (database: Database) => Promise<T>) {
  const database = openNodeDatabase(file, { readOnly: true });
  try {
    return await query(database);
  } finally {
    await database.close();
  }
}

// Shared ledgers

/** The stored group named `group`, read through listGroups. */
export const groupNamed = (group: string) => storedGroup(file, group);

/** The ID of the group named `group`. */
export const groupId = async (group: string) => (await groupNamed(group)).id;

/** Makes the group named `group` a shared ledger on this phone, as its first Invite will. */
export async function share(group: string) {
  const id = await groupId(group);
  await act(async () => {
    await shareGroup(appDatabase(), { groupId: id, device: PHONE });
  });
  await settle();
  return id;
}

/** Tries to make the group a shared ledger; the error it failed with, if it failed. */
export async function tryShare(group: string): Promise<unknown> {
  try {
    await share(group);
    return undefined;
  } catch (error) {
    await settle();
    return error;
  }
}

/**
 * Starts the app with `groups`, each with its members (startWithGroups), makes
 * Brisbane a shared ledger at START, and leaves the clock a minute later, so the
 * changes a test makes are stamped LATER, from counter 0.
 */
export async function startShared(
  groups: Record<string, readonly string[]> = BRISBANE,
) {
  const app = await startWithGroups(groups);
  await share('Brisbane');
  setClock(LATER);
  return app;
}

/** The member IDs of the group named `group`, by name: its members and its former members. */
export async function members(group: string) {
  const { id, members: current } = await groupNamed(group);
  const former = await read((database) => listFormerMembers(database, id));
  return Object.fromEntries(
    [...current, ...former].map((member) => [member.name, member.id]),
  ) as Record<string, string>;
}

/** Every stored category, of every space, in the order the categories capability lists them. */
export const allCategories = () => read((database) => listCategories(database));

/** A category of the group named `group`, as an expense stores it: its ID, name and color. */
export const categoryOf = async (group: string, name: string) =>
  categoryIn(file, await groupId(group), name);

/** The stored expense titled `title`. */
export async function expenseTitled(title: string) {
  const found = (await storedExpenses()).find(
    (candidate) => candidate.title === title,
  );
  if (found === undefined) throw new Error(`No expense titled ${title}`);
  return found;
}

// The events the phone wrote

/** The events the phone has not uploaded yet, in the order it wrote them. */
export const unsent = () => read(listUnsentSyncEvents);

/** Does `action`, and returns the contents of the events the phone wrote meanwhile, in order. */
export async function eventsOf(
  action: () => Promise<unknown>,
): Promise<SyncEvent[]> {
  const before = (await unsent()).length;
  await action();
  return (await unsent()).slice(before).map((event) => event.content);
}

/** A stamp of this phone: LATER and counter 0 unless said otherwise. */
export const stamped = (counter = 0, ms = LATER): SyncStamp => ({
  ms,
  counter,
  device: PHONE,
});

/** A stamp of another phone. */
export const at = (ms: number, counter = 0, device = OTHER): SyncStamp => ({
  ms,
  counter,
  device,
});

/** The base an event gives for the unit `unit`, if it changes that unit and names one. */
export function baseOf(event: SyncEvent, unit: string): SyncStamp | undefined {
  if (!('units' in event)) return undefined;
  const units: Record<string, { base?: SyncStamp } | undefined> = event.units;
  return units[unit]?.base;
}

/** A stamp the phone gave when Brisbane became a shared ledger, whatever its counter. */
export const SHARED_STAMP = {
  ms: START,
  counter: expect.any(Number),
  device: PHONE,
};

/** Expects each event to be one the domain's check accepts from the phone that wrote it, with an ID of its own. */
export async function expectUnsentAreValid() {
  const events = await unsent();
  for (const event of events) {
    expect(event.id).toMatch(UUID_V4);
    expect(checkSyncEvent(event.content, null)).toEqual({
      status: 'valid',
      event: event.content,
    });
  }
  expect(new Set(events.map((event) => event.id)).size).toBe(events.length);
}

/** Whether the stamps go from earlier to later, none the same as the one before. */
export const inStampOrder = (stamps: readonly (SyncStamp | undefined)[]) =>
  stamps.every(
    (stamp, index) =>
      stamp !== undefined &&
      (index === 0 || compareSyncStamps(stamps[index - 1]!, stamp) < 0),
  );

// Events from other phones

type Values = Record<string, unknown>;

/** A record's first event: every unit it is given, none with a base. */
export function created(
  type: SyncEvent['type'],
  id: string,
  stamp: SyncStamp,
  values: Values,
) {
  return {
    version: 1,
    stamp,
    type,
    id,
    units: Object.fromEntries(
      Object.entries(values).map(([name, value]) => [name, { value }]),
    ),
  };
}

/** A later event: the units it changes, each with the base given for it, if any. */
export function changed(
  type: SyncEvent['type'],
  id: string,
  stamp: SyncStamp,
  values: Values,
  bases: Record<string, SyncStamp> = {},
) {
  return {
    version: 1,
    stamp,
    type,
    id,
    units: Object.fromEntries(
      Object.entries(values).map(([name, value]) => [
        name,
        name in bases ? { value, base: bases[name] } : { value },
      ]),
    ),
  };
}

/** An event that permanently deletes an expense or a category. */
export const deleted = (
  type: 'expense' | 'category',
  id: string,
  stamp: SyncStamp,
) => ({ version: 1, stamp, type, id, deleted: true });

let relayedCount = 0;

/**
 * An event as the API relays it: `content` under a new event ID, uploaded by the
 * device that stamped it and received at the moment it was stamped, unless
 * `envelope` says otherwise.
 */
export function relayed(
  content: unknown,
  envelope: Partial<Omit<ReceivedSyncEvent, 'content'>> = {},
): ReceivedSyncEvent {
  const stamp = (content as { stamp?: Partial<SyncStamp> } | null)?.stamp;
  relayedCount += 1;
  return {
    id: `00000000-0000-4000-8000-${String(relayedCount).padStart(12, '0')}`,
    device: typeof stamp?.device === 'string' ? stamp.device : OTHER,
    receivedAtMs: typeof stamp?.ms === 'number' ? stamp.ms : Date.now(),
    ...envelope,
    content,
  };
}

/** Hands the app events received for the shared ledger `id`, in this order, in one go. */
export async function receiveEvents(
  id: string,
  ...events: ReceivedSyncEvent[]
) {
  await act(async () => {
    await applySyncEvents(appDatabase(), id, events);
  });
  await settle();
}

/** Hands the app these contents, each relayed as `relayed` does, in this order, in one go. */
export const receive = (id: string, ...contents: unknown[]) =>
  receiveEvents(id, ...contents.map((content) => relayed(content)));

/** Tries to hand the app the events; the error it failed with, if it failed. */
export async function tryReceive(
  id: string,
  ...contents: unknown[]
): Promise<unknown> {
  try {
    await receive(id, ...contents);
    return undefined;
  } catch (error) {
    await settle();
    return error;
  }
}

/** The received events the app did not apply, in the order they were received. */
export const refused = () => read(listRefusedSyncEvents);

/**
 * What stays the same when an event the phone wrote itself, and has merged, comes back
 * and applies (SYNC-28.3): the stored expenses, Brisbane with its members, the
 * categories, the unsent events and the events that were not applied. The result of what
 * the phone has received takes the event in, so the whole database does not stay the same.
 */
export const merged = async () => ({
  expenses: await storedExpenses(),
  brisbane: await groupNamed('Brisbane'),
  categories: await allCategories(),
  unsent: await unsent(),
  refused: await refused(),
});

// Changing a shared ledger as a person would

/** Deletes the expense in the trash titled `title` for good, from its read-only details on Trash. */
export async function deletePermanently(title: string) {
  await openTrash();
  await openTrashed(title);
  await chooseExpenseAction('Settings', 'Delete Permanently');
  await pressAlertButton('Delete');
}

/** Opens the expense's Edit Expense, does `change` on it, and saves. */
export async function editWith(id: string, change: () => Promise<unknown>) {
  await openEditExpense(id);
  await change();
  await press('Save');
  await expectFormClosed();
}

/** Renames the group named `group` to `to` in Rename Group, from the Groups root, and goes back to the root. */
export async function renameGroupTo(group: string, to: string) {
  await tapTab('Groups');
  await openGroup(group);
  await openRenameGroup(group);
  await fireEvent.changeText(groupNameField(), to);
  await pressOnBar('Rename Group', 'Save');
  await expectClosed('Rename Group');
  await waitFor(() =>
    expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups', to.trim()]),
  );
  await goBackFrom(to.trim());
}

/** Opens the Members of the group named `group` from the Groups root. */
export async function showMembers(group: string) {
  await tapTab('Groups');
  await openGroup(group);
  await openMembers(group);
}

/** Closes Members and goes back from the group named `group` to the Groups root. */
export async function leaveMembers(group: string) {
  await pressOnBar('Members', 'Close');
  await expectClosed('Members');
  await goBackFrom(group);
}

// Group Categories, on the Settings tab

const GROUP_CATEGORIES = 'Group Categories';

const settingsTitle = () => navigationBars(tab('Settings')).at(-1)?.props.title;

/** Opens the Group Categories of the group `id` on the Settings tab, by its URL. */
export async function openGroupCategories(id: string) {
  await tapTab('Settings');
  await push(`/settings/manage-categories?scopeKind=group&spaceId=${id}`);
  await waitFor(() => expect(settingsTitle()).toBe(GROUP_CATEGORIES));
  await settle();
}

/** Goes back from Group Categories, and selects Expenses. */
export async function closeGroupCategories() {
  await act(async () => router.back());
  await waitFor(() => expect(settingsTitle()).not.toBe(GROUP_CATEGORIES));
  await tapTab('Expenses');
  await settle();
}

function categoriesScreen(): HostView {
  const found = nativeViews(/^RNSScreen$/, tab('Settings')).find((view) =>
    navigationBars(view).some((bar) => bar.props.title === GROUP_CATEGORIES),
  );
  if (found === undefined) throw new Error('Group Categories is not open');
  return found;
}

function backgroundOf(view: HostView): string | undefined {
  const color = StyleSheet.flatten(view.props.style)?.backgroundColor;
  return typeof color === 'string' ? color.toUpperCase() : undefined;
}

const textOf = (node: HostView | string): string =>
  typeof node === 'string' ? node : node.children.map(textOf).join('');

function firstText(view: HostView): string | undefined {
  const [text] = nativeViews(/^Text$/, view);
  return text === undefined ? undefined : textOf(text);
}

/**
 * What the open Group Categories lists, top to bottom, as [name, color], under
 * CATEGORIES and under ARCHIVED: every view filled with a palette color is a dot,
 * named by the first text of the nearest view around it, as categories.test.tsx
 * reads them.
 */
export function categoriesShown() {
  const all = categoriesScreen().queryAll(() => true);
  const header = within(categoriesScreen()).queryByText('ARCHIVED');
  const headerAt = header === null ? Infinity : all.indexOf(header);
  const rows = nativeViews(/./, categoriesScreen())
    .filter((view) => PALETTE.includes(backgroundOf(view) ?? ''))
    .map((dot) => {
      let row = dot.parent;
      while (row !== null && firstText(row) === undefined) row = row.parent;
      return {
        archived: all.indexOf(dot) > headerAt,
        category: [
          row === null ? undefined : firstText(row),
          backgroundOf(dot),
        ],
      };
    });
  return {
    active: rows.filter((row) => !row.archived).map((row) => row.category),
    archived: rows.filter((row) => row.archived).map((row) => row.category),
  };
}

/** The names Group Categories lists under CATEGORIES, top to bottom. */
export const categoryNames = () =>
  categoriesShown().active.map(([name]) => name);

/** Does Remove on the row named `name` of the open Group Categories, then presses `choice` in the alert it shows. */
export async function removeGroupCategory(
  name: string,
  choice: 'Delete' | 'Archive',
) {
  await doAction(categoriesScreen(), name, 'Remove');
  await pressAlertButton(choice);
}

/** Does Remove on the row named `name` of the open Group Categories, returns the alert it shows as [title, message], and presses Cancel. */
export async function removalAlert(name: string) {
  const before = alertsShown().length;
  await doAction(categoriesScreen(), name, 'Remove');
  const shown = alertsShown().slice(before);
  if (shown.length !== 1)
    throw new Error(`Removing ${name} showed ${shown.length} alerts`);
  await pressAlertButton('Cancel');
  return shown[0];
}

/** Restores the archived category `name` on the open Group Categories. */
export async function restoreGroupCategory(name: string) {
  await fireEvent.press(
    within(categoriesScreen()).getByRole('button', { name: `Restore ${name}` }),
  );
  await settle();
}

function moveList(name: string): HostView | undefined {
  const title = `Move ${name} Expenses`;
  const bar = navigationBars()
    .filter((candidate) => candidate.props.title === title)
    .at(-1);
  if (bar !== undefined)
    for (let view = bar.parent; view; view = view.parent)
      if (/^RNS(Modal)?Screen$/.test(String(view.type))) return view;
  const header = screen.queryAllByRole('header', { name: title }).at(-1);
  for (let outer = header?.parent; outer; outer = outer.parent) {
    const buttons = within(outer).queryAllByRole('button').map(nameOf);
    if (buttons.includes('Cancel') && buttons.some((it) => it !== 'Cancel'))
      return outer;
  }
  return undefined;
}

/** On the open Group Categories: Remove on `name`, then Move Expenses…, which opens its Move list. */
export async function openMoveList(name: string) {
  await doAction(categoriesScreen(), name, 'Remove');
  await pressAlertButton('Move Expenses…');
  await waitFor(() => expect(moveList(name)).toBeDefined());
  await settle();
}

/** Whether the Move list of `name` is open. */
export const moveListIsOpen = (name: string) => moveList(name) !== undefined;

/** Presses `target` in the open Move list of `name`, and lets the move finish. */
export async function pressMoveTarget(name: string, target: string) {
  await fireEvent.press(
    within(moveList(name)!).getByRole('button', { name: target }),
  );
  await settle();
}

/** On the open Group Categories: Remove on `name`, Move Expenses…, then `target`. */
export async function moveGroupCategoryExpenses(name: string, target: string) {
  await openMoveList(name);
  await pressMoveTarget(name, target);
}

/** The lines of text the open Group Categories shows, top to bottom. */
export const categoriesLines = () => linesIn(categoriesScreen());
