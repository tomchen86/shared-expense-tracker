import { DEVICES_PATH } from '@shared-expense/domain/api';
import { runMigrations } from '../../src/database/migrate';
import { migrations } from '../../src/migrations';
import { startServer, type NodeServer } from '../../src/node';
import {
  newPhone,
  registrationBy,
  signedBy,
  type Phone,
  type RequestInput,
} from '../acceptance/sharing-api';
import { createTestDatabase, type TestDatabase } from '../support/database';
import { sendRaw, sendTo } from '../support/signed';

// What the checks before routing do at the edges the acceptance tests leave: which
// requests are public, which are registrations, and which path a signature is checked
// against.

const NOW = 1794983520000;
const SIGNATURE = { status: 401, body: { error: 'signature' } };

let database: TestDatabase;
let server: NodeServer;

beforeEach(async () => {
  database = await createTestDatabase();
  await runMigrations(database.sql, migrations);
  server = await startServer({
    databaseUrl: database.url,
    now: () => NOW,
    clientIp: () => '203.0.113.7',
    ipHashKey: 'a key for this test',
  });
});

afterEach(async () => {
  await server.close();
  await database.drop();
});

const signed = (phone: Phone, input: RequestInput = {}) =>
  signedBy(phone, { timestampMs: NOW, ...input });

async function registered(): Promise<Phone> {
  const phone = newPhone();
  const answer = await sendTo(
    server.url,
    registrationBy(phone, { timestampMs: NOW }),
  );
  expect(answer).toEqual({ status: 200, body: { deviceId: phone.deviceId } });
  return phone;
}

const devices = async () =>
  (await database.sql`SELECT id FROM devices`).map(({ id }) => id as string);

describe('the public route', () => {
  test('is GET /health only: a HEAD of it is checked like any other request', async () => {
    const phone = await registered();

    const get = await sendRaw(server.url, {
      method: 'GET',
      target: '/health',
      headers: {},
    });
    const head = await sendRaw(server.url, {
      method: 'HEAD',
      target: '/health',
      headers: {},
    });
    const signedHead = await sendTo(
      server.url,
      signed(phone, { method: 'HEAD', path: '/health' }),
    );

    expect(get).toEqual({ status: 200, body: { status: 'ok' } });
    expect(head.status).toBe(401);
    // It passed the checks, and no route takes a HEAD of /health.
    expect(signedHead.status).toBe(404);
  });
});

describe('the method a signature covers', () => {
  test('is the one the request arrives with, a HEAD included', async () => {
    const phone = await registered();
    const asGet = signed(phone);

    const head = await sendTo(server.url, signed(phone, { method: 'HEAD' }));
    const getSentAsHead = await sendTo(server.url, {
      ...asGet,
      method: 'HEAD',
    });

    expect(head.status).toBe(404);
    expect(getSentAsHead.status).toBe(401);
    expect((await sendTo(server.url, asGet)).status).toBe(404);
  });
});

describe('a registration', () => {
  test('is a POST of /devices with no query: with one, it is a request for a path with no route', async () => {
    const phone = newPhone();
    const withQuery = (input: RequestInput = {}) =>
      registrationBy(phone, {
        timestampMs: NOW,
        path: `${DEVICES_PATH}?x=1`,
        ...input,
      });

    const before = await sendTo(server.url, withQuery());
    expect(await devices()).toEqual([]);
    await sendTo(server.url, registrationBy(phone, { timestampMs: NOW }));
    const after = await sendTo(server.url, withQuery());

    expect(before).toEqual(SIGNATURE);
    expect(after.status).toBe(404);
    expect(await devices()).toEqual([phone.deviceId]);
  });

  test.each([
    ['a trailing slash', 'POST', `${DEVICES_PATH}/`],
    ['another method', 'PUT', DEVICES_PATH],
    ['capitals', 'POST', '/Devices'],
  ])('is not a request with %s', async (_, method, path) => {
    const phone = newPhone();

    const answer = await sendTo(
      server.url,
      registrationBy(phone, { timestampMs: NOW, method, path }),
    );

    expect(answer).toEqual(SIGNATURE);
    expect(await devices()).toEqual([]);
  });

  test('whose body is not UTF-8 is refused for its body', async () => {
    const phone = newPhone();

    const answer = await sendTo(
      server.url,
      signed(phone, {
        method: 'POST',
        path: DEVICES_PATH,
        body: Uint8Array.of(0xff, 0xfe, 0x7b, 0x7d),
      }),
    );

    expect(answer).toEqual({ status: 400, body: { error: 'request' } });
  });

  test.each([
    ['32 bytes of 0xff', 'ff'.repeat(32)],
    ['32 bytes of 0x00', '00'.repeat(32)],
  ])(
    'that carries %s, which no key pair signs for, is refused for its signature',
    async (_, publicKey) => {
      const phone = newPhone();

      const answer = await sendTo(
        server.url,
        registrationBy(phone, { timestampMs: NOW, publicKey }),
      );

      expect(answer).toEqual(SIGNATURE);
      expect(await devices()).toEqual([]);
    },
  );
});

describe('the path a signature covers', () => {
  test('is the path the server routes the request on', async () => {
    const phone = await registered();
    const request = signed(phone, { path: '/no-such-route' });

    // The URL the runtime hands the app has its dot segments resolved, so this is a
    // request for the path that was signed.
    const resolved = await sendRaw(server.url, {
      method: 'GET',
      target: '/x/../no-such-route',
      headers: request.headers,
    });

    expect(resolved.status).toBe(404);
  });

  test.each([
    ['an empty query', '/no-such-route?'],
    ['a doubled slash', '//no-such-route'],
    ['a fragment', '/no-such-route#x'],
    ['an encoded letter', '/no-such-rout%65'],
  ])('is not the signed path written with %s', async (_, target) => {
    const phone = await registered();
    const request = signed(phone, { path: '/no-such-route' });

    const answer = await sendRaw(server.url, {
      method: 'GET',
      target,
      headers: request.headers,
    });

    expect(answer).toEqual(SIGNATURE);
    expect((await sendTo(server.url, request)).status).toBe(404);
  });
});

describe('a field sent twice', () => {
  test.each(['x-device-id', 'x-request-timestamp', 'x-request-nonce'])(
    'as two %s headers is refused, though both say the same',
    async (name) => {
      const phone = await registered();
      const request = signed(phone);

      const answer = await sendRaw(server.url, {
        method: 'GET',
        target: request.path,
        headers: {
          ...request.headers,
          [name]: [request.headers[name], request.headers[name]],
        },
      });

      expect(answer).toEqual(SIGNATURE);
      expect((await sendTo(server.url, request)).status).toBe(404);
    },
  );
});
