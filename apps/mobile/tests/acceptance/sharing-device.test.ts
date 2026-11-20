// This import comes first: it takes Web Crypto and Buffer away before the app's code
// loads, so that code loads and runs as on Hermes.
import { restoreGlobals } from './sharing-like-hermes';
import type { ApiRequest, ApiResult } from '../../src/sharing';
import {
  API,
  T,
  apiAnswers,
  apiAnswersNext,
  apiIsAhead,
  apiLosesNextAnswer,
  apiRefusesNext,
  bytesToSign,
  draws,
  drewFromTheRandomSource,
  emptySecureStore,
  failSecureStoreReads,
  failSecureStoreWrites,
  fetchCalls,
  forbiddenDraws,
  fromHex,
  goOffline,
  goOnline,
  localDataHolds,
  localDataOf,
  mistakes,
  newPhone,
  nextSeedIs,
  publicKeyIn,
  publicKeyOf,
  received,
  registeredKeyOf,
  registrationsReceived,
  removeSecureStoreEntry,
  removeWorld,
  requestsReceived,
  resetWorld,
  restoredFrom,
  secureStore,
  secureStoreEntries,
  secureStoreWorks,
  seedBehind,
  settled,
  sha256,
  signingKeyOf,
  startOn,
  toHex,
  utf8,
  uuidsDrawn,
  verifies,
  withFailingWrites,
  writeSecureStoreEntry,
  type App,
  type Phone,
  type Received,
} from './sharing-app';

// The phone's device identity and the requests it signs (ADR-0015), with no screen: each
// test starts the app's code on a phone of its own and sends requests as a feature would.
// The secure store, the random source and the API are the doubles in sharing-app, and the
// runtime has no Web Crypto and no Buffer, as on Hermes.

jest.mock(
  'expo-secure-store',
  () =>
    jest.requireActual<typeof import('./sharing-app')>('./sharing-app')
      .secureStore,
  { virtual: true },
);

jest.mock(
  'expo-crypto',
  () =>
    jest.requireActual<typeof import('./sharing-app')>('./sharing-app')
      .randomSource,
  { virtual: true },
);

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const NONCE = /^[0-9a-f]{32}$/;
const EMPTY_HASH =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const HOUR = 3_600_000;

beforeEach(() => {
  jest.useFakeTimers({ now: T });
  resetWorld();
});

afterEach(async () => {
  const wrong = mistakes();
  await removeWorld();
  jest.restoreAllMocks();
  jest.useRealTimers();
  expect(wrong).toEqual([]);
});

afterAll(restoreGlobals);

// Sending, as a feature of the app would

const ITEMS = '/example/items';

const send = (app: App, request: Partial<ApiRequest> = {}) =>
  settled(
    app.sharing.sendApiRequest(app.database, {
      apiUrl: API,
      method: 'GET',
      path: ITEMS,
      ...request,
    }),
  );

const identityOf = (app: App) =>
  settled(app.sharing.readDeviceIdentity(app.database));

const clockOffsetOf = (app: App) =>
  settled(app.sharing.readClockOffsetMs(app.database));

/** What the caller got, with the body as text. */
function readable(result: ApiResult) {
  return 'body' in result ? { ...result, body: textOf(result.body) } : result;
}

const textOf = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

const answered = (status: number, body: string) => ({
  outcome: 'answered',
  status,
  body,
});

/** Lets the app's code run as far as it gets without the clock moving. */
async function turns() {
  for (let turn = 0; turn < 40; turn += 1) {
    await jest.advanceTimersByTimeAsync(0);
  }
}

/** Restarts the app on `phone`: the last run's memory is gone. */
async function restart(app: App, phone: Phone): Promise<App> {
  await app.close();
  return startOn(phone);
}

interface Registered {
  phone: Phone;
  app: App;
  deviceId: string;
  publicKey: string;
}

/** A phone that has made its device identity, registered it and sent one request. */
async function registeredPhone(): Promise<Registered> {
  const phone = newPhone();
  const app = await startOn(phone);
  expect(readable(await send(app))).toEqual(answered(200, '{}'));
  const deviceId = uuidsDrawn().at(-1)!;
  const publicKey = registeredKeyOf(deviceId)!;
  expect(publicKey).toMatch(/^[0-9a-f]{64}$/);
  return { phone, app, deviceId, publicKey };
}

/** The requests the API received after the first `count`. */
const receivedAfter = (count: number) => received().slice(count);

async function expectSignedBy(
  request: Received,
  { deviceId, publicKey }: Pick<Registered, 'deviceId' | 'publicKey'>,
) {
  expect(request.deviceId).toBe(deviceId);
  expect(request.nonce).toMatch(NONCE);
  expect(drewFromTheRandomSource(fromHex(request.nonce!))).toBe(true);
  expect(await verifies(request, publicKey)).toBe(true);
}

describe('SHARING-19.1', () => {
  test('[SHARING-19.1] reading the device identity and the clock offset on a new phone makes no identity and no request', async () => {
    const app = await startOn(newPhone());

    const identity = await identityOf(app);
    const offset = await clockOffsetOf(app);
    const identityAgain = await identityOf(app);

    expect(identity).toEqual({ status: 'none' });
    expect(offset).toBe(0);
    expect(identityAgain).toEqual({ status: 'none' });
    expect(fetchCalls()).toBe(0);
    expect(secureStoreEntries()).toEqual([]);
    expect(draws()).toEqual([]);
  });
});

describe('SHARING-20.1', () => {
  test('[SHARING-20.1] the first request makes the device identity: an ID from randomUUID and a seed in the secure store, on this device only', async () => {
    const app = await startOn(newPhone());
    const weakRandom = jest.spyOn(Math, 'random');

    const result = await send(app);

    expect(readable(result)).toEqual(answered(200, '{}'));
    expect('crypto' in globalThis).toBe(false);
    expect('Buffer' in globalThis).toBe(false);
    expect(uuidsDrawn()).toHaveLength(1);
    const [deviceId] = uuidsDrawn();
    expect(deviceId).toMatch(UUID_V4);
    expect(await identityOf(app)).toEqual({ status: 'ready', deviceId });
    expect(received().map((request) => request.deviceId)).toEqual([
      deviceId,
      deviceId,
    ]);
    const entries = secureStoreEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].key).toContain(deviceId);
    expect(entries[0].options.keychainAccessible).toBe(
      secureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    );
    expect(entries[0].options.requireAuthentication ?? false).toBe(false);
    // The registered key comes from 32 bytes the random source handed out.
    expect(seedBehind(registeredKeyOf(deviceId)!)).toHaveLength(32);
    expect(forbiddenDraws()).toEqual([]);
    expect(weakRandom).not.toHaveBeenCalled();
  });

  test('[SHARING-20.1] keeps the seed and the signing secret key out of the local data', async () => {
    const { phone, app, deviceId, publicKey } = await registeredPhone();
    await send(app, { method: 'POST', body: 'more' });
    const seed = seedBehind(publicKey)!;
    await app.close();

    expect(seed).toHaveLength(32);
    expect(localDataHolds(phone, seed)).toBe(false);
    expect(localDataHolds(phone, signingKeyOf(seed))).toBe(false);
    // The search finds what is there: the device ID, as text or as its 16 bytes.
    expect(
      localDataHolds(phone, utf8(deviceId)) ||
        localDataHolds(phone, fromHex(deviceId.replaceAll('-', ''))),
    ).toBe(true);
  });

  test('[SHARING-20.1] a phone that has a device identity makes no other, after a restart either', async () => {
    const { phone, app, deviceId, publicKey } = await registeredPhone();
    const entries = secureStoreEntries();

    await send(app);
    await send(app, { path: '/example/other' });
    const again = await restart(app, phone);
    await send(again);

    expect(received()).toHaveLength(5);
    for (const request of received()) {
      await expectSignedBy(request, { deviceId, publicKey });
    }
    expect(await identityOf(again)).toEqual({ status: 'ready', deviceId });
    expect(uuidsDrawn()).toEqual([deviceId]);
    expect(secureStoreEntries()).toEqual(entries);
  });

  test('[SHARING-20.1] two requests sent together make one device identity', async () => {
    const app = await startOn(newPhone());

    const results = await settled(
      Promise.all([
        app.sharing.sendApiRequest(app.database, {
          apiUrl: API,
          method: 'GET',
          path: ITEMS,
        }),
        app.sharing.sendApiRequest(app.database, {
          apiUrl: API,
          method: 'GET',
          path: '/example/other',
        }),
      ]),
    );

    expect(results.map(readable)).toEqual([
      answered(200, '{}'),
      answered(200, '{}'),
    ]);
    expect(uuidsDrawn()).toHaveLength(1);
    const [deviceId] = uuidsDrawn();
    expect(secureStoreEntries()).toHaveLength(1);
    expect(new Set(received().map((request) => request.deviceId))).toEqual(
      new Set([deviceId]),
    );
    expect(new Set(registrationsReceived().map(publicKeyIn))).toEqual(
      new Set([registeredKeyOf(deviceId)]),
    );
    expect(
      requestsReceived()
        .map((request) => request.path)
        .sort(),
    ).toEqual([ITEMS, '/example/other']);
  });
});

describe('SHARING-21.1', () => {
  const SEED =
    '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
  const SECRET_KEY =
    'bdbb0a00ab23997ad90a4549a3b99cef1eb93f42150a20916a56f85bd31dcf81';
  const PUBLIC_KEY =
    '6fd0e31e547724487390b224a27934039e75568c032ed392a162b0537e9217f8';

  test('[SHARING-21.1] registers the public key of the signing key derived from a known seed', async () => {
    const app = await startOn(newPhone());
    nextSeedIs(fromHex(SEED));

    await send(app);

    // The values in the requirement, worked out here with Node's HKDF and Ed25519.
    expect(toHex(signingKeyOf(fromHex(SEED)))).toBe(SECRET_KEY);
    expect(publicKeyOf(fromHex(SECRET_KEY))).toBe(PUBLIC_KEY);
    const [registration, request] = received();
    expect(publicKeyIn(registration)).toBe(PUBLIC_KEY);
    expect(await verifies(registration, PUBLIC_KEY)).toBe(true);
    expect(await verifies(request, PUBLIC_KEY)).toBe(true);
  });

  test('[SHARING-21.1] derives another public key, the same way, from another seed', async () => {
    const seed = new Uint8Array(32).fill(0xff);
    const app = await startOn(newPhone());
    nextSeedIs(seed);

    await send(app);

    const expected = publicKeyOf(signingKeyOf(seed));
    const [registration, request] = received();
    expect(expected).not.toBe(PUBLIC_KEY);
    expect(publicKeyIn(registration)).toBe(expected);
    expect(await verifies(request, expected)).toBe(true);
  });
});

describe('SHARING-22.1', () => {
  test('[SHARING-22.1] the first request registers the device, then sends what was asked', async () => {
    const app = await startOn(newPhone());

    const result = await send(app);

    expect(readable(result)).toEqual(answered(200, '{}'));
    const [registration, request, ...others] = received();
    expect(others).toEqual([]);
    const [deviceId] = uuidsDrawn();
    const publicKey = publicKeyIn(registration)!;
    expect(registration.method).toBe('POST');
    expect(registration.url).toBe(`${API}/devices`);
    expect(publicKey).toBe(registeredKeyOf(deviceId));
    expect(request.method).toBe('GET');
    expect(request.url).toBe(`${API}${ITEMS}`);
    await expectSignedBy(registration, { deviceId, publicKey });
    await expectSignedBy(request, { deviceId, publicKey });
    expect(registration.nonce).not.toBe(request.nonce);
  });

  test('[SHARING-22.1] a registered phone does not register again', async () => {
    const { app } = await registeredPhone();

    await send(app);
    await send(app, { method: 'POST', path: '/example/other', body: '{}' });

    expect(registrationsReceived()).toHaveLength(1);
    expect(received().map((request) => request.path)).toEqual([
      '/devices',
      ITEMS,
      ITEMS,
      '/example/other',
    ]);
  });

  test('[SHARING-22.1] a registered phone does not register again after a restart', async () => {
    const { phone, app, deviceId, publicKey } = await registeredPhone();

    const again = await restart(app, phone);
    const result = await send(again);

    expect(readable(result)).toEqual(answered(200, '{}'));
    expect(registrationsReceived()).toHaveLength(1);
    expect(received()).toHaveLength(3);
    await expectSignedBy(received()[2], { deviceId, publicKey });
  });
});

describe('SHARING-23.1', () => {
  /** The device ID and public key of every registration the API received. */
  const registrations = () =>
    registrationsReceived().map((request) => ({
      deviceId: request.deviceId,
      publicKey: publicKeyIn(request),
    }));

  test('[SHARING-23.1] with no network the phone keeps the identity it made and registers it later', async () => {
    const app = await startOn(newPhone());
    goOffline();

    const offline = await send(app);

    expect(offline).toEqual({ outcome: 'no-answer' });
    expect(fetchCalls()).toBe(1);
    expect(received()).toEqual([]);
    const [deviceId] = uuidsDrawn();
    expect(await identityOf(app)).toEqual({ status: 'ready', deviceId });
    const entries = secureStoreEntries();
    expect(entries).toHaveLength(1);

    goOnline();
    const online = await send(app);

    expect(readable(online)).toEqual(answered(200, '{}'));
    expect(received().map((request) => request.path)).toEqual([
      '/devices',
      ITEMS,
    ]);
    const publicKey = publicKeyOf(
      signingKeyOf(seedBehind(registeredKeyOf(deviceId)!)!),
    );
    expect(registrations()).toEqual([{ deviceId, publicKey }]);
    expect(uuidsDrawn()).toEqual([deviceId]);
    expect(secureStoreEntries()).toEqual(entries);
  });

  test('[SHARING-23.1] when the answer to the registration is lost, the phone registers the same identity again', async () => {
    const app = await startOn(newPhone());
    apiLosesNextAnswer('registration');

    const first = await send(app);

    expect(first).toEqual({ outcome: 'no-answer' });
    expect(received().map((request) => request.path)).toEqual(['/devices']);
    const [deviceId] = uuidsDrawn();
    const publicKey = registeredKeyOf(deviceId)!;
    expect(publicKey).toBeDefined();

    const second = await send(app);

    expect(readable(second)).toEqual(answered(200, '{}'));
    expect(received().map((request) => request.path)).toEqual([
      '/devices',
      '/devices',
      ITEMS,
    ]);
    expect(registrations()).toEqual([
      { deviceId, publicKey },
      { deviceId, publicKey },
    ]);
    expect(uuidsDrawn()).toEqual([deviceId]);
    expect(secureStoreEntries()).toHaveLength(1);
  });

  test('[SHARING-23.1] when the API refuses the registration, the caller gets its answer and the identity stays', async () => {
    const app = await startOn(newPhone());
    apiRefusesNext('registration', { error: 'too-many-registrations' });

    const refused = await send(app);

    expect(readable(refused)).toEqual({
      outcome: 'not-registered',
      status: 429,
      body: '{"error":"too-many-registrations"}',
    });
    expect(received().map((request) => request.path)).toEqual(['/devices']);
    const [deviceId] = uuidsDrawn();
    expect(await identityOf(app)).toEqual({ status: 'ready', deviceId });

    const next = await send(app);

    expect(readable(next)).toEqual(answered(200, '{}'));
    const [first, second] = registrations();
    expect(first.deviceId).toBe(deviceId);
    expect(second).toEqual(first);
    expect(uuidsDrawn()).toEqual([deviceId]);
    expect(secureStoreEntries()).toHaveLength(1);
  });

  test.each([
    ['a server error', 500, 'oops'],
    ['status 200 with a body that does not say registered', 200, '{}'],
    ['status 200 with no body', 200, ''],
    ['"not found"', 404, '404 Not Found'],
  ])(
    '[SHARING-23.1] an answer to the registration that is %s is not "registered"',
    async (_, status, body) => {
      const app = await startOn(newPhone());
      apiAnswersNext('registration', status, body);

      const result = await send(app);

      expect(readable(result)).toEqual({
        outcome: 'not-registered',
        status,
        body,
      });
      expect(received().map((request) => request.path)).toEqual(['/devices']);

      const next = await send(app);

      expect(readable(next)).toEqual(answered(200, '{}'));
      expect(received().map((request) => request.path)).toEqual([
        '/devices',
        '/devices',
        ITEMS,
      ]);
      expect(uuidsDrawn()).toHaveLength(1);
    },
  );

  test('[SHARING-23.1] after a restart the phone still registers the identity it made', async () => {
    const phone = newPhone();
    const app = await startOn(phone);
    goOffline();
    expect(await send(app)).toEqual({ outcome: 'no-answer' });
    const [deviceId] = uuidsDrawn();
    const entries = secureStoreEntries();

    const again = await restart(app, phone);
    goOnline();
    const result = await send(again);

    expect(readable(result)).toEqual(answered(200, '{}'));
    expect(uuidsDrawn()).toEqual([deviceId]);
    expect(secureStoreEntries()).toEqual(entries);
    const [registration] = registrationsReceived();
    expect(registration.deviceId).toBe(deviceId);
    expect(await verifies(registration, publicKeyIn(registration)!)).toBe(true);
    expect(seedBehind(publicKeyIn(registration)!)).toHaveLength(32);
  });
});

describe('SHARING-24.1', () => {
  test('[SHARING-24.1] when the seed cannot be stored, the phone has no identity and sends nothing', async () => {
    const app = await startOn(newPhone());
    failSecureStoreWrites();

    await expect(send(app)).rejects.toThrow();

    expect(fetchCalls()).toBe(0);
    expect(secureStoreEntries()).toEqual([]);
    expect(await identityOf(app)).toEqual({ status: 'none' });

    secureStoreWorks();
    const result = await send(app);

    expect(readable(result)).toEqual(answered(200, '{}'));
    const deviceId = uuidsDrawn().at(-1)!;
    expect(await identityOf(app)).toEqual({ status: 'ready', deviceId });
    expect(received().map((request) => request.deviceId)).toEqual([
      deviceId,
      deviceId,
    ]);
  });

  test('[SHARING-24.1] when the device ID cannot be saved, the phone has no identity, and its authorization is not lost', async () => {
    const app = await startOn(newPhone());

    await expect(
      settled(
        app.sharing.sendApiRequest(withFailingWrites(app.database), {
          apiUrl: API,
          method: 'GET',
          path: ITEMS,
        }),
      ),
    ).rejects.toThrow();

    expect(fetchCalls()).toBe(0);
    expect(await identityOf(app)).toEqual({ status: 'none' });

    const result = await send(app);

    expect(readable(result)).toEqual(answered(200, '{}'));
    const deviceId = uuidsDrawn().at(-1)!;
    expect(await identityOf(app)).toEqual({ status: 'ready', deviceId });
    expect(
      secureStoreEntries().filter((entry) => entry.key.includes(deviceId)),
    ).toHaveLength(1);
    expect(received().map((request) => request.deviceId)).toEqual([
      deviceId,
      deviceId,
    ]);
  });

  test('[SHARING-24.1] an entry an earlier install left in the secure store is not used', async () => {
    const earlier = await registeredPhone();
    await earlier.app.close();
    const [left] = secureStoreEntries();
    const requests = received().length;

    // A new install: the same secure store, and local data that starts empty.
    const app = await startOn(newPhone());
    const before = await identityOf(app);
    const result = await send(app);

    expect(before).toEqual({ status: 'none' });
    expect(readable(result)).toEqual(answered(200, '{}'));
    const deviceId = uuidsDrawn().at(-1)!;
    expect(deviceId).not.toBe(earlier.deviceId);
    expect(await identityOf(app)).toEqual({ status: 'ready', deviceId });
    const [registration, request] = receivedAfter(requests);
    const publicKey = publicKeyIn(registration)!;
    expect(publicKey).not.toBe(earlier.publicKey);
    await expectSignedBy(registration, { deviceId, publicKey });
    await expectSignedBy(request, { deviceId, publicKey });
    expect(secureStoreEntries()).toHaveLength(2);
    expect(secureStoreEntries()).toContainEqual(left);
  });
});

describe('SHARING-25.1', () => {
  test('[SHARING-25.1] signs a GET with no body, where the runtime has no Web Crypto and no Buffer', async () => {
    const { app, deviceId, publicKey } = await registeredPhone();
    const path = `${ITEMS}?after=41&limit=100`;

    await send(app, { path });

    expect('crypto' in globalThis).toBe(false);
    expect('Buffer' in globalThis).toBe(false);
    const request = received().at(-1)!;
    expect(request.method).toBe('GET');
    expect(request.url).toBe(`${API}${path}`);
    expect(request.body).toHaveLength(0);
    expect(request.timestamp).toBe('1794983520000');
    await expectSignedBy(request, { deviceId, publicKey });
    expect(textOf(bytesToSign(request)).split('\n')).toEqual([
      'shared-expense/request/v1',
      'GET',
      path,
      EMPTY_HASH,
      deviceId,
      '1794983520000',
      request.nonce,
    ]);
  });

  test.each([
    ['3 bytes', fromHex('00ff10')],
    ['1,000 bytes', new Uint8Array(1_000).map((_, index) => index % 251)],
    ['262,144 bytes', new Uint8Array(262_144).map((_, index) => index % 253)],
  ])(
    '[SHARING-25.1] signs a POST with a body of %s, which arrives as it was given',
    async (_, body) => {
      const { app, deviceId, publicKey } = await registeredPhone();

      await send(app, { method: 'POST', body });

      const request = received().at(-1)!;
      expect(request.method).toBe('POST');
      expect(toHex(sha256(request.body))).toBe(toHex(sha256(body)));
      expect(request.body).toHaveLength(body.length);
      await expectSignedBy(request, { deviceId, publicKey });
    },
  );

  test('[SHARING-25.1] sends a body given as text in UTF-8, and signs those bytes', async () => {
    const { app, deviceId, publicKey } = await registeredPhone();
    const text = '{"note":"晚餐 🍜 é"}';

    await send(app, { method: 'POST', body: text });

    const request = received().at(-1)!;
    expect(toHex(request.body)).toBe(toHex(utf8(text)));
    await expectSignedBy(request, { deviceId, publicKey });
  });

  test('[SHARING-25.1] signs each request with a new nonce from the random source', async () => {
    const { app, deviceId, publicKey } = await registeredPhone();

    for (let index = 0; index < 5; index += 1) await send(app);

    const requests = received();
    expect(requests).toHaveLength(7);
    expect(new Set(requests.map((request) => request.nonce)).size).toBe(7);
    for (const request of requests) {
      await expectSignedBy(request, { deviceId, publicKey });
    }
  });

  test("[SHARING-25.1] signs each request with the phone's time at that moment", async () => {
    const { app } = await registeredPhone();

    await send(app);
    jest.setSystemTime(T + 90_000);
    await send(app);

    expect(
      received()
        .slice(-2)
        .map((request) => request.timestamp),
    ).toEqual(['1794983520000', '1794983610000']);
  });
});

describe('SHARING-25.1, a method or a path that cannot be signed', () => {
  const WRONG: [string, Partial<ApiRequest>][] = [
    ['a method in lower case', { method: 'get' }],
    ['an empty method', { method: '' }],
    ['a path without its leading slash', { path: 'example/items' }],
    ['a path with a space', { path: '/a b' }],
    ['a path with a quote', { path: "/a'b" }],
    ['a path with an empty segment', { path: '/a//b' }],
    ['a path with a dot segment', { path: '/a/../b' }],
    ['a path with a percent sign before its query', { path: '/a%20b' }],
    ['a path with an empty query', { path: '/a?' }],
    ['a query with a space', { path: '/a?x=a b' }],
  ];

  test.each(WRONG)(
    '[SHARING-25.1] a phone with no device identity fails to send %s, and makes no identity',
    async (_, request) => {
      const app = await startOn(newPhone());

      await expect(send(app, request)).rejects.toThrow();

      expect(fetchCalls()).toBe(0);
      expect(await identityOf(app)).toEqual({ status: 'none' });
      expect(secureStoreEntries()).toEqual([]);
      expect(uuidsDrawn()).toEqual([]);
    },
  );

  test.each(WRONG)(
    '[SHARING-25.1] a registered phone fails to send %s, and makes no request',
    async (_, request) => {
      const { app, deviceId, publicKey } = await registeredPhone();
      const calls = fetchCalls();

      await expect(send(app, request)).rejects.toThrow();

      expect(fetchCalls()).toBe(calls);
      // What is written properly still goes out.
      await send(app, { path: '/a.b/c-d_e~f?x=1&y=%E5%B8%B3' });
      const sent = received().at(-1)!;
      expect(sent.url).toBe(`${API}/a.b/c-d_e~f?x=1&y=%E5%B8%B3`);
      await expectSignedBy(sent, { deviceId, publicKey });
    },
  );
});

describe('SHARING-45.1', () => {
  const WITH_CONTENT: [string, Partial<ApiRequest>][] = [
    ['a GET with 3 bytes', { method: 'GET', body: fromHex('00ff10') }],
    ['a GET with text', { method: 'GET', body: '{}' }],
    ['a HEAD with 1 byte', { method: 'HEAD', body: fromHex('00') }],
    ['a HEAD with text', { method: 'HEAD', body: 'x' }],
  ];

  test.each(WITH_CONTENT)(
    '[SHARING-45.1] a phone with no device identity fails to send %s, and makes no identity',
    async (_, request) => {
      const app = await startOn(newPhone());

      await expect(send(app, request)).rejects.toThrow();

      expect(fetchCalls()).toBe(0);
      expect(await identityOf(app)).toEqual({ status: 'none' });
      expect(secureStoreEntries()).toEqual([]);
      expect(uuidsDrawn()).toEqual([]);
    },
  );

  test.each(WITH_CONTENT)(
    '[SHARING-45.1] a registered phone fails to send %s, and makes no request',
    async (_, request) => {
      const { app } = await registeredPhone();
      const calls = fetchCalls();

      await expect(send(app, request)).rejects.toThrow();

      expect(fetchCalls()).toBe(calls);
    },
  );

  test.each<[string, string, Partial<ApiRequest>, string]>([
    ['a GET', '0 bytes', { method: 'GET', body: new Uint8Array(0) }, '{}'],
    ['a GET', 'empty text', { method: 'GET', body: '' }, '{}'],
    ['a HEAD', '0 bytes', { method: 'HEAD', body: new Uint8Array(0) }, ''],
    ['a HEAD', 'empty text', { method: 'HEAD', body: '' }, ''],
    ['a HEAD', 'nothing', { method: 'HEAD' }, ''],
  ])(
    '[SHARING-45.1] sends %s whose content is %s, as one with no content',
    async (_, __, request, answer) => {
      const { app, deviceId, publicKey } = await registeredPhone();

      const result = await send(app, request);

      expect(readable(result)).toEqual(answered(200, answer));
      const sent = received().at(-1)!;
      expect(sent.method).toBe(request.method);
      expect(sent.body).toHaveLength(0);
      await expectSignedBy(sent, { deviceId, publicKey });
      expect(textOf(bytesToSign(sent)).split('\n')[3]).toBe(EMPTY_HASH);
    },
  );
});

describe('SHARING-26.1', () => {
  test.each([
    ['GET', '/example/a', 200, '{"items":[]}'],
    ['GET', '/example/b', 404, 'not found'],
    ['POST', '/example/c', 500, ''],
    ['DELETE', '/example/d', 204, ''],
  ])(
    "[SHARING-26.1] hands the caller the API's answer to %s %s: %d",
    async (method, path, status, body) => {
      const { app } = await registeredPhone();
      apiAnswers(method, path, status, body);

      const result = await send(app, { method, path });

      expect(readable(result)).toEqual(answered(status, body));
      expect(
        received().filter((request) => request.path === path),
      ).toHaveLength(1);
    },
  );

  test('[SHARING-26.1] hands the caller an answer whose body is not text, byte for byte', async () => {
    const { app } = await registeredPhone();
    const body = fromHex('00ff80fe0a0d');
    apiAnswers('GET', ITEMS, 200, body);

    const result = await send(app);

    expect(result.outcome).toBe('answered');
    expect('body' in result && toHex(result.body)).toBe(toHex(body));
  });

  test.each([
    [{ error: 'signature' } as const, 401],
    [{ error: 'replayed' } as const, 401],
    [{ error: 'request' } as const, 400],
    [{ error: 'too-large' } as const, 413],
    [{ error: 'too-many-registrations' } as const, 429],
  ])(
    '[SHARING-26.1] hands the caller a refusal %j as it is, and does not send again',
    async (refusal, status) => {
      const { app } = await registeredPhone();
      const before = received().length;
      apiRefusesNext('request', refusal);

      const result = await send(app);

      expect(readable(result)).toEqual(
        answered(status, JSON.stringify(refusal)),
      );
      expect(receivedAfter(before)).toHaveLength(1);
    },
  );

  test('[SHARING-26.1] tells the caller when a request got no answer, and tries once', async () => {
    const { app } = await registeredPhone();
    const calls = fetchCalls();
    goOffline();

    const offline = await send(app);

    expect(offline).toEqual({ outcome: 'no-answer' });
    expect(fetchCalls()).toBe(calls + 1);

    goOnline();
    apiLosesNextAnswer('request');
    const lost = await send(app);

    expect(lost).toEqual({ outcome: 'no-answer' });
    expect(fetchCalls()).toBe(calls + 2);
  });
});

describe('SHARING-27.1', () => {
  /** A registered phone whose clock offset is `ms`, learned from the API. */
  async function phoneWithOffset(ms: number) {
    const registered = await registeredPhone();
    apiIsAhead(ms);
    expect(readable(await send(registered.app))).toEqual(answered(200, '{}'));
    expect(await clockOffsetOf(registered.app)).toBe(ms);
    return registered;
  }

  test.each([
    ['an hour slow', HOUR],
    ['an hour fast', -HOUR],
    ['5 minutes and 1 ms slow', 300_001],
  ])(
    "[SHARING-27.1] a phone %s takes the API's time and sends again once",
    async (_, ahead) => {
      const { app, deviceId, publicKey } = await registeredPhone();
      const before = received().length;
      apiIsAhead(ahead);

      const result = await send(app);

      expect(readable(result)).toEqual(answered(200, '{}'));
      const [first, second, ...others] = receivedAfter(before);
      expect(others).toEqual([]);
      expect(first.timestamp).toBe(String(T));
      expect(second.timestamp).toBe(String(T + ahead));
      expect(second.path).toBe(first.path);
      expect(second.nonce).not.toBe(first.nonce);
      await expectSignedBy(first, { deviceId, publicKey });
      await expectSignedBy(second, { deviceId, publicKey });
      expect(await clockOffsetOf(app)).toBe(ahead);
    },
  );

  test('[SHARING-27.1] later requests are signed with the corrected time, and sent once', async () => {
    const { app } = await phoneWithOffset(HOUR);
    const before = received().length;

    jest.setSystemTime(T + 60_000);
    const result = await send(app);

    expect(readable(result)).toEqual(answered(200, '{}'));
    expect(receivedAfter(before).map((request) => request.timestamp)).toEqual([
      String(T + HOUR + 60_000),
    ]);
  });

  test('[SHARING-27.1] a phone whose very first request is off corrects the registration, then sends what was asked', async () => {
    const app = await startOn(newPhone());
    apiIsAhead(HOUR);

    const result = await send(app);

    expect(readable(result)).toEqual(answered(200, '{}'));
    expect(
      received().map((request) => [request.path, request.timestamp]),
    ).toEqual([
      ['/devices', String(T)],
      ['/devices', String(T + HOUR)],
      [ITEMS, String(T + HOUR)],
    ]);
    expect(uuidsDrawn()).toHaveLength(1);
    expect(await clockOffsetOf(app)).toBe(HOUR);
  });

  test('[SHARING-27.1] when the second try is refused for the clock too, the phone keeps the newer offset and hands that refusal over', async () => {
    const { app } = await registeredPhone();
    const before = received().length;
    apiRefusesNext('request', { error: 'clock', serverTimeMs: T + HOUR });
    apiRefusesNext('request', { error: 'clock', serverTimeMs: T + 2 * HOUR });

    const result = await send(app);

    expect(readable(result)).toEqual(
      answered(
        401,
        JSON.stringify({ error: 'clock', serverTimeMs: T + 2 * HOUR }),
      ),
    );
    expect(receivedAfter(before).map((request) => request.timestamp)).toEqual([
      String(T),
      String(T + HOUR),
    ]);
    expect(await clockOffsetOf(app)).toBe(2 * HOUR);
  });

  test('[SHARING-27.1] a phone whose clock was set right afterwards corrects its offset back', async () => {
    const { app } = await phoneWithOffset(HOUR);
    const before = received().length;
    apiIsAhead(0);

    const result = await send(app);

    expect(readable(result)).toEqual(answered(200, '{}'));
    expect(receivedAfter(before).map((request) => request.timestamp)).toEqual([
      String(T + HOUR),
      String(T),
    ]);
    expect(await clockOffsetOf(app)).toBe(0);
  });

  test.each<[string, Record<string, unknown>]>([
    ['is missing', { error: 'clock' }],
    ['is text', { error: 'clock', serverTimeMs: 'soon' }],
    ['is negative', { error: 'clock', serverTimeMs: -1 }],
    ['is a fraction', { error: 'clock', serverTimeMs: 1.5 }],
    ['is past the largest integer', { error: 'clock', serverTimeMs: 2 ** 53 }],
    ['is null', { error: 'clock', serverTimeMs: null }],
  ])(
    '[SHARING-27.1] a clock refusal whose API time %s changes no offset and is not sent again',
    async (_, body) => {
      const { app } = await phoneWithOffset(HOUR);
      const before = received().length;
      apiRefusesNext('request', body, 'clock');

      const result = await send(app);

      expect(readable(result)).toEqual(answered(401, JSON.stringify(body)));
      expect(receivedAfter(before)).toHaveLength(1);
      expect(await clockOffsetOf(app)).toBe(HOUR);
    },
  );

  test('[SHARING-27.1] keeps the offset after a restart', async () => {
    const { phone, app } = await phoneWithOffset(HOUR);
    const before = received().length;

    const again = await restart(app, phone);
    const offset = await clockOffsetOf(again);
    const result = await send(again);

    expect(offset).toBe(HOUR);
    expect(readable(result)).toEqual(answered(200, '{}'));
    expect(receivedAfter(before).map((request) => request.timestamp)).toEqual([
      String(T + HOUR),
    ]);
  });
});

describe('SHARING-28.1', () => {
  const tooMany = (retryAfterMs: number) =>
    ({ error: 'too-many-requests', retryAfterMs }) as const;

  /** Starts a request and returns a way to see what the caller has been told so far. */
  function sending(app: App, request: Partial<ApiRequest> = {}) {
    let result: ApiResult | undefined;
    const done = app.sharing
      .sendApiRequest(app.database, {
        apiUrl: API,
        method: 'GET',
        path: ITEMS,
        ...request,
      })
      .then((value) => {
        result = value;
        return value;
      });
    // A test that fails before it reads `done` must not leave a rejection unhandled.
    done.catch(() => undefined);
    return { done, told: () => result };
  }

  test('[SHARING-28.1] waits as long as the API said, then signs and sends again', async () => {
    const { app, deviceId, publicKey } = await registeredPhone();
    const before = received().length;
    apiRefusesNext('request', tooMany(30_000));

    const request = sending(app);
    await turns();
    expect(receivedAfter(before)).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(29_999);
    await turns();
    expect(receivedAfter(before)).toHaveLength(1);
    expect(request.told()).toBeUndefined();
    await jest.advanceTimersByTimeAsync(1);
    const result = await settled(request.done);

    expect(readable(result)).toEqual(answered(200, '{}'));
    const [first, second, ...others] = receivedAfter(before);
    expect(others).toEqual([]);
    expect(second.at).toBe(T + 30_000);
    expect(second.timestamp).toBe(String(T + 30_000));
    expect(second.path).toBe(first.path);
    expect(second.nonce).not.toBe(first.nonce);
    await expectSignedBy(second, { deviceId, publicKey });
  });

  test('[SHARING-28.1] sends again at once when the API says to wait 0 ms', async () => {
    const { app } = await registeredPhone();
    const before = received().length;
    apiRefusesNext('request', tooMany(0));

    const result = await send(app);

    expect(readable(result)).toEqual(answered(200, '{}'));
    expect(receivedAfter(before).map((request) => request.at)).toEqual([T, T]);
  });

  test('[SHARING-28.1] waits the full 60,000 ms when told to', async () => {
    const { app } = await registeredPhone();
    const before = received().length;
    apiRefusesNext('request', tooMany(60_000));

    const request = sending(app);
    await jest.advanceTimersByTimeAsync(59_999);
    await turns();
    expect(receivedAfter(before)).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(1);
    const result = await settled(request.done);

    expect(readable(result)).toEqual(answered(200, '{}'));
    expect(receivedAfter(before).map((each) => each.at)).toEqual([
      T,
      T + 60_000,
    ]);
  });

  test('[SHARING-28.1] waits only once: a second refusal for too many requests goes to the caller', async () => {
    const { app } = await registeredPhone();
    const before = received().length;
    apiRefusesNext('request', tooMany(30_000));
    apiRefusesNext('request', tooMany(10_000));

    const request = sending(app);
    await jest.advanceTimersByTimeAsync(30_000);
    const result = await settled(request.done);
    await jest.advanceTimersByTimeAsync(120_000);
    await turns();

    expect(readable(result)).toEqual(
      answered(429, JSON.stringify(tooMany(10_000))),
    );
    expect(receivedAfter(before)).toHaveLength(2);
  });

  test('[SHARING-28.1] waits for a registration too, then sends what was asked', async () => {
    const app = await startOn(newPhone());
    apiRefusesNext('registration', tooMany(5_000));

    const request = sending(app);
    await jest.advanceTimersByTimeAsync(4_999);
    await turns();
    expect(received().map((each) => each.path)).toEqual(['/devices']);
    await jest.advanceTimersByTimeAsync(1);
    const result = await settled(request.done);

    expect(readable(result)).toEqual(answered(200, '{}'));
    expect(received().map((each) => [each.path, each.at])).toEqual([
      ['/devices', T],
      ['/devices', T + 5_000],
      [ITEMS, T + 5_000],
    ]);
    expect(uuidsDrawn()).toHaveLength(1);
  });

  test.each<[string, Record<string, unknown>]>([
    ['is missing', { error: 'too-many-requests' }],
    ['is 60,001', { error: 'too-many-requests', retryAfterMs: 60_001 }],
    ['is negative', { error: 'too-many-requests', retryAfterMs: -1 }],
    ['is a fraction', { error: 'too-many-requests', retryAfterMs: 1.5 }],
    ['is text', { error: 'too-many-requests', retryAfterMs: '30000' }],
    ['is null', { error: 'too-many-requests', retryAfterMs: null }],
  ])(
    '[SHARING-28.1] neither waits nor sends again when the time to wait %s',
    async (_, body) => {
      const { app } = await registeredPhone();
      const before = received().length;
      apiRefusesNext('request', body, 'too-many-requests');

      // Settles with no time passing, so the phone did not wait.
      const result = await send(app);
      await jest.advanceTimersByTimeAsync(120_000);
      await turns();

      expect(readable(result)).toEqual(answered(429, JSON.stringify(body)));
      expect(receivedAfter(before)).toHaveLength(1);
    },
  );
});

describe('SHARING-29.1', () => {
  /** A registered phone's local data restored to another phone, whose secure store is empty. */
  async function restoredPhone() {
    const original = await registeredPhone();
    await original.app.close();
    const phone = restoredFrom(original.phone);
    emptySecureStore();
    return { phone, app: await startOn(phone), deviceId: original.deviceId };
  }

  test('[SHARING-29.1] a phone restored from a backup, with an empty secure store, has lost its authorization', async () => {
    const { app, deviceId } = await restoredPhone();

    expect(await identityOf(app)).toEqual({ status: 'lost', deviceId });
  });

  test('[SHARING-29.1] a phone that lost its authorization sends nothing, makes no new identity and changes nothing', async () => {
    const { phone, app, deviceId } = await restoredPhone();
    const calls = fetchCalls();
    const drawn = draws().length;
    const before = localDataOf(phone);

    const result = await send(app);
    const posted = await send(app, { method: 'POST', body: '{}' });

    expect(result).toEqual({ outcome: 'authorization-lost' });
    expect(posted).toEqual({ outcome: 'authorization-lost' });
    expect(fetchCalls()).toBe(calls);
    expect(draws()).toHaveLength(drawn);
    expect(secureStoreEntries()).toEqual([]);
    expect(localDataOf(phone)).toEqual(before);
    expect(await identityOf(app)).toEqual({ status: 'lost', deviceId });
  });

  test('[SHARING-29.1] a secure store that holds only the seeds of other device IDs leaves the authorization lost', async () => {
    const original = await registeredPhone();
    await original.app.close();
    const other = await registeredPhone();
    await other.app.close();
    const mine = secureStoreEntries().find((entry) =>
      entry.key.includes(original.deviceId),
    )!;
    const theirs = secureStoreEntries().find((entry) =>
      entry.key.includes(other.deviceId),
    )!;
    removeSecureStoreEntry(mine.key);
    const calls = fetchCalls();

    const app = await startOn(restoredFrom(original.phone));
    const identity = await identityOf(app);
    const result = await send(app);

    expect(identity).toEqual({ status: 'lost', deviceId: original.deviceId });
    expect(result).toEqual({ outcome: 'authorization-lost' });
    expect(fetchCalls()).toBe(calls);
    expect(secureStoreEntries()).toEqual([theirs]);
  });

  test.each([
    ['empty', ''],
    ['text that is no seed', 'not a seed'],
  ])(
    '[SHARING-29.1] an entry whose content is %s leaves the authorization lost',
    async (_, content) => {
      const { phone, app, deviceId } = await registeredPhone();
      const [entry] = secureStoreEntries();
      writeSecureStoreEntry(entry.key, content);
      const calls = fetchCalls();

      const again = await restart(app, phone);
      const identity = await identityOf(again);
      const result = await send(again);

      expect(identity).toEqual({ status: 'lost', deviceId });
      expect(result).toEqual({ outcome: 'authorization-lost' });
      expect(fetchCalls()).toBe(calls);
      expect(uuidsDrawn()).toEqual([deviceId]);
    },
  );
});

describe('SHARING-30.1', () => {
  test('[SHARING-30.1] a secure store that cannot be read for now fails the request without losing the authorization', async () => {
    const { phone, app, deviceId, publicKey } = await registeredPhone();
    const entries = secureStoreEntries();
    const calls = fetchCalls();
    const drawn = draws().length;

    // After a reboot, before the first unlock: a new run of the app, and reads that fail.
    const again = await restart(app, phone);
    failSecureStoreReads();
    const before = localDataOf(phone);

    await expect(identityOf(again)).rejects.toThrow();
    await expect(send(again)).rejects.toThrow();

    expect(fetchCalls()).toBe(calls);
    expect(draws()).toHaveLength(drawn);
    expect(secureStoreEntries()).toEqual(entries);
    expect(localDataOf(phone)).toEqual(before);

    secureStoreWorks();
    const identity = await identityOf(again);
    const result = await send(again);

    expect(identity).toEqual({ status: 'ready', deviceId });
    expect(readable(result)).toEqual(answered(200, '{}'));
    expect(registrationsReceived()).toHaveLength(1);
    await expectSignedBy(received().at(-1)!, { deviceId, publicKey });
    expect(uuidsDrawn()).toEqual([deviceId]);
  });
});
