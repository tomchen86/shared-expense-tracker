import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import {
  DEVICES_PATH,
  REFUSAL_STATUS,
  SIGNED_REQUEST_HEADERS,
  SNAPSHOT_NEEDED_BY_HEADER,
  isRefusal,
  isRegisterDeviceResponse,
  signedRequestBytes,
  type Refusal,
  type RegisterDeviceRequest,
} from '@shared-expense/domain/api';
import { getRandomValues } from 'expo-crypto';
import type { Database } from '../storage';
import {
  ensureDevice,
  readCorrectedTime,
  saveClockOffsetMs,
  saveRegistered,
  type SigningDevice,
} from './device-identity';

// The one way the phone sends a request to the API (ADR-0022): it makes and registers the
// device identity on first use, signs every request, and sends again only for the two
// refusals it can do something about.

export interface ApiRequest {
  /** Where the API is, such as `https://api.example.test`. */
  apiUrl: string;
  /** The HTTP method, in capitals. */
  method: string;
  /** The path with its query, from the `/` after the host. */
  path: string;
  /** The body to send; text is sent as its UTF-8 bytes. */
  body?: Uint8Array | string;
  /**
   * The body to send instead when the API refused the request for its clock: asked for
   * once, after the new clock offset is saved and before the one resend (SHARING-27.2).
   */
  bodyAfterClockCorrection?: () => Promise<Uint8Array | string>;
  /**
   * How long each request sent may take to be answered in full, in milliseconds: one that
   * takes longer is given up and has no answer, whatever arrives later (SYNC-97.1). Each
   * send has this long, the registration and a resend too, and no wait the API asks for
   * is part of it. Without it, a request waits as long as the platform does.
   */
  giveUpAfterMs?: number;
  /** Lets a caller distinguish a secure-store read failure from other request errors. */
  onSeedReadError?: (cause: unknown) => never;
  /** Check that the identity is still the one an operation belongs to before registering or signing. */
  checkDevice?: (deviceId: string) => void;
}

/** What became of a request. */
export type ApiResult =
  /** The API's answer, whatever its status. */
  | ({ outcome: 'answered' } & Answer)
  /** Not sent: registering this device first got this answer. */
  | { outcome: 'not-registered'; status: number; body: Uint8Array }
  /** The registration or the request got no answer. */
  | { outcome: 'no-answer' }
  /** Not sent: this phone's authorization is lost. */
  | { outcome: 'authorization-lost' };

const NONCE_LENGTH = 16;
/** The longest the API can make this phone wait before it sends again (SHARING-28.1). */
const LONGEST_WAIT_MS = 60_000;
// A refusal and a registration's answer are far shorter, and all ASCII.
const LONGEST_JSON_ANSWER = 1024;

interface Outgoing {
  apiUrl: string;
  method: string;
  path: string;
  body: Uint8Array<ArrayBuffer>;
  contentType: string;
}

interface Answer {
  status: number;
  body: Uint8Array;
  snapshotNeededBy?: string;
}

/**
 * Throws unless a request with this method and path can be signed (SHARING-18.1), before
 * anything is made or sent for it. The other fields stand in for a device's own.
 */
function assertSignable(method: string, path: string): void {
  signedRequestBytes({
    method,
    path,
    bodyHash: new Uint8Array(32),
    deviceId: '00000000-0000-4000-8000-000000000000',
    timestampMs: 0,
    nonce: '0'.repeat(32),
  });
}

/**
 * The bytes to sign and send, as a copy of their own: what is signed is what is sent,
 * whatever the caller does with its bytes meanwhile.
 */
const bytesToSend = (body: Uint8Array | string | undefined) =>
  Uint8Array.from(typeof body === 'string' ? utf8ToBytes(body) : (body ?? []));

const wait = (ms: number) =>
  ms > 0
    ? new Promise<void>((resolve) => setTimeout(resolve, ms))
    : Promise.resolve();

/** What the bytes say as JSON; undefined when they are not a short JSON text in ASCII. */
function jsonIn(bytes: Uint8Array): unknown {
  if (bytes.length > LONGEST_JSON_ANSWER || bytes.some((byte) => byte > 127)) {
    return undefined;
  }
  try {
    return JSON.parse(String.fromCharCode(...bytes));
  } catch {
    return undefined;
  }
}

/** The refusal that an answer is, when its status and its body both say so. */
function refusalIn(answer: Answer): Refusal | undefined {
  const said = jsonIn(answer.body);
  return isRefusal(said) && REFUSAL_STATUS[said.error] === answer.status
    ? said
    : undefined;
}

/**
 * Signs the request as of this moment, with the corrected time and a new nonce, and sends
 * it once (SHARING-25.1). Resolves with the API's answer, or with nothing when there was
 * none, or none in full within `giveUpAfterMs`.
 */
async function sendSigned(
  database: Database,
  device: SigningDevice,
  { apiUrl, method, path, body, contentType }: Outgoing,
  giveUpAfterMs: number | undefined,
): Promise<Answer | undefined> {
  const timestampMs = await readCorrectedTime(database);
  const nonce = bytesToHex(getRandomValues(new Uint8Array(NONCE_LENGTH)));
  const signature = device.sign(
    signedRequestBytes({
      method,
      path,
      bodyHash: sha256(body),
      deviceId: device.deviceId,
      timestampMs,
      nonce,
    }),
  );
  const headers: Record<string, string> = {
    [SIGNED_REQUEST_HEADERS.deviceId]: device.deviceId,
    [SIGNED_REQUEST_HEADERS.timestamp]: String(timestampMs),
    [SIGNED_REQUEST_HEADERS.nonce]: nonce,
    [SIGNED_REQUEST_HEADERS.signature]: bytesToHex(signature),
  };
  // Said outright: left to itself, iOS calls a body with no type a submitted form.
  if (body.length > 0) headers['content-type'] = contentType;
  return fetchAnswer(
    `${apiUrl}${path}`,
    {
      method,
      headers,
      credentials: 'omit',
      ...(body.length > 0 ? { body } : {}),
    },
    giveUpAfterMs,
  );
}

/** One HTTP exchange, including receipt of the entire body, for signed or public requests. */
export async function fetchAnswer(
  url: string,
  init: RequestInit,
  giveUpAfterMs?: number,
) {
  // Raced, not only aborted: what arrives after the limit is not used, whether or not
  // the platform's fetch stops at the signal.
  const givingUp =
    giveUpAfterMs === undefined ? undefined : new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<undefined>((resolve) => {
    if (givingUp)
      timer = setTimeout(() => {
        givingUp.abort();
        resolve(undefined);
      }, giveUpAfterMs);
  });
  try {
    return await Promise.race([
      fetch(url, {
        ...init,
        ...(givingUp && { signal: givingUp.signal }),
      }).then(async (response) => {
        const snapshotNeededBy = response.headers.get(
          SNAPSHOT_NEEDED_BY_HEADER,
        );
        return {
          status: response.status,
          body: new Uint8Array(await response.arrayBuffer()),
          ...(snapshotNeededBy !== null && { snapshotNeededBy }),
        };
      }),
      limit,
    ]);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Sends the request and resolves with the API's answer as it is, or with nothing when
 * there was none (SHARING-26.1). It sends again only after the two refusals the phone can
 * do something about, once each for a request: for the clock it takes the API's time
 * (SHARING-27.2), and for too many requests it waits as long as the API said
 * (SHARING-28.1). After the clock refusal it sends what `bodyAfterClockCorrection` gives,
 * when the caller gave one.
 */
async function exchange(
  database: Database,
  device: SigningDevice,
  request: Outgoing,
  {
    bodyAfterClockCorrection,
    giveUpAfterMs,
  }: Pick<ApiRequest, 'bodyAfterClockCorrection' | 'giveUpAfterMs'>,
): Promise<Answer | undefined> {
  let outgoing = request;
  let clockCorrected = false;
  let waited = false;
  for (;;) {
    const answer = await sendSigned(database, device, outgoing, giveUpAfterMs);
    const refusal = answer && refusalIn(answer);
    if (refusal?.error === 'clock') {
      await saveClockOffsetMs(database, refusal.serverTimeMs - Date.now());
      if (clockCorrected) return answer;
      clockCorrected = true;
      // Asked for once, and only now that the new offset is saved.
      if (bodyAfterClockCorrection) {
        outgoing = {
          ...outgoing,
          body: bytesToSend(await bodyAfterClockCorrection()),
        };
      }
    } else if (
      refusal?.error === 'too-many-requests' &&
      refusal.retryAfterMs <= LONGEST_WAIT_MS &&
      !waited
    ) {
      waited = true;
      await wait(refusal.retryAfterMs);
    } else {
      return answer;
    }
  }
}

/**
 * Registers the device (SHARING-22.1). Resolves with nothing once the API has answered
 * that it is registered and the local data records it, and otherwise with what the caller
 * is told (SHARING-23.1).
 */
async function register(
  database: Database,
  device: SigningDevice,
  { apiUrl, giveUpAfterMs }: ApiRequest,
): Promise<ApiResult | undefined> {
  const content: RegisterDeviceRequest = { publicKey: device.publicKey };
  const answer = await exchange(
    database,
    device,
    {
      apiUrl,
      method: 'POST',
      path: DEVICES_PATH,
      body: bytesToSend(JSON.stringify(content)),
      contentType: 'application/json',
    },
    { giveUpAfterMs },
  );
  if (!answer) return { outcome: 'no-answer' };
  const said = jsonIn(answer.body);
  if (
    answer.status !== 200 ||
    !isRegisterDeviceResponse(said) ||
    said.deviceId !== device.deviceId
  ) {
    return {
      outcome: 'not-registered',
      status: answer.status,
      body: answer.body,
    };
  }
  await saveRegistered(database, device.deviceId);
  return undefined;
}

// Getting a device that is ready to send is done by one request at a time, so requests
// that start together make one device identity and register it once (SHARING-20.1).
let lastTurn: Promise<unknown> = Promise.resolve();

function inTurn<T>(work: () => Promise<T>): Promise<T> {
  const turn = lastTurn.then(work);
  lastTurn = turn.catch(() => undefined);
  return turn;
}

/** Prepares a device for an encrypted request without registering it before the draft is saved. */
export function prepareSigningDevice(
  database: Database,
  onSeedReadError: (cause: unknown) => never,
) {
  return inTurn(() => ensureDevice(database, onSeedReadError));
}

/**
 * Sends a signed request to the API, making and registering this phone's device identity
 * first when it has none. Rejects when the method or the path cannot be signed, and when
 * the identity cannot be read or saved.
 */
export async function sendApiRequest(
  database: Database,
  request: ApiRequest,
): Promise<ApiResult> {
  const { apiUrl, method, path } = request;
  assertSignable(method, path);
  const body = bytesToSend(request.body);
  if (body.length > 0 && (method === 'GET' || method === 'HEAD')) {
    throw new Error(`A ${method} request cannot carry a body`);
  }

  const device = await inTurn(async (): Promise<SigningDevice | ApiResult> => {
    const ready = await ensureDevice(database, request.onSeedReadError);
    if (ready === 'lost') return { outcome: 'authorization-lost' };
    request.checkDevice?.(ready.deviceId);
    if (ready.registered) return ready;
    return (await register(database, ready, request)) ?? ready;
  });
  if ('outcome' in device) return device;

  const answer = await exchange(
    database,
    device,
    { apiUrl, method, path, body, contentType: 'application/octet-stream' },
    request,
  );
  return answer ? { outcome: 'answered', ...answer } : { outcome: 'no-answer' };
}
