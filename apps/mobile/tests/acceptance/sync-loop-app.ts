import { Buffer } from 'node:buffer';
import { randomBytes, randomUUID, webcrypto } from 'node:crypto';
import * as fs from 'node:fs';
import { request as httpRequest } from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { SyncEvent, SyncStamp } from '@shared-expense/domain';
import { decrypt, encrypt } from '@shared-expense/domain/crypto';
import type { Sql } from '../../../api/src/database/connect';
import { runMigrations as runApiMigrations } from '../../../api/src/database/migrate';
import { migrations as apiMigrations } from '../../../api/src/migrations';
import { startServer, type NodeServer } from '../../../api/src/node';
import {
  createTestDatabase,
  type TestDatabase,
} from '../../../api/tests/support/database';
import { addMemberDevice } from '../../../api/tests/support/group-members';
import type { LocalIdentity } from '../../src/shell';
import type { Database } from '../../src/storage';

// The sync loop's tests run the phone's code in Node against the real API (ADR-0027): the
// API's Node entry on a port of its own, with a PostgreSQL database of its own for each
// test. A phone here is a SQLite file, a secure store and a set of the app's modules of its
// own, with no screen: a test changes its data and syncs it through what the app's
// capabilities export, as the screens do. `fetch` is the phone's only way to the API, and
// the tests stand in it: they see every request, and can cut the network, lose an answer,
// answer in the API's place, or do something at the moment an answer arrives.
//
// Until a phone can join a group (#141), the second phone starts from a copy of the first
// one's database made before the group is shared, each phone makes the group a shared
// ledger with its own device ID, the API's test support makes the second one a member
// device, and the tests put the group key in both secure stores (SYNC-66.1).
//
// The phones' clock is Jest's faked `Date`, set to the clock of the phone whose code runs;
// timers are real, since the requests are. The API's time is a number the tests set.
//
// State lives on `globalThis`: starting a phone resets Jest's modules, this one included.

/** 2026-10-30T04:00:00Z, when the groups become shared ledgers. */
export const T = Date.parse('2026-10-30T04:00:00Z');
export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
/** A minute later, where a test starts: every phone's clock and the API's time. */
export const NOW = T + MINUTE;

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');
export const toHex = hex;
export const fromHex = (text: string) =>
  new Uint8Array(Buffer.from(text, 'hex'));
export const utf8 = (text: string) => new Uint8Array(Buffer.from(text, 'utf8'));

// What the world holds

interface StoreEntry {
  value: string;
  options: Record<string, unknown>;
}

interface PhoneState {
  name: string;
  directory: string;
  file: string;
  store: Map<string, StoreEntry>;
  storeReads: 'work' | 'fail';
  clockMs: number;
}

/** A request a phone handed to `fetch`. */
export interface Sent {
  method: string;
  url: string;
  /** The path with its query. */
  path: string;
  headers: Record<string, string>;
  body: Uint8Array;
  /** The device ID it is signed as. */
  deviceId: string | null;
  /** The request time it is signed with. */
  timestamp: string | null;
  /** Whether it reached the API. */
  reached: boolean;
  /** The status of the answer the phone got, if it got one. */
  status?: number;
}

type Act =
  | { kind: 'no-answer' }
  | { kind: 'lose-answer' }
  | {
      kind: 'answer';
      status: number;
      body: string;
      headers: Record<string, string>;
    }
  | { kind: 'then'; hook: () => Promise<void> };

interface Rule {
  method: string;
  act: Act;
}

interface Draw {
  how:
    'randomUUID' | 'getRandomValues' | 'getRandomBytesAsync' | 'getRandomBytes';
  bytes: Uint8Array;
}

interface World {
  root: string;
  server?: NodeServer;
  database?: TestDatabase;
  apiTimeMs: number;
  online: boolean;
  rules: Rule[];
  log: Sent[];
  inFlight: number;
  mostInFlight: number;
  draws: Draw[];
  starting?: PhoneState;
  open: Database[];
  fetchBefore?: typeof fetch;
}

const holder = globalThis as { syncLoopWorld?: World };

function world(): World {
  if (!holder.syncLoopWorld) throw new Error('startWorld has not run');
  return holder.syncLoopWorld;
}

// The secure store, in place of `expo-secure-store`: each phone has its own

const VALID_KEY = /^[\w.-]+$/;

function storeOf(state: PhoneState) {
  const check = (key: unknown) => {
    if (typeof key !== 'string' || !VALID_KEY.test(key)) {
      throw new Error('Invalid key provided to SecureStore.');
    }
  };
  const read = (key: string) => {
    check(key);
    if (state.storeReads === 'fail') {
      throw new Error(
        'Could not read from SecureStore: user interaction is not allowed',
      );
    }
    return state.store.get(key)?.value ?? null;
  };
  const write = (key: string, value: unknown, options?: object) => {
    check(key);
    if (typeof value !== 'string') {
      throw new Error('Invalid value provided to SecureStore.');
    }
    state.store.set(key, {
      value,
      options: { ...(options as Record<string, unknown> | undefined) },
    });
  };
  return {
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
      write(key, value, options),
    getItemAsync: async (key: string) => read(key),
    deleteItemAsync: async (key: string) => {
      check(key);
      state.store.delete(key);
    },
    setItem: (key: string, value: string, options?: object) =>
      write(key, value, options),
    getItem: (key: string) => read(key),
  };
}

/** Stands in for the `expo-secure-store` module of the phone that is being started. */
export function secureStoreOfStartingPhone() {
  const { starting } = world();
  if (!starting) throw new Error('No phone is being started');
  return storeOf(starting);
}

// The random source, in place of `expo-crypto`

function draw(how: Draw['how'], length: number): Uint8Array {
  const bytes = new Uint8Array(randomBytes(length));
  world().draws.push({ how, bytes: Uint8Array.from(bytes) });
  return bytes;
}

/** Stands in for the `expo-crypto` module. */
export const randomSource = {
  randomUUID: () => {
    world().draws.push({ how: 'randomUUID', bytes: new Uint8Array(0) });
    return randomUUID();
  },
  getRandomValues: <A extends ArrayBufferView>(array: A): A => {
    new Uint8Array(array.buffer, array.byteOffset, array.byteLength).set(
      draw('getRandomValues', array.byteLength),
    );
    return array;
  },
  getRandomBytesAsync: async (length: number) =>
    draw('getRandomBytesAsync', length),
  // Answered and recorded: the app must not use it (ADR-0015).
  getRandomBytes: (length: number) => draw('getRandomBytes', length),
};

/** Whether `bytes` came, whole, out of `getRandomValues` or `getRandomBytesAsync`. */
export const drewFromTheRandomSource = (bytes: Uint8Array) =>
  world().draws.some(
    (each) =>
      (each.how === 'getRandomValues' || each.how === 'getRandomBytesAsync') &&
      hex(each.bytes).indexOf(hex(bytes)) % 2 === 0,
  );

/** The draws from `getRandomBytes`, which the app must not use. */
export const forbiddenDraws = () =>
  world().draws.filter((each) => each.how === 'getRandomBytes');

// The API

/** Where the API is. */
export const apiUrl = () => world().server!.url;

/** The API's own database, for what a test cannot see or do through the API. */
export const apiSql = (): Sql => world().database!.sql;

/** From now on the API's time is `ms`. */
export function setApiTime(ms: number) {
  world().apiTimeMs = ms;
}

// The network: every request goes through here

const noNetwork = () => new TypeError('Network request failed');

/** The headers of an answer that the phone gets: the ones that say something about the body, and the API's own. */
function headersToPass(all: Record<string, string | string[] | undefined>) {
  return Object.fromEntries(
    Object.entries(all).flatMap(([name, value]) =>
      typeof value === 'string' &&
      (name === 'content-type' ||
        name === 'cache-control' ||
        name.startsWith('x-'))
        ? [[name, value]]
        : [],
    ),
  );
}

function reach(
  sent: Sent,
): Promise<{ status: number; body: Buffer; headers: Record<string, string> }> {
  const { hostname, port } = new URL(sent.url);
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest(
      {
        hostname,
        port,
        method: sent.method,
        path: sent.path,
        headers: {
          ...sent.headers,
          ...(sent.body.length > 0
            ? { 'content-length': String(sent.body.length) }
            : {}),
        },
        agent: false,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () =>
          resolve({
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks),
            headers: headersToPass(response.headers),
          }),
        );
        response.on('error', reject);
      },
    );
    outgoing.on('error', reject);
    outgoing.end(sent.body.length > 0 ? Buffer.from(sent.body) : undefined);
  });
}

async function fetchThroughTheTests(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const state = world();
  const request = new Request(input, init);
  const url = new URL(request.url);
  const headers: Record<string, string> = {};
  request.headers.forEach((value, name) => {
    headers[name] = value;
  });
  const sent: Sent = {
    method: request.method,
    url: request.url,
    path: url.pathname + url.search,
    headers,
    body: new Uint8Array(await request.arrayBuffer()),
    deviceId: request.headers.get('x-device-id'),
    timestamp: request.headers.get('x-request-timestamp'),
    reached: false,
  };
  state.log.push(sent);
  state.inFlight += 1;
  state.mostInFlight = Math.max(state.mostInFlight, state.inFlight);
  try {
    if (!state.online || url.origin !== apiUrl()) throw noNetwork();
    // A rule is for a request of the event API, never for a registration.
    const index = url.pathname.startsWith('/groups/')
      ? state.rules.findIndex((rule) => rule.method === request.method)
      : -1;
    const act = index < 0 ? undefined : state.rules.splice(index, 1)[0].act;
    if (act?.kind === 'no-answer') throw noNetwork();
    if (act?.kind === 'answer') {
      sent.status = act.status;
      return new Response(act.body, {
        status: act.status,
        headers: act.headers,
      });
    }
    sent.reached = true;
    const answer = await reach(sent);
    if (act?.kind === 'lose-answer') throw noNetwork();
    if (act?.kind === 'then') await act.hook();
    sent.status = answer.status;
    return new Response(new Uint8Array(answer.body), {
      status: answer.status,
      headers: answer.headers,
    });
  } finally {
    state.inFlight -= 1;
  }
}

/** From now on no request reaches the API. */
export function goOffline() {
  world().online = false;
}

export function goOnline() {
  world().online = true;
}

type Method = 'GET' | 'POST' | 'PUT';

const rule = (method: Method, act: Act, times = 1) => {
  for (let count = 0; count < times; count += 1) {
    world().rules.push({ method, act });
  }
};

/** The next such request of the event API gets no answer and never reaches the API. */
export const noAnswerTo = (method: Method, times = 1) =>
  rule(method, { kind: 'no-answer' }, times);

/** The API handles the next such request, and its answer is lost on the way. */
export const loseAnswerTo = (method: Method, times = 1) =>
  rule(method, { kind: 'lose-answer' }, times);

/**
 * The tests answer the next such request in the API's place; `body` is sent as JSON unless
 * it is text, with `headers` when the answer has any.
 */
export const answerNext = (
  method: Method,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  rule(method, {
    kind: 'answer',
    status,
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers,
  });

/** Once the API has answered the next such request, `hook` runs before the phone gets the answer. */
export const whenAnswered = (method: Method, hook: () => Promise<void>) =>
  rule(method, { kind: 'then', hook });

/** Every request the phones have handed to `fetch`, in order. */
export const sent = () => world().log.slice();

/** How many requests there are so far: a mark to read later requests from. */
export const mark = () => world().log.length;

/** The most requests that were ever on their way at one moment. */
export const mostRequestsAtOnce = () => world().mostInFlight;

// Phones

export interface Phone {
  name: string;
  file: string;
  database: Database;
  identity: LocalIdentity;
  sync: typeof import('../../src/sync');
  sharing: typeof import('../../src/sharing');
  groups: typeof import('../../src/groups');
  expenses: typeof import('../../src/ledger/expenses');
  trash: typeof import('../../src/ledger/trash');
  categories: typeof import('../../src/categories/repository');
  /** The ID of Brisbane, and of Tokyo. */
  brisbane: string;
  tokyo: string;
  state: PhoneState;
}

function newState(name: string): PhoneState {
  const directory = path.join(world().root, name);
  fs.mkdirSync(directory, { recursive: true });
  return {
    name,
    directory,
    file: path.join(directory, 'app.db'),
    store: new Map(),
    storeReads: 'work',
    clockMs: T,
  };
}

/** Sets the phone's clock, and makes it the clock that runs now. */
export function setClock(phone: Pick<Phone, 'state'>, ms: number) {
  phone.state.clockMs = ms;
  jest.setSystemTime(ms);
}

/** Before code of `phone` runs: its clock is the one that runs. */
const turnTo = (phone: Pick<Phone, 'state'>) =>
  jest.setSystemTime(phone.state.clockMs);

/**
 * Starts the app's code on a phone as a new process would: nothing an earlier run kept in
 * memory is left, the modules get this phone's secure store, and the phone database has
 * the app's migrations, its local identity and its default categories.
 */
async function startOn(
  state: PhoneState,
  groups?: Pick<Phone, 'brisbane' | 'tokyo'>,
): Promise<Phone> {
  const worldState = world();
  jest.setSystemTime(state.clockMs);
  worldState.starting = state;
  jest.resetModules();
  const actual = <M extends object>(module: string) =>
    jest.requireActual<M>(module);
  const { openNodeDatabase } = actual<typeof import('../../src/storage/node')>(
    '../../src/storage/node',
  );
  const { initializeDatabase } =
    actual<typeof import('../../src/storage')>('../../src/storage');
  const { appMigrations } = actual<typeof import('../../src/shell/migrations')>(
    '../../src/shell/migrations',
  );
  const { ensureLocalIdentity } = actual<
    typeof import('../../src/shell/identity')
  >('../../src/shell/identity');
  const categories = actual<typeof import('../../src/categories/repository')>(
    '../../src/categories/repository',
  );
  const phone = {
    name: state.name,
    file: state.file,
    sync: actual<typeof import('../../src/sync')>('../../src/sync'),
    sharing: actual<typeof import('../../src/sharing')>('../../src/sharing'),
    groups: actual<typeof import('../../src/groups')>('../../src/groups'),
    expenses: actual<typeof import('../../src/ledger/expenses')>(
      '../../src/ledger/expenses',
    ),
    trash: actual<typeof import('../../src/ledger/trash')>(
      '../../src/ledger/trash',
    ),
    categories,
    state,
  };
  const database = openNodeDatabase(state.file);
  worldState.open.push(database);
  const identity = await initializeDatabase(
    database,
    appMigrations,
    false,
    async (transaction) => {
      const made = await ensureLocalIdentity(transaction);
      await categories.ensureDefaultCategories(
        transaction,
        made.personalSpaceId,
      );
      return made;
    },
  );
  return {
    ...phone,
    database,
    identity,
    brisbane: groups?.brisbane ?? '',
    tokyo: groups?.tokyo ?? '',
  };
}

/**
 * A phone of its own that has the app and nothing of the other phones' data: its personal
 * data, no group and no device identity yet. Its clock is at T.
 */
export const newPhone = (name: string): Promise<Phone> =>
  startOn(newState(name));

/** Ends the app on the phone and starts it again on the same data. */
export async function restart(phone: Phone): Promise<Phone> {
  await phone.database.close();
  return startOn(phone.state, phone);
}

/** A copy of the phone's database file as it is now, at the path it resolves with. */
export async function copyOfData(phone: Phone): Promise<string> {
  const copy = path.join(
    world().root,
    `${phone.name}-copy-${fs.readdirSync(world().root).length}.db`,
  );
  await phone.database.run('VACUUM INTO ?', [copy]);
  return copy;
}

/**
 * Puts the phone's local data back to a copy made earlier, as a restored backup does, and
 * starts the app again. The secure store is the phone's own, so the seed and the group
 * keys are still there.
 */
export async function restoreData(phone: Phone, copy: string): Promise<Phone> {
  await phone.database.close();
  fs.copyFileSync(copy, phone.file);
  return startOn(phone.state, phone);
}

/**
 * Imports the copy as the phone's own export file (backup): through the app's import, on
 * the open database, with the app still running.
 */
export async function importData(phone: Phone, copy: string): Promise<void> {
  turnTo(phone);
  const backup = jest.requireActual<typeof import('../../src/backup/import')>(
    '../../src/backup/import',
  );
  await backup.importData(phone.database, copy, (replace) =>
    phone.database.transaction(replace),
  );
}

/** The device ID of the phone's device identity. */
export async function deviceId(phone: Phone): Promise<string> {
  const identity = await phone.sharing.readDeviceIdentity(phone.database);
  if (identity.status === 'none') throw new Error('No device identity yet');
  return identity.deviceId;
}

// Group keys (SYNC-66.1, SYNC-94.1)

/** The name of the secure-store entry that holds a group's key of one key epoch. */
export const keyEntry = (groupId: string, epoch: number) =>
  `group-key.${groupId}.${epoch}`;

/**
 * Saves a group key on the phone as the app saves one (SYNC-94.1): the phone has the key,
 * and knows the key epoch.
 */
export async function saveKey(
  phone: Phone,
  groupId: string,
  epoch: number,
  key: Uint8Array,
) {
  turnTo(phone);
  await phone.sync.saveGroupKey(phone.database, { groupId, epoch, key });
}

/** What the phone's secure store holds under `name`: the value, and the settings it was written with. */
export const secureStoreEntry = (phone: Phone, name: string) =>
  phone.state.store.get(name);

/** The settings the phone's seed is kept with in the secure store. */
export async function seedSettings(phone: Phone) {
  const id = await deviceId(phone);
  const [seed] = [...phone.state.store].filter(([name]) => name.includes(id));
  if (!seed) throw new Error('The phone has no seed');
  return seed[1].options;
}

/**
 * Writes a group key straight into the phone's secure store, as the entry SYNC-66.1
 * reads. The phone is not told the key's epoch, so this is for key epoch 1, which a
 * phone's key epoch starts at.
 */
export function giveKey(
  phone: Phone,
  groupId: string,
  epoch: number,
  key: Uint8Array,
) {
  phone.state.store.set(keyEntry(groupId, epoch), {
    value: hex(key),
    options: { keychainAccessible: 1 },
  });
}

/** Writes the entry's value as it is, right or wrong. */
export function writeKeyEntry(
  phone: Phone,
  groupId: string,
  epoch: number,
  value: string,
) {
  phone.state.store.set(keyEntry(groupId, epoch), {
    value,
    options: { keychainAccessible: 1 },
  });
}

export function takeKey(phone: Phone, groupId: string, epoch: number) {
  phone.state.store.delete(keyEntry(groupId, epoch));
}

/** From now on reading the phone's secure store reports an error, as before the first unlock. */
export function failSecureStoreReads(phone: Phone) {
  phone.state.storeReads = 'fail';
}

export function secureStoreWorks(phone: Phone) {
  phone.state.storeReads = 'work';
}

/** The names of the entries in the phone's secure store. */
export const secureStoreEntries = (phone: Phone) => [
  ...phone.state.store.keys(),
];

/** Takes the device's seed out of the phone's secure store: its authorization is lost. */
export async function loseSeed(phone: Phone) {
  const id = await deviceId(phone);
  for (const key of phone.state.store.keys()) {
    if (key.includes(id)) phone.state.store.delete(key);
  }
}

// Events, as a phone running other code would make and read them

export interface Envelope {
  groupId: string;
  eventId: string;
  deviceId: string;
  epoch: number;
}

/** The associated data of an event (SYNC-67.1): five lines of ASCII joined by line feeds. */
export const associatedData = (envelope: Envelope) =>
  utf8(
    [
      'shared-expense/event/v1',
      envelope.groupId,
      envelope.eventId,
      envelope.deviceId,
      String(envelope.epoch),
    ].join('\n'),
  );

/** What `content` is as an event's plaintext: JSON with no added whitespace, in UTF-8. */
export const plaintextOf = (content: unknown) => utf8(JSON.stringify(content));

/**
 * The ciphertext of an event, in lowercase hexadecimal: `content` as JSON, or the bytes
 * themselves, under `key` and a new nonce, bound to `envelope`.
 */
export function sealed(
  key: Uint8Array,
  envelope: Envelope,
  content: unknown,
): string {
  return hex(
    encrypt({
      key,
      nonce: new Uint8Array(randomBytes(24)),
      plaintext: content instanceof Uint8Array ? content : plaintextOf(content),
      associatedData: associatedData(envelope),
    }),
  );
}

/** The plaintext of a ciphertext under `key` and these associated data; undefined when it does not open. */
export function opensWith(
  key: Uint8Array,
  data: Uint8Array,
  content: Uint8Array,
): Uint8Array | undefined {
  const result = decrypt({ key, ciphertext: content, associatedData: data });
  return result.ok ? result.plaintext : undefined;
}

/** The plaintext of an event's ciphertext under `key` and `envelope`; undefined when it does not open. */
export const opened = (
  key: Uint8Array,
  envelope: Envelope,
  content: Uint8Array,
) => opensWith(key, associatedData(envelope), content);

/** An event as the API has stored it. */
export interface Stored extends Envelope {
  sequence: number;
  receivedAtMs: number;
  content: Uint8Array;
}

/** The events the API has stored for a group, in the order of their sequence numbers. */
export async function storedEvents(groupId: string): Promise<Stored[]> {
  const rows = await apiSql()<
    {
      sequence: string;
      id: string;
      device_id: string;
      epoch: string;
      received_at_ms: string;
      content: Buffer;
    }[]
  >`
    SELECT sequence, id, device_id, epoch, received_at_ms, content
    FROM group_events WHERE group_id = ${groupId} ORDER BY sequence`;
  return rows.map((row) => ({
    groupId,
    eventId: row.id,
    deviceId: row.device_id,
    epoch: Number(row.epoch),
    sequence: Number(row.sequence),
    receivedAtMs: Number(row.received_at_ms),
    content: new Uint8Array(row.content),
  }));
}

/** What the stored events hold, opened with `key`, in order; an event that does not open is undefined. */
export async function storedContents(
  groupId: string,
  key: Uint8Array,
): Promise<(SyncEvent | undefined)[]> {
  return (await storedEvents(groupId)).map((event) => {
    const plaintext = opened(key, event, event.content);
    return plaintext === undefined
      ? undefined
      : (JSON.parse(Buffer.from(plaintext).toString('utf8')) as SyncEvent);
  });
}

/** From now on the API's key epoch of the group is `epoch`, as after a rotation (#143). */
export async function setEpoch(groupId: string, epoch: number) {
  await apiSql()`UPDATE groups SET epoch = ${epoch} WHERE id = ${groupId}`;
}

/** Makes the API count `bytes` as what the group's stored events add up to. */
export async function setStoredBytes(groupId: string, bytes: number) {
  await apiSql()`UPDATE groups SET stored_bytes = ${bytes} WHERE id = ${groupId}`;
}

export const storedBytes = async (groupId: string) =>
  Number(
    (
      await apiSql()<{ stored_bytes: string }[]>`
        SELECT stored_bytes FROM groups WHERE id = ${groupId}`
    )[0].stored_bytes,
  );

/** Whether any row of the API's database holds `text`, as it is, in hexadecimal or in Base64. */
export async function apiDatabaseHolds(text: string): Promise<boolean> {
  const sql = apiSql();
  const tables = await sql<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
  const writings = writingsOf(text);
  for (const { tablename } of tables) {
    const rows = await sql<Record<string, unknown>[]>`
      SELECT * FROM ${sql(tablename)}`;
    // Bytes as they are and in hexadecimal; everything else as text.
    const dump = rows
      .flatMap((row) => Object.values(row))
      .map((value) =>
        value instanceof Uint8Array
          ? `${hex(value)} ${Buffer.from(value).toString('latin1')}`
          : String(value),
      )
      .join('\n');
    if (writings.some((writing) => dump.includes(writing))) return true;
  }
  return false;
}

const writingsOf = (text: string) => {
  const bytes = Buffer.from(text, 'utf8');
  return [
    text,
    bytes.toString('hex'),
    bytes.toString('base64').replace(/=+$/, ''),
    bytes.toString('base64url'),
  ];
};

/** Whether a request holds `text` in its URL, its headers or its body, in any of those writings. */
export const requestHolds = (request: Sent, text: string) => {
  const whole = [
    request.url,
    JSON.stringify(request.headers),
    Buffer.from(request.body).toString('latin1'),
  ].join('\n');
  return writingsOf(text).some((writing) => whole.includes(writing));
};

// What a phone sent

const eventsPath = (groupId: string) => `/groups/${groupId}/events`;

/** The requests a phone has sent since `from`, by the device ID they are signed as. */
export async function sentBy(phone: Phone, from = 0): Promise<Sent[]> {
  const id = await deviceId(phone);
  return sent()
    .slice(from)
    .filter((request) => request.deviceId === id);
}

/** The cursors of the downloads a phone has sent for a group since `from`, in order. */
export async function downloads(
  phone: Phone,
  from = 0,
  groupId = phone.brisbane,
): Promise<string[]> {
  return (await sentBy(phone, from))
    .filter(
      (request) =>
        request.method === 'GET' &&
        request.path.startsWith(`${eventsPath(groupId)}?`),
    )
    .map((request) => request.path.slice(request.path.indexOf('?') + 1));
}

export interface Upload {
  epoch: number;
  events: { id: string; content: string }[];
  /** How many bytes the request's body is. */
  bytes: number;
  /** The request time it is signed with. */
  timestamp: string | null;
  /** The status of the answer the phone got, if it got one. */
  status?: number;
}

/** The uploads a phone has sent for a group since `from`, in order. */
export async function uploads(
  phone: Phone,
  from = 0,
  groupId = phone.brisbane,
): Promise<Upload[]> {
  return (await sentBy(phone, from))
    .filter(
      (request) =>
        request.method === 'POST' && request.path === eventsPath(groupId),
    )
    .map((request) => ({
      ...(JSON.parse(Buffer.from(request.body).toString('utf8')) as Pick<
        Upload,
        'epoch' | 'events'
      >),
      bytes: request.body.length,
      timestamp: request.timestamp,
      status: request.status,
    }));
}

/** What an uploaded event holds, opened with `key` as the phone `by` uploaded it. */
export async function uploadedContent(
  by: Phone,
  key: Uint8Array,
  upload: Upload,
  index: number,
  groupId = by.brisbane,
): Promise<SyncEvent | undefined> {
  const event = upload.events[index];
  const plaintext = opened(
    key,
    {
      groupId,
      eventId: event.id,
      deviceId: await deviceId(by),
      epoch: upload.epoch,
    },
    fromHex(event.content),
  );
  return plaintext === undefined
    ? undefined
    : (JSON.parse(Buffer.from(plaintext).toString('utf8')) as SyncEvent);
}

// Syncing

/** Syncs one of the phone's shared ledgers once, Brisbane unless another is given. */
export async function sync(
  phone: Phone,
  groupId = phone.brisbane,
): Promise<void> {
  turnTo(phone);
  await phone.sync.syncGroup(phone.database, { apiUrl: apiUrl(), groupId });
}

/** Syncs, and resolves with the error it failed with, if it failed. */
export async function trySync(
  phone: Phone,
  database: Database = phone.database,
  groupId = phone.brisbane,
): Promise<unknown> {
  turnTo(phone);
  try {
    await phone.sync.syncGroup(database, { apiUrl: apiUrl(), groupId });
    return undefined;
  } catch (error) {
    return error;
  }
}

/**
 * Sends a signed request of the phone's device, as the app's own code sends one: an
 * upload a test wrote itself, or the request that creates a group.
 */
export async function send(
  phone: Phone,
  method: string,
  requestPath: string,
  body?: unknown,
) {
  turnTo(phone);
  const result = await phone.sharing.sendApiRequest(phone.database, {
    apiUrl: apiUrl(),
    method,
    path: requestPath,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (result.outcome !== 'answered') {
    throw new Error(`The request was not answered: ${result.outcome}`);
  }
  return {
    status: result.status,
    body: JSON.parse(Buffer.from(result.body).toString('utf8')) as unknown,
  };
}

/** An event a test has encrypted itself, right or wrong, under the event ID it gives. */
export class Prepared {
  constructor(
    readonly eventId: string,
    /** The content, in lowercase hexadecimal. */
    readonly content: string,
  ) {}
}

/**
 * Uploads events the test wrote, signed by `phone`, under key epoch `epoch`, and resolves
 * with their event IDs. Each is what an event holds, which is sealed with `key` as this
 * phone's upload under a new event ID, or a `Prepared` event, which is sent as it is.
 */
export async function uploadAs(
  phone: Phone,
  key: Uint8Array,
  contents: readonly unknown[],
  { epoch = 1, groupId = phone.brisbane } = {},
): Promise<string[]> {
  const device = await deviceId(phone);
  const events = contents.map((content) => {
    if (content instanceof Prepared) {
      return { id: content.eventId, content: content.content };
    }
    const id = randomUUID();
    return {
      id,
      content: sealed(
        key,
        { groupId, eventId: id, deviceId: device, epoch },
        content,
      ),
    };
  });
  for (let start = 0; start < events.length; start += 100) {
    const answer = await send(phone, 'POST', eventsPath(groupId), {
      epoch,
      events: events.slice(start, start + 100),
    });
    if (answer.status !== 200) {
      throw new Error(
        `The upload was refused: ${answer.status} ${JSON.stringify(answer.body)}`,
      );
    }
  }
  return events.map((event) => event.id);
}

// Reading a phone

/** The events the phone has not uploaded yet for a group, in the order it wrote them. */
export async function unsent(phone: Phone, groupId = phone.brisbane) {
  return (await phone.sync.listUnsentSyncEvents(phone.database)).filter(
    (event) => event.groupId === groupId,
  );
}

/** The received events the phone did not apply, in the order they were received. */
export const refusals = (phone: Phone) =>
  phone.sync.listRefusedSyncEvents(phone.database);

/** Every row of every table of the phone database, by table: each row as JSON, sorted. */
export function everythingIn(phone: Phone): Record<string, string[]> {
  const database = new DatabaseSync(phone.file, { readOnly: true });
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
          .map((row) => JSON.stringify(row))
          .sort(),
      ]),
    );
  } finally {
    database.close();
  }
}

/** Whether any file of the phone's local data holds `bytes`: as they are, in hexadecimal or in Base64. */
export function localDataHolds(phone: Phone, bytes: Uint8Array): boolean {
  const buffer = Buffer.from(bytes);
  const writings = [
    buffer,
    Buffer.from(buffer.toString('hex')),
    Buffer.from(buffer.toString('hex').toUpperCase()),
    Buffer.from(buffer.toString('base64')),
    Buffer.from(buffer.toString('base64url')),
  ];
  return fs
    .readdirSync(phone.state.directory)
    .some((file) =>
      writings.some((writing) =>
        fs
          .readFileSync(path.join(phone.state.directory, file))
          .includes(writing),
      ),
    );
}

/** A shared ledger as every phone of it should hold it: what syncs, and nothing a phone keeps to itself. */
export interface Ledger {
  name: string;
  members: { id: string; name: string }[];
  formerMembers: { id: string; name: string }[];
  categories: { id: string; name: string; color: string; archived: boolean }[];
  /** By ID: the order of expenses on one date is each phone's own. */
  expenses: {
    id: string;
    title: string;
    date: string;
    note: string | null;
    category: { id: string; name: string; color: string };
    amountMinor: number;
    currency: string;
    payments: { participant: string; amountMinor: number }[];
    shares: { participant: string; amountMinor: number }[];
    trashed: boolean;
  }[];
}

/** The shared ledger as the phone holds it, read through what its capabilities export. */
export async function ledgerOf(
  phone: Phone,
  groupId = phone.brisbane,
): Promise<Ledger> {
  const { database } = phone;
  const group = (await phone.groups.listGroups(database)).find(
    (each) => each.id === groupId,
  );
  if (!group) throw new Error('The phone does not have the group');
  const named = ({ id, name }: { id: string; name: string }) => ({ id, name });
  return {
    name: group.name,
    members: group.members.map(named),
    formerMembers: (
      await phone.groups.listFormerMembers(database, groupId)
    ).map(named),
    categories: (await phone.categories.listCategories(database, groupId)).map(
      ({ id, name, color, isArchived }) => ({
        id,
        name,
        color,
        archived: isArchived,
      }),
    ),
    expenses: (await phone.expenses.listExpenses(database, groupId))
      .map((expense) => ({
        id: expense.id,
        title: expense.title,
        date: expense.date,
        note: expense.note ?? null,
        category: expense.category,
        amountMinor: expense.amountMinor,
        currency: expense.currency,
        payments: expense.payments,
        shares: expense.shares,
        trashed: expense.trashOrder !== undefined,
      }))
      .sort((a, b) => Number(a.id > b.id) - Number(a.id < b.id)),
  };
}

/** The titles of the group's expenses on the phone, sorted. */
export const titles = async (phone: Phone, groupId = phone.brisbane) =>
  (await ledgerOf(phone, groupId)).expenses.map(({ title }) => title).sort();

/** The member IDs of a group on the phone by name, former members included. */
export async function memberIds(phone: Phone, groupId = phone.brisbane) {
  const { members, formerMembers } = await ledgerOf(phone, groupId);
  return Object.fromEntries(
    [...members, ...formerMembers].map(({ id, name }) => [name, id]),
  ) as Record<string, string>;
}

/** A category of a group on the phone, as an expense stores it. */
export async function categoryOf(
  phone: Phone,
  name: string,
  groupId = phone.brisbane,
) {
  const found = (await ledgerOf(phone, groupId)).categories.find(
    (category) => category.name === name,
  );
  if (!found) throw new Error(`No category named ${name}`);
  return { id: found.id, name: found.name, color: found.color };
}

// Changing a phone's shared ledger, as its screens do

export interface ExpenseDetails {
  title: string;
  /** In minor units. */
  amountMinor: number;
  date: string;
  note?: string;
  category: string;
  payer: string;
  sharers: string[];
  group: string;
}

const DINNER: ExpenseDetails = {
  title: 'Dinner',
  amountMinor: 10001,
  date: '2026-10-30',
  category: 'Food & Dining',
  payer: 'Casey',
  sharers: ['Blake', 'Taylor', 'Casey'],
  group: '',
};

async function saveDetails(
  phone: Phone,
  details: ExpenseDetails,
  originalTitle?: string,
) {
  turnTo(phone);
  const groupId = details.group || phone.brisbane;
  const ids = await memberIds(phone, groupId);
  const original =
    originalTitle === undefined
      ? undefined
      : (await phone.expenses.listExpenses(phone.database, groupId)).find(
          (expense) => expense.title === originalTitle,
        );
  if (originalTitle !== undefined && !original) {
    throw new Error(`No expense titled ${originalTitle}`);
  }
  await phone.expenses.saveExpense(
    phone.database,
    phone.identity,
    {
      title: details.title,
      amountMinor: details.amountMinor,
      currency: 'USD',
      date: details.date,
      note: details.note,
      categoryId: (await categoryOf(phone, details.category, groupId)).id,
    },
    original,
    {
      groupId,
      payerId: ids[details.payer],
      participants: details.sharers.map((name) => ids[name]),
    },
  );
}

/** Adds an expense to a shared ledger: Dinner, 100.01, paid by Casey and split three ways, unless said otherwise. */
export const addExpense = (
  phone: Phone,
  details: Partial<ExpenseDetails> = {},
) => saveDetails(phone, { ...DINNER, ...details });

/** Saves the expense titled `title` with some of its details changed. */
export async function editExpense(
  phone: Phone,
  title: string,
  changes: Partial<ExpenseDetails>,
  groupId = phone.brisbane,
) {
  const ledger = await ledgerOf(phone, groupId);
  const expense = ledger.expenses.find((each) => each.title === title);
  if (!expense) throw new Error(`No expense titled ${title}`);
  const nameOf = (id: string) =>
    [...ledger.members, ...ledger.formerMembers].find(
      (member) => member.id === id,
    )!.name;
  await saveDetails(
    phone,
    {
      title: expense.title,
      amountMinor: expense.amountMinor,
      date: expense.date,
      note: expense.note ?? undefined,
      category: expense.category.name,
      payer: nameOf(expense.payments[0].participant),
      sharers: expense.shares.map((share) => nameOf(share.participant)),
      group: groupId,
      ...changes,
    },
    title,
  );
}

async function expenseId(phone: Phone, title: string, groupId: string) {
  const found = (await ledgerOf(phone, groupId)).expenses.find(
    (expense) => expense.title === title,
  );
  if (!found) throw new Error(`No expense titled ${title}`);
  return found.id;
}

export async function moveToTrash(
  phone: Phone,
  title: string,
  groupId = phone.brisbane,
) {
  turnTo(phone);
  await phone.trash.moveExpenseToTrash(
    phone.database,
    groupId,
    await expenseId(phone, title, groupId),
  );
}

export async function restoreFromTrash(
  phone: Phone,
  title: string,
  groupId = phone.brisbane,
) {
  turnTo(phone);
  await phone.trash.restoreExpense(
    phone.database,
    groupId,
    await expenseId(phone, title, groupId),
  );
}

export async function renameGroup(
  phone: Phone,
  name: string,
  groupId = phone.brisbane,
) {
  turnTo(phone);
  await phone.groups.renameGroup(phone.database, groupId, name);
}

export async function addMember(
  phone: Phone,
  name: string,
  groupId = phone.brisbane,
) {
  turnTo(phone);
  await phone.groups.addGroupMember(phone.database, groupId, name);
}

export async function renameMember(
  phone: Phone,
  from: string,
  to: string,
  groupId = phone.brisbane,
) {
  turnTo(phone);
  const ids = await memberIds(phone, groupId);
  await phone.groups.renameGroupMember(phone.database, groupId, ids[from], to);
}

export async function addCategory(
  phone: Phone,
  name: string,
  color = '#43A047',
  groupId = phone.brisbane,
) {
  turnTo(phone);
  await phone.categories.createCategory(phone.database, {
    name,
    color,
    createdByUserId: phone.identity.userId,
    spaceId: groupId,
  });
}

export async function renameCategory(
  phone: Phone,
  from: string,
  to: string,
  groupId = phone.brisbane,
) {
  turnTo(phone);
  const { id, color } = await categoryOf(phone, from, groupId);
  await phone.categories.updateCategory(phone.database, {
    id,
    name: to,
    color,
  });
}

export async function archiveCategory(
  phone: Phone,
  name: string,
  groupId = phone.brisbane,
) {
  turnTo(phone);
  const { id } = await categoryOf(phone, name, groupId);
  await phone.categories.setCategoryArchived(phone.database, id, true);
}

/** Deletes a category of a shared ledger for good. */
export async function deleteCategory(
  phone: Phone,
  name: string,
  groupId = phone.brisbane,
) {
  turnTo(phone);
  const { id } = await categoryOf(phone, name, groupId);
  await phone.categories.deleteCategory(phone.database, id);
}

// Events another phone's code would write

/** A stamp of the phone's device. */
export const stampOf = async (
  phone: Phone,
  ms: number,
  counter = 0,
): Promise<SyncStamp> => ({ ms, counter, device: await deviceId(phone) });

/**
 * The first event of an expense as `phone` would write it in a group, Brisbane unless
 * another is given: `title`, 30.00 USD on 2026-10-30, Food & Dining, paid by Casey and
 * split between Taylor and Casey.
 */
export async function created(
  phone: Phone,
  title: string,
  stamp: SyncStamp,
  groupId = phone.brisbane,
) {
  const id = randomUUID();
  const ids = await memberIds(phone, groupId);
  return {
    version: 1,
    stamp,
    type: 'expense',
    id,
    units: {
      title: { value: title },
      date: { value: '2026-10-30' },
      note: { value: null },
      category: { value: await categoryOf(phone, 'Food & Dining', groupId) },
      money: {
        value: {
          amountMinor: 3000,
          currency: 'USD',
          payments: [{ participant: ids.Casey, amountMinor: 3000 }],
          shares: [
            { participant: ids.Taylor, amountMinor: 1500 },
            { participant: ids.Casey, amountMinor: 1500 },
          ],
        },
      },
      trashed: { value: false },
    },
  };
}

// Writes that fail

const WRITE = /^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i;

/**
 * The phone's database as it is when its `nth` write from now fails, as when the app is
 * ended there or the disk is full: that statement and every later one are refused.
 * `failed()` says whether a write was refused.
 */
export function failingAtWrite(database: Database, nth: number) {
  let writes = 0;
  let refused = false;
  const refuse = (sql: string) => {
    if (WRITE.test(sql)) writes += 1;
    if (writes < nth && !refused) return undefined;
    if (!WRITE.test(sql) && !refused) return undefined;
    refused = true;
    return Promise.reject(new Error('disk I/O error'));
  };
  const guard = (
    executor: Pick<Database, 'exec' | 'run' | 'all'>,
  ): Pick<Database, 'exec' | 'run' | 'all'> => ({
    exec: (sql) => refuse(sql) ?? executor.exec(sql),
    run: (sql, parameters) => refuse(sql) ?? executor.run(sql, parameters),
    all: <R>(sql: string, parameters?: Parameters<Database['all']>[1]) =>
      (refuse(sql) as Promise<R[]> | undefined) ??
      executor.all<R>(sql, parameters),
  });
  const failing: Database = {
    ...guard(database),
    transaction: (work) =>
      database.transaction((transaction) => work(guard(transaction))),
    close: () => database.close(),
  };
  return { database: failing, failed: () => refused };
}

// Two phones in one shared ledger

export interface Setup {
  /** Taylor's phone, which created Brisbane on the API. */
  a: Phone;
  /** Casey's phone, a member device of Brisbane. */
  b: Phone;
  /** The device IDs of the two phones. */
  A: string;
  B: string;
  brisbane: string;
  tokyo: string;
  /** Brisbane's group key of key epoch 1, which both phones have. */
  key: Uint8Array;
}

export interface SetupOptions {
  /** Expenses Brisbane has before it becomes a shared ledger, by title. */
  expenses?: string[];
  /** Whether Tokyo becomes a shared ledger too, with a key of its own in both phones. */
  tokyoShared?: boolean;
  /** Whether the phones get Brisbane's key of key epoch 1. */
  keys?: boolean;
}

/**
 * Two phones in Brisbane, as the sync spec's scenarios start: Taylor created Brisbane
 * with Casey and Blake, and Tokyo beside it; both phones made Brisbane a shared ledger at
 * T, each with its own device ID; both are registered and member devices of Brisbane on
 * the API, and have the group key of key epoch 1. Every clock is at NOW, and the requests
 * this took are forgotten.
 */
export async function twoPhones(options: SetupOptions = {}): Promise<Setup> {
  const first = await startOn(newState('taylor'));
  const { saveLocalName } = jest.requireActual<
    typeof import('../../src/shell/identity')
  >('../../src/shell/identity');
  await saveLocalName(first.database, 'Taylor');
  const identity = { ...first.identity, name: 'Taylor' };
  await first.groups.createGroup(first.database, 'Brisbane', identity);
  await first.groups.createGroup(first.database, 'Tokyo', identity);
  const [brisbane, tokyo] = (await first.groups.listGroups(first.database)).map(
    (group) => group.id,
  );
  for (const groupId of [brisbane, tokyo]) {
    await first.groups.addGroupMember(first.database, groupId, 'Casey');
    await first.groups.addGroupMember(first.database, groupId, 'Blake');
  }
  const seeded: Phone = { ...first, identity, brisbane, tokyo };
  for (const title of options.expenses ?? []) {
    await addExpense(seeded, { title });
  }
  await first.database.close();

  // The second phone: the same data, as a snapshot will bring it (#139).
  const second = newState('casey');
  fs.copyFileSync(first.state.file, second.file);
  let a = await startOn(first.state, { brisbane, tokyo });
  let b = await startOn(second, { brisbane, tokyo });

  setApiTime(T);
  const shared = options.tokyoShared ? [brisbane, tokyo] : [brisbane];
  const keys: Uint8Array[] = [];
  for (const groupId of shared) {
    // The first request of each phone makes and registers its device identity.
    await send(a, 'PUT', `/groups/${groupId}`);
    await send(b, 'PUT', `/groups/${groupId}`);
    await addMemberDevice(apiSql(), { groupId, deviceId: await deviceId(b) });
    const key = new Uint8Array(randomBytes(32));
    keys.push(key);
    for (const phone of [a, b]) {
      if (options.keys !== false) giveKey(phone, groupId, 1, key);
      turnTo(phone);
      await phone.sync.shareGroup(phone.database, {
        groupId,
        device: await deviceId(phone),
      });
    }
  }
  setClock(a, NOW);
  setClock(b, NOW);
  setApiTime(NOW);
  world().log.length = 0;
  world().mostInFlight = 0;
  world().draws.length = 0;
  a = { ...a, identity };
  b = { ...b, identity };
  return {
    a,
    b,
    A: await deviceId(a),
    B: await deviceId(b),
    brisbane,
    tokyo,
    key: keys[0],
  };
}

/** Tokyo's group key, which `twoPhones` put in both phones when Tokyo is shared. */
export function keyOf(phone: Phone, groupId: string, epoch = 1): Uint8Array {
  const entry = phone.state.store.get(keyEntry(groupId, epoch));
  if (!entry) throw new Error('The phone has no such key');
  return fromHex(entry.value);
}

// Before and after each test

// Everything Jest can fake but `Date`.
const NOT_FAKED = [
  'hrtime',
  'nextTick',
  'performance',
  'queueMicrotask',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'requestIdleCallback',
  'cancelIdleCallback',
  'setImmediate',
  'clearImmediate',
  'setInterval',
  'clearInterval',
  'setTimeout',
  'clearTimeout',
] as const;

/**
 * Call from beforeEach: no phones, and the real API on a database of its own, its time at
 * T. Only `Date` is faked.
 */
export async function startWorld() {
  jest.useFakeTimers({ now: T, doNotFake: [...NOT_FAKED] });
  const state: World = {
    root: fs.mkdtempSync(path.join(os.tmpdir(), 'sync-loop-')),
    apiTimeMs: T,
    online: true,
    rules: [],
    log: [],
    inFlight: 0,
    mostInFlight: 0,
    draws: [],
    open: [],
    fetchBefore: globalThis.fetch,
  };
  holder.syncLoopWorld = state;
  state.database = await createTestDatabase();
  await runApiMigrations(state.database.sql, apiMigrations);
  state.server = await startServer({
    databaseUrl: state.database.url,
    now: () => world().apiTimeMs,
    // Without a key the API registers no device (SHARING-44.1).
    ipHashKey: 'a key for the sync loop tests',
  });
  globalThis.fetch = fetchThroughTheTests as typeof fetch;
}

/** Call from afterEach: closes the phones and the API, and deletes what they kept. */
export async function endWorld() {
  const state = holder.syncLoopWorld;
  if (!state) return;
  if (state.fetchBefore) globalThis.fetch = state.fetchBefore;
  for (const database of state.open) {
    await database.close().catch(() => undefined);
  }
  await state.server?.close();
  await state.database?.drop();
  fs.rmSync(state.root, { recursive: true, force: true });
  holder.syncLoopWorld = undefined;
  jest.useRealTimers();
}

/** A new ID and new bytes, for what a test makes of its own. */
export const randomId = () => webcrypto.randomUUID();
export const randomKey = () => new Uint8Array(randomBytes(32));

/** Adds a personal expense titled `title`, for 8.75 USD, in the first personal category. */
export async function addPersonalExpense(phone: Phone, title: string) {
  turnTo(phone);
  const [category] = await phone.categories.listCategories(
    phone.database,
    phone.identity.personalSpaceId,
  );
  await phone.expenses.saveExpense(phone.database, phone.identity, {
    title,
    amountMinor: 875,
    currency: 'USD',
    date: '2026-10-30',
    categoryId: category.id,
  });
}
