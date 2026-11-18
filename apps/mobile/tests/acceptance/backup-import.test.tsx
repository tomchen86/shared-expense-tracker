import { Alert } from 'react-native';
import { screen, waitFor } from '@testing-library/react-native';
import { listGroups, renameGroup } from '../../src/groups';
import { saveExpense } from '../../src/ledger/expenses';
import { appMigrations } from '../../src/shell';
import {
  CANNOT_USE_FILE,
  IMPORT_FAILED,
  NEWER_FILE,
  REPLACE,
  alertsShown,
  allowWrites,
  answerPicker,
  appState,
  chooseFile,
  close,
  copyOf,
  damagedInTheMiddle,
  dataIn,
  dataRow,
  edited,
  exportData,
  exportFrom,
  failWritesAfter,
  filePicker,
  fileWith,
  firstHalfOf,
  fromANewerVersion,
  fromBeforeChartTypes,
  goOffline,
  importFile,
  lastAlertButtons,
  newPhone,
  nextAlert,
  openPicker,
  pickerOpened,
  pressAlertButton,
  pressRow,
  removePhones,
  replaceMessage,
  resetPhones,
  rowsOf,
  startOn,
  tablesIn,
  taylorsExport,
  temporaryFiles,
  withADifferentMigration,
  withAnExportTimeThatIsNoTime,
  withFields,
  withoutAnExportTime,
  writeData,
  writeSamsData,
  type Phone,
} from './backup-app';
import { openGroup } from './group-details-app';
import { cardNames } from './groups-app';
import {
  editExpense,
  resetPhone,
  setPhoneLanguage,
} from './ledger-expense-app';
import { cardTitles, expensesRoot } from './ledger-expense-list-app';
import { chooseSort, expectSort } from './ledger-list-find-app';
import {
  expectPeriod,
  periodName,
  pressPreviousPeriod,
} from './ledger-list-period-app';
import {
  appAppearance,
  fakePhoneAppearance,
  fakeReduceTransparency,
  settle,
} from './shell-appearance-app';
import {
  navigationBarTitles,
  selectedTab,
  tab,
  tapTab,
} from './shell-tabs-app';

// Runs on iOS, on a development build, as every test that starts the whole app does.
// Each test starts the app on a phone of its own (backup-app), in Taipei at
// 2026-11-18 14:32 unless it says otherwise, in a region whose currency is USD. The
// export files come from the app's own Export Data; the ones that cannot be imported
// are copies of those, cut, overwritten, or edited as the SQLite databases they are
// (ADR-0020).

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

/** Starts the app on a phone that holds Sam's data. */
async function startWithSamsData(url?: string) {
  await writeSamsData(phone);
  return startOn(phone, { url });
}

const nameField = () => screen.getByLabelText('Your name');

/** Sam's phone is as it was: the same data, on the Settings root, with Sam's name. */
function expectNothingChanged(
  app: { getPathname: () => string },
  before: ReturnType<typeof dataIn>,
) {
  expect(dataIn(phone.database)).toEqual(before);
  expect(app.getPathname()).toBe('/settings');
  expect(nameField()).toHaveDisplayValue('Sam');
}

const TAYLORS_EXPORT_TIME = 'Nov 18, 2026 at 2:32 PM';

test('[BACKUP-10.1] opens the file picker when Import Data is pressed', async () => {
  await startOn(phone);

  await openPicker();

  expect(pickerOpened()).toBe(1);
  expect(alertsShown()).toEqual([]);
});

test('[BACKUP-10.1] does nothing when the user cancels in the file picker', async () => {
  const app = await startWithSamsData();
  const before = dataIn(phone.database);

  await chooseFile(undefined);

  expect(alertsShown()).toEqual([]);
  expectNothingChanged(app, before);
});

test('[BACKUP-26.1] says the data could not be imported when the file picker cannot open, and opens it on the next press', async () => {
  const { file } = await taylorsExport();
  const app = await startWithSamsData();
  const before = dataIn(phone.database);
  filePicker('cannot open');

  await pressRow('Import Data');

  expect(await nextAlert(1)).toEqual(IMPORT_FAILED);
  await settle();
  expect(alertsShown()).toEqual([IMPORT_FAILED]);
  expectNothingChanged(app, before);
  for (const row of ['Export Data', 'Import Data'] as const)
    expect(dataRow(row)).toBeEnabled();

  filePicker('opens');
  await chooseFile(file);

  expect((await nextAlert(2))[0]).toBe(REPLACE);
});

test('[BACKUP-26.1] says the data could not be imported when the file picker cannot hand over the picked file, and asks about it on the next try', async () => {
  const { file } = await taylorsExport();
  const app = await startWithSamsData();
  const before = dataIn(phone.database);
  filePicker('cannot hand over the file');

  await chooseFile(file);

  expect(await nextAlert(1)).toEqual(IMPORT_FAILED);
  await settle();
  expect(alertsShown()).toEqual([IMPORT_FAILED]);
  expectNothingChanged(app, before);

  filePicker('opens');
  await chooseFile(file);

  expect((await nextAlert(2))[0]).toBe(REPLACE);
  expect(dataIn(phone.database)).toEqual(before);
});

test("[BACKUP-11.1] asks before writing anything, with the file's export time and its counts", async () => {
  const { file } = await taylorsExport();
  await startWithSamsData();
  const before = dataIn(phone.database);

  await chooseFile(file);

  expect(await nextAlert(1)).toEqual([
    REPLACE,
    replaceMessage(TAYLORS_EXPORT_TIME, '2 groups', '3 expenses'),
  ]);
  expect(lastAlertButtons()).toEqual([
    ['Cancel', 'cancel'],
    ['Replace', 'destructive'],
  ]);
  expect(dataIn(phone.database)).toEqual(before);
});

test("[BACKUP-11.1] writes the export time in English with the phone's region when the phone's language is not English", async () => {
  const { file } = await taylorsExport();
  setPhoneLanguage('zh-Hant-AU');
  await startOn(phone);

  await chooseFile(file);

  expect(await nextAlert(1)).toEqual([
    REPLACE,
    replaceMessage('18 Nov 2026 at 2:32 pm', '2 groups', '3 expenses'),
  ]);
});

test('[BACKUP-11.1] writes the export time in plain English when the phone reports no region', async () => {
  const { file } = await taylorsExport();
  setPhoneLanguage('ja');
  await startOn(phone);

  await chooseFile(file);

  expect(await nextAlert(1)).toEqual([
    REPLACE,
    replaceMessage(TAYLORS_EXPORT_TIME, '2 groups', '3 expenses'),
  ]);
});

test('[BACKUP-11.1] writes the export time in the time zone the device is in', async () => {
  const { file } = await taylorsExport();
  await startOn(phone, { timeZone: 'America/Los_Angeles' });

  await chooseFile(file);

  expect(await nextAlert(1)).toEqual([
    REPLACE,
    replaceMessage('Nov 17, 2026 at 10:32 PM', '2 groups', '3 expenses'),
  ]);
});

test('[BACKUP-11.1] leaves expenses in the Trash out of the count, and writes one group and one expense in the singular', async () => {
  // Sam's data has one group, the expense Bus, and Tea in the Trash.
  const sams = newPhone();
  await writeSamsData(sams);
  const { file } = await exportFrom(sams);
  await startOn(phone);

  await chooseFile(file);

  expect(await nextAlert(1)).toEqual([
    REPLACE,
    replaceMessage(TAYLORS_EXPORT_TIME, '1 group', '1 expense'),
  ]);
});

test('[BACKUP-11.1] writes 0 groups and 0 expenses for a file exported before anything was recorded', async () => {
  const { file } = await exportFrom(newPhone());
  await startOn(phone);

  await chooseFile(file);

  expect(await nextAlert(1)).toEqual([
    REPLACE,
    replaceMessage(TAYLORS_EXPORT_TIME, '0 groups', '0 expenses'),
  ]);
});

test('[BACKUP-12.1] writes nothing and stays on Settings when Cancel is pressed', async () => {
  const { file } = await taylorsExport();
  const app = await startWithSamsData();
  const before = dataIn(phone.database);
  await chooseFile(file);
  await nextAlert(1);

  await pressAlertButton('Cancel');
  await settle();

  expectNothingChanged(app, before);
  expect(alertsShown()).toHaveLength(1);
});

test('[BACKUP-13.1] makes a new phone hold exactly what the exporting phone held, its local identity included', async () => {
  const { file, data } = await taylorsExport();
  await startOn(phone);
  const own = dataIn(phone.database);

  await importFile(file);

  expect(dataIn(phone.database)).toEqual(data);
  expect(data.local_identity).not.toEqual(own.local_identity);
});

test('[BACKUP-13.1] leaves nothing of the data the phone had before', async () => {
  const { file, data } = await taylorsExport();
  await startWithSamsData();

  await importFile(file);

  const now = dataIn(phone.database);
  expect(now).toEqual(data);
  expect(JSON.stringify(now)).not.toMatch(/Sam|Osaka|Bus|Tea/);
});

test('[BACKUP-13.1] takes a phone back to what it held when it exported the file', async () => {
  const taylors = newPhone();
  await writeData(taylors, { name: 'Taylor', groups: [{ name: 'Brisbane' }] });
  const { file, data } = await exportFrom(taylors);
  await writeData(taylors, {}, async (database, identity) => {
    const [brisbane] = await listGroups(database);
    await renameGroup(database, brisbane.id, 'Sydney');
    const [category] = await database.all<{ id: string }>(
      'SELECT id FROM categories WHERE spaceId = ? ORDER BY position LIMIT 1',
      [identity.personalSpaceId],
    );
    await saveExpense(database, identity, {
      title: 'Taxi',
      amountMinor: 3000,
      currency: 'USD',
      date: '2026-11-14',
      categoryId: category.id,
    });
  });
  expect(dataIn(taylors.database)).not.toEqual(data);
  await startOn(taylors);

  await importFile(file);

  expect(dataIn(taylors.database)).toEqual(data);
});

test('[BACKUP-13.1] ends with the same data when the same file is imported twice', async () => {
  const { file, data } = await taylorsExport();
  await startOn(phone);
  await importFile(file);

  await tapTab('Settings');
  await importFile(file);

  expect(dataIn(phone.database)).toEqual(data);
});

test('[BACKUP-13.1] exports the same data again after an import', async () => {
  const { file, data } = await taylorsExport();
  await startOn(phone);
  await importFile(file);
  await tapTab('Settings');

  const again = await exportData();

  expect(tablesIn(dataIn(again.copy), data)).toEqual(data);
  expect(tablesIn(dataIn(again.copy), data)).toEqual(
    tablesIn(dataIn(file), data),
  );
});

test("[BACKUP-14.1] goes back to the Expenses tab and shows the file's data on every tab, with no further alert", async () => {
  const { file } = await taylorsExport();
  await startWithSamsData();

  await importFile(file);

  expect(selectedTab()).toBe('Expenses');
  expect([...cardTitles()].sort()).toEqual(['Coffee run', 'Dinner', 'Train']);

  await tapTab('Groups');
  await waitFor(() => expect(cardNames()).toEqual(['Open Brisbane']));

  await tapTab('Settings');
  await waitFor(() => expect(nameField()).toHaveDisplayValue('Taylor'));
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Archived groups, 1' }),
    ).toBeOnTheScreen(),
  );
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Trash, 1' })).toBeOnTheScreen(),
  );
  expect(alertsShown()).toHaveLength(1);
});

test('[LEDGER-107.2] opens the expense list on this month again once an import is done', async () => {
  const { file } = await taylorsExport();
  await startWithSamsData('/');
  await pressPreviousPeriod(expensesRoot());
  await expectPeriod(expensesRoot, 'October 2026');
  await tapTab('Settings');

  await importFile(file);

  await waitFor(() => expect(periodName(expensesRoot())).toBe('November 2026'));
  expect([...cardTitles()].sort()).toEqual(['Coffee run', 'Dinner', 'Train']);
});

test("[BACKUP-14.1] uses the file's local identity, chart type and appearance option at once", async () => {
  const { file, data } = await taylorsExport();
  await startWithSamsData();

  await importFile(file);

  const [stored] = rowsOf<{
    userId: string;
    personalSpaceId: string;
    personalParticipantId: string;
  }>(data, 'local_identity');
  expect(await appState()).toEqual({
    identity: {
      userId: stored.userId,
      personalSpaceId: stored.personalSpaceId,
      personalParticipantId: stored.personalParticipantId,
      name: 'Taylor',
    },
    chartType: 'bar',
    appearance: 'dark',
  });
});

test("[BACKUP-14.1] switches to the file's appearance at once", async () => {
  const { file } = await taylorsExport();
  await startOn(phone);
  expect(appAppearance()).toBe('light');

  await importFile(file);

  expect(appAppearance()).toBe('dark');
});

test('[BACKUP-14.1] leaves each tab on its root, whatever was pushed before the import', async () => {
  const { file } = await taylorsExport();
  await startWithSamsData('/groups');
  await openGroup('Osaka');
  await tapTab('Settings');

  await importFile(file);

  expect(navigationBarTitles(tab('Groups'))).toEqual(['Groups']);
  expect(navigationBarTitles(tab('Settings'))).toEqual(['Settings']);
  await tapTab('Groups');
  await waitFor(() => expect(cardNames()).toEqual(['Open Brisbane']));
});

const PHOTO = Uint8Array.from([
  0xff,
  0xd8,
  0xff,
  0xe0,
  ...Array.from({ length: 5000 }, (_, index) => (index * 131) % 256),
]);

/** Files that cannot be used, each made from Taylor's export file or from Sam's phone. */
const UNUSABLE: [
  string,
  (file: string, phone: Phone) => string | Promise<string>,
][] = [
  ['an empty file', () => fileWith('empty.sqlite', '')],
  ['a text file', () => fileWith('notes.txt', 'Coffee run, 8.75\n')],
  ['a photo', () => fileWith('photo.jpg', PHOTO)],
  ['the first half of an export file', (file) => firstHalfOf(file)],
  [
    'an export file overwritten in the middle',
    (file) => damagedInTheMiddle(file),
  ],
  [
    'a database another program made',
    () =>
      edited(
        fileWith('other.sqlite', ''),
        "CREATE TABLE contacts (name TEXT); INSERT INTO contacts VALUES ('Casey')",
      ),
  ],
  [
    'a database whose migration records differ',
    () => withADifferentMigration(),
  ],
  [
    'a database with no migration records',
    (file) => edited(file, 'DROP TABLE _migrations'),
  ],
  [
    'a copy of a phone database, which has no export time',
    (_file, samsPhone) => copyOf(samsPhone.database),
  ],
  [
    'an export file whose export time was deleted',
    (file) => withoutAnExportTime(file),
  ],
  [
    'an export file whose export time is not a time',
    (file) => withAnExportTimeThatIsNoTime(file),
  ],
];

test.each(UNUSABLE)(
  '[BACKUP-15.1] writes nothing and says the file cannot be used for %s',
  async (_what, make) => {
    const { file } = await taylorsExport();
    const app = await startWithSamsData();
    const before = dataIn(phone.database);

    await chooseFile(await make(file, phone));

    expect(await nextAlert(1)).toEqual(CANNOT_USE_FILE);
    await settle();
    expect(alertsShown()).toEqual([CANNOT_USE_FILE]);
    expectNothingChanged(app, before);
  },
);

test('[BACKUP-15.1] keeps the local data on a development build when the migration records differ', async () => {
  expect(__DEV__).toBe(true);
  const app = await startWithSamsData();
  const before = dataIn(phone.database);

  await chooseFile(await withADifferentMigration());

  expect(await nextAlert(1)).toEqual(CANNOT_USE_FILE);
  expectNothingChanged(app, before);
});

const TRIGGER =
  'CREATE TRIGGER wipe AFTER INSERT ON expenses BEGIN DELETE FROM categories; END';

/** Edits to Taylor's export file that leave its rows and migration records as they were. */
const NOT_IN_AN_EXPORT: [string, string][] = [
  ['a trigger', TRIGGER],
  ['one more view', 'CREATE VIEW recent AS SELECT * FROM expenses'],
  [
    'a view in place of a table',
    'ALTER TABLE expense_shares RENAME TO shares; CREATE VIEW expense_shares AS SELECT * FROM shares',
  ],
  ['one more table', 'CREATE TABLE notes (id TEXT)'],
  ['one more index', 'CREATE INDEX expenses_by_title ON expenses (title)'],
  ['a column missing', 'ALTER TABLE expenses DROP COLUMN note'],
  ['one more column', 'ALTER TABLE expenses ADD COLUMN extra TEXT'],
  [
    'a table without one of its constraints',
    `CREATE TABLE groups_next (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, position INTEGER NOT NULL UNIQUE, archived INTEGER NOT NULL DEFAULT 0);
     INSERT INTO groups_next SELECT id, name, position, archived FROM groups;
     DROP TABLE groups;
     ALTER TABLE groups_next RENAME TO groups`,
  ],
];

test.each(NOT_IN_AN_EXPORT)(
  '[BACKUP-24.1] writes nothing and says the file cannot be used for an export file with %s',
  async (_what, sql) => {
    const { file } = await taylorsExport();
    const app = await startWithSamsData();
    const before = dataIn(phone.database);

    await chooseFile(edited(file, sql));

    expect(await nextAlert(1)).toEqual(CANNOT_USE_FILE);
    await settle();
    expect(alertsShown()).toEqual([CANNOT_USE_FILE]);
    expectNothingChanged(app, before);
  },
);

test('[BACKUP-24.1] writes nothing for a file from an older version that has a trigger', async () => {
  const { file } = await taylorsExport();
  const older = edited(await fromBeforeChartTypes(file), TRIGGER);
  const app = await startWithSamsData();
  const before = dataIn(phone.database);

  await chooseFile(older);

  expect(await nextAlert(1)).toEqual(CANNOT_USE_FILE);
  await settle();
  expect(alertsShown()).toEqual([CANNOT_USE_FILE]);
  expectNothingChanged(app, before);
});

const DINNER = "(SELECT id FROM expenses WHERE title = 'Dinner')";
const COFFEE_RUN = "(SELECT id FROM expenses WHERE title = 'Coffee run')";
/** Adds a member of a group that is not in the file, which no foreign key allows. */
const GHOST_MEMBER =
  "INSERT INTO group_members (id, groupId, userId, name, position) VALUES ('ghost', 'missing', NULL, 'Ghost', 1)";

/** Edits to Taylor's export file that break one rule each. Dinner is 10001 minor units. */
const AGAINST_THE_RULES: [string, string][] = [
  [
    'shares that add up to less than the amount',
    `UPDATE expense_shares SET amountMinor = CASE position WHEN 0 THEN 3334 ELSE 3333 END WHERE expenseId = ${DINNER}`,
  ],
  [
    'a payment larger than the amount',
    `UPDATE expense_payments SET amountMinor = 10002 WHERE expenseId = ${DINNER}`,
  ],
  [
    'an expense with no shares',
    `DELETE FROM expense_shares WHERE expenseId = ${COFFEE_RUN}`,
  ],
  [
    'an expense with no payments',
    `DELETE FROM expense_payments WHERE expenseId = ${COFFEE_RUN}`,
  ],
  [
    'a currency that is not supported',
    "UPDATE expenses SET currency = 'XYZ' WHERE title = 'Coffee run'",
  ],
  [
    'a date that does not exist',
    "UPDATE expenses SET date = '2025-02-30' WHERE title = 'Coffee run'",
  ],
  [
    'an amount of 0, against a CHECK',
    `UPDATE expense_payments SET amountMinor = 0 WHERE expenseId = ${COFFEE_RUN};
     UPDATE expense_shares SET amountMinor = 0 WHERE expenseId = ${COFFEE_RUN};
     UPDATE expenses SET amountMinor = 0 WHERE title = 'Coffee run'`,
  ],
  [
    'an expense in a category that is not there, against a foreign key',
    "UPDATE expenses SET categoryId = 'missing' WHERE title = 'Coffee run'",
  ],
  [
    'a member of a group that is not there, against a foreign key',
    GHOST_MEMBER,
  ],
  ['no local identity', 'DELETE FROM local_identity'],
  [
    'an expense in a space that is neither the personal space nor a group',
    "UPDATE expenses SET spaceId = 'nowhere' WHERE title = 'Coffee run'",
  ],
  [
    'a category in a space that is neither the personal space nor a group',
    "UPDATE categories SET spaceId = 'nowhere' WHERE name = 'Shopping' AND spaceId = (SELECT personalSpaceId FROM local_identity)",
  ],
  [
    'a group expense paid by someone who is not a member of the group',
    `UPDATE expense_payments SET participant = 'stranger' WHERE expenseId = ${DINNER}`,
  ],
  [
    'a personal expense shared by a member of a group',
    `UPDATE expense_shares SET participant = (SELECT id FROM group_members WHERE name = 'Casey') WHERE expenseId = ${COFFEE_RUN}`,
  ],
];

test.each(AGAINST_THE_RULES)(
  '[BACKUP-16.1] writes nothing and says the file cannot be used for %s',
  async (_what, sql) => {
    const { file } = await taylorsExport();
    const app = await startWithSamsData();
    const before = dataIn(phone.database);

    await chooseFile(edited(file, sql));

    expect(await nextAlert(1)).toEqual(CANNOT_USE_FILE);
    await settle();
    expect(alertsShown()).toEqual([CANNOT_USE_FILE]);
    expectNothingChanged(app, before);
  },
);

test('[BACKUP-17.1] writes nothing and asks for an update when the file comes from a newer version, on a development build too', async () => {
  expect(__DEV__).toBe(true);
  const { file } = await taylorsExport();
  const app = await startWithSamsData();
  const before = dataIn(phone.database);

  await chooseFile(await fromANewerVersion(file));

  expect(await nextAlert(1)).toEqual(NEWER_FILE);
  await settle();
  expect(alertsShown()).toEqual([NEWER_FILE]);
  expectNothingChanged(app, before);
});

test('[BACKUP-17.1] asks for an update when a file from a newer version has a member of a group that is not there, against a foreign key', async () => {
  const { file } = await taylorsExport();
  const app = await startWithSamsData();
  const before = dataIn(phone.database);

  await chooseFile(edited(await fromANewerVersion(file), GHOST_MEMBER));

  expect(await nextAlert(1)).toEqual(NEWER_FILE);
  await settle();
  expect(alertsShown()).toEqual([NEWER_FILE]);
  expectNothingChanged(app, before);
});

test('[BACKUP-17.1] says the file cannot be used when a file from a newer version is damaged', async () => {
  const { file } = await taylorsExport();
  const app = await startWithSamsData();
  const before = dataIn(phone.database);

  await chooseFile(firstHalfOf(await fromANewerVersion(file)));

  expect(await nextAlert(1)).toEqual(CANNOT_USE_FILE);
  expectNothingChanged(app, before);
});

test('[BACKUP-18.1] upgrades a file from before Insights had a chart type and imports it like any other', async () => {
  const { file, data } = await taylorsExport();
  const older = await fromBeforeChartTypes(file);
  expect(dataIn(older)._migrations.length).toBeLessThan(appMigrations.length);
  await startWithSamsData();

  await chooseFile(older);

  expect(await nextAlert(1)).toEqual([
    REPLACE,
    replaceMessage(TAYLORS_EXPORT_TIME, '2 groups', '3 expenses'),
  ]);

  await pressAlertButton('Replace');
  await waitFor(() => expect(selectedTab()).toBe('Expenses'));

  // Everything as Taylor's phone had it, except the chart type that version did not have.
  expect(dataIn(phone.database)).toEqual(
    withFields(data, 'local_identity', { chartType: 'auto' }),
  );
  expect((await appState()).chartType).toBe('auto');
});

test('[BACKUP-18.1] checks the rules on a file from an older version after upgrading it', async () => {
  const { file } = await taylorsExport();
  const older = edited(
    await fromBeforeChartTypes(file),
    AGAINST_THE_RULES[0][1],
  );
  const app = await startWithSamsData();
  const before = dataIn(phone.database);

  await chooseFile(older);

  expect(await nextAlert(1)).toEqual(CANNOT_USE_FILE);
  expectNothingChanged(app, before);
});

test('[BACKUP-18.1] says the file cannot be used when one of its missing migrations cannot run', async () => {
  const { file } = await taylorsExport();
  const older = edited(
    await fromBeforeChartTypes(file),
    'ALTER TABLE local_identity ADD COLUMN chartType TEXT',
  );
  const app = await startWithSamsData();
  const before = dataIn(phone.database);

  await chooseFile(older);

  expect(await nextAlert(1)).toEqual(CANNOT_USE_FILE);
  expectNothingChanged(app, before);
});

test('[BACKUP-19.1] imports with no network and makes no request', async () => {
  const { file, data } = await taylorsExport();
  await startOn(phone);
  const requests = goOffline();

  await importFile(file);

  expect(dataIn(phone.database)).toEqual(data);
  expect(requests()).toBe(0);
});

test('[BACKUP-20.1] keeps the local data as it was whichever write fails, and imports once every write works', async () => {
  const { file, data } = await taylorsExport();
  const app = await startWithSamsData();
  const before = dataIn(phone.database);
  let failures = 0;

  // The first write after Replace fails, then the second, and so on through the
  // last one, until an import goes through with every write allowed.
  for (let allowed = 0; ; allowed += 1) {
    const shown = alertsShown().length;
    await chooseFile(file);
    expect((await nextAlert(shown + 1))[0]).toBe(REPLACE);
    failWritesAfter(allowed);

    await pressAlertButton('Replace');
    await waitFor(() =>
      expect(
        selectedTab() === 'Expenses' || alertsShown().length === shown + 2,
      ).toBe(true),
    );
    allowWrites();
    if (selectedTab() === 'Expenses') break;

    failures += 1;
    expect(alertsShown().at(-1)).toEqual(IMPORT_FAILED);
    expectNothingChanged(app, before);
    expect(allowed).toBeLessThan(1000);
  }

  expect(failures).toBeGreaterThan(0);
  expect(dataIn(phone.database)).toEqual(data);
  // One import for each write of an import, which takes longer than one test's time.
}, 120_000);

test('[BACKUP-21.1] leaves no temporary file after an import', async () => {
  const { file } = await taylorsExport();
  await startOn(phone);

  await importFile(file);

  expect(temporaryFiles(phone)).toEqual([]);
});

test('[BACKUP-21.1] leaves no temporary file when Cancel is pressed', async () => {
  const { file } = await taylorsExport();
  await startOn(phone);
  await chooseFile(file);
  await nextAlert(1);

  await pressAlertButton('Cancel');
  await settle();

  expect(temporaryFiles(phone)).toEqual([]);
});

test.each([
  ['that cannot be used', CANNOT_USE_FILE, (file: string) => firstHalfOf(file)],
  [
    'from a newer version',
    NEWER_FILE,
    (file: string) => fromANewerVersion(file),
  ],
])(
  '[BACKUP-21.1] leaves no temporary file after a file %s',
  async (_what, alert, make) => {
    const { file } = await taylorsExport();
    await startOn(phone);

    await chooseFile(await make(file));

    expect(await nextAlert(1)).toEqual(alert);
    await settle();
    expect(temporaryFiles(phone)).toEqual([]);
  },
);

test('[BACKUP-21.1] leaves no temporary file when the import fails to write', async () => {
  const { file } = await taylorsExport();
  await startOn(phone);
  await chooseFile(file);
  await nextAlert(1);
  failWritesAfter(0);

  await pressAlertButton('Replace');

  expect(await nextAlert(2)).toEqual(IMPORT_FAILED);
  await settle();
  expect(temporaryFiles(phone)).toEqual([]);
});

const expectRows = (state: 'disabled' | 'enabled') => {
  for (const row of ['Export Data', 'Import Data'] as const)
    if (state === 'disabled') expect(dataRow(row)).toBeDisabled();
    else expect(dataRow(row)).toBeEnabled();
};

test('[BACKUP-22.1] disables both DATA rows while the file picker is open, and enables them when the user cancels', async () => {
  await startOn(phone);

  await openPicker();

  expectRows('disabled');

  await answerPicker(undefined);

  expectRows('enabled');
});

test('[BACKUP-22.1] opens the file picker once when Import Data is pressed twice', async () => {
  await startOn(phone);

  await openPicker();
  await pressRow('Import Data');

  expect(pickerOpened()).toBe(1);
});

test('[BACKUP-22.1] keeps both DATA rows disabled while the confirmation is open, and enables them on Cancel', async () => {
  const { file } = await taylorsExport();
  await startOn(phone);

  await chooseFile(file);
  await nextAlert(1);

  expectRows('disabled');

  await pressAlertButton('Cancel');
  await settle();

  expectRows('enabled');
});

test('[BACKUP-22.1] enables both DATA rows again after a file that cannot be imported', async () => {
  const { file } = await taylorsExport();
  await startOn(phone);

  await chooseFile(firstHalfOf(file));

  expect(await nextAlert(1)).toEqual(CANNOT_USE_FILE);
  await waitFor(() => expectRows('enabled'));
});

// What an import brings of the time each expense was last changed and of a list's order
// (LEDGER-120.1, LEDGER-124.1)

/** The ID of the stored expense titled `title` on `onPhone`. */
function idOf(onPhone: Phone, title: string) {
  const found = rowsOf<{ id: string; title: string }>(
    dataIn(onPhone.database),
    'expenses',
  ).find((row) => row.title === title);
  if (found === undefined) throw new Error(`No expense titled ${title}`);
  return found.id;
}

/**
 * An export file of a phone that got A, B and C, in that order, at one moment on 2026-11-17, and
 * on which A was renamed A2 a day later: A2 is the expense that was changed last.
 */
async function exportAfterChangingA() {
  const source = newPhone();
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-11-17T01:00:00Z'));
  await writeData(source, {
    expenses: [
      { title: 'A', amount: '1', date: '2026-11-12' },
      { title: 'B', amount: '2', date: '2026-11-10' },
      { title: 'C', amount: '3', date: '2026-11-11' },
    ],
  });
  const app = await startOn(source, { url: '/' });
  await editExpense(idOf(source, 'A'), { title: 'A2' });
  await tapTab('Settings');
  const { copy } = await exportData();
  await close(app);
  return copy;
}

test('[LEDGER-120.1] [BACKUP-13.1] brings the time each expense was last changed with an import', async () => {
  const file = await exportAfterChangingA();
  await startOn(phone);

  await importFile(file);
  await chooseSort(expensesRoot(), 'Recently Edited');

  expect(cardTitles()).toEqual(['A2', 'C', 'B']);
});

test('[BACKUP-18.1] [LEDGER-120.1] [LEDGER-121.1] imports a file exported before expenses had a time of their last change, and lists its expenses as they were added until one is changed', async () => {
  const older = await fromBeforeChartTypes(await exportAfterChangingA());
  expect(dataIn(older)._migrations.length).toBeLessThan(appMigrations.length);
  await startOn(phone);

  await importFile(older);
  await chooseSort(expensesRoot(), 'Recently Edited');

  // None has a time, so the one added last comes first.
  expect(cardTitles()).toEqual(['C', 'B', 'A2']);

  await editExpense(idOf(phone, 'B'), { title: 'B2' });
  await settle();

  expect(cardTitles()).toEqual(['B2', 'C', 'A2']);
});

test('[LEDGER-124.1] [BACKUP-13.1] lists the expenses in the order the export file holds after an import', async () => {
  const source = newPhone();
  await writeData(source, {
    expenses: [
      { title: 'A', amount: '9', date: '2026-11-10' },
      { title: 'B', amount: '1', date: '2026-11-12' },
    ],
  });
  const exporting = await startOn(source, { url: '/' });
  await chooseSort(expensesRoot(), 'Oldest First');
  await tapTab('Settings');
  const { copy } = await exportData();
  await close(exporting);

  await writeSamsData(phone);
  await startOn(phone, { url: '/' });
  await chooseSort(expensesRoot(), 'Highest Amount');
  await tapTab('Settings');

  await importFile(copy);

  await expectSort(expensesRoot, 'Oldest First');
  expect(cardTitles()).toEqual(['A', 'B']);
});

test('[LEDGER-124.1] [BACKUP-18.1] lists the expenses newest first after importing a file exported before lists had an order, whatever order the phone was on', async () => {
  const older = await fromBeforeChartTypes(await exportAfterChangingA());
  await writeSamsData(phone);
  await startOn(phone, { url: '/' });
  await chooseSort(expensesRoot(), 'Highest Amount');
  await tapTab('Settings');

  await importFile(older);

  await expectSort(expensesRoot, 'Newest First');
  expect(cardTitles()).toEqual(['A2', 'C', 'B']);
});
