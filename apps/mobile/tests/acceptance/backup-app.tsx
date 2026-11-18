import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Alert, Text, type AlertButton } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { ensureDefaultCategories } from '../../src/categories';
import { listGroups, removeGroupMember } from '../../src/groups';
import {
  appMigrations,
  useChartType,
  useLocalIdentity,
  type LocalIdentity,
} from '../../src/shell';
import { applySeed, type Seed } from '../../src/shell/e2e-seed';
import { useAppearanceOption } from '../../src/shell/local-data-gate';
import {
  ensureLocalIdentity,
  saveLocalAppearance,
  saveLocalChartType,
} from '../../src/shell/identity';
import {
  initializeDatabase,
  runMigrations,
  type Database,
  type SqlExecutor,
  type SqlValue,
} from '../../src/storage';
import { openNodeDatabase } from '../../src/storage/node';
import { setPhoneClock } from './ledger-expense-app';
import { settle } from './shell-appearance-app';
import { push, selectedTab, startApp } from './shell-tabs-app';

// The backup tests start the whole app and stand in for the phone around it
// (ADR-0020): the phone database, a file of the phone the test picks; the phone's
// temporary files, share sheet and file picker, which the test file puts in place of
// src/storage/expo-files; the clock and time zone, as in the expense form tests; and
// the network. A test keeps what the app handed to the share sheet as a file outside
// the phone, as a user who saves it would, and hands a file to the picker the same
// way. An export file is a SQLite database (BACKUP-3.1), so the tests read it, and
// make the damaged and edited ones, with node:sqlite.

// Phones

export interface Phone {
  /** The phone database file. */
  database: string;
  /** Where the phone keeps temporary files. */
  temporary: string;
}

let root = '';
let count = 0;
const cleanups: (() => void)[] = [];

/** A new, empty directory outside any phone, where a user keeps files. */
function outside(): string {
  const directory = path.join(root, `outside-${++count}`);
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

/** A phone on which the app has never started. */
export function newPhone(): Phone {
  const directory = path.join(root, `phone-${++count}`);
  const temporary = path.join(directory, 'temporary');
  fs.mkdirSync(temporary, { recursive: true });
  return { database: path.join(directory, 'app.db'), temporary };
}

/** Every temporary file on the phone, by its path under the phone's temporary directory. */
export const temporaryFiles = (phone: Phone) =>
  fs
    .readdirSync(phone.temporary, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path.relative(phone.temporary, path.join(entry.parentPath, entry.name)),
    );

// The phone the app runs on

const WRITE = /^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER|VACUUM)\b/i;

const running = {
  phone: undefined as Phone | undefined,
  /** The app's connection, without the gate below. */
  database: undefined as Database | undefined,
  beforeWrite: (): Promise<void> => Promise.resolve(),
  /** Called as the app hands each statement to its connection, before the statement is queued. */
  onStatement: undefined as (() => void) | undefined,
  filesOpened: [] as Database[],
};

/**
 * `database` with every statement that changes rows or schema behind `beforeWrite`.
 * The app's own connection also reports each statement it is handed.
 */
function gated(database: Database, isAppConnection: boolean): Database {
  const before = async (sql: string) => {
    if (isAppConnection) running.onStatement?.();
    if (WRITE.test(sql)) await running.beforeWrite();
  };
  const gate = <T extends SqlExecutor>(executor: T): T => ({
    ...executor,
    exec: async (sql: string) => {
      await before(sql);
      return executor.exec(sql);
    },
    run: async (sql: string, parameters?: readonly SqlValue[]) => {
      await before(sql);
      return executor.run(sql, parameters);
    },
    all: async <R,>(sql: string, parameters?: readonly SqlValue[]) => {
      await before(sql);
      return executor.all<R>(sql, parameters);
    },
  });
  return {
    ...gate(database),
    transaction: <R,>(work: (transaction: SqlExecutor) => Promise<R>) =>
      database.transaction((transaction) => work(gate(transaction))),
  };
}

function runningPhone(): Phone {
  if (running.phone === undefined) throw new Error('No phone is running');
  return running.phone;
}

/** Stands in for src/storage/expo: the database of the phone the app runs on. */
export async function openPhoneDatabase(): Promise<Database> {
  running.database = openNodeDatabase(runningPhone().database);
  return gated(running.database, true);
}

export function allowWrites() {
  running.beforeWrite = () => Promise.resolve();
}

/** Every write fails, to the phone database and to any file, as on a full disk. */
export function failWrites() {
  running.beforeWrite = () => Promise.reject(new Error('disk full'));
}

/** Lets the next `allowed` writes through and fails every write after them. */
export function failWritesAfter(allowed: number) {
  let left = allowed;
  running.beforeWrite = () =>
    left-- > 0 ? Promise.resolve() : Promise.reject(new Error('disk full'));
}

/**
 * Runs `change` on the app's own connection just before the app's statement number
 * `position`, counting from now, so the change is queued ahead of that statement.
 * The returned function says whether the app got that far, once the change is saved.
 */
export function beforeStatement(
  position: number,
  change: (database: Database) => Promise<void>,
) {
  let seen = 0;
  let saved: Promise<void> | undefined;
  running.onStatement = () => {
    if (++seen !== position) return;
    running.onStatement = undefined;
    saved = change(running.database!);
  };
  return async () => {
    running.onStatement = undefined;
    await saved;
    return saved !== undefined;
  };
}

// The phone's temporary files, share sheet and file picker

export interface SharedFile {
  /** The name of the file the app handed to the share sheet. */
  name: string;
  /** Where the app keeps that file on the phone. */
  onPhone: string;
  /** The copy the share sheet took, outside the phone. */
  copy: string;
}

const HELD = Symbol('held');

const system = {
  noRoomForTemporaryFiles: false,
  temporaryFilesCannotBeRemoved: false,
  removalsTried: 0,
  shareSheet: 'shares' as 'shares' | 'cancels' | 'cannot open' | 'stays open',
  closeShareSheet: undefined as (() => void) | undefined,
  shared: [] as SharedFile[],
  pick: undefined as string | undefined | typeof HELD,
  answerPicker: undefined as ((file: string | undefined) => void) | undefined,
  pickerOpened: 0,
};

/** Stands in for src/storage/expo-files on the phone the app runs on. */
export const phoneFiles = {
  async createTemporaryDirectory() {
    if (system.noRoomForTemporaryFiles) throw new Error('No space left');
    return fs.mkdtempSync(path.join(runningPhone().temporary, 'made-'));
  },
  async removeTemporaryFiles() {
    system.removalsTried += 1;
    if (system.temporaryFilesCannotBeRemoved)
      throw new Error('The temporary files cannot be removed');
    const { temporary } = runningPhone();
    for (const name of fs.readdirSync(temporary))
      fs.rmSync(path.join(temporary, name), { recursive: true, force: true });
  },
  async removePath(target: string) {
    fs.rmSync(target, { recursive: true, force: true });
  },
  async openDatabaseFile(file: string) {
    const database = openNodeDatabase(file);
    running.filesOpened.push(database);
    return gated(database, false);
  },
  async shareFile(file: string) {
    if (system.shareSheet === 'cannot open')
      throw new Error('The share sheet cannot open');
    // The share sheet reads the file as it opens: a file that is not there fails here.
    const copy = path.join(outside(), path.basename(file));
    fs.copyFileSync(file, copy);
    system.shared.push({ name: path.basename(file), onPhone: file, copy });
    if (system.shareSheet === 'stays open')
      await new Promise<void>((resolve) => {
        system.closeShareSheet = resolve;
      });
  },
  async pickFile() {
    system.pickerOpened += 1;
    const picked =
      system.pick === HELD
        ? await new Promise<string | undefined>((resolve) => {
            system.answerPicker = resolve;
          })
        : system.pick;
    if (picked === undefined) return undefined;
    // The picker hands the app a copy among the phone's temporary files.
    const copy = path.join(
      fs.mkdtempSync(path.join(runningPhone().temporary, 'picked-')),
      path.basename(picked),
    );
    fs.copyFileSync(picked, copy);
    return copy;
  },
} satisfies typeof import('../../src/storage/expo-files');

/** The phone has no room for a new temporary directory. */
export function leaveNoRoomForTemporaryFiles() {
  system.noRoomForTemporaryFiles = true;
}

export function makeRoomForTemporaryFiles() {
  system.noRoomForTemporaryFiles = false;
}

/** The phone refuses when the app asks to delete all its earlier temporary files. */
export function keepTemporaryFilesFromBeingRemoved() {
  system.temporaryFilesCannotBeRemoved = true;
}

/** How many times the app has tried to delete all its temporary files. */
export const removalsTried = () => system.removalsTried;

/**
 * A temporary file an earlier run of the app left on `phone`, as when the system
 * ends the app while the file picker's copy is still there.
 */
export function leaveATemporaryFileOn(phone: Phone) {
  fs.writeFileSync(
    path.join(
      fs.mkdtempSync(path.join(phone.temporary, 'picked-')),
      'Expenses Backup 2026-11-17 0900.sqlite',
    ),
    'left behind',
  );
}

/**
 * What happens when the app opens the share sheet: the user shares the file, cancels,
 * the sheet cannot open, or it stays open until `closeShareSheet`.
 */
export function shareSheet(behavior: typeof system.shareSheet) {
  system.shareSheet = behavior;
}

/** The user finishes with the share sheet that stayed open. */
export async function closeShareSheet() {
  await act(async () => system.closeShareSheet?.());
  await settle();
}

/** The files the app has handed to the share sheet, in order. */
export const sharedFiles = () => system.shared;

/** How many times the app has opened the file picker. */
export const pickerOpened = () => system.pickerOpened;

// Starting the app

function Probe() {
  return (
    <Text testID="backup-probe">
      {JSON.stringify({
        identity: useLocalIdentity(),
        chartType: useChartType(),
        appearance: useAppearanceOption(),
      })}
    </Text>
  );
}

const TEST_ROUTES = { './(tabs)/(expenses)/backup-probe.tsx': Probe };

/** Starts the app on `phone`, on Settings unless `url` says otherwise, in Taipei at 2026-11-18 14:32. */
export async function startOn(
  phone: Phone,
  {
    url = '/settings',
    timeZone = 'Asia/Taipei',
    now = '2026-11-18T06:32:00Z',
  } = {},
) {
  running.phone = phone;
  const app = await startApp(url, TEST_ROUTES);
  setPhoneClock(timeZone, now);
  await settle();
  return app;
}

/** Closes the app. */
export async function close(app: { unmount: () => Promise<void> }) {
  await app.unmount();
  await settle();
}

/** The local identity, chart type and appearance option the app uses now, read on a test screen pushed onto the Expenses tab. */
export async function appState(): Promise<{
  identity: LocalIdentity;
  chartType: string;
  appearance: string;
}> {
  await push('/backup-probe');
  const probe = await screen.findByTestId('backup-probe');
  const state = JSON.parse(String(probe.props.children));
  await act(async () => router.back());
  await waitFor(() => expect(screen.queryByTestId('backup-probe')).toBeNull());
  return state;
}

// Settings

export const NOTE =
  'Export saves all the data on this phone to a file. The file is not encrypted, so anyone who has it can read it. Import replaces all the data on this phone with the data in a file.';

export const dataRow = (name: 'Export Data' | 'Import Data') =>
  screen.getByRole('button', { name });

/** Presses a DATA row and lets the app answer. */
export async function pressRow(name: 'Export Data' | 'Import Data') {
  await fireEvent.press(dataRow(name));
  await settle();
  await settle();
}

/** Presses Export Data and waits for the file the app hands to the share sheet. */
export async function exportData(): Promise<SharedFile> {
  const before = system.shared.length;
  await fireEvent.press(dataRow('Export Data'));
  await waitFor(() => expect(system.shared).toHaveLength(before + 1));
  await settle();
  return system.shared[before];
}

/**
 * Presses Import Data; the user picks `file` in the file picker, or cancels when it
 * is undefined.
 */
export async function chooseFile(file: string | undefined) {
  system.pick = file;
  await pressRow('Import Data');
}

/** Presses Import Data and leaves the file picker open until `answerPicker`. */
export async function openPicker() {
  system.pick = HELD;
  await pressRow('Import Data');
}

/** The user picks `file` in the picker that stayed open, or cancels. */
export async function answerPicker(file: string | undefined) {
  await act(async () => system.answerPicker?.(file));
  await settle();
  await settle();
}

// Alerts

export const EXPORT_FAILED = [
  'Unable to Export Data',
  'Your data could not be exported. Please try again.',
];
export const CANNOT_USE_FILE = [
  'Unable to Import Data',
  'This file is damaged or was not exported by this app. Your data was not changed.',
];
export const NEWER_FILE = [
  'Unable to Import Data',
  'This file was exported by a newer version of the app. Update the app, then try again. Your data was not changed.',
];
export const IMPORT_FAILED = [
  'Unable to Import Data',
  'Your data could not be imported. Your data was not changed.',
];
export const REPLACE = 'Replace All Data?';

/** The confirmation's message for a file exported at `exported` with these counts. */
export const replaceMessage = (
  exported: string,
  groups: string,
  expenses: string,
) =>
  `This file was exported on ${exported} and has ${groups} and ${expenses}. Importing it replaces all the data on this phone. This cannot be undone.`;

const alerts = () => jest.mocked(Alert.alert).mock.calls;

/** A date or time as written, whichever space the platform puts before AM or PM. */
const plainSpaces = (text?: string | null) => text?.replace(/\s+/g, ' ');

/** The alerts shown so far, as [title, message]. */
export const alertsShown = () =>
  alerts().map(([title, message]) => [title, plainSpaces(message)]);

/** The last alert's buttons, as [text, style]. */
export const lastAlertButtons = () =>
  ((alerts().at(-1)?.[2] ?? []) as AlertButton[]).map((button) => [
    button.text,
    button.style,
  ]);

/** Taps a button of the last alert. */
export async function pressAlertButton(text: string) {
  const button = ((alerts().at(-1)?.[2] ?? []) as AlertButton[]).find(
    (candidate) => candidate.text === text,
  );
  if (button === undefined) throw new Error(`No ${text} in the last alert`);
  await act(() => button.onPress?.());
  await settle();
}

/** Waits until the app has shown `expected` alerts in all, and returns the last. */
export async function nextAlert(expected: number) {
  await waitFor(() => expect(alerts()).toHaveLength(expected));
  return alertsShown()[expected - 1];
}

/**
 * Picks `file`, waits for the confirmation, and presses Replace. Resolves once the
 * app is back on the Expenses tab, where an import leaves it (BACKUP-14.1).
 */
export async function importFile(file: string) {
  const before = alerts().length;
  await chooseFile(file);
  expect((await nextAlert(before + 1))[0]).toBe(REPLACE);
  await pressAlertButton('Replace');
  await waitFor(() => expect(selectedTab()).toBe('Expenses'));
  await settle();
}

// The network

/** Takes the network away, and returns how many requests the app has tried since. */
export function goOffline() {
  const fetchBefore = globalThis.fetch;
  const offline = jest.fn(() =>
    Promise.reject(new TypeError('Network request failed')),
  );
  globalThis.fetch = offline as unknown as typeof fetch;
  cleanups.push(() => {
    globalThis.fetch = fetchBefore;
  });
  const opened =
    typeof XMLHttpRequest === 'undefined'
      ? undefined
      : jest.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation(() => {
          throw new TypeError('Network request failed');
        });
  return () => offline.mock.calls.length + (opened?.mock.calls.length ?? 0);
}

// Reading data

/** Every row of every table, by table: each row as JSON, sorted. */
export type Data = Record<string, string[]>;

/** What the SQLite database file at `file` holds. */
export function dataIn(file: string): Data {
  const database = new DatabaseSync(file, { readOnly: true });
  try {
    const tables = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as { name: string }[];
    return Object.fromEntries(
      tables.map(({ name }) => [
        name,
        database
          .prepare(`SELECT * FROM "${name}"`)
          .all()
          .map((row) => JSON.stringify(row))
          .sort(),
      ]),
    );
  } finally {
    database.close();
  }
}

/** The tables of `data` that `like` also has, which leaves out an export file's own table. */
export const tablesIn = (data: Data, like: Data): Data =>
  Object.fromEntries(Object.keys(like).map((name) => [name, data[name]]));

/** The rows of `table` in `data`, parsed. */
export const rowsOf = <T,>(data: Data, table: string) =>
  (data[table] ?? []).map((row) => JSON.parse(row) as T);

/** `data` with `fields` set on every row of `table`. */
export const withFields = (
  data: Data,
  table: string,
  fields: Record<string, unknown>,
): Data => ({
  ...data,
  [table]: rowsOf<object>(data, table)
    .map((row) => JSON.stringify({ ...row, ...fields }))
    .sort(),
});

// Writing data

/**
 * Writes `seed` to a phone as the screens would (ADR-0018), before the app starts
 * on it or between two starts, and then whatever `more` writes.
 */
export async function writeData(
  phone: Phone,
  seed: Seed,
  more?: (database: Database, identity: LocalIdentity) => Promise<void>,
) {
  const database = openNodeDatabase(phone.database);
  try {
    const identity = await initializeDatabase(
      database,
      appMigrations,
      false,
      async (transaction) => {
        const local = await ensureLocalIdentity(transaction);
        await ensureDefaultCategories(transaction, local.personalSpaceId);
        return local;
      },
    );
    const you = await applySeed(database, identity, seed);
    await more?.(database, you);
  } finally {
    await database.close();
  }
}

/** Taylor's data, as the backup spec's Purpose describes it. */
export const writeTaylorsData = (phone: Phone) =>
  writeData(
    phone,
    {
      name: 'Taylor',
      groups: [
        { name: 'Brisbane', members: ['Casey', 'Blake'] },
        { name: 'Tokyo', archived: true },
      ],
      categories: [
        { name: 'Gym' },
        { name: 'Travel', archived: true },
        { name: 'Flights', group: 'Brisbane' },
      ],
      expenses: [
        { title: 'Coffee run', amount: '8.75', date: '2026-11-10' },
        { title: 'Train', amount: '3', date: '2026-11-11', category: 'Gym' },
        {
          title: 'Dinner',
          amount: '100.01',
          date: '2026-11-12',
          group: 'Brisbane',
          category: 'Flights',
          paidBy: 'Casey',
        },
        { title: 'Lunch', amount: '12', date: '2026-11-13', trashed: true },
      ],
    },
    async (database) => {
      const [brisbane] = await listGroups(database);
      const blake = brisbane.members.find((member) => member.name === 'Blake')!;
      await removeGroupMember(database, brisbane.id, blake.id);
      await saveLocalAppearance(database, 'dark');
      await saveLocalChartType(database, 'bar');
    },
  );

/** Sam's data: the name Sam, the group Osaka, the expense Bus, and Tea in the Trash. */
export const writeSamsData = (phone: Phone) =>
  writeData(phone, {
    name: 'Sam',
    groups: [{ name: 'Osaka' }],
    expenses: [
      { title: 'Bus', amount: '2.5', date: '2026-11-01' },
      { title: 'Tea', amount: '4', date: '2026-11-02', trashed: true },
    ],
  });

// Export files

export interface ExportFile {
  /** The export file, outside any phone. */
  file: string;
  /** What the phone database held when the file was exported. */
  data: Data;
}

/** Starts the app on `phone`, exports with Export Data, and closes the app. */
export async function exportFrom(phone: Phone, now?: string) {
  const app = await startOn(phone, { now });
  const shared = await exportData();
  const exported = { file: shared.copy, data: dataIn(phone.database) };
  await close(app);
  system.shared = [];
  jest.mocked(Alert.alert).mockClear();
  return exported;
}

let taylors: { name: string; bytes: Buffer; data: Data } | undefined;

/**
 * An export file of Taylor's data, exported in Taipei at 2026-11-18 14:32 by the app
 * itself. The app exports it once for the whole test file; each test gets a copy.
 */
export async function taylorsExport(): Promise<ExportFile> {
  if (taylors === undefined) {
    const phone = newPhone();
    await writeTaylorsData(phone);
    const { file, data } = await exportFrom(phone);
    taylors = { name: path.basename(file), bytes: fs.readFileSync(file), data };
  }
  const file = path.join(outside(), taylors.name);
  fs.writeFileSync(file, taylors.bytes);
  return { file, data: taylors.data };
}

/** A copy of `file` outside any phone, under the same name. */
export function copyOf(file: string): string {
  const copy = path.join(outside(), path.basename(file));
  fs.copyFileSync(file, copy);
  return copy;
}

/** A file outside any phone that holds `bytes`. */
export function fileWith(name: string, bytes: string | Uint8Array): string {
  const file = path.join(outside(), name);
  fs.writeFileSync(file, bytes);
  return file;
}

/**
 * A copy of the database file `file` after `sql` ran on it, with no CHECK or foreign
 * key constraint in the way, as a file edited by hand or written by a broken app.
 */
export function edited(file: string, sql: string): string {
  const copy = copyOf(file);
  const database = new DatabaseSync(copy, {
    enableForeignKeyConstraints: false,
  });
  try {
    database.exec('PRAGMA ignore_check_constraints = ON');
    database.exec(sql);
  } finally {
    database.close();
  }
  return copy;
}

/** The first half of `file`. */
export function firstHalfOf(file: string): string {
  const bytes = fs.readFileSync(file);
  return fileWith(
    path.basename(file),
    bytes.subarray(0, Math.floor(bytes.length / 2)),
  );
}

/** `file` with a stretch in its middle overwritten. */
export function damagedInTheMiddle(file: string): string {
  const bytes = fs.readFileSync(file);
  const page = 4096;
  const start = Math.floor(bytes.length / page / 2) * page;
  bytes.fill(0xa5, start, Math.min(start + 2 * page, bytes.length));
  return fileWith(path.basename(file), bytes);
}

/** A migration that this version of the app does not have. */
const FROM_A_NEWER_VERSION = 'CREATE TABLE from_a_newer_version (id TEXT)';

/** `file` as a version of the app with one more migration would have exported it. */
export async function fromANewerVersion(file: string): Promise<string> {
  const copy = copyOf(file);
  const database = openNodeDatabase(copy);
  await runMigrations(database, [...appMigrations, FROM_A_NEWER_VERSION]);
  await database.close();
  return copy;
}

/** A database file whose first migration is not the app's. */
export async function withADifferentMigration(): Promise<string> {
  const file = path.join(outside(), 'different.sqlite');
  const database = openNodeDatabase(file);
  await runMigrations(database, ['CREATE TABLE different (id TEXT)']);
  await database.close();
  return file;
}

/** The names of the tables the app's migrations make. */
async function appTables(): Promise<Set<string>> {
  const database = openNodeDatabase(':memory:');
  await runMigrations(database, appMigrations);
  const tables = await database.all<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table'",
  );
  await database.close();
  return new Set(tables.map((table) => table.name));
}

/**
 * The export file's own tables: those the app's migrations do not make. ADR-0020
 * keeps the export time in one, whatever it is called.
 */
async function ownTablesOf(file: string): Promise<string[]> {
  const known = await appTables();
  const own = Object.keys(dataIn(file)).filter((name) => !known.has(name));
  if (own.length === 0)
    throw new Error('The export file has no table of its own (ADR-0020)');
  return own;
}

/** `file` with the rows of its own tables, and so its export time, deleted. */
export async function withoutAnExportTime(file: string): Promise<string> {
  const own = await ownTablesOf(file);
  return edited(file, own.map((name) => `DELETE FROM "${name}"`).join('; '));
}

/**
 * `file` with every value in its own tables, and so its export time, replaced by one
 * that is no moment in time: text that is no date, or a number past the last date
 * JavaScript can hold, in milliseconds or in seconds. A
 * column that is the table's row ID stays as it is.
 */
export async function withAnExportTimeThatIsNoTime(
  file: string,
): Promise<string> {
  const copy = copyOf(file);
  const database = new DatabaseSync(copy, {
    enableForeignKeyConstraints: false,
  });
  try {
    database.exec('PRAGMA ignore_check_constraints = ON');
    for (const name of await ownTablesOf(file)) {
      const columns = database
        .prepare(`PRAGMA table_info("${name}")`)
        .all() as {
        name: string;
        type: string;
        pk: number;
      }[];
      const changes = columns
        .filter((column) => !(column.pk > 0 && /INT/i.test(column.type)))
        .map((column) =>
          /INT|REAL|FLOA|DOUB|NUM/i.test(column.type)
            ? `"${column.name}" = 9000000000000000`
            : `"${column.name}" = 'not a time'`,
        );
      database.exec(`UPDATE "${name}" SET ${changes.join(', ')}`);
    }
  } finally {
    database.close();
  }
  return copy;
}

/**
 * `file` as the version of the app before Insights had a chart type would have
 * exported it: that version's schema and migration records, every row the current
 * export has in the tables and columns that version had, and the export's own
 * tables as they are. A table that a later migration makes is left for the upgrade.
 */
export async function fromBeforeChartTypes(file: string): Promise<string> {
  const copy = path.join(outside(), path.basename(file));
  const chartTypes = appMigrations.findIndex((sql) =>
    sql.includes('chartType'),
  );
  const older = openNodeDatabase(copy);
  await runMigrations(older, appMigrations.slice(0, chartTypes));
  await older.close();
  const known = await appTables();

  const database = new DatabaseSync(copy, {
    enableForeignKeyConstraints: false,
  });
  try {
    database.exec(`ATTACH DATABASE '${file.replaceAll("'", "''")}' AS current`);
    const tablesOf = (schema: string) =>
      database
        .prepare(
          `SELECT name, sql FROM ${schema}.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
        )
        .all() as { name: string; sql: string }[];
    const had = new Set(tablesOf('main').map((table) => table.name));
    for (const { name, sql } of tablesOf('current')) {
      if (name === '_migrations') continue;
      if (!had.has(name)) {
        if (known.has(name)) continue;
        database.exec(sql);
      }
      const columns = (
        database.prepare(`PRAGMA main.table_info("${name}")`).all() as {
          name: string;
        }[]
      )
        .map((column) => `"${column.name}"`)
        .join(', ');
      database.exec(
        `INSERT INTO main."${name}" (${columns}) SELECT ${columns} FROM current."${name}"`,
      );
    }
    database.exec('DETACH DATABASE current');
  } finally {
    database.close();
  }
  return copy;
}

// Before and after each test

/** A phone with nothing on it yet: call from beforeEach, after the Alert spy is in place. */
export function resetPhones() {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-'));
  count = 0;
  running.phone = undefined;
  running.database = undefined;
  running.onStatement = undefined;
  running.filesOpened = [];
  allowWrites();
  system.noRoomForTemporaryFiles = false;
  system.temporaryFilesCannotBeRemoved = false;
  system.removalsTried = 0;
  system.shareSheet = 'shares';
  system.closeShareSheet = undefined;
  system.shared = [];
  system.pick = undefined;
  system.answerPicker = undefined;
  system.pickerOpened = 0;
}

/** Call from afterEach: closes what the app left open and deletes every phone. */
export async function removePhones() {
  for (const cleanup of cleanups.splice(0)) cleanup();
  for (const database of running.filesOpened)
    await database.close().catch(() => undefined);
  fs.rmSync(root, { recursive: true, force: true });
}
