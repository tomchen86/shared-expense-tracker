import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ActionSheetIOS } from 'react-native';
import { fireEvent, waitFor, within } from '@testing-library/react-native';
import {
  addCategory,
  chooseCategory,
  expectFormClosed,
  namesWithAction,
  openEditExpense,
  phoneDatabase,
  press,
  resetPhone,
  storedExpenses,
  watchAlerts,
} from './ledger-expense-app';
import { allowWrites, settle } from './shell-appearance-app';
import { navigationBars, push, tab, tapTab } from './shell-tabs-app';
import { goBackFrom, screenOf } from './group-details-app';
import {
  addGroupExpense,
  archiveGroup,
  archiveGroupCategory,
  categorySheet,
  categorySheetTitle,
  restoreGroup,
  startWithGroups,
  storedGroup,
  closeCategorySheet,
} from './ledger-group-expense-app';
import { listCategories } from '../../src/categories';
import { openNodeDatabase } from '../../src/storage/node';
import type { Database } from '../../src/storage';

// Runs on iOS. Each test starts the app as the group expense form tests do, with
// Taylor saved as your name and Brisbane created with Casey. A group category can
// be archived only while an expense uses it, so the tests spend on it through New
// Expense first. They open a group's Group Categories by its URL on the Settings
// tab, as the categories tests do.

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

const ARCHIVED_FOOTER =
  'Archived categories remain on historical expenses and in Insights.';

let directory: string;
let file: string;

beforeEach(() => {
  jest.clearAllMocks();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'archived-group-'));
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

/** Whether the group category `name` is stored as archived. */
async function isArchived(spaceId: string, name: string) {
  const database = openNodeDatabase(file, { readOnly: true });
  try {
    const found = (await listCategories(database, spaceId)).find(
      (candidate) => candidate.name === name,
    );
    if (found === undefined) throw new Error(`No category named ${name}`);
    return found.isArchived;
  } finally {
    await database.close();
  }
}

/**
 * Brisbane's Gym, archived: added to Brisbane, spent on, archived, and, with
 * `unused`, no longer spent on. Ends on the Expenses tab.
 */
async function archivedGym({ unused = false } = {}) {
  await startWithGroups({ Brisbane: ['Casey'] });
  const brisbane = await storedGroup(file, 'Brisbane');
  await addCategory('Gym', brisbane.id);
  await addGroupExpense({
    group: 'Brisbane',
    payer: 'Casey',
    sharers: ['Casey'],
    title: 'Climbing',
    category: 'Gym',
  });
  await archiveGroupCategory(brisbane.id, 'Gym');
  if (unused) {
    const [climbing] = await storedExpenses();
    await openEditExpense(climbing.id);
    await chooseCategory('Shopping');
    await press('Save');
    await expectFormClosed();
  }
  return brisbane;
}

/** Opens the group's Group Categories by its URL on the Settings tab. */
async function openGroupCategories(groupId: string) {
  await tapTab('Settings');
  await push(`/settings/manage-categories?scopeKind=group&spaceId=${groupId}`);
  await waitFor(() =>
    expect(navigationBars(tab('Settings')).at(-1)?.props.title).toBe(
      'Group Categories',
    ),
  );
  await settle();
  return screenOf('Group Categories');
}

/** Whether `view` is inside a button. */
function inAButton(view: ReturnType<typeof screenOf>) {
  for (let outer = view.parent; outer; outer = outer.parent)
    if (
      outer.props.accessibilityRole === 'button' ||
      outer.props.role === 'button'
    )
      return true;
  return false;
}

test('[CATEGORIES-22.2] opens Manage Categories over the current screen at /manage-categories, until Close', async () => {
  await startWithGroups({ Brisbane: [] });
  await addCategory('Gym');

  await push('/manage-categories');

  await waitFor(() => expect(categorySheetTitle()).toBe('Manage Categories'));
  await settle();
  expect(within(categorySheet()).getByText('Gym')).toBeOnTheScreen();

  await closeCategorySheet();

  expect(categorySheetTitle()).toBeUndefined();
});

test("[CATEGORIES-23.4] opens a group's Group Categories at the URL Group actions uses", async () => {
  await startWithGroups({ Brisbane: [] });
  const brisbane = await storedGroup(file, 'Brisbane');
  await addCategory('Flights', brisbane.id);
  await addCategory('Gym');

  await push(`/manage-categories?scopeKind=group&spaceId=${brisbane.id}`);

  await waitFor(() => expect(categorySheetTitle()).toBe('Group Categories'));
  await settle();
  expect(within(categorySheet()).getByText('Flights')).toBeOnTheScreen();
  expect(within(categorySheet()).queryByText('Gym')).toBeNull();
});

test('[CATEGORIES-37.2] shows the archived categories of an archived group by their name only, not as buttons', async () => {
  const brisbane = await archivedGym();
  await archiveGroup('Brisbane');

  const screen = await openGroupCategories(brisbane.id);

  expect(within(screen).getByText('ARCHIVED')).toBeOnTheScreen();
  const gym = within(screen).getByText('Gym');
  expect(inAButton(gym)).toBe(false);
  expect(within(screen).queryByText('Restore')).toBeNull();
  expect(within(screen).queryByLabelText('Restore Gym')).toBeNull();
  expect(within(screen).getByText(ARCHIVED_FOOTER)).toBeOnTheScreen();
});

test("[CATEGORIES-33.3] gives an archived group's unused archived category no Delete action, until the group is restored", async () => {
  const brisbane = await archivedGym({ unused: true });
  await openGroupCategories(brisbane.id);
  expect(namesWithAction(screenOf('Group Categories'), 'Delete')).toEqual([
    'Restore Gym',
  ]);
  await goBackFrom('Group Categories');
  await archiveGroup('Brisbane');

  const screen = await openGroupCategories(brisbane.id);

  expect(namesWithAction(screen, 'Delete')).toEqual([]);
  await goBackFrom('Group Categories');
  await restoreGroup('Brisbane');
  expect(
    namesWithAction(await openGroupCategories(brisbane.id), 'Delete'),
  ).toEqual(['Restore Gym']);
});

test("[CATEGORIES-38.2] leaves an archived category archived when it is pressed in an archived group's Group Categories, and restores it once the group is restored", async () => {
  const brisbane = await archivedGym();
  await archiveGroup('Brisbane');
  const screen = await openGroupCategories(brisbane.id);

  await fireEvent.press(within(screen).getByText('Gym'));
  await settle();

  expect(
    within(screenOf('Group Categories')).getByText('ARCHIVED'),
  ).toBeOnTheScreen();
  expect(
    navigationBars().some((bar) => bar.props.title === 'Edit Category'),
  ).toBe(false);
  expect(await isArchived(brisbane.id, 'Gym')).toBe(true);
  await goBackFrom('Group Categories');
  await restoreGroup('Brisbane');
  const restored = await openGroupCategories(brisbane.id);
  await fireEvent.press(within(restored).getByLabelText('Restore Gym'));
  await settle();
  expect(await isArchived(brisbane.id, 'Gym')).toBe(false);
  expect(
    within(screenOf('Group Categories')).queryByText('ARCHIVED'),
  ).toBeNull();
});
