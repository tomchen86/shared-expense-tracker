import {
  createHash,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  sign,
  type KeyObject,
} from 'node:crypto';
import {
  DEVICES_PATH,
  REFUSAL_STATUS,
  SIGNED_REQUEST_HEADERS,
  isRegisterDeviceResponse,
  type Refusal,
  type RegisterDeviceRequest,
} from '@shared-expense/domain/api';
import type { Sql } from '../../src/database/connect';
import { runMigrations } from '../../src/database/migrate';
import { migrations } from '../../src/migrations';
import { startServer, type NodeServer } from '../../src/node';
import { createTestDatabase, type TestDatabase } from '../support/database';

// The sharing tests stand in for phones (ADR-0015): each test gets a database of its own
// with the real migrations, served through the Node entry file, and sets the API's time
// and the address its requests come from. A phone here is a device ID and an Ed25519 key
// pair from Node's crypto, and the bytes it signs are put together in this file as
// SHARING-17.1 words them, not by the function the API itself uses.

/** 2026-11-18T06:32:00Z, the API's time when a test starts. */
export const T = 1794983520000;
/** The address requests come from unless a test says otherwise. */
export const HOME = '203.0.113.7';
export const TAYLOR = '0f8fad5b-d9cb-469f-a165-70867728950e';
export const CASEY = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
/** A path that has no route. */
export const NO_ROUTE = '/no-such-route';

// Phones

export interface Phone {
  deviceId: string;
  privateKey: KeyObject;
  /** The raw Ed25519 public key, as 64 lowercase hexadecimal characters. */
  publicKey: string;
}

/** A phone that has not registered: a new key pair, and a new device ID unless one is given. */
export function newPhone(deviceId: string = randomUUID()): Phone {
  const { privateKey } = generateKeyPairSync('ed25519');
  const { x } = createPublicKey(privateKey).export({ format: 'jwk' });
  return {
    deviceId,
    privateKey,
    publicKey: Buffer.from(x!, 'base64url').toString('hex'),
  };
}

export const newNonce = () => randomBytes(16).toString('hex');

// Requests

export interface SentRequest {
  method: string;
  /** The path with its query. */
  path: string;
  body: Uint8Array<ArrayBuffer>;
  headers: Record<string, string>;
}

const bytesOf = (body: Uint8Array | string | undefined) =>
  typeof body === 'string'
    ? new Uint8Array(Buffer.from(body, 'utf8'))
    : new Uint8Array(body ?? []);

/** The bytes to sign, as SHARING-17.1 words them. `timestamp` is written as it is given. */
export function bytesToSign(request: {
  method: string;
  path: string;
  body: Uint8Array;
  deviceId: string;
  timestamp: string;
  nonce: string;
}): Uint8Array {
  return Buffer.from(
    [
      'shared-expense/request/v1',
      request.method,
      request.path,
      createHash('sha256').update(request.body).digest('hex'),
      request.deviceId,
      request.timestamp,
      request.nonce,
    ].join('\n'),
    'latin1',
  );
}

export interface RequestInput {
  method?: string;
  path?: string;
  body?: Uint8Array | string;
  /** The request time; the API's time now unless given. */
  timestampMs?: number;
  /** The request time as it is written, when a test writes it another way than in decimal. */
  timestampText?: string;
  nonce?: string;
  /** The device ID the request names; the phone's own unless given. */
  deviceId?: string;
}

// The world a test runs in

const HASH_KEY = 'a test key for the keyed hash of an IP';

const world = {
  now: T,
  ip: HOME,
  database: undefined as TestDatabase | undefined,
  server: undefined as NodeServer | undefined,
};

export interface Answer {
  status: number;
  /** The body, parsed when it is JSON and as text when it is not. */
  body: unknown;
}

/**
 * Before each test in the calling scope: a new database with the real migrations, served
 * through the Node entry file (ADR-0007), with the API's time at T and requests coming
 * from HOME. With `ownClientIp: false` the server is left to find each request's address
 * itself, and `ipHashKey` replaces the key of the keyed hash, or with `null` takes it away.
 */
export function useSharingApi({
  ownClientIp = true,
  ipHashKey = HASH_KEY as string | null,
} = {}) {
  beforeEach(async () => {
    world.now = T;
    world.ip = HOME;
    world.database = await createTestDatabase();
    await runMigrations(world.database.sql, migrations);
    world.server = await startServer({
      databaseUrl: world.database.url,
      now: () => world.now,
      ...(ipHashKey === null ? {} : { ipHashKey }),
      ...(ownClientIp ? { clientIp: () => world.ip } : {}),
    });
  });
  afterEach(async () => {
    await world.server?.close();
    await world.database?.drop();
    world.server = undefined;
    world.database = undefined;
  });
}

/** The test's own database, for what a test cannot do or see through the API. */
export const sql = (): Sql => world.database!.sql;

/** Where the API is served, for a request `send` cannot send or an answer it cannot show. */
export const serverUrl = () => world.server!.url;

/** The API's time. */
export const now = () => world.now;

export function setTime(ms: number) {
  world.now = ms;
}

/** From now on, requests come from `ip`. */
export function comeFrom(ip: string) {
  world.ip = ip;
}

/** Sends a request as it is, signed or not. A `GET` cannot carry a body: `fetch` refuses to send one. */
export async function send(
  request: Partial<SentRequest> & { path: string },
): Promise<Answer> {
  const method = request.method ?? 'GET';
  const body = request.body ?? new Uint8Array(0);
  if (body.length > 0 && (method === 'GET' || method === 'HEAD')) {
    throw new Error(`A test cannot send a ${method} with a body`);
  }
  const response = await fetch(`${world.server!.url}${request.path}`, {
    method,
    headers: request.headers ?? {},
    ...(body.length > 0 ? { body } : {}),
  });
  const text = await response.text();
  try {
    return { status: response.status, body: JSON.parse(text) };
  } catch {
    return { status: response.status, body: text };
  }
}

/** A request `phone` signed: a `GET` of a path with no route, at the API's time, unless `input` says otherwise. */
export function signedBy(phone: Phone, input: RequestInput = {}): SentRequest {
  const method = input.method ?? 'GET';
  const path = input.path ?? NO_ROUTE;
  const body = bytesOf(input.body);
  const deviceId = input.deviceId ?? phone.deviceId;
  const timestamp =
    input.timestampText ?? String(input.timestampMs ?? world.now);
  const nonce = input.nonce ?? newNonce();
  const signature = sign(
    null,
    bytesToSign({ method, path, body, deviceId, timestamp, nonce }),
    phone.privateKey,
  ).toString('hex');
  return {
    method,
    path,
    body,
    headers: {
      [SIGNED_REQUEST_HEADERS.deviceId]: deviceId,
      [SIGNED_REQUEST_HEADERS.timestamp]: timestamp,
      [SIGNED_REQUEST_HEADERS.nonce]: nonce,
      [SIGNED_REQUEST_HEADERS.signature]: signature,
    },
  };
}

/** `request` with one of its four fields written as `value`, or left out when `value` is undefined. */
export function withField(
  request: SentRequest,
  field: keyof typeof SIGNED_REQUEST_HEADERS,
  value: string | undefined,
): SentRequest {
  const headers = { ...request.headers };
  if (value === undefined) delete headers[SIGNED_REQUEST_HEADERS[field]];
  else headers[SIGNED_REQUEST_HEADERS[field]] = value;
  return { ...request, headers };
}

export const fieldOf = (
  request: SentRequest,
  field: keyof typeof SIGNED_REQUEST_HEADERS,
) => request.headers[SIGNED_REQUEST_HEADERS[field]];

/** `hex` with its lowest bit changed. */
export const withOneBitChanged = (hex: string) =>
  hex.slice(0, -1) + (parseInt(hex.slice(-1), 16) ^ 1).toString(16);

/** A registration `phone` signed, carrying its own public key unless `input` says otherwise. */
export function registrationBy(
  phone: Phone,
  input: RequestInput & { publicKey?: string } = {},
): SentRequest {
  const body: RegisterDeviceRequest = {
    publicKey: input.publicKey ?? phone.publicKey,
  };
  return signedBy(phone, {
    method: 'POST',
    path: DEVICES_PATH,
    body: JSON.stringify(body),
    ...input,
  });
}

/** Registers `phone`, which the API accepts. */
export async function register(phone: Phone): Promise<void> {
  expectRegistered(await send(registrationBy(phone)), phone);
}

/** A phone with its own key pair that has registered. */
export async function registered(deviceId?: string): Promise<Phone> {
  const phone = newPhone(deviceId);
  await register(phone);
  return phone;
}

// Answers

export function expectRegistered(answer: Answer, phone: Phone) {
  expect(answer.status).toBe(200);
  expect(isRegisterDeviceResponse(answer.body)).toBe(true);
  expect(answer.body).toEqual({ deviceId: phone.deviceId });
}

/** The request passed every check: its path has no route, so the answer is "not found", not a refusal. */
export function expectPassed(answer: Answer) {
  expect(answer.status).toBe(404);
  expect(answer.body).not.toEqual(
    expect.objectContaining({ error: expect.anything() }),
  );
}

export function expectRefused(answer: Answer, refusal: Refusal) {
  expect(answer).toEqual({
    status: REFUSAL_STATUS[refusal.error],
    body: refusal,
  });
}

// The database

/** Every row of every table, by table: each row as JSON, sorted. */
export type Contents = Record<string, string[]>;

const readable = (value: unknown): unknown =>
  value instanceof Uint8Array
    ? `bytes:${Buffer.from(value).toString('hex')}`
    : value instanceof Date
      ? `date:${value.toISOString()}`
      : typeof value === 'bigint'
        ? `bigint:${value}`
        : value;

async function rows(): Promise<[string, Record<string, unknown>[]][]> {
  const tables = await sql()<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`;
  const all: [string, Record<string, unknown>[]][] = [];
  for (const { tablename } of tables) {
    all.push([
      tablename,
      await sql().unsafe<Record<string, unknown>[]>(
        `SELECT * FROM "${tablename.replaceAll('"', '""')}"`,
      ),
    ]);
  }
  return all;
}

/** What the database holds, to compare before and after a request. */
export async function databaseContents(): Promise<Contents> {
  return Object.fromEntries(
    (await rows()).map(([table, tableRows]) => [
      table,
      tableRows
        .map((row) =>
          JSON.stringify(
            Object.fromEntries(
              Object.entries(row)
                .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
                .map(([column, value]) => [column, readable(value)]),
            ),
          ),
        )
        .sort(),
    ]),
  );
}

/** Runs `work` and checks that the database is exactly as it was before. */
export async function leavingTheDatabaseAsItWas<R>(
  work: () => Promise<R>,
): Promise<R> {
  const before = await databaseContents();
  const result = await work();
  expect(await databaseContents()).toEqual(before);
  return result;
}

/**
 * Every value in the database in each way it could be read: text as it is, and bytes as
 * hexadecimal, as Base64 with and without padding, and one character per byte.
 */
async function everyStoredValue(): Promise<string[]> {
  const values: string[] = [];
  for (const [, tableRows] of await rows()) {
    for (const row of tableRows) {
      for (const value of Object.values(row)) {
        if (value instanceof Uint8Array) {
          const bytes = Buffer.from(value);
          values.push(
            bytes.toString('hex'),
            bytes.toString('base64'),
            bytes.toString('base64url'),
            bytes.toString('latin1'),
          );
        } else if (value instanceof Date) {
          values.push(value.toISOString());
        } else if (typeof value === 'object' && value !== null) {
          values.push(JSON.stringify(value));
        } else {
          values.push(String(value));
        }
      }
    }
  }
  return values;
}

/** How many stored values hold `bytes`, written as text, hexadecimal, Base64 or raw. */
export async function timesStored(bytes: Uint8Array | string): Promise<number> {
  const buffer = Buffer.from(
    typeof bytes === 'string' ? Buffer.from(bytes, 'utf8') : bytes,
  );
  const forms = new Set([
    buffer.toString('latin1'),
    buffer.toString('hex'),
    buffer.toString('hex').toUpperCase(),
    buffer.toString('base64'),
    buffer.toString('base64url'),
  ]);
  return (await everyStoredValue()).filter((value) =>
    [...forms].some((form) => form.length > 0 && value.includes(form)),
  ).length;
}

/** How many stored values hold the device ID, as text or as its 16 bytes. */
export const timesDeviceIdStored = async (deviceId: string) =>
  (await timesStored(deviceId)) +
  (await timesStored(Buffer.from(deviceId.replaceAll('-', ''), 'hex')));

/** How many stored values hold the phone's public key, in any writing of its 32 bytes. */
export const timesPublicKeyStored = (phone: Phone) =>
  timesStored(Buffer.from(phone.publicKey, 'hex'));

/** The plain digests someone could store in place of `text`. */
export const plainDigestsOf = (text: string | Uint8Array) =>
  ['sha256', 'sha1', 'md5'].map(
    (algorithm) => new Uint8Array(createHash(algorithm).update(text).digest()),
  );
