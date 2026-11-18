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

// Stubs: the signatures are the boundary the acceptance tests use, and the implementer
// replaces the bodies.

function notImplemented(name: string, ...inputs: unknown[]): never {
  throw new Error(`Not implemented: ${name} (${inputs.length} inputs)`);
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
  return notImplemented('signedRequestBytes', input);
}

/** Whether `value` is exactly a registration's body. */
export function isRegisterDeviceRequest(
  value: unknown,
): value is RegisterDeviceRequest {
  return notImplemented('isRegisterDeviceRequest', value);
}

/** Whether `value` is exactly what the API answers to a registration. */
export function isRegisterDeviceResponse(
  value: unknown,
): value is RegisterDeviceResponse {
  return notImplemented('isRegisterDeviceResponse', value);
}

/** Whether `value` is exactly the body of a refusal. */
export function isRefusal(value: unknown): value is Refusal {
  return notImplemented('isRefusal', value);
}
