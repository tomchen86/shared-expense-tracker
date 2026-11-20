import type { Refusal } from '@shared-expense/domain/api';
import type { Sql } from '../database/connect';

/** How far a request time may be from the API's time, either way (SHARING-35.1). */
export const CLOCK_TOLERANCE_MS = 300_000;
// A device's requests (SHARING-37.1), and an IP's new devices (SHARING-41.1).
const REQUEST_LIMIT = 60;
const REQUEST_WINDOW_MS = 60_000;
const REGISTRATION_LIMIT = 30;
const REGISTRATION_WINDOW_MS = 3_600_000;
// The first key of a transaction-level advisory lock says what its second key stands for.
const DEVICE_LOCKS = 1;
const IP_LOCKS = 2;

/** A 32-bit key for an advisory lock, from text that starts with eight hexadecimal characters. */
const lockKey = (hex: string) => Number.parseInt(hex.slice(0, 8), 16) | 0;

/** The public key a device registered, in hexadecimal; undefined when it has not registered. */
export async function findPublicKey(
  sql: Sql,
  deviceId: string,
): Promise<string | undefined> {
  const [device] = await sql<{ public_key: string }[]>`
    SELECT encode(public_key, 'hex') AS public_key FROM devices WHERE id = ${deviceId}`;
  return device?.public_key;
}

/** A request whose signature and clock have been checked. */
export interface VerifiedRequest {
  deviceId: string;
  /** The public key that verified the signature, in hexadecimal. */
  publicKey: string;
  /** 32 lowercase hexadecimal characters. */
  nonce: string;
  timestampMs: number;
  /** The API's time. */
  now: number;
  /**
   * Set when the request is a registration: the keyed hash, in hexadecimal, of the IP it
   * came from, or undefined when the API cannot tell one.
   */
  registration?: { ipHash: string | undefined };
}

/**
 * Runs the checks that depend on what the API accepted before, in the order of
 * SHARING-31.2: replay, the device's limit, and for a new device its IP's limit. When
 * the request passes, records it, and registers its device when that is new.
 *
 * Requests of one device take turns on a lock, and so do the new devices of one IP, so
 * requests that arrive together are checked one after another. Every check comes before
 * the first write: a refused request leaves the database as it was.
 *
 * Resolves with `accepted`, with the refusal, or with `cannot-count` for a new device
 * whose IP has no keyed hash (SHARING-44.1).
 */
export function acceptRequest(
  sql: Sql,
  request: VerifiedRequest,
): Promise<'accepted' | 'cannot-count' | Refusal> {
  const { deviceId, publicKey, nonce, timestampMs, now, registration } =
    request;
  return sql.begin<'accepted' | 'cannot-count' | Refusal>(
    // Said outright, whatever the database's default is: the checks rely on each
    // statement seeing what was committed before it began.
    'isolation level read committed',
    async (transaction) => {
      // Held until the transaction ends. Each statement after it sees what the requests
      // that held the lock before this one committed.
      await transaction`
        SELECT pg_advisory_xact_lock(${DEVICE_LOCKS}, ${lockKey(deviceId)})`;
      const [device] = await transaction<
        {
          public_key: string | null;
          replayed: boolean;
          recent: number;
          oldest: string | null;
        }[]
      >`
        SELECT
          (SELECT encode(public_key, 'hex') FROM devices WHERE id = ${deviceId})
            AS public_key,
          EXISTS (
            SELECT 1 FROM device_requests
            WHERE device_id = ${deviceId}
              AND nonce = decode(${nonce}, 'hex')
              AND request_time_ms
                BETWEEN ${now - CLOCK_TOLERANCE_MS} AND ${now + CLOCK_TOLERANCE_MS}
          ) AS replayed,
          count(*)::int AS recent,
          min(accepted_at_ms) AS oldest
        FROM device_requests
        WHERE device_id = ${deviceId}
          AND accepted_at_ms > ${now - REQUEST_WINDOW_MS}`;
      // The key the signature was verified with is still this device's, or it is a
      // registration and the device is still new.
      const isNew = device.public_key === null;
      if (isNew ? !registration : device.public_key !== publicKey) {
        return { error: 'signature' };
      }
      if (device.replayed) return { error: 'replayed' };
      if (device.recent >= REQUEST_LIMIT) {
        return {
          error: 'too-many-requests',
          retryAfterMs: Number(device.oldest) + REQUEST_WINDOW_MS - now,
        };
      }
      if (isNew) {
        const ipHash = registration?.ipHash;
        if (ipHash === undefined) return 'cannot-count';
        await transaction`
          SELECT pg_advisory_xact_lock(${IP_LOCKS}, ${lockKey(ipHash)})`;
        const [ip] = await transaction<{ registered: number }[]>`
          SELECT count(*)::int AS registered FROM device_registrations
          WHERE ip_hash = decode(${ipHash}, 'hex')
            AND registered_at_ms > ${now - REGISTRATION_WINDOW_MS}`;
        if (ip.registered >= REGISTRATION_LIMIT) {
          return { error: 'too-many-registrations' };
        }
        await transaction`
          INSERT INTO devices (id, public_key)
          VALUES (${deviceId}, decode(${publicKey}, 'hex'))`;
        await transaction`
          INSERT INTO device_registrations (device_id, ip_hash, registered_at_ms)
          VALUES (${deviceId}, decode(${ipHash}, 'hex'), ${now})`;
      }
      await transaction`
        INSERT INTO device_requests (device_id, nonce, request_time_ms, accepted_at_ms)
        VALUES (${deviceId}, decode(${nonce}, 'hex'), ${timestampMs}, ${now})`;
      return 'accepted';
    },
  ) as Promise<'accepted' | 'cannot-count' | Refusal>;
}
