import type { Database, SqlExecutor } from '../storage';

// A phone's device identity, and the requests it signs for the API
// (docs/specs/sharing/spec.md, ADR-0015). No screen is here: the features that create
// or join a shared ledger call these.
// Stubs: the signatures are the boundary the acceptance tests use, and the implementer
// replaces the bodies.

/** What this phone has to show the API. */
export type DeviceIdentity =
  /** The phone has never needed the API. */
  | { status: 'none' }
  /** The local data has a device ID, and the secure store has its seed. */
  | { status: 'ready'; deviceId: string }
  /** The local data has a device ID whose seed the secure store does not have. */
  | { status: 'lost'; deviceId: string };

export interface ApiRequest {
  /** Where the API is, such as `https://api.example.test`. */
  apiUrl: string;
  /** The HTTP method, in capitals. */
  method: string;
  /** The path with its query, from the `/` after the host. */
  path: string;
  /** The body to send; text is sent as its UTF-8 bytes. */
  body?: Uint8Array | string;
}

/** What became of a request. */
export type ApiResult =
  /** The API's answer, whatever its status. */
  | { outcome: 'answered'; status: number; body: Uint8Array }
  /** Not sent: registering this device first got this answer. */
  | { outcome: 'not-registered'; status: number; body: Uint8Array }
  /** The registration or the request got no answer. */
  | { outcome: 'no-answer' }
  /** Not sent: this phone's authorization is lost. */
  | { outcome: 'authorization-lost' };

function notImplemented(name: string, ...inputs: unknown[]): never {
  throw new Error(`Not implemented: ${name} (${inputs.length} inputs)`);
}

/** Reads this phone's device identity without making one. Rejects when the secure store cannot be read. */
export async function readDeviceIdentity(
  database: SqlExecutor,
): Promise<DeviceIdentity> {
  return notImplemented('readDeviceIdentity', database);
}

/** The API's time minus this phone's clock, in milliseconds: 0 until the API has told. */
export async function readClockOffsetMs(
  database: SqlExecutor,
): Promise<number> {
  return notImplemented('readClockOffsetMs', database);
}

/**
 * Sends a signed request to the API, making and registering this phone's device identity
 * first when it has none. Rejects when the identity cannot be read or saved.
 */
export async function sendApiRequest(
  database: Database,
  request: ApiRequest,
): Promise<ApiResult> {
  return notImplemented('sendApiRequest', database, request);
}
