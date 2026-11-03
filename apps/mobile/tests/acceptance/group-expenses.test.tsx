import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ActionSheetIOS } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import {
  expectForm,
  expectFormClosed,
  fillForm,
  phoneDatabase,
  press,
  resetPhone,
  restart,
  storedExpenses,
  watchAlerts,
} from './ledger-expense-app';
import {
  linesIn,
  shownInOrder,
  startExpensesAt,
} from './ledger-expense-list-app';
import { allowWrites, settle } from './shell-appearance-app';
import {
  navigationBarTitles,
  push,
  selectedTab,
  tab,
  tapTab,
} from './shell-tabs-app';
import { localData } from './groups-app';
import {
  NO_EXPENSES,
  expectOpen,
  goBackFrom,
  isOpen,
  openGroup,
} from './group-details-app';
import {
  READ_ONLY,
  openArchivedGroup,
  openArchivedGroups,
  pressRestoreGroup,
} from './group-archive-app';
import {
  NO_GROUP_ID,
  addGroupExpense,
  addToGroup,
  archiveGroup,
  choosePayer,
  chooseSharers,
  detailBarsOn,
  editOn,
  expectDetailsOn,
  groupAddButton,
  groupCard,
  groupCardTitles,
  groupLines,
  memberIds,
  removeFromGroup,
  restoreGroup,
  rowValue,
  startWithGroups,
  storedGroup,
} from './ledger-group-expense-app';
import type { Database, SqlValue } from '../../src/storage';

// Runs on iOS. Each test starts the app as the group expense form tests do: its own
// phone database file, in Taipei on 2026-10-30, in a region whose currency is USD,
// with Taylor saved as your name. Its reads go through a gate the test can hold,
// all at once or one read at a time, as a slow disk would let them through. It adds
// group expenses through New Expense and reads a group's screen, on the Groups tab
// or, for an archived group, on the Settings tab.

let mockOpen: () => Promise<Database>;

jest.mock('../../src/storage/expo', () => ({
  openPhoneDatabase: () => mockOpen(),
}));

// Not virtual, as in ledger-expense-form.test.tsx.
jest.mock('expo-localization', () => {
  const phone = () =>
    jest.requireActual<typeof import('./ledger-expense-app')>(
      './ledger-expense-app',
    );
  return {
    ...jest.requireActual<object>('expo-localization'),
    getLocales: () => phone().phoneLocales(),
    getCalendars: () => phone().phoneCalendars(),
    useLocales: () => phone().phoneLocales(),
    useCalendars: () => phone().phoneCalendars(),
  };
});

/** Brisbane, with Casey and Blake added after you. */
const BRISBANE = { Brisbane: ['Casey', 'Blake'] };

let directory: string;
let file: string;

// The read gate: open, or holding every read outside a transaction until the test
// lets them through, all at once or the oldest one at a time.

let readsHeld = false;
const heldReads: (() => void)[] = [];

function gatedDatabase(path: string): Database {
  const database = phoneDatabase(path);
  return {
    ...database,
    all: async <T,>(sql: string, parameters?: readonly SqlValue[]) => {
      if (readsHeld)
        await new Promise<void>((resolve) => heldReads.push(resolve));
      return database.all<T>(sql, parameters);
    },
  };
}

function openReads() {
  readsHeld = false;
  for (const release of heldReads.splice(0)) release();
}

function holdReads() {
  readsHeld = true;
  return { release: () => act(async () => openReads()) };
}

/** Lets the oldest held read through, if one waits, and what it starts finish. */
async function letOneReadThrough() {
  const release = heldReads.shift();
  await act(async () => release?.());
  await settle();
}

beforeEach(() => {
  jest.clearAllMocks();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'group-expenses-'));
  file = path.join(directory, 'app.db');
  mockOpen = async () => gatedDatabase(file);
  allowWrites();
  openReads();
  resetPhone();
  watchAlerts();
  jest
    .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
    .mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});

/** Adds Brisbane's Dinner for 100.01: Casey pays, split between Blake, Taylor and Casey in that order. */
const addDinner = () =>
  addGroupExpense({
    group: 'Brisbane',
    payer: 'Casey',
    sharers: ['Blake', 'Taylor (You)', 'Casey'],
  });

/** Selects Groups and opens the group's screen from its card on the Groups root. */
async function showGroup(group: string) {
  await tapTab('Groups');
  await openGroup(group);
  await settle();
}

// The expenses on a group's screen

test("[GROUPS-61.1] lists the group's expenses newest first, without the no-expenses hint", async () => {
  await startWithGroups(BRISBANE);
  await addDinner();
  await addGroupExpense({
    group: 'Brisbane',
    payer: 'Casey',
    sharers: ['Casey'],
    title: 'Taxi',
    date: '2026-10-29',
  });

  await showGroup('Brisbane');

  await waitFor(() =>
    expect(groupCardTitles('Brisbane')).toEqual(['Dinner', 'Taxi']),
  );
  expect(groupLines('Brisbane')).not.toContain(NO_EXPENSES);
});

test('[GROUPS-61.1] shows the full amount on the card, with the category, the group and the date', async () => {
  await startWithGroups(BRISBANE);
  await addDinner();

  await showGroup('Brisbane');

  const expected = [
    'Dinner',
    '$100.01',
    'Food & Dining',
    'Brisbane',
    'Oct 30, 2026',
  ];
  await waitFor(() =>
    expect(
      shownInOrder(linesIn(groupCard('Brisbane', 'Dinner')), expected),
    ).toEqual(expected),
  );
});

test('[GROUPS-61.1] lists an expense of the group that you have no part in', async () => {
  await startWithGroups(BRISBANE);
  await addGroupExpense({
    group: 'Brisbane',
    payer: 'Casey',
    sharers: ['Blake'],
  });

  await showGroup('Brisbane');

  await waitFor(() => expect(groupCardTitles('Brisbane')).toEqual(['Dinner']));
});

test("[GROUPS-61.1] leaves out the other groups' expenses", async () => {
  await startWithGroups({ ...BRISBANE, Tokyo: [] });
  await addDinner();
  await addGroupExpense({
    group: 'Tokyo',
    payer: 'Taylor (You)',
    sharers: ['Taylor (You)'],
    title: 'Sushi',
  });

  await showGroup('Brisbane');

  await waitFor(() => expect(groupCardTitles('Brisbane')).toEqual(['Dinner']));
});

test("[GROUPS-61.1] lists an archived group's expenses under its read-only notice", async () => {
  await startWithGroups(BRISBANE);
  await addDinner();
  await archiveGroup('Brisbane');

  await openArchivedGroups();
  await openArchivedGroup('Brisbane');

  await waitFor(() => expect(groupCardTitles('Brisbane')).toEqual(['Dinner']));
  const lines = groupLines('Brisbane');
  const expected = [
    READ_ONLY,
    'Restore Group',
    'Dinner',
    'Brisbane · Archived',
  ];
  expect(shownInOrder(lines, expected)).toEqual(expected);
});

test("[GROUPS-61.1] keeps listing the group's expenses after a restart", async () => {
  const app = await startWithGroups(BRISBANE);
  await addDinner();

  await restart(app);
  await showGroup('Brisbane');

  await waitFor(() => expect(groupCardTitles('Brisbane')).toEqual(['Dinner']));
});

test('[GROUPS-62.1] shows no hint that the group has no expenses while its data is read, one read at a time', async () => {
  await startWithGroups(BRISBANE);
  await addDinner();
  await tapTab('Groups');
  holdReads();

  await fireEvent.press(screen.getByRole('button', { name: 'Open Brisbane' }));
  await settle();

  for (let read = 0; read < 50; read += 1) {
    const lines = linesIn(tab('Groups'));
    expect(lines).not.toContain(NO_EXPENSES);
    if (lines.includes('Dinner')) break;
    await letOneReadThrough();
  }
  openReads();
  await expectOpen('Brisbane');
  await waitFor(() => expect(groupCardTitles('Brisbane')).toEqual(['Dinner']));
  expect(groupLines('Brisbane')).not.toContain(NO_EXPENSES);
});

// The details pushed from a group's screen

test('[GROUPS-63.1] pushes the details on the Groups tab at /groups/expenses/<ID>', async () => {
  const app = await startWithGroups(BRISBANE);
  await addDinner();
  const [dinner] = await storedExpenses();
  await showGroup('Brisbane');

  await fireEvent.press(groupCard('Brisbane', 'Dinner'));

  await expectDetailsOn('Groups', 'Dinner');
  expect(selectedTab()).toBe('Groups');
  expect(navigationBarTitles(tab('Groups'))).toEqual([
    'Groups',
    'Brisbane',
    'Expense',
  ]);
  expect(app.getPathname()).toBe(`/groups/expenses/${dinner.id}`);
});

test('[GROUPS-63.1] pushes the details on the Settings tab for an archived group', async () => {
  const app = await startWithGroups(BRISBANE);
  await addDinner();
  const [dinner] = await storedExpenses();
  await archiveGroup('Brisbane');
  await openArchivedGroups();
  await openArchivedGroup('Brisbane');
  await waitFor(() => expect(groupCardTitles('Brisbane')).toEqual(['Dinner']));

  await fireEvent.press(groupCard('Brisbane', 'Dinner'));

  await expectDetailsOn('Settings', 'Dinner');
  expect(selectedTab()).toBe('Settings');
  expect(navigationBarTitles(tab('Settings'))).toEqual([
    'Settings',
    'Archived Groups',
    'Brisbane',
    'Expense',
  ]);
  expect(app.getPathname()).toBe(
    `/settings/archived-groups/expenses/${dinner.id}`,
  );
});

test("[GROUPS-63.1] goes back to the group's screen from the details", async () => {
  await startWithGroups(BRISBANE);
  await addDinner();
  await showGroup('Brisbane');
  await fireEvent.press(groupCard('Brisbane', 'Dinner'));
  await expectDetailsOn('Groups', 'Dinner');

  await goBackFrom('Expense');

  await waitFor(() => expect(detailBarsOn('Groups')).toEqual([]));
  expect(isOpen('Brisbane')).toBe(true);
  expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups', 'Brisbane']);
});

test('[GROUPS-63.1] pushes one details when a card is pressed twice', async () => {
  await startWithGroups(BRISBANE);
  await addDinner();
  await showGroup('Brisbane');
  const shown = groupCard('Brisbane', 'Dinner');

  await fireEvent.press(shown);
  await fireEvent.press(shown);
  await settle();

  await expectDetailsOn('Groups', 'Dinner');
  await goBackFrom('Expense');
  await waitFor(() =>
    expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups', 'Brisbane']),
  );
});

// The + button on a group's screen

test("[GROUPS-64.1] opens New Expense for the group from the + button on the group's screen", async () => {
  const app = await startWithGroups(BRISBANE);
  const brisbane = await storedGroup(file, 'Brisbane');
  await showGroup('Brisbane');

  const add = groupAddButton('Brisbane');
  expect(add).toBeDefined();
  await fireEvent.press(add!);

  await expectForm('New Expense');
  expect(rowValue('Group')).toBe('Brisbane');
  expect(app.getPathname()).toBe('/expenses/new');
  expect(app.getSearchParams()).toEqual({ groupId: brisbane.id });
});

test("[GROUPS-64.1] comes back to the group's screen, with the new card, once the expense is added", async () => {
  await startWithGroups(BRISBANE);
  await showGroup('Brisbane');
  const add = groupAddButton('Brisbane');
  expect(add).toBeDefined();
  await fireEvent.press(add!);
  await expectForm('New Expense');
  await fillForm({ amount: '100.01', title: 'Dinner' });
  await choosePayer('Casey');
  await chooseSharers('Casey');

  await press('Add');

  await expectFormClosed();
  expect(selectedTab()).toBe('Groups');
  expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups', 'Brisbane']);
  await waitFor(() => expect(groupCardTitles('Brisbane')).toEqual(['Dinner']));
});

test("[GROUPS-64.1] shows no + button on an archived group's screen opened from Archived Groups", async () => {
  await startWithGroups({ ...BRISBANE, Tokyo: [] });
  await archiveGroup('Brisbane');
  await openGroup('Tokyo');
  expect(groupAddButton('Tokyo')).toBeDefined();

  await openArchivedGroups();
  await openArchivedGroup('Brisbane');

  expect(groupAddButton('Brisbane')).toBeUndefined();
});

test("[GROUPS-64.1] shows no + button on an archived group's screen opened by its URL on the Groups tab", async () => {
  const app = await startWithGroups({ ...BRISBANE, Tokyo: [] });
  const brisbane = await storedGroup(file, 'Brisbane');
  await archiveGroup('Brisbane');
  await app.unmount();
  await settle();

  await startExpensesAt(`/groups/${brisbane.id}`);
  await expectOpen('Brisbane');
  await settle();

  expect(groupAddButton('Brisbane')).toBeUndefined();
  await goBackFrom('Brisbane');
  await openGroup('Tokyo');
  expect(groupAddButton('Tokyo')).toBeDefined();
});

test('[GROUPS-64.1] shows the + button once the group is restored on its screen, and opens New Expense for it', async () => {
  await startWithGroups(BRISBANE);
  await archiveGroup('Brisbane');
  await openArchivedGroups();
  await openArchivedGroup('Brisbane');

  await pressRestoreGroup('Brisbane');

  await waitFor(() => expect(groupAddButton('Brisbane')).toBeDefined());
  await fireEvent.press(groupAddButton('Brisbane')!);
  await expectForm('New Expense');
  expect(rowValue('Group')).toBe('Brisbane');
});

test('[GROUPS-64.1] shows no + button when the group is not found', async () => {
  await startWithGroups({ Tokyo: [] });
  await tapTab('Groups');

  await push(`/groups/${NO_GROUP_ID}`);
  await expectOpen('Group Details');
  await settle();

  expect(groupAddButton('Group Details')).toBeUndefined();
  await goBackFrom('Group Details');
  await openGroup('Tokyo');
  expect(groupAddButton('Tokyo')).toBeDefined();
});

// The group's screen after a save

test("[GROUPS-65.1] shows the saved amount as soon as the group's screen comes back from the details", async () => {
  await startWithGroups(BRISBANE);
  await addDinner();
  await showGroup('Brisbane');
  await fireEvent.press(groupCard('Brisbane', 'Dinner'));
  await expectDetailsOn('Groups', 'Dinner');
  await editOn('Groups')!.press();
  await expectForm('Edit Expense');
  await fillForm({ amount: '90.00' });
  await press('Save');
  await expectFormClosed();
  const reads = holdReads();

  await goBackFrom('Expense');

  expect(linesIn(groupCard('Brisbane', 'Dinner'))).toContain('$90.00');
  expect(linesIn(groupCard('Brisbane', 'Dinner'))).not.toContain('$100.01');
  await reads.release();
});

test("[GROUPS-65.1] shows an expense added from the Expenses tab on the group's screen left open", async () => {
  await startWithGroups(BRISBANE);
  await addDinner();
  await showGroup('Brisbane');

  await addGroupExpense({
    group: 'Brisbane',
    payer: 'Casey',
    sharers: ['Casey'],
    title: 'Taxi',
    date: '2026-10-29',
  });
  await tapTab('Groups');

  await waitFor(() =>
    expect(groupCardTitles('Brisbane')).toEqual(['Dinner', 'Taxi']),
  );
});

// Members who leave, and archiving

test("[GROUPS-66.1] keeps a removed member's payments and shares in the group's expenses", async () => {
  await startWithGroups(BRISBANE);
  await addDinner();
  const before = await storedExpenses();

  await removeFromGroup('Brisbane', 'Blake');

  expect(await storedExpenses()).toEqual(before);
});

test('[GROUPS-66.1] keeps them under the same member ID once the member is added back', async () => {
  await startWithGroups(BRISBANE);
  const ids = await memberIds(file, 'Brisbane');
  await addDinner();
  const before = await storedExpenses();
  await removeFromGroup('Brisbane', 'Blake');

  await addToGroup('Brisbane', 'Blake');

  expect((await memberIds(file, 'Brisbane')).Blake).toBe(ids.Blake);
  expect(await storedExpenses()).toEqual(before);
  expect(before[0].shares.map((share) => share.participant)).toContain(
    ids.Blake,
  );
});

test("[GROUPS-57.1] leaves the group's expenses as they were once it is archived and restored", async () => {
  await startWithGroups(BRISBANE);
  await addDinner();
  const before = localData(file);

  await archiveGroup('Brisbane');
  await restoreGroup('Brisbane');

  expect(localData(file)).toEqual(before);
});
