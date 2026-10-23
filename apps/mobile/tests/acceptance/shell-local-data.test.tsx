import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import {
  LocalDataGate,
  useLocalIdentity,
  type LocalIdentity,
} from '../../src/shell';
import { runMigrations, type Database } from '../../src/storage';
import { openNodeDatabase } from '../../src/storage/node';

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// A migration that this version of the app does not have.
const FROM_ANOTHER_VERSION = 'CREATE TABLE from_another_version (id TEXT)';

let directory: string;
let file: string;
const openDatabases = new Set<Database>();

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shell-'));
  file = path.join(directory, 'app.db');
});

afterEach(async () => {
  for (const database of openDatabases) await database.close();
  openDatabases.clear();
  fs.rmSync(directory, { recursive: true, force: true });
});

function ShowIdentity() {
  return <Text testID="identity">{JSON.stringify(useLocalIdentity())}</Text>;
}

/** Starts the app on the database file. The returned function closes the app. */
async function startApp({
  development = false,
  openDatabase = async (): Promise<Database> => openNodeDatabase(file),
} = {}) {
  let database: Database | undefined;
  const view = await render(
    <LocalDataGate
      openDatabase={async () => {
        database = await openDatabase();
        openDatabases.add(database);
        return database;
      }}
      development={development}
    >
      <ShowIdentity />
    </LocalDataGate>,
  );
  return async () => {
    await view.unmount();
    await database?.close();
  };
}

async function readIdentity(): Promise<LocalIdentity> {
  const element = await screen.findByTestId('identity');
  return JSON.parse(element.props.children) as LocalIdentity;
}

const idsOf = (identity: LocalIdentity) => [
  identity.userId,
  identity.personalSpaceId,
  identity.personalParticipantId,
];

/** Deletes everything the app stored, as clearing the app's data does. */
function clearAppData() {
  for (const name of fs.readdirSync(directory)) {
    fs.rmSync(path.join(directory, name), { recursive: true, force: true });
  }
}

/** Writes the database file as a version of the app with a migration this one lacks. */
async function writeDatabaseFromAnotherVersion() {
  const database = openNodeDatabase(file);
  await runMigrations(database, [FROM_ANOTHER_VERSION]);
  await database.close();
}

async function expectLoadError() {
  expect(
    await screen.findByText('Unable to Load Local Data'),
  ).toBeOnTheScreen();
  expect(screen.getByText('Your data was not changed.')).toBeOnTheScreen();
  expect(screen.queryByLabelText('Restoring local data')).toBeNull();
  expect(screen.queryByTestId('identity')).toBeNull();
}

test('[SHELL-1.1] shows only the loading indicator while the local data opens', async () => {
  let finishOpening!: () => void;
  const opening = new Promise<void>((resolve) => {
    finishOpening = resolve;
  });
  await startApp({
    openDatabase: async () => {
      await opening;
      return openNodeDatabase(file);
    },
  });

  expect(screen.getByLabelText('Restoring local data')).toBeOnTheScreen();
  expect(screen.queryByTestId('identity')).toBeNull();
  expect(screen.queryByText('Unable to Load Local Data')).toBeNull();

  finishOpening();

  expect(await screen.findByTestId('identity')).toBeOnTheScreen();
  expect(screen.queryByLabelText('Restoring local data')).toBeNull();
});

test('[SHELL-2.1] creates three different version 4 UUIDs and an empty name on first start', async () => {
  await startApp();
  const identity = await readIdentity();

  for (const id of idsOf(identity)) expect(id).toMatch(UUID_V4);
  expect(new Set(idsOf(identity)).size).toBe(3);
  expect(identity.name).toBe('');
});

test('[SHELL-2.1] creates a new identity after the app data is cleared', async () => {
  const closeApp = await startApp();
  const before = await readIdentity();
  await closeApp();
  clearAppData();

  await startApp();
  const after = await readIdentity();

  for (const id of idsOf(after)) expect(id).toMatch(UUID_V4);
  expect(after.userId).not.toBe(before.userId);
  expect(after.personalSpaceId).not.toBe(before.personalSpaceId);
  expect(after.personalParticipantId).not.toBe(before.personalParticipantId);
});

test('[SHELL-3.1] keeps the same identity when the app is closed as soon as its screens appear', async () => {
  const closeApp = await startApp();
  const before = await readIdentity();
  await closeApp();

  await startApp();
  const after = await readIdentity();

  expect(before.userId).toMatch(UUID_V4);
  expect(after).toEqual(before);
});

test('[SHELL-4.1] shows the load error when the database cannot be opened', async () => {
  await startApp({
    openDatabase: () => Promise.reject(new Error('disk unavailable')),
  });

  await expectLoadError();
});

test('[SHELL-4.1] leaves a file that is not a database unchanged', async () => {
  fs.writeFileSync(file, 'This file is not a SQLite database.');
  const before = fs.readFileSync(file);

  await startApp();

  await expectLoadError();
  expect(fs.readFileSync(file)).toEqual(before);
});

test('[SHELL-4.1] leaves data from another version unchanged outside a development build', async () => {
  await writeDatabaseFromAnotherVersion();
  const before = fs.readFileSync(file);

  await startApp({ development: false });

  await expectLoadError();
  expect(fs.readFileSync(file)).toEqual(before);
});

test('[SHELL-5.1] starts over with a new identity on a development build', async () => {
  await writeDatabaseFromAnotherVersion();

  const closeApp = await startApp({ development: true });
  const identity = await readIdentity();
  await closeApp();

  for (const id of idsOf(identity)) expect(id).toMatch(UUID_V4);
  const database = new DatabaseSync(file, { readOnly: true });
  const table = database
    .prepare(
      "SELECT name FROM sqlite_master WHERE name = 'from_another_version'",
    )
    .get();
  database.close();
  expect(table).toBeUndefined();
});
