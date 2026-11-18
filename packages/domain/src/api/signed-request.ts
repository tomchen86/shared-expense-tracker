// What a signed request, a registration and a refusal look like on the wire (ADR-0015,
// docs/specs/sharing/spec.md). The phone and the API both use this file, so neither
// defines a header name, a body or a status of its own.

/** The four fields of a signed request, as HTTP headers. Each value is plain ASCII text. */
export const SIGNED_REQUEST_HEADERS = {
  /** The device ID: a lowercase version-4 UUID. */
  deviceId: 'x-device-id',
  /** The request time: milliseconds since the Unix epoch, in decimal. */
  timestamp: 'x-request-timestamp',
  /** The request nonce: 32 lowercase hexadecimal characters. */
  nonce: 'x-request-nonce',
  /** The Ed25519 signature of `signedRequestBytes`: 128 lowercase hexadecimal characters. */
  signature: 'x-request-signature',
} as const;

/** Where a phone registers: `POST`, with a `RegisterDeviceRequest` as JSON. */
export const DEVICES_PATH = '/devices';

/** The body of a registration. */
export interface RegisterDeviceRequest {
  /** The device's Ed25519 public key: 64 lowercase hexadecimal characters. */
  publicKey: string;
}

/** What the API answers, with status 200, once a device is registered. */
export interface RegisterDeviceResponse {
  deviceId: string;
}

/** Why the API refused a request. The body of a refusal is one of these, as JSON. */
export type Refusal =
  /** A signature field is missing or malformed, the device is unknown, or the signature does not match. */
  | { error: 'signature' }
  /** The request time is too far from the API's time, which is `serverTimeMs`. */
  | { error: 'clock'; serverTimeMs: number }
  /** The device has already used this nonce. */
  | { error: 'replayed' }
  /** The device has sent too many requests, and may send again in `retryAfterMs`. */
  | { error: 'too-many-requests'; retryAfterMs: number }
  /** The body is not what the route takes. */
  | { error: 'request' }
  /** The IP has registered too many new devices. */
  | { error: 'too-many-registrations' };

export type RefusalReason = Refusal['error'];

/** The HTTP status of each refusal. */
export const REFUSAL_STATUS: Record<RefusalReason, number> = {
  signature: 401,
  clock: 401,
  replayed: 401,
  'too-many-requests': 429,
  request: 400,
  'too-many-registrations': 429,
};

const LABEL = 'shared-expense/request/v1';
const HASH_LENGTH = 32;
const METHOD = /^[A-Z]+$/;
// What no URL parser, HTTP client or proxy rewrites on the way (ADR-0022): before the
// query, letters, digits and `-._~/`; in the query also `%?=&`.
const BEFORE_QUERY = /^\/[A-Za-z0-9\-._~/]*$/;
const QUERY = /^[A-Za-z0-9\-._~/%?=&]+$/;
const DEVICE_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const NONCE = /^[0-9a-f]{32}$/;
const PUBLIC_KEY = /^[0-9a-f]{64}$/;
const HEX = '0123456789abcdef';

function isPath(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const mark = value.indexOf('?');
  const beforeQuery = mark < 0 ? value : value.slice(0, mark);
  return (
    BEFORE_QUERY.test(beforeQuery) &&
    !beforeQuery.includes('//') &&
    beforeQuery
      .split('/')
      .every((segment) => segment !== '.' && segment !== '..') &&
    (mark < 0 || QUERY.test(value.slice(mark + 1)))
  );
}

/** A whole number of milliseconds from 0 to the largest integer a number holds exactly. */
function isTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function hexOf(bytes: Uint8Array): string {
  let text = '';
  for (let index = 0; index < bytes.length; index += 1) {
    text += HEX[bytes[index] >> 4] + HEX[bytes[index] & 15];
  }
  return text;
}

/**
 * The bytes a phone signs for a request and the API verifies (SHARING-17.1). Throws
 * when a field is not written as SHARING-18.1 says.
 */
export function signedRequestBytes(input: {
  /** The HTTP method, in capitals. */
  method: string;
  /** The path with its query, from the `/` after the host. */
  path: string;
  /** The SHA-256 of the body: 32 bytes. */
  bodyHash: Uint8Array;
  deviceId: string;
  /** The request time, in milliseconds since the Unix epoch. */
  timestampMs: number;
  /** 32 lowercase hexadecimal characters. */
  nonce: string;
}): Uint8Array {
  const { method, path, bodyHash, deviceId, timestampMs, nonce } = input;
  if (typeof method !== 'string' || !METHOD.test(method)) {
    throw new Error('The method is not one or more capital letters');
  }
  if (!isPath(path)) {
    throw new Error('The path is not written as a signed request allows');
  }
  if (!(bodyHash instanceof Uint8Array) || bodyHash.length !== HASH_LENGTH) {
    throw new Error('The body hash is not 32 bytes');
  }
  if (typeof deviceId !== 'string' || !DEVICE_ID.test(deviceId)) {
    throw new Error('The device ID is not a lowercase version-4 UUID');
  }
  if (!isTime(timestampMs)) {
    throw new Error('The request time is not a whole number of milliseconds');
  }
  if (typeof nonce !== 'string' || !NONCE.test(nonce)) {
    throw new Error('The nonce is not 32 lowercase hexadecimal characters');
  }
  // Every field above is ASCII with no line feed in it, so each is one line and each
  // character one byte.
  const text = [
    LABEL,
    method,
    path,
    hexOf(bodyHash),
    deviceId,
    String(timestampMs),
    nonce,
  ].join('\n');
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) {
    bytes[index] = text.charCodeAt(index);
  }
  return bytes;
}

/** Whether `value` is an object, as JSON has them, with exactly the keys `keys`. */
function hasExactly<Key extends string>(
  value: unknown,
  keys: readonly Key[],
): value is Record<Key, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => own.includes(key));
}

/** Whether `value` is exactly a registration's body. */
export function isRegisterDeviceRequest(
  value: unknown,
): value is RegisterDeviceRequest {
  return (
    hasExactly(value, ['publicKey']) &&
    typeof value.publicKey === 'string' &&
    PUBLIC_KEY.test(value.publicKey)
  );
}

/** Whether `value` is exactly what the API answers to a registration. */
export function isRegisterDeviceResponse(
  value: unknown,
): value is RegisterDeviceResponse {
  return (
    hasExactly(value, ['deviceId']) &&
    typeof value.deviceId === 'string' &&
    DEVICE_ID.test(value.deviceId)
  );
}

/** Whether `value` is exactly the body of a refusal. */
export function isRefusal(value: unknown): value is Refusal {
  if (hasExactly(value, ['error', 'serverTimeMs'])) {
    return value.error === 'clock' && isTime(value.serverTimeMs);
  }
  if (hasExactly(value, ['error', 'retryAfterMs'])) {
    return value.error === 'too-many-requests' && isTime(value.retryAfterMs);
  }
  return (
    hasExactly(value, ['error']) &&
    (value.error === 'signature' ||
      value.error === 'replayed' ||
      value.error === 'request' ||
      value.error === 'too-many-registrations')
  );
}
