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
import type { Database } from '../../src/storage';
import {
  navigationBarTitles,
  push,
  selectedTab,
  startApp,
  tab,
  tapTab,
} from './shell-tabs-app';
import {
  addGroupButton,
  cardNames,
  createGroup,
  localData,
  readIdentity,
  saveName,
  startGroupsApp,
} from './groups-app';
import {
  allowWrites,
  fakePhoneAppearance,
  fakeReduceTransparency,
  settle,
} from './shell-appearance-app';
import {
  alertsShown,
  barTitled,
  expectClosed,
  expectOpen,
  goBackFrom,
  openGroup,
  openMembers,
  pressOnBar,
  swipeDown,
  textsOn,
} from './group-details-app';
import {
  accessibleName,
  archivedGroupsRow,
  contentButton,
  contentButtons,
  rowCounts,
} from './group-archive-app';
import { trashRow, trashRowCounts } from './ledger-trash-app';
import {
  doAction,
  expectFormClosed,
  fillForm,
  openNewExpense,
  press,
  resetPhone,
} from './ledger-expense-app';
import {
  NO_EXPENSE_ID,
  allowReads,
  failReads,
  openDetails,
  phoneDatabaseWithReads,
} from './ledger-expense-list-app';

// Runs on iOS; shell-local-reads-android.test.tsx checks the Android back button.
// The phone database is a file each test chooses (ADR-0006). Its reads outside a
// transaction can fail, as a damaged database's do, while the app opens it as
// usual: opening runs in transactions (SHELL-4.1). Each screen is opened as a
// person would: a tab's root by its tab, other screens by their URL.

let mockOpen: () => Promise<Database>;

jest.mock('../../src/storage/expo', () => ({
  openPhoneDatabase: () => mockOpen(),
}));

// New Expense reads the phone's locale and calendar; ledger-expense-app stands in
// for the phone, as in the expense form tests. Not virtual, as there.
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
const NO_ID = NO_EXPENSE_ID;

let directory: string;
let file: string;

beforeEach(() => {
  jest.clearAllMocks();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'local-reads-'));
  file = path.join(directory, 'app.db');
  mockOpen = async () => phoneDatabaseWithReads(file);
  allowWrites();
  allowReads();
  fakePhoneAppearance('light');
  fakeReduceTransparency(false);
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

interface BarItem {
  type: string;
  title?: string;
  accessibilityLabel?: string;
}

/** The actions on the bar titled `title`: iOS bar items and menus, then buttons in the bar. */
function barActions(title: string) {
  const bar = barTitled(title);
  if (bar === undefined) throw new Error(`${title} is not open`);
  const items: BarItem[] = [
    ...(bar.props.headerLeftBarButtonItems ?? []),
    ...(bar.props.headerRightBarButtonItems ?? []),
  ];
  return [
    ...items.map((item) => item.accessibilityLabel || item.title),
    ...within(bar).queryAllByRole('button').map(accessibleName),
  ];
}

/** Waits until the screen or sheet titled `title` shows the read error and nothing else. */
async function expectReadError(title: string) {
  await expectOpen(title);
  await waitFor(() => expect(textsOn(title)).toEqual(READ_ERROR));
  expect(contentButtons(title).map(accessibleName)).toEqual(['Try Again']);
}

async function pressTryAgain(title: string) {
  await fireEvent.press(contentButton(title, 'Try Again'));
  await settle();
}

/** Starts the app once so that its local data exists, ends it, and returns that data. */
async function createLocalData() {
  const first = await startApp();
  await first.unmount();
  await settle();
  return localData(file);
}

/** The root of the tab whose stack shows `url`; screens outside the tabs open from Expenses. */
const tabRootOf = (url: string) =>
  url.startsWith('/groups')
    ? '/groups'
    : url.startsWith('/settings')
      ? '/settings'
      : '/';

/** Screens that open on a tab's root, by [URL, title, the actions on their title bar]. */
const OPENED_BY_URL: [string, string, string[]][] = [
  ['/settings/archived-groups', 'Archived Groups', []],
  [`/groups/${NO_ID}`, 'Group Details', []],
  [`/settings/archived-groups/${NO_ID}`, 'Group Details', []],
  [`/groups/members?id=${NO_ID}`, 'Members', ['Close']],
  [`/settings/archived-groups/members?id=${NO_ID}`, 'Members', ['Close']],
  [`/groups/balances?id=${NO_ID}`, 'Balances', ['Close']],
  [`/settings/archived-groups/balances?id=${NO_ID}`, 'Balances', ['Close']],
  [
    `/groups/rename-member?id=${NO_ID}&memberId=${NO_ID}`,
    'Rename Member',
    ['Cancel'],
  ],
  [
    `/settings/archived-groups/rename-member?id=${NO_ID}&memberId=${NO_ID}`,
    'Rename Member',
    ['Cancel'],
  ],
  [`/groups/rename?id=${NO_ID}`, 'Rename Group', ['Cancel']],
  [`/settings/archived-groups/rename?id=${NO_ID}`, 'Rename Group', ['Cancel']],
  [`/expenses/${NO_ID}`, 'Expense', []],
  [`/groups/expenses/${NO_ID}`, 'Expense', []],
  [`/settings/archived-groups/expenses/${NO_ID}`, 'Expense', []],
  ['/insights', 'Insights', []],
  [`/groups/insights?groupId=${NO_ID}`, 'Insights', []],
  [`/settings/archived-groups/insights?groupId=${NO_ID}`, 'Insights', []],
  ['/settings/trash', 'Trash', []],
  [`/settings/trash/${NO_ID}`, 'Expense', []],
  ['/expenses/new', 'New Expense', ['Cancel']],
  [`/expenses/${NO_ID}/edit`, 'Edit Expense', ['Cancel']],
  ['/settings/manage-categories', 'Manage Categories', []],
  [
    `/settings/manage-categories?scopeKind=group&spaceId=${NO_ID}`,
    'Group Categories',
    [],
  ],
  ['/manage-categories', 'Manage Categories', ['Close']],
  [
    `/manage-categories?scopeKind=group&spaceId=${NO_ID}`,
    'Group Categories',
    ['Close'],
  ],
];

test.each(OPENED_BY_URL)(
  '[SHELL-60.1] shows only the read error on %s, titled %s, and leaves the local data unchanged',
  async (url, title, actions) => {
    await startApp(tabRootOf(url));
    await settle();
    const before = localData(file);
    failReads();

    await push(url);

    await expectReadError(title);
    expect(barActions(title)).toEqual(actions);
    expect(selectedTab()).toBeDefined();
    expect(localData(file)).toEqual(before);
  },
);

test.each([
  ['/', 'Expenses'],
  ['/groups', 'Groups'],
])(
  '[SHELL-60.1] shows only the read error on the tab root at %s, without its + button, and leaves the local data unchanged',
  async (url, title) => {
    const before = await createLocalData();
    failReads();

    await startApp(url);

    await expectReadError(title);
    expect(barActions(title)).toEqual([]);
    expect(selectedTab()).toBe(title);
    expect(localData(file)).toEqual(before);
  },
);

/** Starts the app with Taylor saved as your name and Brisbane created; ends on the Groups root. */
async function startWithBrisbane() {
  const app = await startGroupsApp();
  await saveName('Taylor');
  await createGroup('Brisbane');
  return app;
}

test('[SHELL-60.1] shows the read error, not the groups read before, when the Groups root cannot read them again', async () => {
  await startWithBrisbane();
  expect(cardNames()).toEqual(['Open Brisbane']);
  await tapTab('Expenses');
  failReads();

  await tapTab('Groups');

  await expectReadError('Groups');
  expect(cardNames()).toEqual([]);
});

test('[SHELL-60.1] shows the read error on the Groups root when it reads the groups but not the expenses its cards sum up', async () => {
  await startWithBrisbane();
  expect(cardNames()).toEqual(['Open Brisbane']);
  await tapTab('Expenses');
  failReads('expenses');

  await tapTab('Groups');

  await expectReadError('Groups');
  expect(cardNames()).toEqual([]);
});

test("[SHELL-60.1] shows the read error, not the group read before, when a group's screen cannot read it again", async () => {
  await startWithBrisbane();
  await openGroup('Brisbane');
  await openMembers('Brisbane');
  failReads();

  await pressOnBar('Members', 'Close');
  await expectClosed('Members');

  await expectReadError('Group Details');
  expect(navigationBarTitles(tab('Groups'))).toEqual([
    'Groups',
    'Group Details',
  ]);
  expect(barActions('Group Details')).toEqual([]);
});

test("[SHELL-60.1] shows the read error, without the expense read before or its title bar actions, when an expense's details cannot read it again", async () => {
  await startApp();
  await settle();
  await openNewExpense();
  await fillForm({ amount: '8.75', title: 'Coffee run' });
  await press('Add');
  await expectFormClosed();
  await openDetails('Coffee run');
  expect(barActions('Expense')).toContain('Edit');
  await tapTab('Groups');
  failReads();

  await tapTab('Expenses');

  await expectReadError('Expense');
  expect(barActions('Expense')).toEqual([]);
});

test('[SHELL-60.1] shows the read error, not the expenses read before, when the expense list cannot read them again', async () => {
  await startApp();
  await settle();
  await tapTab('Groups');
  failReads();

  await tapTab('Expenses');

  await expectReadError('Expenses');
});

test('[SHELL-60.1] shows the read error, not the categories read before, when Manage Categories cannot read them again', async () => {
  await startApp('/settings');
  await fireEvent.press(
    screen.getByRole('button', { name: 'Manage Categories' }),
  );
  await waitFor(() =>
    expect(textsOn('Manage Categories')).toContain('Shopping'),
  );
  await tapTab('Groups');
  failReads();

  await tapTab('Settings');

  await expectReadError('Manage Categories');
  expect(barActions('Manage Categories')).toEqual([]);
});

test('[SHELL-60.1] shows the read error, not an alert, when Manage Categories cannot read the expenses a Remove counts', async () => {
  await startApp('/settings');
  await fireEvent.press(
    screen.getByRole('button', { name: 'Manage Categories' }),
  );
  await waitFor(() =>
    expect(textsOn('Manage Categories')).toContain('Shopping'),
  );
  failReads();

  await doAction(tab('Settings'), 'Shopping', 'Remove');

  await expectReadError('Manage Categories');
  expect(alertsShown()).toEqual([]);
});

test('[SHELL-61.1] shows the screen again when Try Again reads its local data', async () => {
  const app = await startWithBrisbane();
  await app.unmount();
  await settle();
  failReads();
  await startApp('/groups');
  await expectReadError('Groups');
  allowReads();

  await pressTryAgain('Groups');

  await waitFor(() => expect(cardNames()).toEqual(['Open Brisbane']));
  expect(textsOn('Groups')).not.toContain('Unable to Load Local Data');
  expect(addGroupButton()).toBeOnTheScreen();
});

test('[SHELL-61.1] keeps the read error when Try Again still cannot read the local data', async () => {
  const before = await createLocalData();
  failReads();
  await startApp('/groups');
  await expectReadError('Groups');

  await pressTryAgain('Groups');
  await pressTryAgain('Groups');

  await expectReadError('Groups');
  expect(localData(file)).toEqual(before);
});

test('[SHELL-61.1] reads again only on Try Again, not when the screen comes back', async () => {
  const app = await startWithBrisbane();
  await app.unmount();
  await settle();
  failReads();
  await startApp('/groups');
  await expectReadError('Groups');
  allowReads();

  await tapTab('Expenses');
  await tapTab('Groups');
  await settle();

  expect(textsOn('Groups')).toEqual(READ_ERROR);
  await pressTryAgain('Groups');
  await waitFor(() => expect(cardNames()).toEqual(['Open Brisbane']));
});

test('[SHELL-61.1] shows the fields of New Expense when Try Again reads its local data', async () => {
  await startApp();
  await settle();
  failReads();
  await push('/expenses/new');
  await expectReadError('New Expense');
  allowReads();

  await pressTryAgain('New Expense');

  await waitFor(() =>
    expect(screen.getByLabelText('Expense title')).toBeOnTheScreen(),
  );
  expect(barActions('New Expense')).toEqual(['Cancel', 'Add']);
});

// The Settings root reads the local data only for the counts on its rows.

/** Starts the app on the Settings root with the given reads failing, after its local data exists. */
async function startSettingsFailing(table?: string) {
  await createLocalData();
  failReads(table);
  await startGroupsApp('/settings');
  await settle();
}

test('[SHELL-62.1] shows the Settings root without the counts it cannot read', async () => {
  await startSettingsFailing();

  await waitFor(() => {
    expect(accessibleName(archivedGroupsRow())).toBe('Archived groups');
    expect(accessibleName(trashRow())).toBe('Trash');
  });
  expect(rowCounts()).toEqual([]);
  expect(trashRowCounts()).toEqual([]);
  for (const section of ['PROFILE', 'APPEARANCE', 'APP'])
    expect(screen.getByRole('header', { name: section })).toBeOnTheScreen();
  expect(
    screen.getByRole('button', { name: 'Manage Categories' }),
  ).toBeOnTheScreen();
  expect(textsOn('Settings')).not.toContain('Unable to Load Local Data');
});

test('[SHELL-62.1] shows the archived groups count when only the expenses cannot be read', async () => {
  await startSettingsFailing('expenses');

  await waitFor(() =>
    expect(accessibleName(archivedGroupsRow())).toBe('Archived groups, 0'),
  );
  expect(rowCounts()).toEqual(['0']);
  expect(accessibleName(trashRow())).toBe('Trash');
  expect(trashRowCounts()).toEqual([]);
});

test('[SHELL-62.1] saves your name and opens Archived Groups while the Settings root cannot read its counts', async () => {
  await startSettingsFailing();
  const field = screen.getByLabelText('Your name');

  await fireEvent.changeText(field, 'Taylor');
  await fireEvent(field, 'blur', { nativeEvent: {} });
  await settle();
  await fireEvent.press(
    within(archivedGroupsRow()).getByText('Archived Groups'),
  );
  await settle();

  expect(navigationBarTitles(tab('Settings')).at(-1)).toBe('Archived Groups');
  await expectReadError('Archived Groups');
  expect((await readIdentity()).name).toBe('Taylor');
});

test('[SHELL-62.1] shows the counts once the Settings root reads them on coming back', async () => {
  await startSettingsFailing();
  await waitFor(() => expect(accessibleName(trashRow())).toBe('Trash'));
  allowReads();

  await tapTab('Expenses');
  await tapTab('Settings');

  await waitFor(() => {
    expect(accessibleName(archivedGroupsRow())).toBe('Archived groups, 0');
    expect(accessibleName(trashRow())).toBe('Trash, 0');
  });
});

test('[SHELL-63.1] switches tabs from a tab root that shows the read error', async () => {
  failReads();
  await startApp('/groups');
  await expectReadError('Groups');

  await tapTab('Expenses');

  expect(selectedTab()).toBe('Expenses');
});

test('[SHELL-63.1] goes back from a pushed screen that shows the read error', async () => {
  await startApp('/groups');
  await settle();
  failReads();
  await push(`/groups/${NO_ID}`);
  await expectReadError('Group Details');

  await goBackFrom('Group Details');

  expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups']);
  expect(selectedTab()).toBe('Groups');
});

test.each([
  ['/expenses/new', 'New Expense', 'Cancel'],
  [`/groups/members?id=${NO_ID}`, 'Members', 'Close'],
  [`/groups/balances?id=${NO_ID}`, 'Balances', 'Close'],
  ['/manage-categories', 'Manage Categories', 'Close'],
])(
  '[SHELL-63.1] closes %s, titled %s, with %s while it shows the read error, asking nothing',
  async (url, title, cancel) => {
    await startApp(tabRootOf(url));
    await settle();
    failReads();
    await push(url);
    await expectReadError(title);

    await pressOnBar(title, cancel);

    await expectClosed(title);
    expect(alertsShown()).toEqual([]);
  },
);

test.each([
  ['/expenses/new', 'New Expense'],
  [`/groups/members?id=${NO_ID}`, 'Members'],
  [`/groups/balances?id=${NO_ID}`, 'Balances'],
  ['/manage-categories', 'Manage Categories'],
])(
  '[SHELL-63.1] lets %s, titled %s, be swiped down while it shows the read error, asking nothing',
  async (url, title) => {
    await startApp(tabRootOf(url));
    await settle();
    failReads();
    await push(url);
    await expectReadError(title);

    await swipeDown(title);

    await expectClosed(title);
    expect(alertsShown()).toEqual([]);
  },
);
