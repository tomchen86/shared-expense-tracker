import {
  DEVICES_PATH,
  REFUSAL_STATUS,
  SIGNED_REQUEST_HEADERS,
  isRegisterDeviceRequest,
  signedRequestBytes,
  type Refusal,
  type RegisterDeviceResponse,
} from '@shared-expense/domain/api';
import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../app';
import { CLOCK_TOLERANCE_MS, acceptRequest, findPublicKey } from './devices';
import { fromHex } from './hex';
import { keyedIpHash } from './ip';

// The request time in decimal, with no sign, point, space or leading zero, and the
// signature's 64 bytes in lowercase hexadecimal (SHARING-32.1).
const TIMESTAMP = /^(0|[1-9][0-9]{0,15})$/;
const SIGNATURE = /^[0-9a-f]{128}$/;

const refuse = (refusal: Refusal) =>
  Response.json(refusal, { status: REFUSAL_STATUS[refusal.error] });

/**
 * The path with its query, as the request's URL writes it after the host: every runtime
 * gives a URL with a path, which is `/` at the least.
 */
const pathOf = (url: string) =>
  url.slice(url.indexOf('/', url.indexOf('://') + 3));

/** What the bytes say as JSON; undefined when they are not JSON in UTF-8. */
export function jsonOf(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return undefined;
  }
}

/** Whether `signature` is the Ed25519 signature of `message` by the key pair of `publicKey`. */
async function verifies(
  publicKey: string,
  signature: string,
  message: Uint8Array<ArrayBuffer>,
): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      fromHex(publicKey),
      'Ed25519',
      false,
      ['verify'],
    );
    return await crypto.subtle.verify(
      'Ed25519',
      key,
      fromHex(signature),
      message,
    );
  } catch {
    // Bytes that are no public key verify nothing.
    return false;
  }
}

/**
 * Runs the checks of SHARING-31.1 on a request, in their order. Resolves with the answer
 * when the request is refused or is a registration, and with nothing when it passed and
 * goes on to its route.
 */
async function check(c: Context<AppEnv>): Promise<Response | undefined> {
  const method = c.req.method;
  const path = pathOf(c.req.url);

  // The four fields.
  const deviceId = c.req.header(SIGNED_REQUEST_HEADERS.deviceId);
  const timestamp = c.req.header(SIGNED_REQUEST_HEADERS.timestamp);
  const nonce = c.req.header(SIGNED_REQUEST_HEADERS.nonce);
  const signature = c.req.header(SIGNED_REQUEST_HEADERS.signature);
  if (
    deviceId === undefined ||
    timestamp === undefined ||
    nonce === undefined ||
    signature === undefined ||
    !TIMESTAMP.test(timestamp) ||
    !SIGNATURE.test(signature)
  ) {
    return refuse({ error: 'signature' });
  }
  const timestampMs = Number(timestamp);
  const body = new Uint8Array(await c.req.arrayBuffer());
  let message: Uint8Array<ArrayBuffer>;
  try {
    // Throws for a device ID, a request time or a nonce that is not written as it must
    // be, and for a method or a path that cannot be signed (SHARING-18.1, 34.1).
    message = Uint8Array.from(
      signedRequestBytes({
        method,
        path,
        bodyHash: new Uint8Array(await crypto.subtle.digest('SHA-256', body)),
        deviceId,
        timestampMs,
        nonce,
      }),
    );
  } catch {
    return refuse({ error: 'signature' });
  }

  // The body of a registration, which carries the key that verifies it.
  const registering = method === 'POST' && path === DEVICES_PATH;
  let carried: string | undefined;
  if (registering) {
    const content = jsonOf(body);
    if (!isRegisterDeviceRequest(content)) return refuse({ error: 'request' });
    carried = content.publicKey;
  }

  // The device and its signature. A registered device's requests verify with the key it
  // registered, which is also the only key it may register again; only a registration
  // may name a device that is new.
  const registered = await findPublicKey(c.env.sql, deviceId);
  const publicKey = registered ?? carried;
  if (
    publicKey === undefined ||
    (carried !== undefined && carried !== publicKey) ||
    !(await verifies(publicKey, signature, message))
  ) {
    return refuse({ error: 'signature' });
  }

  // The clock, then what depends on the requests accepted before.
  const now = c.env.now();
  if (Math.abs(timestampMs - now) > CLOCK_TOLERANCE_MS) {
    return refuse({ error: 'clock', serverTimeMs: now });
  }
  const outcome = await acceptRequest(c.env.sql, {
    deviceId,
    publicKey,
    nonce,
    timestampMs,
    now,
    registration: registering
      ? { ipHash: await keyedIpHash(c.env.ipHashKey, c.env.clientIp) }
      : undefined,
  });
  if (outcome === 'cannot-count') {
    // SHARING-44.1. The log says what to put right, and never the address.
    console.error(
      c.env.ipHashKey
        ? 'No device was registered: the entry file gave no IP address for the request'
        : 'No device was registered: the API has no key for the IP hash, which the entry files read from IP_HASH_KEY',
    );
    return new Response('Internal Server Error', { status: 500 });
  }
  if (outcome !== 'accepted') return refuse(outcome);
  // What a route after the checks does, it does for this device.
  c.set('deviceId', deviceId);
  if (!registering) return undefined;
  const answer: RegisterDeviceResponse = { deviceId };
  return Response.json(answer);
}

/**
 * Lets a request through to the routes after it only once it has passed the checks, and
 * answers a registration itself (SHARING-31.1, 38.1). A path with no route is checked
 * too, since this runs before routing finds that out (ADR-0022).
 */
export const signedRequests = createMiddleware<AppEnv>(async (c, next) => {
  const answer = await check(c);
  if (answer) return answer;
  await next();
});
