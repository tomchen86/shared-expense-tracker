import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ActionSheetIOS } from 'react-native';
import {
  fireEvent,
  screen,
  userEvent,
  waitFor,
  within,
} from '@testing-library/react-native';
import type { Database } from '../../src/storage';
import { listCategories } from '../../src/categories';
import { openNodeDatabase } from '../../src/storage/node';
import {
  navigationBarTitles,
  navigationBars,
  push,
  tab,
  tapTab,
} from './shell-tabs-app';
import { allowWrites, settle } from './shell-appearance-app';
import {
  barAction,
  chooseGroupAction,
  isOpen,
  pressOnBar,
  screenOf,
  textsOn,
} from './group-details-app';
import {
  READ_ONLY,
  contentButton,
  contentButtons,
  accessibleName,
  openArchivedGroup,
  openArchivedGroups,
  pressRestoreGroup,
} from './group-archive-app';
import {
  categoryNamed,
  chooseCategory,
  doAction,
  expectFormClosed,
  fillForm,
  formTitle,
  openNewExpense,
  press,
  resetPhone,
  storedExpenses,
  watchAlerts,
} from './ledger-expense-app';
import {
  addCategoryInSheet,
  addGroupExpense,
  archiveGroup,
  closeCategorySheet,
  detailLinesOn,
  editOn,
  expectDetailsOn,
  groupCard,
  openCategorySheet,
  removeCategoryInSheet,
  startWithGroups,
  storedGroup,
} from './ledger-group-expense-app';
import {
  NOT_FOUND,
  allowReads,
  detailBars,
  holdReads,
  openDetails,
  phoneDatabaseWithReads,
  pressEdit,
} from './ledger-expense-list-app';
import { showGroup } from './group-balances-app';
import { deleteByAction } from './ledger-trash-app';

// Runs on iOS. Each test starts the app as the group expense form tests do, with
// Taylor saved as your name, changes the local data on another tab, and holds the
// reads a screen makes when it comes back, as a slow disk would, to press its
// actions before it has read the local data again.

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

const READ_ERROR = [
  'Unable to Load Local Data',
  'Your data was not changed.',
  'Try Again',
];
const CATEGORIES_READ_ONLY = 'Archived group. Categories are read-only.';
const DEFAULT_NAMES = [
  'Food & Dining',
  'Transportation',
  'Shopping',
  'Entertainment',
  'Bills & Utilities',
  'Health',
  'Travel',
  'Other',
  'Uncategorized',
];

let directory: string;
let file: string;
let alerts: ReturnType<typeof watchAlerts>;

beforeEach(() => {
  jest.clearAllMocks();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rereads-'));
  file = path.join(directory, 'app.db');
  mockOpen = async () => phoneDatabaseWithReads(file);
  allowWrites();
  allowReads();
  resetPhone();
  alerts = watchAlerts();
  jest
    .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
    .mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});

// Group Categories

/** Opens the group's Group Categories by its URL on the Settings tab. */
async function openGroupCategories(groupId: string) {
  await tapTab('Settings');
  await push(`/settings/manage-categories?scopeKind=group&spaceId=${groupId}`);
  await waitFor(() =>
    expect(navigationBarTitles(tab('Settings')).at(-1)).toBe(
      'Group Categories',
    ),
  );
  await waitFor(() =>
    expect(textsOn('Group Categories')).toContain('Shopping'),
  );
}

/** Whether the category form is open, as a screen or a sheet with its title. */
const categoryFormOpen = () =>
  ['New Category', 'Edit Category'].some(
    (title) =>
      navigationBarTitles().includes(title) ||
      screen.queryByRole('header', { name: title }) !== null,
  );

/**
 * Taps the row named `name` on the categories screen titled `title` as a finger
 * does: only a row that is a button on screen takes the tap.
 */
async function tapRow(name: string, title = 'Group Categories') {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  await user.press(within(screenOf(title)).getByText(name));
  await settle();
}

/** The navigation bars titled Manage Categories: the Settings tab's first, then the one over the form. */
const manageCategoriesBars = () =>
  navigationBars().filter((bar) => bar.props.title === 'Manage Categories');

/**
 * Renames the category `from` to `to` on the Manage Categories that New Expense
 * opened over itself while another Manage Categories is open on the Settings tab,
 * then closes it.
 */
async function renameOverTheForm(from: string, to: string) {
  await openCategorySheet();
  await waitFor(() => expect(manageCategoriesBars()).toHaveLength(2));
  await fireEvent.press(screen.getAllByText(from).at(-1)!);
  await fireEvent.changeText(await screen.findByLabelText('Category name'), to);
  if (isOpen('Edit Category')) await pressOnBar('Edit Category', 'Save');
  else await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  await settle();
  await waitFor(() =>
    expect(screen.queryByLabelText('Category name')).toBeNull(),
  );
  await fireEvent.press(
    within(manageCategoriesBars().at(-1)!).getByRole('button', {
      name: 'Close',
    }),
  );
  await waitFor(() => expect(manageCategoriesBars()).toHaveLength(1));
  await settle();
}

/** The names of the group's categories in the database file, archived ones too. */
async function storedCategoryNames(groupId: string) {
  const database = openNodeDatabase(file, { readOnly: true });
  try {
    return (await listCategories(database, groupId)).map((item) => item.name);
  } finally {
    await database.close();
  }
}

test('[SHELL-64.1] opens no form or alert for presses on Group Categories made before it reads that its group was archived', async () => {
  await startWithGroups({ Brisbane: [] });
  const brisbane = await storedGroup(file, 'Brisbane');
  await openGroupCategories(brisbane.id);
  await archiveGroup('Brisbane');
  const reads = holdReads();

  await tapTab('Settings');
  await tapRow('Shopping');
  await barAction('Group Categories', 'Add category').press();
  await settle();
  await doAction(tab('Settings'), 'Shopping', 'Remove');
  await reads.release();
  await settle();

  expect(categoryFormOpen()).toBe(false);
  expect(alerts.shown()).toEqual([]);
  expect(textsOn('Group Categories')).toContain(CATEGORIES_READ_ONLY);
  expect(await storedCategoryNames(brisbane.id)).toEqual(DEFAULT_NAMES);
});

test('[SHELL-64.1] opens Edit Category with the name read again for a category pressed before Manage Categories reads it again', async () => {
  await startWithGroups();
  await tapTab('Settings');
  await push('/settings/manage-categories');
  await waitFor(() =>
    expect(textsOn('Manage Categories')).toContain('Shopping'),
  );
  await tapTab('Expenses');
  await openNewExpense();
  await renameOverTheForm('Shopping', 'Groceries');
  await press('Cancel');
  await expectFormClosed();
  const reads = holdReads();

  await tapTab('Settings');
  await tapRow('Shopping', 'Manage Categories');
  await reads.release();

  await waitFor(() =>
    expect(screen.getByLabelText('Category name')).toHaveDisplayValue(
      'Groceries',
    ),
  );
  expect(categoryFormOpen()).toBe(true);
});

test('[SHELL-64.1] opens no form for a press on Group Categories when reading it again fails, and shows the read error', async () => {
  await startWithGroups({ Brisbane: [] });
  const brisbane = await storedGroup(file, 'Brisbane');
  await openGroupCategories(brisbane.id);
  await tapTab('Groups');
  const reads = holdReads();

  await tapTab('Settings');
  await tapRow('Shopping');
  await reads.fail();
  await settle();

  await waitFor(() => expect(textsOn('Group Categories')).toEqual(READ_ERROR));
  expect(categoryFormOpen()).toBe(false);
});

// A group's screen and an expense's details

test("[SHELL-64.1] opens neither Rename Group nor New Expense from a group's screen pressed before it reads that the group was archived", async () => {
  await startWithGroups({ Brisbane: [] });
  await archiveGroup('Brisbane');
  await openArchivedGroups();
  await openArchivedGroup('Brisbane');
  await pressRestoreGroup('Brisbane');
  await waitFor(() =>
    expect(contentButtons('Brisbane').map(accessibleName)).toContain(
      'Add expense',
    ),
  );
  await archiveGroup('Brisbane');
  const reads = holdReads();

  await tapTab('Settings');
  await fireEvent.press(contentButton('Brisbane', 'Add expense'));
  await settle();
  await chooseGroupAction('Brisbane', 'Rename Group');
  await reads.release();
  await settle();

  expect(isOpen('Rename Group')).toBe(false);
  expect(formTitle()).toBeUndefined();
  expect(textsOn('Brisbane')).toContain(READ_ONLY);
  expect(contentButtons('Brisbane').map(accessibleName)).toContain(
    'Restore Group',
  );
});

test('[SHELL-64.1] opens no Edit Expense from details pressed before they read that the group was archived', async () => {
  await startWithGroups({ Brisbane: ['Casey'] });
  await addGroupExpense({
    group: 'Brisbane',
    payer: 'Taylor (You)',
    sharers: ['Taylor (You)', 'Casey'],
  });
  await openDetails('Dinner');
  await archiveGroup('Brisbane');
  const reads = holdReads();

  await tapTab('Expenses');
  await pressEdit();
  await settle();
  await reads.release();
  await settle();

  expect(formTitle()).toBeUndefined();
  const edit = (
    detailBars().at(-1)?.props.headerRightBarButtonItems ?? []
  ).find((item: { title?: string }) => item.title === 'Edit');
  expect(edit?.disabled).toBe(true);
});

test('[SHELL-64.1] opens no Edit Expense from group expense details pressed before they read that the expense moved to the trash', async () => {
  await startWithGroups({ Brisbane: ['Casey'] });
  await addGroupExpense({
    group: 'Brisbane',
    payer: 'Taylor (You)',
    sharers: ['Taylor (You)', 'Casey'],
  });
  await showGroup('Brisbane');
  await fireEvent.press(groupCard('Brisbane', 'Dinner'));
  await expectDetailsOn('Groups', 'Dinner');
  await tapTab('Expenses');
  await settle();
  await deleteByAction('Dinner');
  const reads = holdReads();

  await tapTab('Groups');
  await editOn('Groups')?.press();
  await settle();
  await reads.release();
  await settle();

  expect(formTitle()).toBeUndefined();
  await waitFor(() => expect(detailLinesOn('Groups')).toEqual([NOT_FOUND]));
});

// The expense form

test('[SHELL-64.1] saves with Uncategorized when Add is pressed before the form reads that its category was deleted', async () => {
  await startWithGroups();
  await openNewExpense();
  await fillForm({ amount: '8.75', title: 'Spin class' });
  await openCategorySheet();
  await addCategoryInSheet('Gym');
  await closeCategorySheet();
  await chooseCategory('Gym');
  await openCategorySheet();
  await removeCategoryInSheet('Gym', 'Delete');
  const reads = holdReads();

  await closeCategorySheet();
  await press('Add');
  await reads.release();
  await settle();

  await expectFormClosed();
  const [saved] = await storedExpenses();
  expect(saved.title).toBe('Spin class');
  expect(saved.category).toEqual(await categoryNamed('Uncategorized'));
  expect(alerts.shown()).toEqual([
    ['Delete Category?', 'This permanently removes the category.'],
  ]);
});
