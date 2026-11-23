import { Buffer } from 'node:buffer';
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  hkdfSync,
  verify,
  webcrypto,
} from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  DEVICES_PATH,
  REFUSAL_STATUS,
  SIGNED_REQUEST_HEADERS,
  type Refusal,
  type RefusalReason,
} from '@shared-expense/domain/api';
import type { Database } from '../../src/storage';

// The sharing tests stand in for the phone around the app's device identity (ADR-0015):
// the secure store and the random source, which the test files put in place of
// `expo-secure-store` and `expo-crypto`; the phone database, a file of the phone the test
// picks; the clock, which is Jest's; and the API, which answers `fetch` as
// docs/specs/sharing/spec.md says the real one does unless a test tells it otherwise.
// Everything a test compares with is worked out here with Node's own crypto, not with the
// code the app uses.
//
// The app reaches the API with the runtime's global `fetch`, as the spec's Purpose says,
// so that is what the API here takes the place of.
//
// The doubles keep their state on `globalThis`: starting the app again resets Jest's
// modules, this one included, and the phone must outlive that.

/** 2026-11-18T06:32:00Z, the phone's clock when a test starts. */
export const T = 1794983520000;
/** Where the API is. */
export const API = 'https://api.example.test';

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');
export const toHex = hex;
export const fromHex = (text: string) =>
  new Uint8Array(Buffer.from(text, 'hex'));
export const utf8 = (text: string) => new Uint8Array(Buffer.from(text, 'utf8'));
export const sha256 = (bytes: Uint8Array) =>
  new Uint8Array(createHash('sha256').update(bytes).digest());

// What the world holds

interface StoreEntry {
  key: string;
  value: string;
  options: Record<string, unknown>;
}

export interface Draw {
  how:
    'randomUUID' | 'getRandomValues' | 'getRandomBytesAsync' | 'getRandomBytes';
  bytes: Uint8Array;
  /** The UUID handed out, when `how` is `randomUUID`. */
  uuid?: string;
}

/** A request the API received. */
export interface Received {
  method: string;
  url: string;
  /** The path with its query. */
  path: string;
  body: Uint8Array;
  deviceId: string | null;
  timestamp: string | null;
  nonce: string | null;
  signature: string | null;
  /** The phone's clock when it arrived. */
  at: number;
}

type Behavior =
  | { kind: 'answer'; status: number; body: string | Uint8Array }
  | { kind: 'lose-answer' };

/** Which request a test means: any, a registration, any other, or the ones a function picks. */
export type When =
  'any' | 'registration' | 'request' | ((request: Received) => boolean);

/** What a route of the API answers to a request that passed the checks; undefined when the route is not its own. */
export type Route = (
  request: Received,
) => { status: number; body: string | Uint8Array } | undefined;

interface World {
  entries: Map<string, StoreEntry>;
  storeReads: 'work' | 'fail';
  storeWrites: 'work' | 'fail';
  draws: Draw[];
  drawn: number;
  nextSeeds: Uint8Array[];
  received: Received[];
  /** Every call of `fetch`, answered or not. */
  attempts: number;
  online: boolean;
  /** The API's time minus the phone's clock. */
  aheadMs: number;
  devices: Map<string, string>;
  nonces: Set<string>;
  queue: { when: When; behavior: Behavior }[];
  answers: Map<string, { status: number; body: string | Uint8Array }>;
  routes: Route[];
  publicRoutes: Route[];
  mistakes: string[];
  fetchBefore: typeof fetch | undefined;
  root: string;
  phones: number;
  databases: Database[];
}

const newWorld = (): World => ({
  entries: new Map(),
  storeReads: 'work',
  storeWrites: 'work',
  draws: [],
  drawn: 0,
  nextSeeds: [],
  received: [],
  attempts: 0,
  online: true,
  aheadMs: 0,
  devices: new Map(),
  nonces: new Set(),
  queue: [],
  answers: new Map(),
  routes: [],
  publicRoutes: [],
  mistakes: [],
  fetchBefore: undefined,
  root: '',
  phones: 0,
  databases: [],
});

const holder = globalThis as { sharingTestWorld?: World };
const world = (): World => (holder.sharingTestWorld ??= newWorld());

// The secure store, in place of `expo-secure-store`

const VALID_KEY = /^[\w.-]+$/;

const entryId = (key: string, options?: Record<string, unknown>) =>
  `${String(options?.keychainService ?? '')}\n${key}`;

function checkKey(key: unknown): asserts key is string {
  if (typeof key !== 'string' || !VALID_KEY.test(key)) {
    throw new Error(
      'Invalid key provided to SecureStore. Keys must not be empty and contain only alphanumeric characters, ".", "-", and "_".',
    );
  }
}

function storeSet(key: string, value: unknown, options?: object) {
  checkKey(key);
  if (typeof value !== 'string') {
    throw new Error(
      'Invalid value provided to SecureStore. Values must be strings; consider JSON-encoding your values if they are serializable.',
    );
  }
  if (world().storeWrites === 'fail') {
    throw new Error('Could not encrypt the value for SecureStore');
  }
  const kept = { ...(options as Record<string, unknown> | undefined) };
  world().entries.set(entryId(key, kept), { key, value, options: kept });
}

function storeGet(key: string, options?: object): string | null {
  checkKey(key);
  if (world().storeReads === 'fail') {
    throw new Error(
      'Could not read from SecureStore: user interaction is not allowed',
    );
  }
  return (
    world().entries.get(entryId(key, options as Record<string, unknown>))
      ?.value ?? null
  );
}

function storeDelete(key: string, options?: object) {
  checkKey(key);
  if (world().storeWrites === 'fail') {
    throw new Error('Could not delete the value from SecureStore');
  }
  world().entries.delete(entryId(key, options as Record<string, unknown>));
}

/** Stands in for the `expo-secure-store` module. */
export const secureStore = {
  AFTER_FIRST_UNLOCK: 0,
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 1,
  ALWAYS: 2,
  WHEN_PASSCODE_SET_THIS_DEVICE_ONLY: 3,
  ALWAYS_THIS_DEVICE_ONLY: 4,
  WHEN_UNLOCKED: 5,
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
  isAvailableAsync: async () => true,
  canUseBiometricAuthentication: () => false,
  setItemAsync: async (key: string, value: string, options?: object) =>
    storeSet(key, value, options),
  getItemAsync: async (key: string, options?: object) => storeGet(key, options),
  deleteItemAsync: async (key: string, options?: object) =>
    storeDelete(key, options),
  setItem: (key: string, value: string, options?: object) =>
    storeSet(key, value, options),
  getItem: (key: string, options?: object) => storeGet(key, options),
};

/** Every entry in the secure store. */
export const secureStoreEntries = () =>
  [...world().entries.values()].map((entry) => ({
    ...entry,
    options: { ...entry.options },
  }));

/** The secure store of a phone that has just been set up, or restored from a backup. */
export function emptySecureStore() {
  world().entries.clear();
}

export function failSecureStoreWrites() {
  world().storeWrites = 'fail';
}

/** From now on reading the secure store reports an error, as before the first unlock. */
export function failSecureStoreReads() {
  world().storeReads = 'fail';
}

export function secureStoreWorks() {
  world().storeReads = 'work';
  world().storeWrites = 'work';
}

/** Takes the entry named `key` out of the secure store. */
export function removeSecureStoreEntry(key: string) {
  for (const [id, entry] of world().entries) {
    if (entry.key === key) world().entries.delete(id);
  }
}

/** Replaces what the entry named `key` holds. */
export function writeSecureStoreEntry(key: string, value: string) {
  const entry = [...world().entries.values()].find((each) => each.key === key);
  if (!entry) throw new Error(`The secure store has no entry named ${key}`);
  entry.value = value;
}

/** Puts an entry named `key` in the secure store, set the way the app sets its own entries. */
export function addSecureStoreEntry(key: string, value: string) {
  storeSet(key, value, {
    keychainAccessible: secureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
}

// The random source, in place of `expo-crypto`

function nextBytes(length: number): Uint8Array {
  const state = world();
  state.drawn += 1;
  const bytes = new Uint8Array(length);
  for (let offset = 0, block = 0; offset < length; offset += 32, block += 1) {
    const digest = createHash('sha256')
      .update(`draw ${state.drawn} block ${block}`)
      .digest();
    bytes.set(digest.subarray(0, Math.min(32, length - offset)), offset);
  }
  return bytes;
}

function draw(how: Draw['how'], length: number): Uint8Array {
  const state = world();
  const bytes =
    length === 32 && how !== 'randomUUID' && state.nextSeeds.length > 0
      ? state.nextSeeds.shift()!
      : nextBytes(length);
  state.draws.push({ how, bytes: Uint8Array.from(bytes) });
  return Uint8Array.from(bytes);
}

function randomUUID(): string {
  const bytes = draw('randomUUID', 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const text = hex(bytes);
  const uuid = `${text.slice(0, 8)}-${text.slice(8, 12)}-${text.slice(12, 16)}-${text.slice(16, 20)}-${text.slice(20)}`;
  world().draws.at(-1)!.uuid = uuid;
  return uuid;
}

const DIGESTS: Record<string, string> = {
  'SHA-1': 'sha1',
  'SHA-256': 'sha256',
  'SHA-384': 'sha384',
  'SHA-512': 'sha512',
  MD5: 'md5',
};

function digestOf(algorithm: string, data: Uint8Array | string): Buffer {
  const name = DIGESTS[algorithm];
  if (!name) throw new Error(`expo-crypto has no digest ${algorithm}`);
  return createHash(name).update(data).digest();
}

/** Stands in for the `expo-crypto` module. */
export const randomSource = {
  CryptoDigestAlgorithm: {
    SHA1: 'SHA-1',
    SHA256: 'SHA-256',
    SHA384: 'SHA-384',
    SHA512: 'SHA-512',
    MD5: 'MD5',
  },
  CryptoEncoding: { HEX: 'hex', BASE64: 'base64' },
  randomUUID,
  getRandomValues: <A extends ArrayBufferView>(array: A): A => {
    new Uint8Array(array.buffer, array.byteOffset, array.byteLength).set(
      draw('getRandomValues', array.byteLength),
    );
    return array;
  },
  getRandomBytesAsync: async (length: number) =>
    draw('getRandomBytesAsync', length),
  // Recorded and answered: the tests look for it, since it can fall back to Math.random
  // in a development build (ADR-0015).
  getRandomBytes: (length: number) => draw('getRandomBytes', length),
  digest: async (algorithm: string, data: ArrayBufferView | ArrayBuffer) => {
    const bytes = ArrayBuffer.isView(data)
      ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
      : new Uint8Array(data);
    const digest = digestOf(algorithm, bytes);
    return digest.buffer.slice(
      digest.byteOffset,
      digest.byteOffset + digest.byteLength,
    );
  },
  digestStringAsync: async (
    algorithm: string,
    data: string,
    options?: { encoding?: string },
  ) =>
    digestOf(algorithm, data).toString(
      options?.encoding === 'base64' ? 'base64' : 'hex',
    ),
};

/** Every draw from the random source, in order. */
export const draws = () => world().draws.slice();

/** The UUIDs `randomUUID` has handed out, in order. */
export const uuidsDrawn = () =>
  world()
    .draws.filter((each) => each.how === 'randomUUID')
    .map((each) => each.uuid!);

/** The draws from `getRandomBytes`, which the app must not use. */
export const forbiddenDraws = () =>
  world().draws.filter((each) => each.how === 'getRandomBytes');

const holds = (whole: Uint8Array, part: Uint8Array) =>
  hex(whole).indexOf(hex(part)) % 2 === 0;

/** Whether `bytes` came, whole, out of `getRandomValues` or `getRandomBytesAsync`. */
export const drewFromTheRandomSource = (bytes: Uint8Array) =>
  bytes.length > 0 &&
  world().draws.some(
    (each) =>
      (each.how === 'getRandomValues' || each.how === 'getRandomBytesAsync') &&
      holds(each.bytes, bytes),
  );

/** The next 32 bytes the app asks the random source for are `seed`. */
export function nextSeedIs(seed: Uint8Array) {
  world().nextSeeds.push(Uint8Array.from(seed));
}

// Keys, worked out with Node's crypto

const PKCS8_ED25519 = Buffer.from('302e020100300506032b657004220420', 'hex');

/** The signing secret key SHARING-21.1 derives from a seed. */
export const signingKeyOf = (seed: Uint8Array) =>
  new Uint8Array(
    hkdfSync(
      'sha256',
      seed,
      new Uint8Array(32),
      Buffer.from('shared-expense/device/signing/v1', 'utf8'),
      32,
    ),
  );

/** The Ed25519 public key of a 32-byte secret key, in hexadecimal. */
export function publicKeyOf(secretKey: Uint8Array): string {
  const key = createPrivateKey({
    key: Buffer.concat([PKCS8_ED25519, secretKey]),
    format: 'der',
    type: 'pkcs8',
  });
  const { x } = createPublicKey(key).export({ format: 'jwk' });
  return Buffer.from(x!, 'base64url').toString('hex');
}

/**
 * The seed whose signing key has the public key `publicKey`: 32 bytes in a row that
 * `getRandomValues` or `getRandomBytesAsync` handed out. Undefined when there is none.
 */
export function seedBehind(publicKey: string): Uint8Array | undefined {
  for (const each of world().draws) {
    if (each.how !== 'getRandomValues' && each.how !== 'getRandomBytesAsync')
      continue;
    for (let start = 0; start + 32 <= each.bytes.length; start += 1) {
      const seed = each.bytes.subarray(start, start + 32);
      if (publicKeyOf(signingKeyOf(seed)) === publicKey) {
        return Uint8Array.from(seed);
      }
    }
  }
  return undefined;
}

// The API, in place of `fetch`

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TIME = /^(0|[1-9][0-9]{0,15})$/;
const NONCE = /^[0-9a-f]{32}$/;
const SIGNATURE = /^[0-9a-f]{128}$/;
const PUBLIC_KEY = /^[0-9a-f]{64}$/;

export const isRegistration = (request: Received) =>
  request.method === 'POST' && request.path === DEVICES_PATH;

/** The bytes a request's signature has to cover, as SHARING-17.1 words them. */
export const bytesToSign = (request: Received) =>
  new Uint8Array(
    Buffer.from(
      [
        'shared-expense/request/v1',
        request.method,
        request.path,
        hex(sha256(request.body)),
        request.deviceId,
        request.timestamp,
        request.nonce,
      ].join('\n'),
      'latin1',
    ),
  );

/** Whether Web Crypto's Ed25519 verifies the request's signature with `publicKey`. */
export async function verifies(
  request: Received,
  publicKey: string,
): Promise<boolean> {
  if (!SIGNATURE.test(request.signature ?? '') || !PUBLIC_KEY.test(publicKey))
    return false;
  try {
    const key = await webcrypto.subtle.importKey(
      'raw',
      Buffer.from(publicKey, 'hex'),
      'Ed25519',
      false,
      ['verify'],
    );
    return await webcrypto.subtle.verify(
      'Ed25519',
      key,
      Buffer.from(request.signature!, 'hex'),
      bytesToSign(request),
    );
  } catch {
    return false;
  }
}

const SPKI_ED25519 = Buffer.from('302a300506032b6570032100', 'hex');

/** The same check with Node's own Ed25519, which needs no turn of the event loop. */
function verifiesNow(request: Received, publicKey: string): boolean {
  try {
    return verify(
      null,
      bytesToSign(request),
      createPublicKey({
        key: Buffer.concat([SPKI_ED25519, Buffer.from(publicKey, 'hex')]),
        format: 'der',
        type: 'spki',
      }),
      Buffer.from(request.signature!, 'hex'),
    );
  } catch {
    return false;
  }
}

/** The public key a registration carries, when its body is exactly one. */
export function publicKeyIn(request: Received): string | undefined {
  try {
    const body: unknown = JSON.parse(
      Buffer.from(request.body).toString('utf8'),
    );
    if (
      typeof body === 'object' &&
      body !== null &&
      !Array.isArray(body) &&
      Object.keys(body).length === 1 &&
      'publicKey' in body &&
      typeof body.publicKey === 'string' &&
      PUBLIC_KEY.test(body.publicKey)
    ) {
      return body.publicKey;
    }
  } catch {
    // Not JSON.
  }
  return undefined;
}

const refusalAnswer = (refusal: Refusal) => ({
  status: REFUSAL_STATUS[refusal.error],
  body: JSON.stringify(refusal),
});

/** The API's time now. */
export const apiTime = () => Date.now() + world().aheadMs;

/**
 * What the API answers when no test has told it otherwise: a public route's answer,
 * whatever the request's four fields say, and for every other request SHARING-31.2 to
 * 38.1, without the limits.
 */
function answerOf(request: Received): {
  status: number;
  body: string | Uint8Array;
} {
  const state = world();
  for (const route of state.publicRoutes) {
    const answer = route(request);
    if (answer) return answer;
  }
  if (
    !UUID.test(request.deviceId ?? '') ||
    !TIME.test(request.timestamp ?? '') ||
    !NONCE.test(request.nonce ?? '') ||
    !SIGNATURE.test(request.signature ?? '')
  ) {
    return refusalAnswer({ error: 'signature' });
  }
  const deviceId = request.deviceId!;
  let publicKey = state.devices.get(deviceId);
  if (isRegistration(request)) {
    const carried = publicKeyIn(request);
    if (carried === undefined) return refusalAnswer({ error: 'request' });
    if (publicKey !== undefined && publicKey !== carried) {
      return refusalAnswer({ error: 'signature' });
    }
    publicKey = carried;
  }
  if (publicKey === undefined || !verifiesNow(request, publicKey)) {
    return refusalAnswer({ error: 'signature' });
  }
  const serverTimeMs = apiTime();
  if (Math.abs(Number(request.timestamp) - serverTimeMs) > 300_000) {
    return refusalAnswer({ error: 'clock', serverTimeMs });
  }
  const used = `${deviceId} ${request.nonce}`;
  if (state.nonces.has(used)) return refusalAnswer({ error: 'replayed' });
  state.nonces.add(used);
  if (isRegistration(request)) {
    state.devices.set(deviceId, publicKey);
    return { status: 200, body: JSON.stringify({ deviceId }) };
  }
  const told = state.answers.get(`${request.method} ${request.path}`);
  if (told) return told;
  for (const route of state.routes) {
    const answer = route(request);
    if (answer) return answer;
  }
  return { status: 200, body: '{}' };
}

const noNetwork = () => new TypeError('Network request failed');

/** A response as `fetch` gives it; a status that allows no body gets none. */
const responseOf = (status: number, body: string | Uint8Array) =>
  new Response(
    [204, 205, 304].includes(status)
      ? null
      : typeof body === 'string'
        ? body
        : new Uint8Array(body),
    { status },
  );

async function fetchFromTheApi(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const state = world();
  state.attempts += 1;
  if (!state.online) throw noNetwork();
  let request: Request;
  try {
    request = new Request(input, init);
  } catch (error) {
    state.mistakes.push(`The app made a request fetch cannot send: ${error}`);
    throw error;
  }
  const url = new URL(request.url);
  if (url.origin !== API) {
    state.mistakes.push(`The app sent a request to ${url.origin}`);
    throw noNetwork();
  }
  const header = (name: string) => request.headers.get(name);
  const received: Received = {
    method: request.method,
    url: request.url,
    path: url.pathname + url.search,
    body: new Uint8Array(await request.arrayBuffer()),
    deviceId: header(SIGNED_REQUEST_HEADERS.deviceId),
    timestamp: header(SIGNED_REQUEST_HEADERS.timestamp),
    nonce: header(SIGNED_REQUEST_HEADERS.nonce),
    signature: header(SIGNED_REQUEST_HEADERS.signature),
    at: Date.now(),
  };
  state.received.push(received);
  const kind: When = isRegistration(received) ? 'registration' : 'request';
  const index = state.queue.findIndex(({ when }) =>
    typeof when === 'function'
      ? when(received)
      : when === 'any' || when === kind,
  );
  const told = index < 0 ? undefined : state.queue.splice(index, 1)[0].behavior;
  if (told?.kind === 'answer') {
    return responseOf(told.status, told.body);
  }
  const answer = answerOf(received);
  if (told?.kind === 'lose-answer') throw noNetwork();
  // The answer to a HEAD carries no body.
  return responseOf(
    answer.status,
    request.method === 'HEAD' ? '' : answer.body,
  );
}

/** Every request the API has received, in order. */
export const received = () => world().received.slice();

/** The requests the API has received that are not registrations. */
export const requestsReceived = () =>
  world().received.filter((each) => !isRegistration(each));

export const registrationsReceived = () =>
  world().received.filter(isRegistration);

/** How many times the app has called `fetch`, answered or not. */
export const fetchCalls = () => world().attempts;

/** The public key the API has registered for a device. */
export const registeredKeyOf = (deviceId: string) =>
  world().devices.get(deviceId);

export function goOffline() {
  world().online = false;
}

export function goOnline() {
  world().online = true;
}

/** From now on the API's time is the phone's clock plus `ms`. */
export function apiIsAhead(ms: number) {
  world().aheadMs = ms;
}

/** What the API answers to `method` `path` once the request has passed its checks. */
export function apiAnswers(
  method: string,
  pathWithQuery: string,
  status: number,
  body: string | Uint8Array,
) {
  world().answers.set(`${method} ${pathWithQuery}`, { status, body });
}

/** Gives the API a route: what it answers to the requests the route takes, once they have passed its checks. */
export function apiRoutes(route: Route) {
  world().routes.push(route);
}

/**
 * Gives the API a public route (SHARING-31.2): what it answers to the requests the route
 * takes, signed or not, before any check.
 */
export function apiPublicRoutes(route: Route) {
  world().publicRoutes.push(route);
}

/** The API answers the next such request with this status and body, whatever the request is. */
export function apiAnswersNext(
  when: When,
  status: number,
  body: string | Uint8Array,
) {
  world().queue.push({ when, behavior: { kind: 'answer', status, body } });
}

/**
 * The API refuses the next such request with `body`, which a test may write wrongly on
 * purpose, under the status of the refusal `reason`.
 */
export function apiRefusesNext(
  when: When,
  body: Refusal | Record<string, unknown>,
  reason: RefusalReason = (body as Refusal).error,
) {
  apiAnswersNext(when, REFUSAL_STATUS[reason], JSON.stringify(body));
}

/** The API handles the next such request, and its answer is lost on the way. */
export function apiLosesNextAnswer(when: When) {
  world().queue.push({ when, behavior: { kind: 'lose-answer' } });
}

/** What the app did that no phone could do; empty when all is well. */
export const mistakes = () => world().mistakes.slice();

// Phones and the app

export interface Phone {
  /** The directory that holds the phone database and whatever SQLite keeps beside it. */
  directory: string;
  /** The phone database file. */
  database: string;
}

/** A phone on which the app has never started. Its secure store is the one every phone in a test shares. */
export function newPhone(): Phone {
  const state = world();
  state.phones += 1;
  const directory = path.join(state.root, `phone-${state.phones}`);
  fs.mkdirSync(directory, { recursive: true });
  return { directory, database: path.join(directory, 'app.db') };
}

/** A phone whose database is a copy of `phone`'s, as a restored backup is. */
export function restoredFrom(phone: Phone): Phone {
  const copy = newPhone();
  for (const file of fs.readdirSync(phone.directory)) {
    fs.copyFileSync(
      path.join(phone.directory, file),
      path.join(copy.directory, file),
    );
  }
  return copy;
}

export type Sharing = typeof import('../../src/sharing');

export interface App {
  database: Database;
  sharing: Sharing;
  close(): Promise<void>;
}

/**
 * Starts the app's code on `phone` as a new process would: nothing the last run kept in
 * memory is left, and the phone database has the app's migrations.
 */
export async function startOn(phone: Phone): Promise<App> {
  jest.resetModules();
  const { openNodeDatabase } = jest.requireActual<
    typeof import('../../src/storage/node')
  >('../../src/storage/node');
  const { runMigrations } =
    jest.requireActual<typeof import('../../src/storage')>('../../src/storage');
  const { appMigrations } = jest.requireActual<
    typeof import('../../src/shell/migrations')
  >('../../src/shell/migrations');
  const sharing = jest.requireActual<Sharing>('../../src/sharing');
  const database = openNodeDatabase(phone.database);
  world().databases.push(database);
  await runMigrations(database, appMigrations);
  return { database, sharing, close: () => database.close() };
}

const WRITE = /^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i;

/** `database` as it is when the phone cannot write: every statement that changes a row fails. */
export function withFailingWrites(database: Database): Database {
  const refuse = (sql: string) =>
    WRITE.test(sql) ? Promise.reject(new Error('disk I/O error')) : undefined;
  const guard = <E extends Pick<Database, 'exec' | 'run' | 'all'>>(
    executor: E,
  ): Pick<Database, 'exec' | 'run' | 'all'> => ({
    exec: (sql) => refuse(sql) ?? executor.exec(sql),
    run: (sql, parameters) => refuse(sql) ?? executor.run(sql, parameters),
    all: <R>(sql: string, parameters?: Parameters<Database['all']>[1]) =>
      (refuse(sql) as Promise<R[]> | undefined) ??
      executor.all<R>(sql, parameters),
  });
  return {
    ...guard(database),
    transaction: (work) =>
      database.transaction((transaction) => work(guard(transaction))),
    close: () => database.close(),
  };
}

/** Every row of every table of a phone database, by table: each row as JSON, sorted. */
export function localDataOf(phone: Phone): Record<string, string[]> {
  const database = new DatabaseSync(phone.database, { readOnly: true });
  try {
    const tables = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      )
      .all() as { name: string }[];
    return Object.fromEntries(
      tables.map(({ name }) => [
        name,
        (
          database
            .prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`)
            .all() as Record<string, unknown>[]
        )
          .map((row) =>
            JSON.stringify(row, (_, value: unknown) =>
              value instanceof Uint8Array ? `bytes:${hex(value)}` : value,
            ),
          )
          .sort(),
      ]),
    );
  } finally {
    database.close();
  }
}

/**
 * Whether the file at `file` holds `bytes`: as they are, in hexadecimal, or in Base64
 * with or without padding.
 */
export function fileHolds(file: string, bytes: Uint8Array): boolean {
  const buffer = Buffer.from(bytes);
  const content = fs.readFileSync(file);
  return [
    buffer,
    Buffer.from(buffer.toString('hex')),
    Buffer.from(buffer.toString('hex').toUpperCase()),
    Buffer.from(buffer.toString('base64')),
    Buffer.from(buffer.toString('base64url')),
  ].some((writing) => content.includes(writing));
}

/** Whether any file of the phone's local data holds `bytes`, in any of those writings. */
export const localDataHolds = (phone: Phone, bytes: Uint8Array): boolean =>
  fs
    .readdirSync(phone.directory)
    .some((file) => fileHolds(path.join(phone.directory, file), bytes));

/**
 * Lets the app's code run until `work` settles, without moving the phone's clock: the
 * tests fake the timers, so a wait of no time at all would otherwise never end.
 */
export async function settled<R>(work: Promise<R>): Promise<R> {
  let done = false;
  const finished = work.then(
    (value) => {
      done = true;
      return value;
    },
    (error: unknown) => {
      done = true;
      throw error;
    },
  );
  finished.catch(() => undefined);
  for (let turn = 0; !done && turn < 2000; turn += 1) {
    await jest.advanceTimersByTimeAsync(0);
  }
  if (!done) {
    throw new Error('The app is still waiting, though no time is passing');
  }
  return finished;
}

// Before and after each test

/**
 * Call from beforeEach: a world with no phones, an empty secure store, an API that knows
 * no device, and the phone's clock at T on fake timers.
 */
export function resetWorld() {
  holder.sharingTestWorld = newWorld();
  const state = world();
  state.root = fs.mkdtempSync(path.join(os.tmpdir(), 'sharing-'));
  state.fetchBefore = globalThis.fetch;
  globalThis.fetch = fetchFromTheApi as typeof fetch;
}

/** Call from afterEach: closes what the tests left open and deletes every phone. */
export async function removeWorld() {
  const state = world();
  if (state.fetchBefore) globalThis.fetch = state.fetchBefore;
  for (const database of state.databases) {
    await database.close().catch(() => undefined);
  }
  fs.rmSync(state.root, { recursive: true, force: true });
}
