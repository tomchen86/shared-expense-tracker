import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  isEventsPageResponse,
  isHealthResponse,
} from '@shared-expense/domain/api';
import { runMigrations } from '../src/database/migrate';
import { migrations } from '../src/migrations';
import {
  BODY_LIMIT,
  newPhone,
  registrationBy,
  signedBy,
  withField,
} from './acceptance/sharing-api';
import { runCommand, startServerCommand } from './support/command';
import { useTestDatabase } from './support/database';
import { sendRaw, sendTo } from './support/signed';

const COMMAND_TIMEOUT_MS = 120_000;

const database = useTestDatabase();

async function expectHealthy(url: string) {
  const response = await fetch(`${url}/health`);
  expect(response.status).toBe(200);
  expect(isHealthResponse(await response.json())).toBe(true);
}

/**
 * A phone registers with the server at `url` and sends a signed request, by the server's
 * own clock and from wherever the entry file says this machine's requests come.
 */
async function expectSignedRequestsPass(url: string) {
  const phone = newPhone();
  const at = () => ({ timestampMs: Date.now() });
  const request = signedBy(phone, at());

  const unregistered = await sendRaw(url, signedBy(phone, at()), {
    declaredLength: BODY_LIMIT + 1,
  });
  expect(unregistered).toEqual({
    status: 401,
    body: { error: 'signature' },
  });
  expect(await sendTo(url, registrationBy(phone, at()))).toEqual({
    status: 200,
    body: { deviceId: phone.deviceId },
  });
  const get = await sendRaw(url, request, {
    declaredLength: 1,
    sent: Uint8Array.of(0xff),
    ended: true,
  });
  expect(get.status).toBe(404);
  const signedHead = signedBy(phone, { ...at(), method: 'HEAD' });
  const head = await sendRaw(url, signedHead, { declaredLength: 1 });
  expect(head.status).toBe(404);
  expect(await sendTo(url, request)).toEqual({
    status: 401,
    body: { error: 'replayed' },
  });
}

async function expectOversizedBodyRefused(url: string) {
  const request = signedBy(newPhone(), {
    method: 'POST',
    body: new Uint8Array(BODY_LIMIT + 1),
    timestampMs: Date.now(),
  });
  const tooLarge = { status: 413, body: { error: 'too-large' } };

  const declared = await sendRaw(url, request, {
    declaredLength: request.body.length,
  });
  expect(declared).toEqual(tooLarge);

  const chunked = await sendRaw(url, request, { sent: request.body });
  expect(chunked).toEqual(tooLarge);
}

/**
 * The two verification files and the download page answer a request that is not signed,
 * and the checks still refuse one beside them.
 */
async function expectInviteLinkRoutesPublic(url: string) {
  for (const route of [
    '/.well-known/apple-app-site-association',
    '/.well-known/assetlinks.json',
    '/i/a',
  ]) {
    const response = await fetch(`${url}${route}`);
    expect([route, response.status]).toEqual([route, 200]);
  }
  const posted = await fetch(`${url}/i/a`, { method: 'POST' });
  expect([posted.status, await posted.json()]).toEqual([
    401,
    { error: 'signature' },
  ]);
}

// The eight low-order points of Ed25519, in each way 32 bytes write one.
const LOW_ORDER_PUBLIC_KEYS = [
  '0000000000000000000000000000000000000000000000000000000000000000',
  '0100000000000000000000000000000000000000000000000000000000000000',
  '26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05',
  'c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a',
  'ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
  'edffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
  'eeffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
].flatMap((key) => [
  key,
  key.slice(0, 62) + (parseInt(key.slice(62), 16) | 0x80).toString(16),
]);

/**
 * A registration that carries a low-order public key is refused for its body, and no
 * request passes under its device ID. Left to the runtime's Ed25519, the answer differs:
 * under the key that writes the identity element, workerd's Web Crypto verifies this
 * signature for every message, and Node's verifies it for none.
 */
async function expectLowOrderKeysRefused(url: string) {
  // R is the identity element and S is 0.
  const forged = `01${'00'.repeat(63)}`;
  for (const publicKey of LOW_ORDER_PUBLIC_KEYS) {
    const phone = newPhone();
    const at = () => ({ timestampMs: Date.now() });

    const registration = await sendTo(
      url,
      withField(
        registrationBy(phone, { ...at(), publicKey }),
        'signature',
        forged,
      ),
    );
    const request = await sendTo(
      url,
      withField(signedBy(phone, at()), 'signature', forged),
    );

    expect([publicKey, registration]).toEqual([
      publicKey,
      { status: 400, body: { error: 'request' } },
    ]);
    expect([publicKey, request]).toEqual([
      publicKey,
      { status: 401, body: { error: 'signature' } },
    ]);
  }

  // A key that is no low-order point is a body the API takes: its signature decides.
  const other = await sendTo(
    url,
    withField(
      registrationBy(newPhone(), {
        timestampMs: Date.now(),
        publicKey: `03${'00'.repeat(31)}`,
      }),
      'signature',
      forged,
    ),
  );
  expect(other).toEqual({ status: 401, body: { error: 'signature' } });
}

/**
 * The event API as the entry file serves it, on its runtime: a phone creates a group,
 * uploads the largest body the tests send, seven events of 65,536 bytes, and downloads
 * the first page of them, while a phone that is no member device gets none.
 */
async function expectEventsRelayed(url: string) {
  const at = () => ({ timestampMs: Date.now() });
  const phone = newPhone();
  const stranger = newPhone();
  for (const each of [phone, stranger]) {
    expect((await sendTo(url, registrationBy(each, at()))).status).toBe(200);
  }
  const groupId = randomUUID();
  const eventsPath = `/groups/${groupId}/events`;
  const events = Array.from({ length: 7 }, () => ({
    id: randomUUID(),
    content: randomBytes(65_536).toString('hex'),
  }));
  const numbered = events.map(({ id }, index) => ({ id, sequence: index + 1 }));

  const created = await sendTo(
    url,
    signedBy(phone, { ...at(), method: 'PUT', path: `/groups/${groupId}` }),
  );
  const uploaded = await sendTo(
    url,
    signedBy(phone, {
      ...at(),
      method: 'POST',
      path: eventsPath,
      body: JSON.stringify({ epoch: 1, events }),
    }),
  );
  const page = await sendTo(
    url,
    signedBy(phone, { ...at(), path: `${eventsPath}?after=0` }),
  );
  const toAStranger = await sendTo(
    url,
    signedBy(stranger, { ...at(), path: `${eventsPath}?after=0` }),
  );

  expect(created).toEqual({ status: 200, body: { groupId } });
  expect(uploaded).toEqual({ status: 200, body: { events: numbered } });
  // Four of the largest events fill a page.
  expect(isEventsPageResponse(page.body)).toBe(true);
  expect(page).toEqual({
    status: 200,
    body: {
      events: events.slice(0, 4).map((event, index) => ({
        ...event,
        sequence: index + 1,
        deviceId: phone.deviceId,
        epoch: 1,
        receivedAtMs: expect.any(Number),
      })),
      more: true,
    },
  });
  expect(toAStranger).toEqual({
    status: 403,
    body: { error: 'not-a-member' },
  });
}

test(
  'the Node entry file serves GET /health',
  async () => {
    const node = await startServerCommand('tsx', ['src/node.ts'], {
      DATABASE_URL: database.url,
      PORT: '0',
    });
    try {
      await expectHealthy(node.url);
    } finally {
      await node.stop();
    }
  },
  COMMAND_TIMEOUT_MS,
);

test(
  'the Node entry file registers a phone with the key in IP_HASH_KEY and relays its events, and registers none without it',
  async () => {
    await runMigrations(database.sql, migrations);
    const withKey = await startServerCommand('tsx', ['src/node.ts'], {
      DATABASE_URL: database.url,
      PORT: '0',
      IP_HASH_KEY: 'a key for this test',
    });
    try {
      await expectSignedRequestsPass(withKey.url);
      await expectOversizedBodyRefused(withKey.url);
      await expectLowOrderKeysRefused(withKey.url);
      await expectInviteLinkRoutesPublic(withKey.url);
      await expectEventsRelayed(withKey.url);
    } finally {
      await withKey.stop();
    }

    const withoutKey = await startServerCommand('tsx', ['src/node.ts'], {
      DATABASE_URL: database.url,
      PORT: '0',
      IP_HASH_KEY: undefined,
    });
    try {
      const answer = await sendTo(
        withoutKey.url,
        registrationBy(newPhone(), { timestampMs: Date.now() }),
      );
      expect(answer.status).toBe(500);
    } finally {
      await withoutKey.stop();
    }
  },
  COMMAND_TIMEOUT_MS,
);

test(
  'the Node entry file runs the migrations',
  async () => {
    const code = await runCommand('tsx', ['src/node.ts', 'migrate'], {
      DATABASE_URL: database.url,
    });
    expect(code).toBe(0);
    await expect(
      database.sql`SELECT count(*)::int AS count FROM _migrations`,
    ).resolves.toEqual([{ count: expect.any(Number) }]);
  },
  COMMAND_TIMEOUT_MS,
);

test(
  'the Workers entry file serves GET /health, on the Workers runtime',
  async () => {
    // Wranglers started together collide on their default ports and state directory.
    const state = mkdtempSync(path.join(tmpdir(), 'api-wrangler-'));
    try {
      const workers = await startServerCommand(
        'wrangler',
        [
          'dev',
          '--ip',
          '127.0.0.1',
          '--port',
          '0',
          '--inspector-port',
          '0',
          '--persist-to',
          state,
        ],
        {
          CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE:
            database.url,
        },
      );
      try {
        await expectHealthy(workers.url);
        // Every request connects anew: a client cannot outlive its request on Workers.
        await expectHealthy(workers.url);
      } finally {
        await workers.stop();
      }
    } finally {
      rmSync(state, { recursive: true, force: true });
    }
  },
  COMMAND_TIMEOUT_MS,
);

test(
  'the Workers entry file registers a phone, checks its signed requests and relays its events, on the Workers runtime',
  async () => {
    await runMigrations(database.sql, migrations);
    const state = mkdtempSync(path.join(tmpdir(), 'api-wrangler-'));
    try {
      const workers = await startServerCommand(
        'wrangler',
        [
          'dev',
          '--ip',
          '127.0.0.1',
          '--port',
          '0',
          '--inspector-port',
          '0',
          '--persist-to',
          state,
        ],
        {
          CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE:
            database.url,
          // The secret wrangler.jsonc requires, which `wrangler dev` reads from here.
          IP_HASH_KEY: 'a key for this test',
          // Let the client see the Worker's response while the upload is still open.
          WRANGLER_DISABLE_REQUEST_BODY_DRAINING: '1',
        },
      );
      try {
        await expectSignedRequestsPass(workers.url);
        await expectOversizedBodyRefused(workers.url);
        await expectLowOrderKeysRefused(workers.url);
        await expectInviteLinkRoutesPublic(workers.url);
        await expectEventsRelayed(workers.url);
      } finally {
        await workers.stop();
      }
    } finally {
      rmSync(state, { recursive: true, force: true });
    }
  },
  COMMAND_TIMEOUT_MS,
);
