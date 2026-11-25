import * as SecureStore from 'expo-secure-store';
import { appMigrations } from '../shell/migrations';
import { runMigrations, type Database } from '../storage';
import { openNodeDatabase } from '../storage/node';
import {
  addSecureStoreEntry,
  draws,
  removeSecureStoreEntry,
  removeWorld,
  resetWorld,
  secureStoreEntries,
} from '../../tests/acceptance/sharing-app';
import { sendApiRequest } from './api-request';
import { renewBeforeCopyConfirmation } from './join-requests';

jest.mock(
  'expo-crypto',
  () => jest.requireActual('../../tests/acceptance/sharing-app').randomSource,
);
jest.mock('expo-secure-store', () => ({
  __esModule: true,
  ...jest.requireActual('../../tests/acceptance/sharing-app').secureStore,
}));

const group = 'c0000000-0000-4000-8000-000000000001';
const manifest = 'join-keys.pending';
const first = `group-key.${group}.1`;
const second = `group-key.${group}.2`;
const foreignSeed = 'device-seed.other-phone';
const entries = () =>
  new Map(secureStoreEntries().map(({ key, value }) => [key, value]));
let db: Database;

beforeEach(async () => {
  resetWorld();
  db = openNodeDatabase(':memory:');
  await runMigrations(db, appMigrations);
  await db.exec(`
    INSERT INTO device_identity VALUES (1, 'lost-phone', 1, 9000);
    INSERT INTO groups (id, name, position) VALUES ('active', 'Paris', 0);
    INSERT INTO sync_groups (groupId, device) VALUES ('active', 'lost-phone');
    INSERT INTO join_requests (code, secret, groupName, name)
      VALUES ('pending', 'secret', 'Tokyo', 'Dana');
  `);
  addSecureStoreEntry(manifest, `${group}.2`);
  addSecureStoreEntry(first, 'ab'.repeat(32));
  addSecureStoreEntry(second, 'cd'.repeat(32));
  addSecureStoreEntry(foreignSeed, 'ef'.repeat(32));
});

afterEach(async () => {
  jest.restoreAllMocks();
  await db.close();
  await removeWorld();
});

test('a successful renewal keeps the clock offset and unrelated seed and clears the newly read-only ledger’s keys', async () => {
  addSecureStoreEntry('group-key.active.1', 'aa'.repeat(32));
  await db.exec(
    `INSERT INTO join_requests (groupName, outcome) VALUES ('Ended', 'declined')`,
  );

  expect(await renewBeforeCopyConfirmation(db)).toBe(true);

  const [{ deviceId, registered, clockOffsetMs }] = await db.all<{
    deviceId: string;
    registered: number;
    clockOffsetMs: number;
  }>('SELECT deviceId, registered, clockOffsetMs FROM device_identity');
  expect(deviceId).not.toBe('lost-phone');
  expect(registered).toBe(0);
  expect(clockOffsetMs).toBe(9000);
  expect(await db.all('SELECT readOnly FROM sync_groups')).toEqual([
    { readOnly: 'lapsed' },
  ]);
  expect(await db.all('SELECT * FROM join_requests')).toEqual([]);
  expect(entries()).toEqual(
    new Map([
      [foreignSeed, 'ef'.repeat(32)],
      [`device-seed.${deviceId}`, expect.stringMatching(/^[0-9a-f]{64}$/)],
    ]),
  );
});

test.each([second, manifest])(
  'restores earlier deletions when %s cannot be deleted, before drawing a seed',
  async (blocked) => {
    const original = entries();
    const remove = SecureStore.deleteItemAsync;
    jest
      .spyOn(SecureStore, 'deleteItemAsync')
      .mockImplementation(async (key, options) => {
        if (key === blocked) throw new Error('Cannot delete');
        await remove(key, options);
      });

    await expect(renewBeforeCopyConfirmation(db)).rejects.toThrow(
      'Cannot delete',
    );

    expect(entries()).toEqual(original);
    expect(draws()).toEqual([]);
    expect(await db.all('SELECT code FROM join_requests')).toEqual([
      { code: 'pending' },
    ]);
  },
);

test('a failed SQLite commit removes the saved seed and restores the pending keys, ledger, requests and identity', async () => {
  const original = entries();
  // A deferred foreign key fails at COMMIT, after the ledger, requests and identity have changed.
  await db.exec(`CREATE TABLE commit_guard (
    deviceId TEXT REFERENCES groups(id) DEFERRABLE INITIALLY DEFERRED
  );
  CREATE TRIGGER fail_identity_commit AFTER UPDATE OF deviceId ON device_identity
  BEGIN INSERT INTO commit_guard VALUES (NEW.deviceId); END;`);
  const save = SecureStore.setItemAsync;
  let stagedSeed: string | undefined;
  jest
    .spyOn(SecureStore, 'setItemAsync')
    .mockImplementation(async (key, value, options) => {
      await save(key, value, options);
      if (key.startsWith('device-seed.')) {
        expect([...entries().keys()].sort()).toEqual([foreignSeed, key].sort());
        stagedSeed = key;
      }
    });

  await expect(renewBeforeCopyConfirmation(db)).rejects.toThrow(/FOREIGN KEY/);

  expect(stagedSeed).toBeDefined();
  expect(entries()).toEqual(original);
  expect(
    await db.all(
      'SELECT deviceId, registered, clockOffsetMs FROM device_identity',
    ),
  ).toEqual([{ deviceId: 'lost-phone', registered: 1, clockOffsetMs: 9000 }]);
  expect(await db.all('SELECT readOnly FROM sync_groups')).toEqual([
    { readOnly: null },
  ]);
  expect(await db.all('SELECT code FROM join_requests')).toEqual([
    { code: 'pending' },
  ]);
});

test('a signed request awaiting a rate-limit retry cannot send again under the replaced device ID', async () => {
  const oldId = 'c0000000-0000-4000-8000-000000000002';
  await db.run('UPDATE device_identity SET deviceId = ?', [oldId]);
  addSecureStoreEntry(`device-seed.${oldId}`, 'ac'.repeat(32));
  const exchange = jest
    .spyOn(globalThis, 'fetch')
    .mockImplementationOnce(async () => {
      removeSecureStoreEntry(`device-seed.${oldId}`);
      await renewBeforeCopyConfirmation(db);
      return new Response(
        JSON.stringify({ error: 'too-many-requests', retryAfterMs: 0 }),
        { status: 429 },
      );
    });

  await expect(
    sendApiRequest(db, {
      apiUrl: 'https://api.example.test',
      method: 'GET',
      path: '/pending',
    }),
  ).rejects.toThrow('The device identity changed');
  expect(exchange).toHaveBeenCalledTimes(1);
});
