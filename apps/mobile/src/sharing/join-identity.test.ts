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
import { syncGroup } from '../sync/loop';
import { fetchDeviceSyncTimes } from '../sync/roster';
import { sendApiRequest } from './api-request';
import { putInvite } from './invite-api';
import { prepareInvite } from './invites';
import { askJoinResult } from './join-decisions';
import { renewBeforeCopyConfirmation } from './join-requests';
import { refreshReceivedRequests } from './received-requests';
import { refreshInviteCard } from './refresh-invite-card';

jest.mock(
  'expo-crypto',
  () => jest.requireActual('../../tests/acceptance/sharing-app').randomSource,
);
// Lets a test wait for the card the phone decided to send.
jest.mock('./invite-api', () => {
  const actual = jest.requireActual('./invite-api');
  return { ...actual, putInvite: jest.fn(actual.putInvite) };
});
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

test.each([
  { blocked: second, deleted: [first] },
  { blocked: manifest, deleted: [first, second] },
])(
  'keeps earlier deletions when $blocked cannot be deleted and retries from the manifest',
  async ({ blocked, deleted }) => {
    const remaining = entries();
    for (const key of deleted) remaining.delete(key);
    const remove = SecureStore.deleteItemAsync;
    const failDelete = jest
      .spyOn(SecureStore, 'deleteItemAsync')
      .mockImplementation(async (key, options) => {
        if (key === blocked) throw new Error('Cannot delete');
        await remove(key, options);
      });
    const write = jest.spyOn(SecureStore, 'setItemAsync');

    await expect(renewBeforeCopyConfirmation(db)).rejects.toThrow(
      'Cannot delete',
    );

    expect(entries()).toEqual(remaining);
    expect(write).not.toHaveBeenCalled();
    expect(draws()).toEqual([]);
    expect(await db.all('SELECT code FROM join_requests')).toEqual([
      { code: 'pending' },
    ]);

    failDelete.mockRestore();
    await expect(renewBeforeCopyConfirmation(db)).resolves.toBe(true);
    const [{ deviceId }] = await db.all<{ deviceId: string }>(
      'SELECT deviceId FROM device_identity',
    );
    expect([...entries().keys()].sort()).toEqual(
      [foreignSeed, `device-seed.${deviceId}`].sort(),
    );
    expect(await db.all('SELECT code FROM join_requests')).toEqual([]);
  },
);

test('a failed SQLite commit removes the new seed, keeps pending keys deleted and rolls back the ledger, requests and identity', async () => {
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
  expect(entries()).toEqual(new Map([[foreignSeed, 'ef'.repeat(32)]]));
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

test('a request made for the replaced device ID sends nothing and leaves the new identity unregistered', async () => {
  const exchange = jest.spyOn(globalThis, 'fetch');
  await renewBeforeCopyConfirmation(db);

  await expect(
    sendApiRequest(db, {
      apiUrl: 'https://api.example.test',
      method: 'POST',
      path: '/groups/active/events',
      body: 'made under lost-phone',
      deviceId: 'lost-phone',
    }),
  ).resolves.toEqual({ outcome: 'identity-changed' });
  expect(exchange).not.toHaveBeenCalled();
  expect(await db.all('SELECT registered FROM device_identity')).toEqual([
    { registered: 0 },
  ]);
});

test('a request made for a lost identity that is still stored is told the authorization is lost', async () => {
  const exchange = jest.spyOn(globalThis, 'fetch');

  await expect(
    sendApiRequest(db, {
      apiUrl: 'https://api.example.test',
      method: 'GET',
      path: '/groups/active/events?after=0',
      deviceId: 'lost-phone',
    }),
  ).resolves.toEqual({ outcome: 'authorization-lost' });
  expect(exchange).not.toHaveBeenCalled();
});

describe('a request made from local data read before the identity changed', () => {
  const API_URL = 'https://api.example.test';
  let exchange: jest.SpyInstance;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_API_URL = API_URL;
    exchange = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('offline'));
  });
  afterEach(() => {
    delete process.env.EXPO_PUBLIC_API_URL;
  });

  const unregistered = async () =>
    expect(await db.all('SELECT registered FROM device_identity')).toEqual([
      { registered: 0 },
    ]);

  /** Lets `change` commit right after the `nth` transaction from now ends. */
  function changeAfterTransaction(nth: number, change: () => Promise<unknown>) {
    const transaction = db.transaction.bind(db);
    let count = 0;
    jest.spyOn(db, 'transaction').mockImplementation(async (work) => {
      const result = await transaction(work);
      count += 1;
      if (count === nth) await change();
      return result;
    });
  }

  /** Lets `change` commit right after the first read whose SQL holds `marker`. */
  function changeAfterRead(marker: string, change: () => Promise<unknown>) {
    const all = db.all.bind(db);
    let changed = false;
    jest.spyOn(db, 'all').mockImplementation(async (sql, parameters) => {
      const rows = await all(sql, parameters);
      if (!changed && sql.includes(marker)) {
        changed = true;
        await change();
      }
      return rows as never;
    });
  }

  const renew = () => renewBeforeCopyConfirmation(db);

  test('asking what became of a join request sends nothing for the request the change deleted', async () => {
    changeAfterTransaction(1, renew);

    await expect(askJoinResult(db, 'pending')).resolves.toEqual({
      outcome: 'no-answer',
    });
    expect(exchange).not.toHaveBeenCalled();
    await unregistered();
  });

  test('listing the requests to a ledger sends nothing for the ledger the change made a copy', async () => {
    await db.run(
      `INSERT INTO group_invites (id, groupId, secret, expiresAtMs, cardHash)
       VALUES ('live', 'active', 'secret', ?, 'hash')`,
      [Number.MAX_SAFE_INTEGER],
    );
    changeAfterRead('AS signer', renew);

    await refreshReceivedRequests(db, 'active');

    expect(exchange).not.toHaveBeenCalled();
    await unregistered();
  });

  test('creating an invite sends nothing for a group read before the change', async () => {
    await db.run(
      "INSERT INTO groups (id, name, position) VALUES ('solo', 'Lisbon', 1)",
    );
    changeAfterTransaction(1, renew);

    await expect(prepareInvite(db, 'solo')).resolves.toBe('error');
    expect(exchange).not.toHaveBeenCalled();
    await unregistered();
  });

  test('creating an invite for a read-only copy sends nothing', async () => {
    // A phone whose identity has its seed, so that only the copy stops the request.
    await db.run(
      "UPDATE device_identity SET deviceId = 'phone-a', registered = 1",
    );
    addSecureStoreEntry('device-seed.phone-a', 'a1'.repeat(32));
    await db.run("UPDATE sync_groups SET readOnly = 'not-a-member'");

    await expect(prepareInvite(db, 'active')).resolves.toBe('unavailable');
    expect(exchange).not.toHaveBeenCalled();
  });

  test('replacing an invite card sends nothing for the ledger the change made a copy', async () => {
    await db.run(
      `INSERT INTO group_invites (id, groupId, secret, expiresAtMs, cardHash)
       VALUES ('live', 'active', ?, ?, 'old card')`,
      // A 32-byte secret, as an invite holds one.
      ['A'.repeat(43), Number.MAX_SAFE_INTEGER],
    );
    const send = jest.mocked(putInvite);
    // The second transaction is the one that decides to send the card.
    changeAfterTransaction(2, renew);

    refreshInviteCard(db, 'active');

    for (let turn = 0; send.mock.results.length === 0 && turn < 1000; turn++)
      await new Promise(setImmediate);
    await expect(send.mock.results[0].value).rejects.toMatchObject({
      reason: 'identity-changed',
    });
    expect(exchange).not.toHaveBeenCalled();
    await unregistered();
  });

  test("asking for the phones' sync times sends nothing for a ledger Members read before the change made it a copy", async () => {
    await renew();

    await expect(
      fetchDeviceSyncTimes(db, 'active', API_URL),
    ).resolves.toBeUndefined();
    expect(exchange).not.toHaveBeenCalled();
    await unregistered();
  });

  test('a download made for an identity another with its seed replaced keeps the ledger shared and its key', async () => {
    await db.run(
      "UPDATE device_identity SET deviceId = 'phone-a', registered = 1",
    );
    addSecureStoreEntry('device-seed.phone-a', 'a1'.repeat(32));
    addSecureStoreEntry('group-key.active.1', 'aa'.repeat(32));
    // As an import of another phone's file would, whose seed this phone holds (BACKUP-29.1).
    changeAfterRead('AS identity', async () => {
      await db.run("UPDATE device_identity SET deviceId = 'phone-b'");
      addSecureStoreEntry('device-seed.phone-b', 'b2'.repeat(32));
    });

    await syncGroup(db, { apiUrl: API_URL, groupId: 'active' });

    expect(exchange).not.toHaveBeenCalled();
    expect(await db.all('SELECT readOnly FROM sync_groups')).toEqual([
      { readOnly: null },
    ]);
    expect(entries().get('group-key.active.1')).toBe('aa'.repeat(32));
  });

  test('a clock refusal changes nothing for the request once another identity is stored', async () => {
    const oldId = 'c0000000-0000-4000-8000-000000000002';
    await db.run('UPDATE device_identity SET deviceId = ?, registered = 1', [
      oldId,
    ]);
    addSecureStoreEntry(`device-seed.${oldId}`, 'ac'.repeat(32));
    exchange.mockImplementationOnce(async () => {
      await db.run("UPDATE device_identity SET deviceId = 'phone-b'");
      return new Response(
        JSON.stringify({ error: 'clock', serverTimeMs: Date.now() }),
        { status: 401 },
      );
    });
    const bodyAfterClockCorrection = jest.fn(async () => 'rechecked');

    await expect(
      sendApiRequest(db, {
        apiUrl: API_URL,
        method: 'POST',
        path: '/groups/active/events',
        body: 'made under the old identity',
        bodyAfterClockCorrection,
      }),
    ).rejects.toThrow('The device identity changed');
    expect(bodyAfterClockCorrection).not.toHaveBeenCalled();
    expect(exchange).toHaveBeenCalledTimes(1);
  });
});
