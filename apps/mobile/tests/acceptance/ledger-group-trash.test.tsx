import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ActionSheetIOS, Alert } from 'react-native';
import {
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';
import {
  addExpense,
  expectForm,
  formBarSides,
  formScreen,
  formTitle,
  nameOf,
  press,
  resetPhone,
  restart,
  storedExpenses,
  swipeFormDown,
  titleField,
} from './ledger-expense-app';
import {
  EMPTY_LIST,
  NOT_FOUND,
  NO_EXPENSE_ID,
  allowReads,
  card,
  expensesRoot,
  holdReads,
  linesIn,
  phoneDatabaseWithReads,
  readOut,
  shownInOrder,
  startExpensesAt,
} from './ledger-expense-list-app';
import {
  NO_DELETED,
  actionLabels,
  chooseExpenseAction,
  deleteByAction,
  expectCards,
  expectTrash,
  expenseBarItems,
  expenseLines,
  hasExpenseActions,
  noticeShown,
  openTrash,
  openTrashed,
  pressEmptyTrash,
  pressUndo,
  restoreFromTrash,
  trashCard,
  trashLines,
  trashRow,
  trashRowCounts,
} from './ledger-trash-app';
import { localData } from './groups-app';
import {
  NO_EXPENSES,
  alertsShown,
  goBackFrom,
  openGroup,
  pressAlertButton,
} from './group-details-app';
import {
  openArchivedGroup,
  openArchivedGroups,
  pressRestoreGroup,
} from './group-archive-app';
import {
  SHARED_HISTORY,
  SHARED_HISTORY_TEXT,
  addGroupExpense,
  archiveGroup,
  deleteFromGroup,
  detailLinesOn,
  editOn,
  expectDetailsOn,
  groupCard,
  groupCardTitles,
  groupLines,
  startWithGroups,
  storedGroup,
} from './ledger-group-expense-app';
import { showGroup } from './group-balances-app';
import { allowWrites, settle } from './shell-appearance-app';
import { navigationBarTitles, push, tab, tapTab } from './shell-tabs-app';
import type { Database } from '../../src/storage';

// Runs on iOS. Each test starts the app as the group expense tests do: its own phone
// database file, in Taipei on 2026-10-30, in a region whose currency is USD, with
// Taylor saved as your name and Brisbane's members Taylor, Casey and Blake. It adds
// group expenses through New Expense and moves them to the trash through their
// cards' Delete expense action, on the expense list or the group's screen; swiping a
// card to show Delete is a gesture only the E2E flow makes (ADR-0008). A test can
// hold the app's reads to see a screen before its data.

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

beforeEach(() => {
  jest.clearAllMocks();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'group-trash-'));
  file = path.join(directory, 'app.db');
  mockOpen = async () => phoneDatabaseWithReads(file);
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

const YOU = 'Taylor (You)';

/** Adds Brisbane's Dinner for 100.01: Casey pays, split between Blake, Taylor and Casey in that order. */
const addDinner = () =>
  addGroupExpense({
    group: 'Brisbane',
    payer: 'Casey',
    sharers: ['Blake', YOU, 'Casey'],
  });

/** Adds Brisbane's Taxi for 25.00, which you have no part in: Casey pays, for Blake alone. */
const addTaxi = () =>
  addGroupExpense({
    group: 'Brisbane',
    title: 'Taxi',
    amount: '25.00',
    payer: 'Casey',
    sharers: ['Blake'],
  });

/** Adds Brisbane's Dinner for 60.00: Taylor pays, split between Taylor, Casey and Blake. */
const addTaylorsDinner = () =>
  addGroupExpense({
    group: 'Brisbane',
    amount: '60.00',
    payer: YOU,
    sharers: [YOU, 'Casey', 'Blake'],
  });

async function idOf(title: string) {
  const expense = (await storedExpenses()).find(
    (candidate) => candidate.title === title,
  );
  if (expense === undefined) throw new Error(`No expense titled ${title}`);
  return expense;
}

/** Moves the card titled `title` on the expense list to the trash, from the Expenses tab. */
async function deleteFromList(title: string) {
  await tapTab('Expenses');
  await settle();
  await deleteByAction(title);
}

// Delete on a group expense's card and details

test("[LEDGER-71.2] offers Delete expense on a group expense's card on the group's screen", async () => {
  await startWithGroups(BRISBANE);
  await addDinner();

  await showGroup('Brisbane');

  await waitFor(() =>
    expect(actionLabels(groupCard('Brisbane', 'Dinner'))).toContain(
      'Delete expense',
    ),
  );
});

test('[LEDGER-71.2] moves group expenses to the trash from their cards without asking, also one you have no part in, and keeps them there after a restart', async () => {
  const app = await startWithGroups(BRISBANE);
  await addDinner();
  await addTaxi();
  await showGroup('Brisbane');
  await waitFor(() =>
    expect(groupCardTitles('Brisbane')).toEqual(['Taxi', 'Dinner']),
  );

  await deleteFromGroup('Brisbane', 'Taxi');
  await waitFor(() => expect(groupCardTitles('Brisbane')).toEqual(['Dinner']));
  await deleteFromList('Dinner');

  expect(alertsShown()).toEqual([]);
  await waitFor(() => expect(linesIn(expensesRoot())).toContain(EMPTY_LIST));
  await showGroup('Brisbane');
  await waitFor(() => expect(groupLines('Brisbane')).toContain(NO_EXPENSES));
  expect(groupCardTitles('Brisbane')).toEqual([]);

  await restart(app);
  await waitFor(() => expect(linesIn(expensesRoot())).toContain(EMPTY_LIST));
  await tapTab('Groups');
  await openGroup('Brisbane');
  await waitFor(() => expect(groupLines('Brisbane')).toContain(NO_EXPENSES));
});

test('[LEDGER-64.2] leaves a group expense in the trash off the expense list', async () => {
  await startWithGroups(BRISBANE);
  await addExpense();
  await addDinner();
  await tapTab('Expenses');
  await expectCards(['Dinner', 'Coffee run']);

  await deleteByAction('Dinner');

  await expectCards(['Coffee run']);
});

test("[LEDGER-71.2] shows only Expense not found. at the Groups tab's URL of a group expense in the trash", async () => {
  const app = await startWithGroups(BRISBANE);
  await addDinner();
  const { id } = await idOf('Dinner');
  await deleteFromList('Dinner');
  await app.unmount();
  await settle();

  await startExpensesAt(`/groups/expenses/${id}`);

  await waitFor(() => expect(detailLinesOn('Groups')).toEqual([NOT_FOUND]));
  expect(editOn('Groups')).toBeUndefined();
  expect(hasExpenseActions('Groups')).toBe(false);
});

test('[LEDGER-71.2] shows only Expense not found. on details left open on another tab once their group expense moves to the trash', async () => {
  await startWithGroups(BRISBANE);
  await addDinner();
  await showGroup('Brisbane');
  await fireEvent.press(groupCard('Brisbane', 'Dinner'));
  await expectDetailsOn('Groups', 'Dinner');

  await deleteFromList('Dinner');
  await tapTab('Groups');
  await settle();

  await waitFor(() => expect(detailLinesOn('Groups')).toEqual([NOT_FOUND]));
  expect(editOn('Groups')).toBeUndefined();
  expect(hasExpenseActions('Groups')).toBe(false);
});

test("[LEDGER-72.2] moves a group expense to the trash from its details on the group's screen, and goes back to the group", async () => {
  await startWithGroups(BRISBANE);
  await addDinner();
  await showGroup('Brisbane');
  await fireEvent.press(groupCard('Brisbane', 'Dinner'));
  await expectDetailsOn('Groups', 'Dinner');

  await chooseExpenseAction('Groups', 'Delete');

  expect(alertsShown()).toEqual([]);
  await waitFor(() =>
    expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups', 'Brisbane']),
  );
  await waitFor(() => expect(groupLines('Brisbane')).toContain(NO_EXPENSES));
  expect(noticeShown()).toBe(true);
});

test("[LEDGER-67.2] offers no Delete expense on an archived group's expense cards until the group is restored", async () => {
  await startWithGroups(BRISBANE);
  await addDinner();
  await archiveGroup('Brisbane');
  await tapTab('Expenses');
  await waitFor(() =>
    expect(linesIn(card('Dinner'))).toContain('Brisbane · Archived'),
  );
  expect(actionLabels(card('Dinner'))).not.toContain('Delete expense');
  await openArchivedGroups();
  await openArchivedGroup('Brisbane');
  await waitFor(() => expect(groupCardTitles('Brisbane')).toEqual(['Dinner']));
  expect(actionLabels(groupCard('Brisbane', 'Dinner'))).not.toContain(
    'Delete expense',
  );

  await pressRestoreGroup('Brisbane');

  await waitFor(() =>
    expect(actionLabels(groupCard('Brisbane', 'Dinner'))).toContain(
      'Delete expense',
    ),
  );
  await tapTab('Expenses');
  await waitFor(() =>
    expect(actionLabels(card('Dinner'))).toContain('Delete expense'),
  );
});

// Undo

test("[LEDGER-75.2] puts group expenses back on the group's screen, and on the expense list if they are yours, when Undo is pressed", async () => {
  await startWithGroups(BRISBANE);
  await addDinner();
  await addTaxi();
  await showGroup('Brisbane');
  await waitFor(() =>
    expect(groupCardTitles('Brisbane')).toEqual(['Taxi', 'Dinner']),
  );

  await deleteFromGroup('Brisbane', 'Taxi');
  await pressUndo('Taxi');
  await waitFor(() =>
    expect(groupCardTitles('Brisbane')).toEqual(['Taxi', 'Dinner']),
  );
  await deleteFromGroup('Brisbane', 'Dinner');
  await pressUndo('Dinner');

  await waitFor(() =>
    expect(groupCardTitles('Brisbane')).toEqual(['Taxi', 'Dinner']),
  );
  await tapTab('Expenses');
  await expectCards(['Dinner']);
});

// Trash

test('[LEDGER-76.1] counts group expenses in the trash at the Trash row', async () => {
  await startWithGroups(BRISBANE);
  await addExpense();
  await addDinner();
  await deleteFromList('Coffee run');
  await deleteFromList('Dinner');

  await tapTab('Settings');

  await waitFor(() => expect(trashRowCounts()).toEqual(['2']));
  expect(nameOf(trashRow())).toBe('Trash, 2');
});

test('[LEDGER-77.2] lists group expenses on Trash with personal ones, the last moved in first, at the full amount and with the group', async () => {
  await startWithGroups(BRISBANE);
  await addExpense();
  await addDinner();
  await deleteFromList('Coffee run');
  await deleteFromList('Dinner');

  await openTrash();

  await expectTrash(['Dinner', 'Coffee run']);
  const expected = [
    'Dinner',
    '$100.01',
    'Food & Dining',
    'Brisbane',
    'Oct 30, 2026',
  ];
  expect(linesIn(trashCard('Dinner'))).toEqual(expected);
  expect(shownInOrder([readOut(trashCard('Dinner'))], expected)).toEqual(
    expected,
  );
  expect(actionLabels(trashCard('Dinner'))).not.toContain('Delete expense');
});

test('[LEDGER-77.2] lists a group expense you have no part in on Trash at its full amount', async () => {
  await startWithGroups(BRISBANE);
  await addTaxi();
  await showGroup('Brisbane');
  await deleteFromGroup('Brisbane', 'Taxi');

  await openTrash();

  await expectTrash(['Taxi']);
  expect(linesIn(trashCard('Taxi'))).toContain('$25.00');
});

test("[LEDGER-77.2] marks the group as archived on a group expense's card on Trash", async () => {
  await startWithGroups(BRISBANE);
  await addDinner();
  await deleteFromList('Dinner');
  await archiveGroup('Brisbane');

  await openTrash();

  await expectTrash(['Dinner']);
  expect(linesIn(trashCard('Dinner'))).toContain('Brisbane · Archived');
});

test("[LEDGER-78.2] shows a group expense's read-only details with what its details show, and only Expense actions", async () => {
  await startWithGroups(BRISBANE);
  await addTaylorsDinner();
  await deleteFromList('Dinner');
  await openTrash();

  await openTrashed('Dinner');

  const expected = [
    'This expense is in the Trash.',
    'Restore',
    'Dinner',
    '$60.00',
    'YOUR POSITION',
    'You paid',
    '$60.00',
    'Your share',
    '$20.00',
    'You are owed',
    '$40.00',
    'PAID BY',
    YOU,
    '$60.00',
    'SPLIT',
    YOU,
    '$20.00',
    'Casey',
    '$20.00',
    'Blake',
    '$20.00',
    'DETAILS',
    'Group',
    'Brisbane',
    'Category',
    'Food & Dining',
    'Date',
    'Oct 30, 2026',
  ];
  await waitFor(() =>
    expect(shownInOrder(expenseLines('Settings'), expected)).toEqual(expected),
  );
  expect(expenseBarItems('Settings')).toEqual([
    {
      menu: 'Expense actions',
      icon: 'ellipsis.circle',
      items: [{ title: 'Delete Permanently', destructive: true }],
    },
  ]);
});

test("[LEDGER-78.2] shows Status but not Shared history on the read-only details of an archived group's expense", async () => {
  await startWithGroups(BRISBANE);
  await addTaylorsDinner();
  await deleteFromList('Dinner');
  await archiveGroup('Brisbane');
  await openTrash();

  await openTrashed('Dinner');

  const expected = ['Group', 'Brisbane', 'Status', 'Archived · Read-only'];
  await waitFor(() =>
    expect(shownInOrder(expenseLines('Settings'), expected)).toEqual(expected),
  );
  expect(expenseLines('Settings')).not.toContain(SHARED_HISTORY);
  expect(expenseLines('Settings')).not.toContain(SHARED_HISTORY_TEXT);
});

test("[LEDGER-79.2] restores a group expense you have no part in to the group's screen, not the expense list", async () => {
  await startWithGroups(BRISBANE);
  await addTaxi();
  await showGroup('Brisbane');
  await deleteFromGroup('Brisbane', 'Taxi');

  await restoreFromTrash('Taxi');

  await waitFor(() => expect(trashLines()).toContain(NO_DELETED));
  await showGroup('Brisbane');
  await waitFor(() => expect(groupCardTitles('Brisbane')).toEqual(['Taxi']));
  await tapTab('Expenses');
  await waitFor(() => expect(linesIn(expensesRoot())).toContain(EMPTY_LIST));
});

test("[LEDGER-79.2] restores an archived group's expense from Trash without asking, back read-only on the archived group's screen", async () => {
  await startWithGroups(BRISBANE);
  await addDinner();
  await deleteFromList('Dinner');
  await archiveGroup('Brisbane');

  await restoreFromTrash('Dinner');

  expect(alertsShown()).toEqual([]);
  await waitFor(() => expect(trashLines()).toContain(NO_DELETED));
  await goBackFrom('Trash');
  await openArchivedGroups();
  await openArchivedGroup('Brisbane');
  await waitFor(() => expect(groupCardTitles('Brisbane')).toEqual(['Dinner']));
  const shown = groupCard('Brisbane', 'Dinner');
  expect(linesIn(shown)).toContain('Brisbane · Archived');
  expect(actionLabels(shown)).not.toContain('Delete expense');
});

test('[LEDGER-80.1] deletes a group expense in the trash for good, with its payments and shares', async () => {
  await startWithGroups(BRISBANE);
  await addDinner();
  await deleteFromList('Dinner');
  await openTrash();
  await openTrashed('Dinner');

  await chooseExpenseAction('Settings', 'Delete Permanently');
  await pressAlertButton('Delete');

  await waitFor(() => expect(trashLines()).toContain(NO_DELETED));
  expect(await storedExpenses()).toEqual([]);
  const stored = localData(file);
  expect(stored.expense_payments).toEqual([]);
  expect(stored.expense_shares).toEqual([]);
});

test('[LEDGER-81.1] empties group expenses from the trash too', async () => {
  await startWithGroups(BRISBANE);
  await addExpense();
  await addDinner();
  await deleteFromList('Coffee run');
  await deleteFromList('Dinner');
  await openTrash();
  await expectTrash(['Dinner', 'Coffee run']);

  await pressEmptyTrash();
  await pressAlertButton('Empty Trash');

  await waitFor(() => expect(trashLines()).toContain(NO_DELETED));
  expect(await storedExpenses()).toEqual([]);
  const stored = localData(file);
  expect(stored.expense_payments).toEqual([]);
  expect(stored.expense_shares).toEqual([]);
});

// Edit Expense at the URL of an expense in the trash, or of no expense

/** The lines Edit Expense shows, top to bottom, once it is open. */
async function expectEditNotFound() {
  await waitFor(() => expect(formTitle()).toBe('Edit Expense'));
  await waitFor(() => expect(linesIn(formScreen())).toEqual([NOT_FOUND]));
  expect(within(formScreen()).queryByLabelText('Expense title')).toBeNull();
  expect(formBarSides()).toEqual({ left: ['Cancel'], right: [] });
}

test('[LEDGER-85.1] shows only Expense not found. and Cancel on the Edit Expense of an expense in the trash, and saves nothing', async () => {
  await startWithGroups(BRISBANE);
  await addExpense();
  const { id } = await idOf('Coffee run');
  await deleteFromList('Coffee run');
  const before = await storedExpenses();

  await push(`/expenses/${id}/edit`);

  await expectEditNotFound();
  await press('Cancel');
  await waitFor(() => expect(formTitle()).toBeUndefined());
  expect(alertsShown()).toEqual([]);
  expect(await storedExpenses()).toEqual(before);
});

test('[LEDGER-85.1] shows only Expense not found. on the Edit Expense of a group expense in the trash, and keeps it there when swiped down', async () => {
  await startWithGroups(BRISBANE);
  await addDinner();
  const dinner = await idOf('Dinner');
  await deleteFromList('Dinner');
  const { id: brisbane } = await storedGroup(file, 'Brisbane');

  await push(`/expenses/${dinner.id}/edit`);

  await expectEditNotFound();
  expect(screen.queryByLabelText('Split with others')).toBeNull();
  await swipeFormDown();
  await waitFor(() => expect(formTitle()).toBeUndefined());
  const stored = await idOf('Dinner');
  expect(stored.trashOrder).toBeDefined();
  expect(stored.spaceId).toBe(brisbane);
  expect(stored).toEqual({ ...dinner, trashOrder: stored.trashOrder });
});

test('[LEDGER-85.1] shows only Expense not found. and Cancel on the Edit Expense of an ID that is no expense', async () => {
  await startWithGroups(BRISBANE);

  await push(`/expenses/${NO_EXPENSE_ID}/edit`);

  await expectEditNotFound();
});

test('[LEDGER-85.1] never shows Expense not found. while Edit Expense reads the expense', async () => {
  await startWithGroups(BRISBANE);
  await addExpense();
  const { id } = await idOf('Coffee run');
  const reads = holdReads();

  await push(`/expenses/${id}/edit`);
  await settle();

  expect(screen.queryByText(NOT_FOUND)).toBeNull();
  await reads.release();
  await expectForm('Edit Expense');
  expect(titleField().props.value).toBe('Coffee run');
  expect(screen.queryByText(NOT_FOUND)).toBeNull();
});
