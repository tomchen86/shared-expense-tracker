import * as fs from 'node:fs';
import { Alert } from 'react-native';
import { waitFor } from '@testing-library/react-native';
import { listCategories } from '../../src/categories';
import { listGroups } from '../../src/groups';
import { saveExpense } from '../../src/ledger/expenses';
import { appMigrations } from '../../src/shell';
import { ensureLocalIdentity } from '../../src/shell/identity';
import { openNodeDatabase } from '../../src/storage/node';
import {
  EXPORT_FAILED,
  NOTE,
  alertsShown,
  allowWrites,
  beforeStatement,
  closeShareSheet,
  dataIn,
  dataRow,
  exportData,
  failWrites,
  failWritesAfter,
  goOffline,
  leaveNoRoomForTemporaryFiles,
  makeRoomForTemporaryFiles,
  newPhone,
  nextAlert,
  pressRow,
  removePhones,
  resetPhones,
  rowsOf,
  shareSheet,
  sharedFiles,
  startOn,
  tablesIn,
  temporaryFiles,
  writeTaylorsData,
  type Phone,
} from './backup-app';
import { resetPhone } from './ledger-expense-app';
import {
  fakePhoneAppearance,
  fakeReduceTransparency,
  inOrder,
  settle,
} from './shell-appearance-app';
import { navigationBarTitles, tab } from './shell-tabs-app';

// Runs on iOS. Each test starts the app on a phone of its own (backup-app), in a
// region whose currency is USD, and presses Export Data on the Settings root. What
// the app hands to the share sheet is read as the SQLite database it is (ADR-0020).

jest.mock('../../src/storage/expo', () => ({
  openPhoneDatabase: () =>
    jest
      .requireActual<typeof import('./backup-app')>('./backup-app')
      .openPhoneDatabase(),
}));

jest.mock(
  '../../src/storage/expo-files',
  () =>
    jest.requireActual<typeof import('./backup-app')>('./backup-app')
      .phoneFiles,
);

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

let phone: Phone;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  resetPhones();
  resetPhone();
  fakePhoneAppearance('light');
  fakeReduceTransparency(false);
  phone = newPhone();
});

afterEach(async () => {
  jest.restoreAllMocks();
  await removePhones();
});

/** Starts the app on a phone that holds Taylor's data. */
async function startWithTaylorsData() {
  await writeTaylorsData(phone);
  return startOn(phone);
}

const isSqliteDatabase = (file: string) =>
  fs.readFileSync(file).subarray(0, 16).toString('latin1') ===
  'SQLite format 3\0';

test('[SHELL-71.1] shows DATA after APP, with Export Data, Import Data and the note below them', async () => {
  await startOn(phone);

  const layout = [
    'APP',
    'Manage Categories',
    'Archived Groups',
    'Trash',
    'DATA',
    'Export Data',
    'Import Data',
    NOTE,
  ];
  expect(inOrder(layout)).toEqual(layout);
});

test('[SHELL-71.1] reads Export Data and Import Data out as buttons', async () => {
  await startOn(phone);

  expect(dataRow('Export Data')).toBeOnTheScreen();
  expect(dataRow('Import Data')).toBeOnTheScreen();
});

test.each(['Export Data', 'Import Data'] as const)(
  '[SHELL-71.1] stays on the Settings root when %s is pressed',
  async (row) => {
    const app = await startOn(phone);

    await pressRow(row);

    expect(navigationBarTitles(tab('Settings'))).toEqual(['Settings']);
    expect(app.getPathname()).toBe('/settings');
  },
);

test('[BACKUP-1.1] hands an export file to the share sheet and leaves the local data as it was', async () => {
  await startWithTaylorsData();
  const before = dataIn(phone.database);

  const shared = await exportData();

  expect(sharedFiles()).toHaveLength(1);
  expect(isSqliteDatabase(shared.copy)).toBe(true);
  expect(dataIn(phone.database)).toEqual(before);
});

test('[BACKUP-1.1] exports on a phone that has recorded nothing yet', async () => {
  await startOn(phone);

  const shared = await exportData();

  expect(sharedFiles()).toHaveLength(1);
  expect(isSqliteDatabase(shared.copy)).toBe(true);
});

test.each([
  [
    'in the afternoon',
    'Asia/Taipei',
    '2026-11-18T06:32:00Z',
    'Expenses Backup 2026-11-18 1432.sqlite',
  ],
  [
    'while it is still the day before there',
    'America/Los_Angeles',
    '2026-11-19T06:05:00Z',
    'Expenses Backup 2026-11-18 2205.sqlite',
  ],
  [
    'just after midnight',
    'Asia/Taipei',
    '2026-11-18T16:07:00Z',
    'Expenses Backup 2026-11-19 0007.sqlite',
  ],
])(
  '[BACKUP-2.1] names the file after the date and time where the device is, %s',
  async (_when, timeZone, now, name) => {
    await startOn(phone, { timeZone, now });

    const shared = await exportData();

    expect(shared.name).toBe(name);
  },
);

test('[BACKUP-3.1] puts every table of the local data in the export file, row for row', async () => {
  await startWithTaylorsData();
  const data = dataIn(phone.database);
  // Taylor's data is what the spec says: nothing here is left out of the comparison below.
  expect(
    rowsOf<{ title: string; trashOrder: number | null }>(data, 'expenses')
      .map((expense) => [expense.title, expense.trashOrder !== null])
      .sort(),
  ).toEqual([
    ['Coffee run', false],
    ['Dinner', false],
    ['Lunch', true],
    ['Train', false],
  ]);
  expect(data.expense_payments).toHaveLength(4);
  expect(data.expense_shares).toHaveLength(6);
  expect(
    rowsOf<{ name: string; archived: number }>(data, 'groups')
      .map((group) => [group.name, group.archived])
      .sort(),
  ).toEqual([
    ['Brisbane', 0],
    ['Tokyo', 1],
  ]);
  expect(
    rowsOf<{ name: string; removed: number }>(data, 'group_members')
      .map((member) => [member.name, member.removed])
      .sort(),
  ).toEqual([
    ['Blake', 1],
    ['Casey', 0],
    ['Taylor', 0],
    ['Taylor', 0],
  ]);
  expect(
    rowsOf<{ name: string; isArchived: number }>(data, 'categories')
      .filter(({ name }) => ['Gym', 'Flights', 'Travel'].includes(name))
      .map((category) => [category.name, category.isArchived])
      .sort(),
  ).toEqual([
    ['Flights', 0],
    ['Gym', 0],
    ['Travel', 0],
    ['Travel', 0],
    ['Travel', 1],
  ]);
  expect(rowsOf(data, 'local_identity')).toEqual([
    expect.objectContaining({
      name: 'Taylor',
      appearance: 'dark',
      chartType: 'bar',
    }),
  ]);
  expect(data._migrations).toHaveLength(appMigrations.length);

  const shared = await exportData();

  expect(tablesIn(dataIn(shared.copy), data)).toEqual(data);
});

test('[BACKUP-3.1] exports the local identity, the default categories and the migration records of a phone that has recorded nothing', async () => {
  await startOn(phone);
  const data = dataIn(phone.database);
  expect(data.local_identity).toHaveLength(1);
  expect(data.categories.length).toBeGreaterThan(0);
  expect(data.expenses).toEqual([]);

  const shared = await exportData();

  expect(tablesIn(dataIn(shared.copy), data)).toEqual(data);
});

test('[BACKUP-4.1] holds a change saved during the export either whole or not at all, wherever it lands', async () => {
  await startWithTaylorsData();
  const reading = openNodeDatabase(phone.database, { readOnly: true });
  const identity = await ensureLocalIdentity(reading);
  const [brisbane] = await listGroups(reading);
  const [category] = await listCategories(reading, brisbane.id);
  await reading.close();
  const [taylor, casey] = brisbane.members;
  let changes = 0;

  // The change is queued ahead of the first statement the app hands to its
  // connection, then ahead of its second, and so on, until the export is over before
  // the app gets that far.
  for (let position = 1; position <= 60; position += 1) {
    const title = `Taxi ${position}`;
    const saved = beforeStatement(position, (database) =>
      saveExpense(
        database,
        identity,
        {
          title,
          amountMinor: 3000,
          currency: 'USD',
          date: '2026-11-14',
          categoryId: category.id,
        },
        undefined,
        {
          groupId: brisbane.id,
          payerId: casey.id,
          participants: [taylor.id, casey.id],
        },
      ),
    );
    const shared = await exportData();
    if (!(await saved())) break;
    changes += 1;

    const [{ id }] = rowsOf<{ id: string; title: string }>(
      dataIn(phone.database),
      'expenses',
    ).filter((expense) => expense.title === title);
    const exported = dataIn(shared.copy);
    expect([
      [0, 0, 0],
      [1, 1, 2],
    ]).toContainEqual([
      rowsOf<{ id: string }>(exported, 'expenses').filter(
        (expense) => expense.id === id,
      ).length,
      rowsOf<{ expenseId: string }>(exported, 'expense_payments').filter(
        (payment) => payment.expenseId === id,
      ).length,
      rowsOf<{ expenseId: string }>(exported, 'expense_shares').filter(
        (share) => share.expenseId === id,
      ).length,
    ]);
  }

  // An export reads the local data, so at least the first change was saved during one.
  expect(changes).toBeGreaterThan(0);
});

test('[BACKUP-5.1] exports with no network and makes no request', async () => {
  await startWithTaylorsData();
  const requests = goOffline();
  const data = dataIn(phone.database);

  const shared = await exportData();

  expect(tablesIn(dataIn(shared.copy), data)).toEqual(data);
  expect(requests()).toBe(0);
});

test.each(['shares', 'cancels'] as const)(
  '[BACKUP-6.1] leaves no temporary file and shows nothing once the user %s in the share sheet',
  async (answer) => {
    await startWithTaylorsData();
    shareSheet(answer);

    await exportData();

    expect(temporaryFiles(phone)).toEqual([]);
    expect(alertsShown()).toEqual([]);
  },
);

test('[BACKUP-6.1] keeps the file where the share sheet can read it while the sheet is open', async () => {
  await startWithTaylorsData();
  shareSheet('stays open');

  const shared = await exportData();

  expect(fs.readFileSync(shared.onPhone)).toEqual(fs.readFileSync(shared.copy));

  await closeShareSheet();

  expect(temporaryFiles(phone)).toEqual([]);
});

test.each([
  ['there is no room for a temporary file', leaveNoRoomForTemporaryFiles],
  ['the file cannot be written', failWrites],
])(
  '[BACKUP-7.1] reports a failed export and leaves nothing behind when %s',
  async (_reason, fail) => {
    await startWithTaylorsData();
    const before = dataIn(phone.database);
    fail();

    await pressRow('Export Data');

    expect(await nextAlert(1)).toEqual(EXPORT_FAILED);
    expect(sharedFiles()).toEqual([]);
    expect(temporaryFiles(phone)).toEqual([]);
    expect(dataIn(phone.database)).toEqual(before);
  },
);

test('[BACKUP-7.1] reports a failed export and leaves nothing behind when the share sheet cannot open', async () => {
  await startWithTaylorsData();
  shareSheet('cannot open');

  await pressRow('Export Data');

  expect(await nextAlert(1)).toEqual(EXPORT_FAILED);
  expect(temporaryFiles(phone)).toEqual([]);
});

test('[BACKUP-7.1] deletes what it had written when a later write of the export fails', async () => {
  await startWithTaylorsData();
  const before = dataIn(phone.database);

  // The second write of the export fails, then the third, and so on, until an
  // export goes through with every write allowed.
  for (let allowed = 1; ; allowed += 1) {
    const shown = alertsShown().length;
    failWritesAfter(allowed);

    await pressRow('Export Data');
    await waitFor(() =>
      expect(sharedFiles().length + alertsShown().length).toBe(shown + 1),
    );
    await settle();
    allowWrites();
    if (sharedFiles().length === 1) break;

    expect(alertsShown().at(-1)).toEqual(EXPORT_FAILED);
    expect(temporaryFiles(phone)).toEqual([]);
    expect(dataIn(phone.database)).toEqual(before);
    expect(allowed).toBeLessThan(1000);
  }
}, 60_000);

test('[BACKUP-7.1] exports when Export Data is pressed again after a failed export', async () => {
  await startWithTaylorsData();
  leaveNoRoomForTemporaryFiles();
  failWrites();
  await pressRow('Export Data');
  expect(await nextAlert(1)).toEqual(EXPORT_FAILED);
  makeRoomForTemporaryFiles();
  allowWrites();
  const data = dataIn(phone.database);

  const shared = await exportData();

  expect(tablesIn(dataIn(shared.copy), data)).toEqual(data);
  expect(alertsShown()).toEqual([EXPORT_FAILED]);
});

test('[BACKUP-8.1] disables both DATA rows until the share sheet closes', async () => {
  await startWithTaylorsData();
  shareSheet('stays open');

  await exportData();

  expect(dataRow('Export Data')).toBeDisabled();
  expect(dataRow('Import Data')).toBeDisabled();

  await closeShareSheet();

  expect(dataRow('Export Data')).toBeEnabled();
  expect(dataRow('Import Data')).toBeEnabled();
});

test('[BACKUP-8.1] exports once when Export Data is pressed twice', async () => {
  await startWithTaylorsData();
  shareSheet('stays open');

  await exportData();
  await pressRow('Export Data');

  expect(sharedFiles()).toHaveLength(1);
  expect(temporaryFiles(phone)).toHaveLength(1);

  await closeShareSheet();

  expect(sharedFiles()).toHaveLength(1);
});

test('[BACKUP-8.1] enables both DATA rows again after a failed export', async () => {
  await startWithTaylorsData();
  shareSheet('cannot open');

  await pressRow('Export Data');
  expect(await nextAlert(1)).toEqual(EXPORT_FAILED);
  await settle();

  await waitFor(() => expect(dataRow('Export Data')).toBeEnabled());
  expect(dataRow('Import Data')).toBeEnabled();
});
