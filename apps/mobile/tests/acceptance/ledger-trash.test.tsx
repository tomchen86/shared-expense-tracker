import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Alert, processColor } from 'react-native';
import {
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';
import {
  addCategory,
  addExpense,
  nameOf,
  namesWithAction,
  resetPhone,
  restart,
  startExpenses,
  storedExpenses,
} from './ledger-expense-app';
import {
  EMPTY_LIST,
  NOT_FOUND,
  NO_EXPENSE_ID,
  allowReads,
  card,
  cards,
  detailBars,
  detailLines,
  expensesRoot,
  goBackFromDetails,
  hasEdit,
  holdReads,
  linesIn,
  openDetails,
  phoneDatabaseWithReads,
  readOut,
  shownInOrder,
  startExpensesAt,
  totalShareLines,
} from './ledger-expense-list-app';
import {
  DELETE_EXPENSE,
  EMPTY_TRASH,
  IN_TRASH,
  MOVED,
  NO_DELETED,
  TRASH_FAILED,
  actionLabels,
  announcements,
  changeScreenReader,
  chooseExpenseAction,
  deleteByAction,
  expectCards,
  expectTrash,
  expenseBarItems,
  expenseBars,
  expenseLines,
  expenseScreen,
  fakeScreenReader,
  goBackFromTrashed,
  hasExpenseActions,
  lastAlertButtonStyles,
  moveCategoryExpenses,
  movedAnnouncement,
  noticeLines,
  noticeShown,
  noticeShownOn,
  noticeView,
  openTrash,
  openTrashed,
  pressEmptyTrash,
  pressRestore,
  pressUndo,
  removeCategory,
  restoreFromTrash,
  trashButtonNames,
  trashCard,
  trashCards,
  trashLines,
  trashRow,
  trashRowCounts,
  undoButton,
  wait,
} from './ledger-trash-app';
import { createGroup, localData, saveName } from './groups-app';
import {
  alertsShown,
  barTitled,
  goBackFrom,
  openGroup,
  pressAlertButton,
  screenOf,
} from './group-details-app';
import {
  allowWrites,
  colorsInBoth,
  failWrites,
  failWritesAfter,
  fakePhoneAppearance,
  fixedColors,
  holdWrites,
  settle,
  switchPhoneTo,
  textsWithoutColor,
} from './shell-appearance-app';
import {
  navigationBarTitles,
  selectedTab,
  tab,
  tapTab,
} from './shell-tabs-app';
import type { Database } from '../../src/storage';

// Runs on iOS; ledger-trash-android.test.tsx checks what Android shows differently.
// Each test starts the app on a phone database file of its own, in Taipei on
// 2026-10-30, in a region whose currency is USD, with no screen reader on, and adds
// its expenses through New Expense. A test can hold or fail the app's writes, as a
// slow or full disk would, and hold its reads to see a screen before its data.

let mockOpen: () => Promise<Database>;

jest.mock('../../src/storage/expo', () => ({
  openPhoneDatabase: () => mockOpen(),
}));

// Not virtual, as in the expense form tests.
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

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
    Heavy: 'heavy',
    Soft: 'soft',
    Rigid: 'rigid',
  },
  NotificationFeedbackType: {
    Success: 'success',
    Warning: 'warning',
    Error: 'error',
  },
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
}));

let directory: string;
let file: string;

beforeEach(() => {
  jest.clearAllMocks();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'expense-trash-'));
  file = path.join(directory, 'app.db');
  mockOpen = async () => phoneDatabaseWithReads(file);
  allowWrites();
  allowReads();
  resetPhone();
  fakeScreenReader(false);
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});

/** Starts the app with Coffee run for 8.75 and Lunch for 12.50, both today. */
async function startWithTwo() {
  const app = await startExpenses();
  await addExpense({ title: 'Coffee run', amount: '8.75' });
  await addExpense({ title: 'Lunch', amount: '12.50' });
  return app;
}

async function idOf(title: string) {
  const expense = (await storedExpenses()).find(
    (candidate) => candidate.title === title,
  );
  if (expense === undefined) throw new Error(`No expense titled ${title}`);
  return expense.id;
}

/** Adds the category Gym and an expense in it, Squat rack. */
async function addGymExpense() {
  await addCategory('Gym');
  await addExpense({ title: 'Squat rack', category: 'Gym' });
}

const ARCHIVE_GYM = [
  'Archive “Gym”?',
  'This category is used by 1 expense. Existing expenses will keep their category, but it will no longer appear for new expenses.',
];
const DELETE_GYM = [
  'Delete Category?',
  'This permanently removes the category.',
];

const DETAILS_OF_COFFEE_RUN = [
  'Coffee run',
  '$8.75',
  'DETAILS',
  'Category',
  'Shopping',
  'Date',
  'Dec 25, 2024',
  'NOTE',
  'Morning treat',
];

/** Adds Coffee run for 8.75 in Shopping on 2024-12-25 with the note Morning treat. */
const addFullCoffeeRun = () =>
  addExpense({
    category: 'Shopping',
    date: '2024-12-25',
    note: 'Morning treat',
  });

// The expense list

test('[LEDGER-31.2] leaves an expense in the trash off the list, also after the app restarts', async () => {
  const app = await startWithTwo();

  await deleteByAction('Lunch');
  await restart(app);

  await expectCards(['Coffee run']);
});

// Moving an expense to the trash

test('[LEDGER-71.1] offers Delete expense on every card', async () => {
  await startWithTwo();

  expect(actionLabels(card('Coffee run'))).toContain('Delete expense');
  expect(actionLabels(card('Lunch'))).toContain('Delete expense');
});

test('[LEDGER-71.1] moves an expense to the trash without asking, and leaves it out of the list and Your Total Share', async () => {
  await startWithTwo();

  await deleteByAction('Lunch');

  expect(alertsShown()).toEqual([]);
  await expectCards(['Coffee run']);
  expect(totalShareLines()).toEqual(['Your Total Share: $8.75']);
});

test('[LEDGER-71.1] shows the empty list text once the last card moves to the trash, also after the app restarts', async () => {
  const app = await startExpenses();
  await addExpense();

  await deleteByAction('Coffee run');

  await expectCards([]);
  expect(linesIn(expensesRoot())).toContain(EMPTY_LIST);
  expect(totalShareLines()).toEqual(['Your Total Share: —']);
  await restart(app);
  await waitFor(() => expect(linesIn(expensesRoot())).toContain(EMPTY_LIST));
  expect(cards()).toEqual([]);
  expect(totalShareLines()).toEqual(['Your Total Share: —']);
});

test('[LEDGER-71.1] keeps the card on the list until the move to the trash is saved', async () => {
  await startWithTwo();
  const writes = holdWrites();

  await deleteByAction('Lunch');

  expect(cards().map((shown) => linesIn(shown)[0])).toEqual([
    'Lunch',
    'Coffee run',
  ]);
  await writes.release();
  await settle();
  await expectCards(['Coffee run']);
});

test('[LEDGER-71.1] moves the expense once when Delete expense is used again before the move is saved', async () => {
  await startWithTwo();
  const writes = holdWrites();

  await deleteByAction('Lunch');
  await deleteByAction('Lunch');
  await writes.release();
  await settle();

  await expectCards(['Coffee run']);
  expect(announcements()).toEqual([movedAnnouncement('Lunch')]);
  await openTrash();
  await expectTrash(['Lunch']);
});

test('[LEDGER-71.1] keeps an expense in the trash after the app restarts', async () => {
  const app = await startWithTwo();
  await deleteByAction('Lunch');

  await restart(app);

  await expectCards(['Coffee run']);
  await openTrash();
  await expectTrash(['Lunch']);
});

test('[LEDGER-71.1] shows only Expense not found. at the URL of an expense in the trash', async () => {
  const app = await startWithTwo();
  const lunch = await idOf('Lunch');
  await deleteByAction('Lunch');
  await app.unmount();
  await settle();

  await startExpensesAt(`/expenses/${lunch}`);

  await waitFor(() => expect(detailBars()).toHaveLength(1));
  await waitFor(() => expect(detailLines()).toEqual([NOT_FOUND]));
  expect(hasEdit()).toBe(false);
  expect(hasExpenseActions('Expenses')).toBe(false);
});

test('[LEDGER-71.1] still counts an expense in the trash as using its category', async () => {
  await startExpenses();
  await addGymExpense();

  await deleteByAction('Squat rack');

  expect(await removeCategory('Gym')).toEqual(ARCHIVE_GYM);
});

test('[LEDGER-71.1] lets Move Expenses… move an expense in the trash out of its category', async () => {
  await startExpenses();
  await addGymExpense();
  await deleteByAction('Squat rack');

  await moveCategoryExpenses('Gym', 'Shopping');

  expect(namesWithAction(tab('Settings'), 'Delete')).toContain('Restore Gym');
  await goBackFrom('Manage Categories');
  await restoreFromTrash('Squat rack');
  await tapTab('Expenses');
  await expectCards(['Squat rack']);
  expect(linesIn(card('Squat rack'))).toContain('Shopping');
});

// Delete on the details

test('[LEDGER-72.1] [SHELL-53.1] puts Expense actions, with Delete in red, at the right of Edit on the details on iOS', async () => {
  await startExpenses();
  await addExpense();

  await openDetails('Coffee run');

  expect(expenseBarItems('Expenses')).toEqual([
    {
      menu: 'Expense actions',
      icon: 'ellipsis.circle',
      items: [{ title: 'Delete', destructive: true }],
    },
    { button: 'Edit', variant: 'plain' },
  ]);
});

test('[LEDGER-72.1] moves the expense to the trash and goes back to the list when Delete is chosen on the details', async () => {
  await startWithTwo();
  await openDetails('Lunch');

  await chooseExpenseAction('Expenses', 'Delete');

  expect(alertsShown()).toEqual([]);
  await waitFor(() =>
    expect(navigationBarTitles(tab('Expenses'))).toEqual(['Expenses']),
  );
  await expectCards(['Coffee run']);
  expect(noticeShown()).toBe(true);
});

test('[LEDGER-72.1] keeps the details open until the move to the trash is saved', async () => {
  await startWithTwo();
  await openDetails('Lunch');
  const writes = holdWrites();

  await chooseExpenseAction('Expenses', 'Delete');

  expect(detailBars()).toHaveLength(1);
  expect(detailLines()).toContain('Lunch');
  await writes.release();
  await settle();
  await waitFor(() =>
    expect(navigationBarTitles(tab('Expenses'))).toEqual(['Expenses']),
  );
});

test('[LEDGER-72.1] goes back once when Delete is chosen again before the move is saved', async () => {
  await startWithTwo();
  await openDetails('Lunch');
  const writes = holdWrites();

  await chooseExpenseAction('Expenses', 'Delete');
  await chooseExpenseAction('Expenses', 'Delete');
  await writes.release();
  await settle();

  await waitFor(() =>
    expect(navigationBarTitles(tab('Expenses'))).toEqual(['Expenses']),
  );
  expect(selectedTab()).toBe('Expenses');
  expect(announcements()).toEqual([movedAnnouncement('Lunch')]);
});

test('[LEDGER-72.1] offers no Expense actions with Expense not found.', async () => {
  await startExpensesAt(`/expenses/${NO_EXPENSE_ID}`);

  await waitFor(() => expect(detailLines()).toEqual([NOT_FOUND]));
  expect(hasExpenseActions('Expenses')).toBe(false);
});

// The Undo notice

test('[LEDGER-73.1] shows Moved to Trash · Undo and announces it once the move is saved', async () => {
  await startExpenses();
  await addExpense();

  await deleteByAction('Coffee run');

  const expected = [MOVED, '·', 'Undo'];
  expect(shownInOrder(noticeLines(), expected)).toEqual(expected);
  expect(undoButton('Coffee run')).not.toBeNull();
  expect(within(undoButton('Coffee run')!).getByText('Undo')).toBeOnTheScreen();
  expect(announcements()).toEqual([movedAnnouncement('Coffee run')]);
});

test('[LEDGER-73.1] shows and announces nothing before the move is saved', async () => {
  await startExpenses();
  await addExpense();
  const writes = holdWrites();

  await deleteByAction('Coffee run');

  expect(noticeShown()).toBe(false);
  expect(announcements()).toEqual([]);
  await writes.release();
  await settle();
  expect(noticeShown()).toBe(true);
});

test('[LEDGER-73.1] keeps the notice and its Undo on another tab', async () => {
  await startExpenses();
  await addExpense();
  await deleteByAction('Coffee run');

  await tapTab('Groups');

  expect(noticeShownOn('Groups')).toBe(true);
  await pressUndo('Coffee run');
  await tapTab('Expenses');
  await expectCards(['Coffee run']);
});

test('[LEDGER-73.1] gives the Undo to the newest expense moved to the trash', async () => {
  await startWithTwo();
  await deleteByAction('Coffee run');
  await wait(3000);

  await deleteByAction('Lunch');

  expect(announcements()).toEqual([
    movedAnnouncement('Coffee run'),
    movedAnnouncement('Lunch'),
  ]);
  expect(undoButton('Lunch')).not.toBeNull();
  expect(undoButton('Coffee run')).toBeNull();
  await wait(4900);
  expect(noticeShown()).toBe(true);
  await wait(100);
  expect(noticeShown()).toBe(false);
  await openTrash();
  await expectTrash(['Lunch', 'Coffee run']);
});

// How long the notice stays

test('[LEDGER-74.1] hides the notice 5 seconds after the move is saved, leaving the expense in the trash', async () => {
  await startExpenses();
  await addExpense();

  await deleteByAction('Coffee run');

  await wait(4900);
  expect(noticeShown()).toBe(true);
  await wait(100);
  expect(noticeShown()).toBe(false);
  await openTrash();
  await expectTrash(['Coffee run']);
});

test('[LEDGER-74.1] shows the notice for 15 seconds while a screen reader is on', async () => {
  fakeScreenReader(true);
  await startExpenses();
  await addExpense();

  await deleteByAction('Coffee run');

  await wait(14900);
  expect(noticeShown()).toBe(true);
  await wait(100);
  expect(noticeShown()).toBe(false);
});

test('[LEDGER-74.1] counts 15 seconds again when a screen reader is turned on', async () => {
  await startExpenses();
  await addExpense();
  await deleteByAction('Coffee run');
  await wait(2000);

  await changeScreenReader(true);

  await wait(14900);
  expect(noticeShown()).toBe(true);
  await wait(100);
  expect(noticeShown()).toBe(false);
});

test('[LEDGER-74.1] counts 5 seconds again when the screen reader is turned off', async () => {
  fakeScreenReader(true);
  await startExpenses();
  await addExpense();
  await deleteByAction('Coffee run');
  await wait(5000);

  await changeScreenReader(false);

  await wait(4900);
  expect(noticeShown()).toBe(true);
  await wait(100);
  expect(noticeShown()).toBe(false);
});

test('[LEDGER-74.1] hides the notice once its expense is restored from Trash', async () => {
  await startExpenses();
  await addExpense();
  await deleteByAction('Coffee run');
  await openTrash();
  await openTrashed('Coffee run');

  await pressRestore();

  expect(noticeShown()).toBe(false);
});

test('[LEDGER-74.1] hides the notice once its expense is deleted for good', async () => {
  await startExpenses();
  await addExpense();
  await deleteByAction('Coffee run');
  await openTrash();
  await openTrashed('Coffee run');

  await chooseExpenseAction('Settings', 'Delete Permanently');
  await pressAlertButton('Delete');

  expect(noticeShown()).toBe(false);
});

test('[LEDGER-74.1] hides the notice once the trash is emptied', async () => {
  await startExpenses();
  await addExpense();
  await deleteByAction('Coffee run');
  await openTrash();
  await expectTrash(['Coffee run']);

  await pressEmptyTrash();
  await pressAlertButton('Empty Trash');

  expect(noticeShown()).toBe(false);
});

test('[LEDGER-74.1] keeps the notice when another expense is restored from Trash', async () => {
  await startWithTwo();
  await deleteByAction('Lunch');
  await deleteByAction('Coffee run');
  await openTrash();
  await openTrashed('Lunch');

  await pressRestore();

  expect(noticeShown()).toBe(true);
  expect(undoButton('Coffee run')).not.toBeNull();
});

// Undo

test('[LEDGER-75.1] puts the expense back on the list and in Your Total Share when Undo is pressed', async () => {
  await startWithTwo();
  await deleteByAction('Lunch');

  await pressUndo('Lunch');

  expect(alertsShown()).toEqual([]);
  expect(noticeShown()).toBe(false);
  await expectCards(['Lunch', 'Coffee run']);
  expect(totalShareLines()).toEqual(['Your Total Share: $21.25']);
  await openTrash();
  await waitFor(() => expect(trashLines()).toEqual([NO_DELETED]));
});

test('[LEDGER-75.1] puts an expense back in its place among expenses of the same date', async () => {
  await startExpenses();
  await addExpense({ title: 'E', date: '2025-01-01' });
  await addExpense({ title: 'F', date: '2025-01-01' });
  await addExpense({ title: 'D', date: '2025-01-01' });
  await deleteByAction('F');

  await pressUndo('F');

  await expectCards(['D', 'F', 'E']);
});

test('[LEDGER-75.1] puts back an expense deleted on its details without opening them again', async () => {
  await startWithTwo();
  await openDetails('Lunch');
  await chooseExpenseAction('Expenses', 'Delete');
  await waitFor(() =>
    expect(navigationBarTitles(tab('Expenses'))).toEqual(['Expenses']),
  );

  await pressUndo('Lunch');

  await expectCards(['Lunch', 'Coffee run']);
  expect(navigationBarTitles(tab('Expenses'))).toEqual(['Expenses']);
});

test('[LEDGER-75.1] keeps an expense put back with Undo after the app restarts', async () => {
  const app = await startWithTwo();
  await deleteByAction('Lunch');
  await pressUndo('Lunch');

  await restart(app);

  await expectCards(['Lunch', 'Coffee run']);
});

// The Trash row on the Settings root

test('[LEDGER-76.1] shows 0 at the Trash row before anything is deleted', async () => {
  await startExpenses();

  await tapTab('Settings');

  await waitFor(() => expect(trashRowCounts()).toEqual(['0']));
  expect(nameOf(trashRow())).toBe('Trash, 0');
});

test('[LEDGER-76.1] counts the expenses in the trash at the Trash row', async () => {
  await startWithTwo();
  await deleteByAction('Coffee run');
  await deleteByAction('Lunch');

  await tapTab('Settings');

  await waitFor(() => expect(trashRowCounts()).toEqual(['2']));
  expect(nameOf(trashRow())).toBe('Trash, 2');
});

test('[LEDGER-76.1] counts one less at the Trash row once an expense is restored', async () => {
  await startWithTwo();
  await deleteByAction('Coffee run');
  await deleteByAction('Lunch');

  await restoreFromTrash('Lunch');
  await goBackFrom('Trash');

  await waitFor(() => expect(trashRowCounts()).toEqual(['1']));
  expect(nameOf(trashRow())).toBe('Trash, 1');
});

test('[LEDGER-76.1] shows no count at the Trash row before the Settings root reads the expenses', async () => {
  const first = await startWithTwo();
  await deleteByAction('Lunch');
  await first.unmount();
  await settle();
  const reads = holdReads();
  await startExpenses();

  await tapTab('Settings');

  expect(trashRowCounts()).toEqual([]);
  expect(nameOf(trashRow())).toBe('Trash');
  await reads.release();
  await waitFor(() => expect(trashRowCounts()).toEqual(['1']));
  expect(nameOf(trashRow())).toBe('Trash, 1');
});

// Trash

test('[LEDGER-77.1] lists the expenses in the trash, the last one moved in first', async () => {
  await startExpenses();
  await addExpense({ title: 'A', date: '2025-01-03' });
  await addExpense({ title: 'B', date: '2025-01-01' });
  await addExpense({ title: 'C', date: '2025-01-02' });

  await deleteByAction('A');
  await deleteByAction('C');
  await deleteByAction('B');

  await openTrash();
  await expectTrash(['B', 'C', 'A']);
});

test('[LEDGER-77.1] puts an expense moved to the trash again on top', async () => {
  await startExpenses();
  await addExpense({ title: 'A', date: '2025-01-03' });
  await addExpense({ title: 'B', date: '2025-01-01' });
  await addExpense({ title: 'C', date: '2025-01-02' });
  await deleteByAction('A');
  await deleteByAction('C');
  await deleteByAction('B');
  await restoreFromTrash('A');
  await expectTrash(['B', 'C']);
  await tapTab('Expenses');

  await deleteByAction('A');

  await openTrash();
  await expectTrash(['A', 'B', 'C']);
});

test('[LEDGER-77.1] shows the cards on Trash as the expense list does, without Delete', async () => {
  await startExpenses();
  await addExpense({ note: 'Morning treat' });
  await deleteByAction('Coffee run');

  await openTrash();

  await expectTrash(['Coffee run']);
  const shown = trashCard('Coffee run');
  const expected = ['Coffee run', '$8.75', 'Food & Dining', 'Oct 30, 2026'];
  expect(shownInOrder(linesIn(shown), expected)).toEqual(expected);
  expect(linesIn(shown)).not.toContain('Morning treat');
  expect(shownInOrder([readOut(shown)], expected)).toEqual(expected);
  expect(actionLabels(shown)).not.toContain('Delete expense');
  expect(
    within(screenOf('Trash')).queryByLabelText('Delete Coffee run expense', {
      includeHiddenElements: true,
    }),
  ).toBeNull();
});

test('[LEDGER-77.1] lists only the expenses in the trash', async () => {
  await startWithTwo();

  await deleteByAction('Lunch');

  await openTrash();
  await expectTrash(['Lunch']);
});

test('[LEDGER-77.1] shows an expense moved to the trash while Trash stays open', async () => {
  await startWithTwo();
  await openTrash();
  await waitFor(() => expect(trashLines()).toEqual([NO_DELETED]));
  await tapTab('Expenses');

  await deleteByAction('Lunch');
  await tapTab('Settings');

  await expectTrash(['Lunch']);
});

test('[LEDGER-77.1] shows only No deleted expenses. on an empty Trash', async () => {
  await startExpenses();

  await openTrash();

  await waitFor(() => expect(trashLines()).toEqual([NO_DELETED]));
  expect(trashCards()).toEqual([]);
});

test('[LEDGER-77.1] never shows No deleted expenses. while Trash reads the expenses', async () => {
  const first = await startWithTwo();
  await deleteByAction('Lunch');
  await first.unmount();
  await settle();
  const reads = holdReads();
  await startExpenses();

  await openTrash();
  await settle();

  expect(screen.queryByText(NO_DELETED)).toBeNull();
  await reads.release();
  await expectTrash(['Lunch']);
  expect(screen.queryByText(NO_DELETED)).toBeNull();
});

// The read-only details

test('[LEDGER-78.1] pushes the read-only details of a card on Trash onto the Settings tab', async () => {
  const app = await startExpenses();
  await addFullCoffeeRun();
  const id = await idOf('Coffee run');
  await deleteByAction('Coffee run');
  await openTrash();

  await openTrashed('Coffee run');

  expect(selectedTab()).toBe('Settings');
  expect(navigationBarTitles(tab('Settings'))).toEqual([
    'Settings',
    'Trash',
    'Expense',
  ]);
  expect(app.getPathname()).toBe(`/settings/trash/${id}`);
  const expected = [IN_TRASH, 'Restore', ...DETAILS_OF_COFFEE_RUN];
  expect(shownInOrder(expenseLines('Settings'), expected)).toEqual(expected);
  expect(
    within(expenseScreen('Settings')).getByRole('button', { name: 'Restore' }),
  ).toBeOnTheScreen();
});

test('[LEDGER-78.1] puts only Expense actions, with Delete Permanently in red, on the read-only details on iOS', async () => {
  await startExpenses();
  await addExpense();
  await deleteByAction('Coffee run');
  await openTrash();

  await openTrashed('Coffee run');

  expect(expenseBarItems('Settings')).toEqual([
    {
      menu: 'Expense actions',
      icon: 'ellipsis.circle',
      items: [{ title: 'Delete Permanently', destructive: true }],
    },
  ]);
});

test('[LEDGER-78.1] pushes one read-only details when a card on Trash is pressed twice', async () => {
  await startExpenses();
  await addExpense();
  await deleteByAction('Coffee run');
  await openTrash();
  await expectTrash(['Coffee run']);

  const pressed = trashCard('Coffee run');
  await fireEvent.press(pressed);
  await fireEvent.press(pressed);
  await waitFor(() => expect(expenseBars('Settings')).toHaveLength(1));
  await settle();

  expect(navigationBarTitles(tab('Settings'))).toEqual([
    'Settings',
    'Trash',
    'Expense',
  ]);
  await goBackFromTrashed();
  expect(navigationBarTitles(tab('Settings'))).toEqual(['Settings', 'Trash']);
});

test('[LEDGER-78.1] goes back from the read-only details to Trash', async () => {
  await startExpenses();
  await addExpense();
  await deleteByAction('Coffee run');
  await openTrash();
  await openTrashed('Coffee run');

  await goBackFromTrashed();

  expect(selectedTab()).toBe('Settings');
  expect(navigationBarTitles(tab('Settings'))).toEqual(['Settings', 'Trash']);
  await expectTrash(['Coffee run']);
});

test('[LEDGER-78.1] never shows Expense not found. while the read-only details load', async () => {
  await startExpenses();
  await addExpense();
  await deleteByAction('Coffee run');
  await openTrash();
  await expectTrash(['Coffee run']);
  const reads = holdReads();

  await fireEvent.press(trashCard('Coffee run'));
  await waitFor(() => expect(expenseBars('Settings')).toHaveLength(1));
  await settle();

  expect(screen.queryByText(NOT_FOUND)).toBeNull();
  await reads.release();
  await waitFor(() => expect(expenseLines('Settings')).toContain('Coffee run'));
  expect(screen.queryByText(NOT_FOUND)).toBeNull();
});

test('[LEDGER-78.1] shows only Expense not found. at the Trash URL of an expense that is not in the trash', async () => {
  const first = await startWithTwo();
  const lunch = await idOf('Lunch');
  await first.unmount();
  await settle();

  await startExpensesAt(`/settings/trash/${lunch}`);

  await waitFor(() => expect(expenseBars('Settings')).toHaveLength(1));
  expect(selectedTab()).toBe('Settings');
  await waitFor(() => expect(expenseLines('Settings')).toEqual([NOT_FOUND]));
  expect(hasExpenseActions('Settings')).toBe(false);
});

test('[LEDGER-78.1] shows only Expense not found. once Undo takes the expense out of the trash', async () => {
  await startExpenses();
  await addExpense();
  await deleteByAction('Coffee run');
  await openTrash();
  await openTrashed('Coffee run');

  await pressUndo('Coffee run');

  await waitFor(() => expect(expenseLines('Settings')).toEqual([NOT_FOUND]));
  expect(hasExpenseActions('Settings')).toBe(false);
});

test('[LEDGER-78.1] shows only Expense not found. at the Trash URL of an ID that is no expense', async () => {
  await startExpensesAt(`/settings/trash/${NO_EXPENSE_ID}`);

  await waitFor(() => expect(expenseBars('Settings')).toHaveLength(1));
  await waitFor(() => expect(expenseLines('Settings')).toEqual([NOT_FOUND]));
  expect(hasExpenseActions('Settings')).toBe(false);
});

// Restore

test('[LEDGER-79.1] restores an expense from its read-only details without asking, back to its place', async () => {
  await startExpenses();
  await addExpense({ title: 'E', date: '2025-01-01' });
  await addExpense({ title: 'F', date: '2025-01-01' });
  await addExpense({ title: 'D', date: '2025-01-01' });
  await deleteByAction('F');
  await openTrash();
  await openTrashed('F');

  await pressRestore();

  expect(alertsShown()).toEqual([]);
  await waitFor(() =>
    expect(navigationBarTitles(tab('Settings'))).toEqual(['Settings', 'Trash']),
  );
  await waitFor(() => expect(trashLines()).toEqual([NO_DELETED]));
  await tapTab('Expenses');
  await expectCards(['D', 'F', 'E']);
});

test('[LEDGER-79.1] restores the expense as it was before it moved to the trash', async () => {
  await startExpenses();
  await addFullCoffeeRun();
  await deleteByAction('Coffee run');

  await restoreFromTrash('Coffee run');
  await tapTab('Expenses');

  await expectCards(['Coffee run']);
  expect(totalShareLines()).toEqual(['Your Total Share: $8.75']);
  await openDetails('Coffee run');
  expect(shownInOrder(detailLines(), DETAILS_OF_COFFEE_RUN)).toEqual(
    DETAILS_OF_COFFEE_RUN,
  );
});

test('[LEDGER-79.1] keeps the read-only details open until the restore is saved', async () => {
  await startExpenses();
  await addExpense();
  await deleteByAction('Coffee run');
  await openTrash();
  await openTrashed('Coffee run');
  const writes = holdWrites();

  await pressRestore();

  expect(expenseBars('Settings')).toHaveLength(1);
  await writes.release();
  await settle();
  await waitFor(() =>
    expect(navigationBarTitles(tab('Settings'))).toEqual(['Settings', 'Trash']),
  );
});

test('[LEDGER-79.1] restores once and goes back once when Restore is pressed again before it is saved', async () => {
  await startExpenses();
  await addExpense();
  await deleteByAction('Coffee run');
  await openTrash();
  await openTrashed('Coffee run');
  const writes = holdWrites();

  await pressRestore();
  await pressRestore();
  await writes.release();
  await settle();

  await waitFor(() =>
    expect(navigationBarTitles(tab('Settings'))).toEqual(['Settings', 'Trash']),
  );
  await waitFor(() => expect(trashLines()).toEqual([NO_DELETED]));
  await tapTab('Expenses');
  await expectCards(['Coffee run']);
});

// Delete Permanently

test('[LEDGER-80.1] asks before deleting an expense in the trash for good', async () => {
  await startExpenses();
  await addExpense();
  await deleteByAction('Coffee run');
  await openTrash();
  await openTrashed('Coffee run');

  await chooseExpenseAction('Settings', 'Delete Permanently');

  expect(alertsShown()).toEqual([DELETE_EXPENSE]);
  expect(lastAlertButtonStyles().map(([text]) => text)).toEqual([
    'Cancel',
    'Delete',
  ]);
  expect(lastAlertButtonStyles()[1][1]).toBe('destructive');
});

test('[LEDGER-80.1] deletes an expense in the trash for good and goes back to Trash', async () => {
  const app = await startWithTwo();
  await deleteByAction('Coffee run');
  await deleteByAction('Lunch');
  await openTrash();
  await openTrashed('Lunch');

  await chooseExpenseAction('Settings', 'Delete Permanently');
  await pressAlertButton('Delete');

  await waitFor(() =>
    expect(navigationBarTitles(tab('Settings'))).toEqual(['Settings', 'Trash']),
  );
  await expectTrash(['Coffee run']);
  await restart(app);
  await expectCards([]);
  await openTrash();
  await expectTrash(['Coffee run']);
});

test('[LEDGER-80.1] changes nothing when Cancel is pressed', async () => {
  await startExpenses();
  await addExpense();
  await deleteByAction('Coffee run');
  await openTrash();
  await openTrashed('Coffee run');

  await chooseExpenseAction('Settings', 'Delete Permanently');
  await pressAlertButton('Cancel');

  expect(expenseBars('Settings')).toHaveLength(1);
  await goBackFromTrashed();
  await expectTrash(['Coffee run']);
});

test('[LEDGER-80.1] no longer counts an expense deleted for good as using its category', async () => {
  await startExpenses();
  await addGymExpense();
  await deleteByAction('Squat rack');
  await openTrash();
  await openTrashed('Squat rack');

  await chooseExpenseAction('Settings', 'Delete Permanently');
  await pressAlertButton('Delete');
  await waitFor(() =>
    expect(navigationBarTitles(tab('Settings'))).toEqual(['Settings', 'Trash']),
  );
  await goBackFrom('Trash');

  expect(await removeCategory('Gym')).toEqual(DELETE_GYM);
});

// Empty Trash

test('[LEDGER-81.1] shows Empty Trash above the cards while the trash has expenses', async () => {
  await startExpenses();
  await addExpense();
  await deleteByAction('Coffee run');

  await openTrash();

  await expectTrash(['Coffee run']);
  expect(trashButtonNames()[0]).toBe('Empty Trash');
});

test('[LEDGER-81.1] asks before emptying the trash', async () => {
  await startExpenses();
  await addExpense();
  await deleteByAction('Coffee run');
  await openTrash();
  await expectTrash(['Coffee run']);

  await pressEmptyTrash();

  expect(alertsShown()).toEqual([EMPTY_TRASH]);
  expect(lastAlertButtonStyles().map(([text]) => text)).toEqual([
    'Cancel',
    'Empty Trash',
  ]);
  expect(lastAlertButtonStyles()[1][1]).toBe('destructive');
});

test('[LEDGER-81.1] deletes every expense in the trash for good when Empty Trash is confirmed', async () => {
  const app = await startExpenses();
  await addExpense({ title: 'Tea' });
  await addExpense({ title: 'Coffee run' });
  await addExpense({ title: 'Lunch' });
  await deleteByAction('Coffee run');
  await deleteByAction('Lunch');
  await openTrash();
  await expectTrash(['Lunch', 'Coffee run']);

  await pressEmptyTrash();
  await pressAlertButton('Empty Trash');

  await waitFor(() => expect(trashLines()).toEqual([NO_DELETED]));
  expect(trashButtonNames()).not.toContain('Empty Trash');
  await goBackFrom('Trash');
  await waitFor(() => expect(trashRowCounts()).toEqual(['0']));
  await tapTab('Expenses');
  await expectCards(['Tea']);
  await restart(app);
  await expectCards(['Tea']);
  await openTrash();
  await waitFor(() => expect(trashLines()).toEqual([NO_DELETED]));
});

test('[LEDGER-81.1] keeps the trash when Cancel is pressed', async () => {
  await startWithTwo();
  await deleteByAction('Coffee run');
  await deleteByAction('Lunch');
  await openTrash();
  await expectTrash(['Lunch', 'Coffee run']);

  await pressEmptyTrash();
  await pressAlertButton('Cancel');

  await expectTrash(['Lunch', 'Coffee run']);
});

test('[LEDGER-81.1] shows no Empty Trash on an empty Trash', async () => {
  await startExpenses();

  await openTrash();

  await waitFor(() => expect(trashLines()).toEqual([NO_DELETED]));
  expect(trashButtonNames()).not.toContain('Empty Trash');
});

test('[LEDGER-81.1] no longer counts emptied expenses as using their category', async () => {
  await startExpenses();
  await addGymExpense();
  await deleteByAction('Squat rack');
  await openTrash();
  await expectTrash(['Squat rack']);

  await pressEmptyTrash();
  await pressAlertButton('Empty Trash');
  await waitFor(() => expect(trashLines()).toEqual([NO_DELETED]));
  await goBackFrom('Trash');

  expect(await removeCategory('Gym')).toEqual(DELETE_GYM);
});

// When a change to the trash is not saved

test('[LEDGER-82.1] says the expense could not move to the trash, and keeps it, when the write fails', async () => {
  await startExpenses();
  await addExpense();
  const before = localData(file);
  failWrites();

  await deleteByAction('Coffee run');

  expect(alertsShown()).toEqual([TRASH_FAILED]);
  expect(noticeShown()).toBe(false);
  await expectCards(['Coffee run']);
  expect(localData(file)).toEqual(before);
});

test('[LEDGER-82.1] keeps the details open when Delete on them is not saved', async () => {
  await startExpenses();
  await addExpense();
  await openDetails('Coffee run');
  failWrites();

  await chooseExpenseAction('Expenses', 'Delete');

  expect(alertsShown()).toEqual([TRASH_FAILED]);
  expect(detailBars()).toHaveLength(1);
  expect(detailLines()).toContain('Coffee run');
});

test('[LEDGER-82.1] keeps the notice and the expense in the trash when Undo is not saved', async () => {
  await startExpenses();
  await addExpense();
  await deleteByAction('Coffee run');
  const before = localData(file);
  failWrites();

  await pressUndo('Coffee run');

  expect(alertsShown()).toEqual([TRASH_FAILED]);
  expect(noticeShown()).toBe(true);
  expect(cards()).toEqual([]);
  expect(localData(file)).toEqual(before);
});

test('[LEDGER-82.1] keeps the read-only details open when Restore is not saved', async () => {
  await startExpenses();
  await addExpense();
  await deleteByAction('Coffee run');
  await openTrash();
  await openTrashed('Coffee run');
  const before = localData(file);
  failWrites();

  await pressRestore();

  expect(alertsShown()).toEqual([TRASH_FAILED]);
  expect(expenseBars('Settings')).toHaveLength(1);
  expect(localData(file)).toEqual(before);
});

test('[LEDGER-82.1] keeps the read-only details open when Delete Permanently is not saved', async () => {
  await startExpenses();
  await addExpense();
  await deleteByAction('Coffee run');
  await openTrash();
  await openTrashed('Coffee run');
  const before = localData(file);
  await chooseExpenseAction('Settings', 'Delete Permanently');
  failWrites();

  await pressAlertButton('Delete');

  expect(alertsShown()).toEqual([DELETE_EXPENSE, TRASH_FAILED]);
  expect(expenseBars('Settings')).toHaveLength(1);
  expect(localData(file)).toEqual(before);
});

test('[LEDGER-82.1] keeps the trash when Empty Trash is not saved', async () => {
  await startWithTwo();
  await deleteByAction('Coffee run');
  await deleteByAction('Lunch');
  await openTrash();
  await expectTrash(['Lunch', 'Coffee run']);
  const before = localData(file);
  await pressEmptyTrash();
  failWrites();

  await pressAlertButton('Empty Trash');

  expect(alertsShown()).toEqual([EMPTY_TRASH, TRASH_FAILED]);
  await expectTrash(['Lunch', 'Coffee run']);
  expect(localData(file)).toEqual(before);
});

test('[LEDGER-82.1] keeps the local data as it was whichever write of a move to the trash fails', async () => {
  await startExpenses();
  await addExpense();
  const before = localData(file);

  let writesThrough = 0;
  for (; writesThrough < 20; writesThrough += 1) {
    jest.mocked(Alert.alert).mockClear();
    failWritesAfter(writesThrough);
    await deleteByAction('Coffee run');
    if (alertsShown().length === 0) break;
    expect(alertsShown()).toEqual([TRASH_FAILED]);
    expect(localData(file)).toEqual(before);
  }

  expect(writesThrough).toBeGreaterThan(0);
  await expectCards([]);
});

test('[LEDGER-82.1] keeps the local data as it was whichever write of emptying the trash fails', async () => {
  await startWithTwo();
  await deleteByAction('Coffee run');
  await deleteByAction('Lunch');
  await openTrash();
  await expectTrash(['Lunch', 'Coffee run']);
  const before = localData(file);

  let writesThrough = 0;
  for (; writesThrough < 20; writesThrough += 1) {
    jest.mocked(Alert.alert).mockClear();
    allowWrites();
    await pressEmptyTrash();
    failWritesAfter(writesThrough);
    await pressAlertButton('Empty Trash');
    if (!alertsShown().some(([title]) => title === TRASH_FAILED[0])) break;
    expect(localData(file)).toEqual(before);
    await expectTrash(['Lunch', 'Coffee run']);
  }

  expect(writesThrough).toBeGreaterThan(0);
  await waitFor(() => expect(trashLines()).toEqual([NO_DELETED]));
});

test('[LEDGER-82.1] moves the expense to the trash when tried again after writes recover', async () => {
  await startExpenses();
  await addExpense();
  failWrites();
  await deleteByAction('Coffee run');
  allowWrites();

  await deleteByAction('Coffee run');

  await expectCards([]);
  expect(noticeShown()).toBe(true);
});

// The shell's rules on these screens

test('[SHELL-53.1] leaves menu actions that are not marked destructive as they are', async () => {
  await startExpenses();
  await addExpense();
  await openDetails('Coffee run');
  expect(expenseBarItems('Expenses')[0]).toMatchObject({
    items: [{ title: 'Delete', destructive: true }],
  });
  await goBackFromDetails();

  await saveName('Taylor');
  await createGroup('Brisbane');
  await openGroup('Brisbane');

  const menus: {
    type: string;
    menu?: { items: { title?: string; destructive?: boolean }[] };
  }[] = barTitled('Brisbane')?.props.headerRightBarButtonItems ?? [];
  expect(
    menus
      .flatMap((item) => item.menu?.items ?? [])
      .map((entry) => [entry.title, entry.destructive === true]),
  ).toEqual([
    ['Members', false],
    ['Rename Group', false],
  ]);
});

test('[SHELL-13.1] shows only a back arrow named Back on Trash and the read-only details', async () => {
  await startExpenses();
  await addExpense();
  await deleteByAction('Coffee run');
  await openTrash();
  await openTrashed('Coffee run');

  for (const pushed of [
    barTitled('Trash')?.props,
    expenseBars('Settings')[0]?.props,
  ])
    // The native stack hides the back title with backButtonDisplayMode on iOS 14
    // and later, and with backTitleVisible when it knows no iOS version, as in Jest.
    expect(pushed).toMatchObject(
      pushed?.backButtonDisplayMode === undefined
        ? { backTitle: 'Back', backTitleVisible: false }
        : { backTitle: 'Back', backButtonDisplayMode: 'minimal' },
    );
});

// SHELL-34.1 leaves out the colors of user data, such as a category's color.
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
const PALETTE_COLORS = new Set(
  PALETTE.map((color) => (processColor(color) as number) >>> 0),
);

function appColors(root: Parameters<typeof fixedColors>[0]) {
  return {
    colors: new Map(
      [...fixedColors(root)].filter(
        ([, { color }]) => !PALETTE_COLORS.has(color),
      ),
    ),
    uncolored: textsWithoutColor(root),
  };
}

test('[SHELL-34.1] colors the Undo notice with colors that follow the appearance', async () => {
  fakePhoneAppearance('light');
  await startExpenses();
  await addExpense();
  await deleteByAction('Coffee run');
  const light = appColors(noticeView());

  await switchPhoneTo('dark');
  const dark = appColors(noticeView());

  expect(colorsInBoth(light.colors, dark.colors)).toEqual([]);
  expect([...light.uncolored, ...dark.uncolored]).toEqual([]);
});

test('[SHELL-34.1] colors Trash and the read-only details with colors that follow the appearance', async () => {
  fakePhoneAppearance('light');
  await startExpenses();
  await addExpense({ note: 'Morning treat' });
  await deleteByAction('Coffee run');
  await openTrash();
  await expectTrash(['Coffee run']);
  const lightTrash = appColors(screenOf('Trash'));
  await openTrashed('Coffee run');
  const lightDetails = appColors(expenseScreen('Settings'));

  await switchPhoneTo('dark');
  const darkDetails = appColors(expenseScreen('Settings'));
  await goBackFromTrashed();
  const darkTrash = appColors(screenOf('Trash'));

  expect(colorsInBoth(lightTrash.colors, darkTrash.colors)).toEqual([]);
  expect(colorsInBoth(lightDetails.colors, darkDetails.colors)).toEqual([]);
  expect([
    ...lightTrash.uncolored,
    ...darkTrash.uncolored,
    ...lightDetails.uncolored,
    ...darkDetails.uncolored,
  ]).toEqual([]);
});
