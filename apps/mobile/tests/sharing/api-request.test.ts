import type { ApiRequest } from '../../src/sharing';
import {
  API,
  T,
  apiAnswersNext,
  apiRefusesNext,
  failSecureStoreWrites,
  fetchCalls,
  fromHex,
  mistakes,
  newPhone,
  received,
  registeredKeyOf,
  removeWorld,
  resetWorld,
  secureStoreEntries,
  secureStoreWorks,
  settled,
  startOn,
  toHex,
  utf8,
  uuidsDrawn,
  withFailingWrites,
  type App,
} from '../acceptance/sharing-app';

// What the phone's requests to the API do beyond the acceptance tests, with the same
// doubles for the secure store, the random source and the API.

jest.mock(
  'expo-secure-store',
  () =>
    jest.requireActual<typeof import('../acceptance/sharing-app')>(
      '../acceptance/sharing-app',
    ).secureStore,
);

jest.mock(
  'expo-crypto',
  () =>
    jest.requireActual<typeof import('../acceptance/sharing-app')>(
      '../acceptance/sharing-app',
    ).randomSource,
);

const HOUR = 3_600_000;
const ITEMS = '/example/items';

/** What the app handed `fetch`, call by call. */
let handed: { url: string; init: RequestInit }[];

beforeEach(() => {
  jest.useFakeTimers({ now: T });
  resetWorld();
  handed = [];
  const api = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    handed.push({ url: String(input), init: init ?? {} });
    return api(input, init);
  }) as typeof fetch;
});

afterEach(async () => {
  const wrong = mistakes();
  await removeWorld();
  jest.useRealTimers();
  expect(wrong).toEqual([]);
});

const send = (app: App, request: Partial<ApiRequest> = {}) =>
  settled(
    app.sharing.sendApiRequest(app.database, {
      apiUrl: API,
      method: 'GET',
      path: ITEMS,
      ...request,
    }),
  );

const textOf = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

const headersOf = (init: RequestInit) =>
  Object.fromEntries(
    Object.entries(init.headers as Record<string, string>).map(
      ([name, value]) => [name.toLowerCase(), value],
    ),
  );

async function registeredApp(): Promise<App> {
  const app = await startOn(newPhone());
  expect((await send(app)).outcome).toBe('answered');
  return app;
}

test('says what a body is, since iOS would call a body of no type a submitted form', async () => {
  const app = await startOn(newPhone());

  await send(app);
  await send(app, { method: 'POST', body: fromHex('00ff10') });
  await send(app, { method: 'PUT', body: '{"note":"晚餐"}' });

  expect(
    handed.map(({ url, init }) => [
      init.method,
      url,
      headersOf(init)['content-type'],
    ]),
  ).toEqual([
    ['POST', `${API}/devices`, 'application/json'],
    ['GET', `${API}${ITEMS}`, undefined],
    ['POST', `${API}${ITEMS}`, 'application/octet-stream'],
    ['PUT', `${API}${ITEMS}`, 'application/octet-stream'],
  ]);
  expect(handed[1].init.body).toBeUndefined();
});

test('sends no cookies and stores none: the signature is all that says who asks', async () => {
  const app = await startOn(newPhone());

  await send(app);

  expect(handed.map(({ init }) => init.credentials)).toEqual(['omit', 'omit']);
});

test.each(['GET', 'HEAD'])(
  'fails to send a %s with a body, before it makes a device identity or a request',
  async (method) => {
    const app = await startOn(newPhone());

    await expect(send(app, { method, body: 'x' })).rejects.toThrow(
      'cannot carry a body',
    );
    await expect(send(app, { method, body: Uint8Array.of(0) })).rejects.toThrow(
      'cannot carry a body',
    );

    expect(fetchCalls()).toBe(0);
    expect(uuidsDrawn()).toEqual([]);
    expect(secureStoreEntries()).toEqual([]);
    // An empty body is no body.
    expect((await send(app, { method, body: '' })).outcome).toBe('answered');
    expect((await send(app, { method, body: new Uint8Array(0) })).outcome).toBe(
      'answered',
    );
  },
);

test('sends the bytes it was given, whatever the caller does with them afterwards', async () => {
  const app = await registeredApp();
  const body = utf8('the bytes as they were handed over');
  const original = toHex(body);

  const sending = app.sharing.sendApiRequest(app.database, {
    apiUrl: API,
    method: 'POST',
    path: ITEMS,
    body,
  });
  body.fill(0);
  await settled(sending);

  expect(toHex(received().at(-1)!.body)).toBe(original);
});

test('takes a body that is a part of a larger block of bytes', async () => {
  const app = await registeredApp();
  const block = new Uint8Array(64).fill(0xee);
  block.set(fromHex('00ff10'), 20);

  await send(app, { method: 'POST', body: block.subarray(20, 23) });

  expect(toHex(received().at(-1)!.body)).toBe('00ff10');
});

test('removes the seed it stored when the device ID cannot be saved', async () => {
  const app = await startOn(newPhone());

  await expect(
    settled(
      app.sharing.sendApiRequest(withFailingWrites(app.database), {
        apiUrl: API,
        method: 'GET',
        path: ITEMS,
      }),
    ),
  ).rejects.toThrow('disk I/O error');

  expect(uuidsDrawn()).toHaveLength(1);
  expect(secureStoreEntries()).toEqual([]);
});

test('reports that the device ID cannot be saved even when the seed cannot be removed either', async () => {
  const app = await startOn(newPhone());
  const database = withFailingWrites(app.database);
  const failing: typeof database = {
    ...database,
    run: (sql, parameters) => {
      // The seed is in the secure store by now; from here on it cannot be taken out.
      failSecureStoreWrites();
      return database.run(sql, parameters);
    },
  };

  await expect(
    settled(
      app.sharing.sendApiRequest(failing, {
        apiUrl: API,
        method: 'GET',
        path: ITEMS,
      }),
    ),
  ).rejects.toThrow('disk I/O error');

  // The entry is left, named after a device ID nothing has, and is not used.
  expect(secureStoreEntries()).toHaveLength(1);
  secureStoreWorks();
  expect((await send(app)).outcome).toBe('answered');
  const deviceId = uuidsDrawn().at(-1)!;
  expect(uuidsDrawn()).toHaveLength(2);
  expect(await app.sharing.readDeviceIdentity(app.database)).toEqual({
    status: 'ready',
    deviceId,
  });
});

test('an answer that names another device is not "registered"', async () => {
  const app = await startOn(newPhone());
  const other = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
  apiAnswersNext('registration', 200, JSON.stringify({ deviceId: other }));

  const result = await send(app);

  expect(result.outcome).toBe('not-registered');
  expect(received().map((request) => request.path)).toEqual(['/devices']);
  // The phone registers again the next time.
  expect((await send(app)).outcome).toBe('answered');
  expect(received().map((request) => request.path)).toEqual([
    '/devices',
    '/devices',
    ITEMS,
  ]);
});

test('takes the body of a refusal for one only under the status of that refusal', async () => {
  const app = await registeredApp();
  const before = received().length;
  const clock = JSON.stringify({ error: 'clock', serverTimeMs: T + HOUR });
  const tooMany = JSON.stringify({
    error: 'too-many-requests',
    retryAfterMs: 5_000,
  });
  apiAnswersNext('request', 200, clock);
  apiAnswersNext('request', 429, clock);
  apiAnswersNext('request', 401, tooMany);

  const results = [await send(app), await send(app), await send(app)];

  expect(
    results.map((result) =>
      'body' in result ? [result.status, textOf(result.body)] : result,
    ),
  ).toEqual([
    [200, clock],
    [429, clock],
    [401, tooMany],
  ]);
  expect(received().slice(before)).toHaveLength(3);
  expect(await app.sharing.readClockOffsetMs(app.database)).toBe(0);
});

test('reads no refusal in an answer that is too long to be one', async () => {
  const app = await registeredApp();
  const before = received().length;
  const padded = `{"error":"clock","serverTimeMs":${T + HOUR}${' '.repeat(2000)}}`;
  apiAnswersNext('request', 401, padded);

  const result = await send(app);

  expect('body' in result && textOf(result.body)).toBe(padded);
  expect(received().slice(before)).toHaveLength(1);
  expect(await app.sharing.readClockOffsetMs(app.database)).toBe(0);
});

test('sends a request three times at most: once more for the clock and once more after waiting', async () => {
  const app = await registeredApp();
  const before = received().length;
  apiRefusesNext('request', { error: 'clock', serverTimeMs: T + HOUR });
  apiRefusesNext('request', { error: 'too-many-requests', retryAfterMs: 0 });
  apiRefusesNext('request', { error: 'clock', serverTimeMs: T + 2 * HOUR });
  apiRefusesNext('request', { error: 'too-many-requests', retryAfterMs: 0 });

  const result = await send(app);

  expect('body' in result && textOf(result.body)).toBe(
    JSON.stringify({ error: 'clock', serverTimeMs: T + 2 * HOUR }),
  );
  expect(
    received()
      .slice(before)
      .map((request) => request.timestamp),
  ).toEqual([String(T), String(T + HOUR), String(T + HOUR)]);
  expect(await app.sharing.readClockOffsetMs(app.database)).toBe(2 * HOUR);
});

test.each([
  ['the largest integer a request time can be', Number.MAX_SAFE_INTEGER],
  ['0', 0],
])(
  "keeps the request time within what it can be when the API's time is %s",
  async (_, serverTimeMs) => {
    const app = await registeredApp();
    apiRefusesNext('request', { error: 'clock', serverTimeMs });
    apiRefusesNext('request', { error: 'clock', serverTimeMs });
    await send(app);
    const before = received().length;

    // The phone's clock has moved on, or back, since it took that time.
    jest.setSystemTime(serverTimeMs === 0 ? T - 5_000 : T + 5_000);
    const result = await send(app);

    // It still signs and sends, so the API can put its clock right.
    expect(result.outcome).toBe('answered');
    expect(received()[before].timestamp).toBe(String(serverTimeMs));
    expect(await app.sharing.readClockOffsetMs(app.database)).toBe(0);
  },
);

test('reads the device identity from the local data each time, so data replaced meanwhile is what counts', async () => {
  const app = await registeredApp();
  const first = uuidsDrawn().at(-1)!;

  // As an import of a file with no device identity leaves the local data.
  await app.database.run('DELETE FROM device_identity');
  expect(await app.sharing.readDeviceIdentity(app.database)).toEqual({
    status: 'none',
  });
  expect((await send(app)).outcome).toBe('answered');

  const second = uuidsDrawn().at(-1)!;
  expect(second).not.toBe(first);
  expect(await app.sharing.readDeviceIdentity(app.database)).toEqual({
    status: 'ready',
    deviceId: second,
  });
  expect(registeredKeyOf(second)).toBeDefined();
  expect(secureStoreEntries()).toHaveLength(2);
});
