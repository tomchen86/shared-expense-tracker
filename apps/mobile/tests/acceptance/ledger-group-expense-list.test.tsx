import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ActionSheetIOS } from 'react-native';
import { fireEvent, waitFor, within } from '@testing-library/react-native';
import {
  addExpense,
  inTreeOrder,
  phoneDatabase,
  resetPhone,
  storedExpenses,
  watchAlerts,
} from './ledger-expense-app';
import {
  EMPTY_LIST,
  NOT_FOUND,
  card,
  cardTitles,
  cards,
  colorDots,
  detailLines,
  detailScreen,
  dotColors,
  expensesRoot,
  isUnread,
  linesIn,
  opacityIn,
  openDetails,
  readOut,
  shownInOrder,
  startExpensesAt,
  totalShareLines,
} from './ledger-expense-list-app';
import { actionLabels, expenseBarItems } from './ledger-trash-app';
import { allowWrites, settle } from './shell-appearance-app';
import { tapTab } from './shell-tabs-app';
import {
  expectClosed,
  groupNameField,
  openGroup,
  openRenameGroup,
  pressOnBar,
  goBackFrom,
} from './group-details-app';
import {
  SHARED_HISTORY,
  SHARED_HISTORY_TEXT,
  addGroupExpense,
  archiveGroup,
  archiveGroupCategory,
  detailLinesOn,
  editOn,
  expectDetailsOn,
  groupCard,
  groupCardTitles,
  removeFromGroup,
  renameInGroup,
  restoreGroup,
  startWithGroups,
  storedGroup,
} from './ledger-group-expense-app';
import type { Database } from '../../src/storage';

// Runs on iOS. Each test starts the app as the group expense form tests do: its own
// phone database file, in Taipei on 2026-10-30, in a region whose currency is USD,
// with Taylor saved as your name. It adds group expenses through New Expense and
// reads the expense list and the details on the Expenses tab.

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
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'group-expense-list-'));
  file = path.join(directory, 'app.db');
  mockOpen = async () => phoneDatabase(file);
  allowWrites();
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

/** Shows the expense list, after any change made on another tab. */
async function showExpenses() {
  await tapTab('Expenses');
  await settle();
}

/** Renames the group from its Rename Group, then goes back to the Groups root. */
async function renameGroup(from: string, to: string) {
  await tapTab('Groups');
  await openGroup(from);
  await openRenameGroup(from);
  await fireEvent.changeText(groupNameField(), to);
  await pressOnBar('Rename Group', 'Save');
  await expectClosed('Rename Group');
  await goBackFrom(to);
}

// The hint

test('[LEDGER-32.2] says there are no expenses when the only group expense has nothing of yours', async () => {
  await startWithGroups(BRISBANE);
  await addGroupExpense({
    group: 'Brisbane',
    payer: 'Casey',
    sharers: ['Blake'],
  });

  await showExpenses();

  expect(within(expensesRoot()).getByText(EMPTY_LIST)).toBeOnTheScreen();
  expect(cards()).toEqual([]);
});

test('[LEDGER-32.2] shows the card of a group expense you share instead of the hint', async () => {
  await startWithGroups(BRISBANE);
  await addGroupExpense({
    group: 'Brisbane',
    payer: 'Casey',
    sharers: ['Casey', 'Taylor (You)'],
  });

  await showExpenses();

  await waitFor(() => expect(cardTitles()).toEqual(['Dinner']));
  expect(within(expensesRoot()).queryByText(EMPTY_LIST)).toBeNull();
});

// Which group expenses the list shows

test('[LEDGER-64.1] lists a group expense you share', async () => {
  await startWithGroups(BRISBANE);

  await addGroupExpense({
    group: 'Brisbane',
    payer: 'Casey',
    sharers: ['Taylor (You)', 'Casey'],
  });

  await showExpenses();
  await waitFor(() => expect(cardTitles()).toEqual(['Dinner']));
});

test('[LEDGER-64.1] lists a group expense you only paid', async () => {
  await startWithGroups(BRISBANE);

  await addGroupExpense({
    group: 'Brisbane',
    payer: 'Taylor (You)',
    sharers: ['Casey', 'Blake'],
  });

  await showExpenses();
  await waitFor(() => expect(cardTitles()).toEqual(['Dinner']));
});

test('[LEDGER-64.1] lists a group expense in which your share is 0', async () => {
  await startWithGroups(BRISBANE);

  await addGroupExpense({
    group: 'Brisbane',
    payer: 'Casey',
    sharers: ['Casey', 'Taylor (You)'],
    amount: '0.01',
  });

  await showExpenses();
  await waitFor(() => expect(cardTitles()).toEqual(['Dinner']));
});

test('[LEDGER-64.1] leaves out a group expense you neither paid nor share', async () => {
  await startWithGroups(BRISBANE);
  await addExpense();

  await addGroupExpense({
    group: 'Brisbane',
    payer: 'Casey',
    sharers: ['Blake'],
  });

  await showExpenses();
  expect(await storedExpenses()).toHaveLength(2);
  await waitFor(() => expect(cardTitles()).toEqual(['Coffee run']));
});

test('[LEDGER-64.1] lists group expenses with personal ones, newest date first', async () => {
  await startWithGroups(BRISBANE);
  await addExpense({ title: 'Coffee run', date: '2025-01-02' });
  await addGroupExpense({
    group: 'Brisbane',
    payer: 'Casey',
    sharers: ['Taylor (You)'],
    title: 'Dinner',
    date: '2025-01-03',
  });

  await addGroupExpense({
    group: 'Brisbane',
    payer: 'Casey',
    sharers: ['Taylor (You)'],
    title: 'Taxi',
    date: '2025-01-01',
  });

  await showExpenses();
  await waitFor(() =>
    expect(cardTitles()).toEqual(['Dinner', 'Coffee run', 'Taxi']),
  );
});

test("[LEDGER-64.1] keeps listing an archived group's expense", async () => {
  await startWithGroups(BRISBANE);
  await addDinner();

  await archiveGroup('Brisbane');

  await showExpenses();
  await waitFor(() => expect(cardTitles()).toEqual(['Dinner']));
});

// The card

test("[LEDGER-65.1] shows the group's name between the category and the date, with your share as the amount", async () => {
  await startWithGroups(BRISBANE);

  await addDinner();

  await showExpenses();
  const expected = [
    'Dinner',
    '$33.34',
    'Food & Dining',
    'Brisbane',
    'Oct 30, 2026',
  ];
  await waitFor(() =>
    expect(shownInOrder(linesIn(card('Dinner')), expected)).toEqual(expected),
  );
  expect(cards()).toHaveLength(1);
  expect(shownInOrder([readOut(card('Dinner'))], expected)).toEqual(expected);
});

test('[LEDGER-65.1] shows $0.00 on the card of a group expense you only paid', async () => {
  await startWithGroups(BRISBANE);

  await addGroupExpense({
    group: 'Brisbane',
    payer: 'Taylor (You)',
    sharers: ['Casey', 'Blake'],
  });

  await showExpenses();
  await waitFor(() =>
    expect(shownInOrder(linesIn(card('Dinner')), ['Dinner', '$0.00'])).toEqual([
      'Dinner',
      '$0.00',
    ]),
  );
});

test('[LEDGER-65.1] counts only your share of a group expense in Your Total Share', async () => {
  await startWithGroups(BRISBANE);
  await addExpense();

  await addDinner();

  await showExpenses();
  await waitFor(() =>
    expect(totalShareLines()).toEqual(['Your Total Share: $42.09']),
  );
});

test('[LEDGER-65.1] marks the group as archived on the card until the group is restored', async () => {
  await startWithGroups(BRISBANE);
  await addDinner();

  await archiveGroup('Brisbane');
  await showExpenses();

  await waitFor(() =>
    expect(linesIn(card('Dinner'))).toContain('Brisbane · Archived'),
  );
  await restoreGroup('Brisbane');
  await showExpenses();
  await waitFor(() => expect(linesIn(card('Dinner'))).toContain('Brisbane'));
  expect(linesIn(card('Dinner'))).not.toContain('Brisbane · Archived');
});

test("[LEDGER-65.1] shows the group's new name on the card", async () => {
  await startWithGroups(BRISBANE);
  await addDinner();

  await renameGroup('Brisbane', 'Sydney');
  await showExpenses();

  await waitFor(() => expect(linesIn(card('Dinner'))).toContain('Sydney'));
  expect(linesIn(card('Dinner'))).not.toContain('Brisbane');
});

test("[LEDGER-65.1] offers Delete expense on a personal expense's card but not on a group expense's", async () => {
  await startWithGroups(BRISBANE);
  await addExpense();
  await addDinner();

  await showExpenses();

  await waitFor(() =>
    expect(actionLabels(card('Coffee run'))).toContain('Delete expense'),
  );
  expect(actionLabels(card('Dinner'))).not.toContain('Delete expense');
});

test("[LEDGER-65.1] [LEDGER-33.2] shows the category's color dot on a group expense's card, and <name> (Archived) once the group's category is archived", async () => {
  await startWithGroups(BRISBANE);
  await addDinner();
  await showExpenses();

  const shown = card('Dinner');
  expect(dotColors(shown)).toEqual(['#D81B60']);
  const [dot] = colorDots(shown);
  expect(
    inTreeOrder(
      within(shown).getByText('$33.34'),
      dot,
      within(shown).getByText('Food & Dining'),
    ),
  ).toBe(true);
  expect(isUnread(dot)).toBe(true);

  const { id } = await storedGroup(file, 'Brisbane');
  await archiveGroupCategory(id, 'Food & Dining');

  const expected = [
    'Dinner',
    '$33.34',
    'Food & Dining (Archived)',
    'Brisbane',
    'Oct 30, 2026',
  ];
  await waitFor(() =>
    expect(shownInOrder(linesIn(card('Dinner')), expected)).toEqual(expected),
  );
  expect(shownInOrder([readOut(card('Dinner'))], expected)).toEqual(expected);
  expect(dotColors(card('Dinner'))).toEqual(['#D81B60']);
  const [archivedDot] = colorDots(card('Dinner'));
  expect(opacityIn(expensesRoot(), archivedDot)).toBe(1);
});

// The details

test('[LEDGER-66.1] shows what you paid, your share, what you are owed, then each payment and share', async () => {
  await startWithGroups(BRISBANE);
  await addGroupExpense({
    group: 'Brisbane',
    payer: 'Taylor (You)',
    sharers: ['Taylor (You)', 'Casey', 'Blake'],
    amount: '60.00',
  });
  await showExpenses();

  await openDetails('Dinner');

  const expected = [
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
    'Taylor (You)',
    '$60.00',
    'SPLIT',
    'Taylor (You)',
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
  expect(shownInOrder(detailLines(), expected)).toEqual(expected);
});

test('[LEDGER-66.1] says what you owe when someone else paid', async () => {
  await startWithGroups(BRISBANE);
  await addGroupExpense({
    group: 'Brisbane',
    payer: 'Casey',
    sharers: ['Taylor (You)', 'Casey', 'Blake'],
    amount: '60.00',
  });
  await showExpenses();

  await openDetails('Dinner');

  const expected = [
    'You paid',
    '$0.00',
    'Your share',
    '$20.00',
    'You owe',
    '$20.00',
    'PAID BY',
    'Casey',
    '$60.00',
  ];
  expect(shownInOrder(detailLines(), expected)).toEqual(expected);
  expect(detailLines()).not.toContain('You are owed');
});

test('[LEDGER-66.1] says Settled up when what you paid is your share', async () => {
  await startWithGroups(BRISBANE);
  await addGroupExpense({
    group: 'Brisbane',
    payer: 'Taylor (You)',
    sharers: ['Taylor (You)'],
    amount: '20.00',
  });
  await showExpenses();

  await openDetails('Dinner');

  const expected = [
    'You paid',
    '$20.00',
    'Your share',
    '$20.00',
    'Settled up',
    '$0.00',
  ];
  expect(shownInOrder(detailLines(), expected)).toEqual(expected);
});

test("[LEDGER-66.1] shows $0.00 and Settled up on the details of a group expense you have no part in, opened from the group's screen", async () => {
  await startWithGroups(BRISBANE);
  await addGroupExpense({
    group: 'Brisbane',
    payer: 'Casey',
    sharers: ['Blake'],
  });
  await tapTab('Groups');
  await openGroup('Brisbane');
  await waitFor(() => expect(groupCardTitles('Brisbane')).toEqual(['Dinner']));

  await fireEvent.press(groupCard('Brisbane', 'Dinner'));
  await expectDetailsOn('Groups', 'Dinner');

  const expected = [
    'You paid',
    '$0.00',
    'Your share',
    '$0.00',
    'Settled up',
    '$0.00',
  ];
  expect(shownInOrder(detailLinesOn('Groups'), expected)).toEqual(expected);
});

test('[LEDGER-66.1] lists the split in its stored order by current names, a former member by their name', async () => {
  await startWithGroups(BRISBANE);
  await addDinner();
  await renameInGroup('Brisbane', 'Casey', 'Cass');
  await removeFromGroup('Brisbane', 'Blake');
  await showExpenses();

  await openDetails('Dinner');

  const expected = [
    'SPLIT',
    'Blake',
    '$33.34',
    'Taylor (You)',
    '$33.34',
    'Cass',
    '$33.33',
    'DETAILS',
  ];
  expect(shownInOrder(detailLines(), expected)).toEqual(expected);
  expect(detailLines()).not.toContain('Former member');
});

test('[LEDGER-66.1] shows the note after the DETAILS section', async () => {
  await startWithGroups(BRISBANE);
  await addGroupExpense({
    group: 'Brisbane',
    payer: 'Casey',
    sharers: ['Taylor (You)'],
    note: 'Birthday',
  });
  await showExpenses();

  await openDetails('Dinner');

  const expected = ['DETAILS', 'Group', 'Brisbane', 'Date', 'NOTE', 'Birthday'];
  expect(shownInOrder(detailLines(), expected)).toEqual(expected);
});

test("[LEDGER-66.1] opens a group expense's details from its URL", async () => {
  const app = await startWithGroups(BRISBANE);
  await addDinner();
  const [dinner] = await storedExpenses();
  await app.unmount();
  await settle();

  await startExpensesAt(`/expenses/${dinner.id}`);

  await expectDetailsOn('Expenses', 'Dinner');
  expect(detailLinesOn('Expenses')).toContain('YOUR POSITION');
  expect(detailLinesOn('Expenses')).not.toContain(NOT_FOUND);
});

test("[LEDGER-66.1] puts only Edit on a group expense's details, without Expense actions", async () => {
  await startWithGroups(BRISBANE);
  await addDinner();
  await showExpenses();

  await openDetails('Dinner');

  expect(
    expenseBarItems('Expenses').map((item) =>
      'menu' in item ? item.menu : item.button,
    ),
  ).toEqual(['Edit']);
});

test("[LEDGER-66.1] [LEDGER-37.2] shows the category's color dot on a group expense's details, and <name> (Archived) once the group's category is archived", async () => {
  await startWithGroups(BRISBANE);
  await addDinner();
  const { id } = await storedGroup(file, 'Brisbane');
  await archiveGroupCategory(id, 'Food & Dining');

  await openDetails('Dinner');

  const expected = [
    'DETAILS',
    'Group',
    'Brisbane',
    'Category',
    'Food & Dining (Archived)',
    'Date',
  ];
  expect(shownInOrder(detailLines(), expected)).toEqual(expected);
  expect(dotColors(detailScreen())).toEqual(['#D81B60']);
  const [dot] = colorDots(detailScreen());
  const details = within(detailScreen());
  expect(
    inTreeOrder(
      details.getByText('Category'),
      dot,
      details.getByText('Food & Dining (Archived)'),
    ),
  ).toBe(true);
  expect(isUnread(dot)).toBe(true);
  expect(opacityIn(detailScreen(), dot)).toBe(1);
});

// Archived groups

test("[LEDGER-67.1] shows the shared history notice and the status of an archived group's expense, with Edit disabled", async () => {
  await startWithGroups(BRISBANE);
  await addDinner();
  await archiveGroup('Brisbane');
  await showExpenses();

  await openDetails('Dinner');

  const expected = [
    'Dinner',
    '$100.01',
    SHARED_HISTORY,
    SHARED_HISTORY_TEXT,
    'YOUR POSITION',
    'DETAILS',
    'Group',
    'Brisbane',
    'Status',
    'Archived · Read-only',
    'Category',
  ];
  expect(shownInOrder(detailLines(), expected)).toEqual(expected);
  expect(editOn('Expenses')?.disabled).toBe(true);
});

test('[LEDGER-67.1] shows no notice or status once the group is restored, and Edit can be pressed again', async () => {
  await startWithGroups(BRISBANE);
  await addDinner();
  await archiveGroup('Brisbane');
  await restoreGroup('Brisbane');
  await showExpenses();

  await openDetails('Dinner');

  expect(detailLines()).not.toContain(SHARED_HISTORY);
  expect(detailLines()).not.toContain('Status');
  expect(editOn('Expenses')?.disabled).toBe(false);
});
