import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import {
  JOIN_REQUEST_REFUSAL_STATUS,
  REFUSAL_STATUS,
  isJoinRequestRefusal,
  isJoinRequestResponse,
  isRefusal,
  type JoinRequestBody,
  type JoinRequestRefusal,
} from '@shared-expense/domain/api';
import { deriveKey, encrypt } from '@shared-expense/domain/crypto';
import { toByteArray } from 'base64-js';
import { getRandomValues } from 'expo-crypto';
import type { Database, SqlExecutor } from '../storage';
import { GIVE_UP_AFTER_MS, jsonIn } from '../sync/loop';
import { apiUrl } from './api-address';
import { prepareSigningDevice, sendApiRequest } from './api-request';
import { readDeviceIdentity, type SigningDevice } from './device-identity';
import type { InviteCredentials } from './invite-card';
import { cannotUse, wentWrong } from './join-invite';

export interface JoinRequest extends InviteCredentials {
  groupName: string;
  name: string;
  memberId: string | null;
  sent: number;
}

const connectAgain = 'Connect to the internet and try again.';
const cannotJoin = "This phone can't join a group.";
const purpose = 'shared-expense/invite/request/v1';

export function listJoinRequests(db: SqlExecutor) {
  return db.all<JoinRequest>('SELECT * FROM join_requests ORDER BY position');
}

export async function requestByCode(
  db: SqlExecutor,
  code: string,
): Promise<JoinRequest | undefined> {
  const [request] = await db.all<JoinRequest>(
    'SELECT * FROM join_requests WHERE code = ?',
    [code],
  );
  return request;
}

function encryptedBody(
  request: JoinRequest,
  userId: string,
  device: SigningDevice,
): JoinRequestBody {
  const { code, secret, name, memberId } = request;
  const bytes = utf8ToBytes(
    JSON.stringify({ name, memberId, userId, boxKey: device.boxKey }),
  );
  const plaintext = new Uint8Array(Math.ceil(bytes.length / 256) * 256);
  plaintext.set(bytes);
  plaintext.fill(0x20, bytes.length);
  return {
    request: bytesToHex(
      encrypt({
        key: deriveKey({ secret: toByteArray(secret + '='), purpose }),
        nonce: getRandomValues(new Uint8Array(24)),
        plaintext,
        associatedData: utf8ToBytes(`${purpose}\n${code}\n${device.deviceId}`),
      }),
    ),
  };
}

const refusalMessages: Record<JoinRequestRefusal['error'], string> = {
  'no-invite': cannotUse,
  'already-a-member': 'This phone is already in this group.',
  'requests-full':
    'Too many people are waiting to join this group. Try again later.',
  request: wentWrong,
};

async function exchange(
  db: Database,
  code: string,
  deviceId: string,
  method: 'PUT' | 'DELETE',
  body?: JoinRequestBody,
) {
  const url = apiUrl();
  if (!url) return 'no-answer';
  const answer = await sendApiRequest(db, {
    apiUrl: url,
    path: `/invites/${encodeURIComponent(code)}/request`,
    method,
    body: JSON.stringify(body),
    checkDevice: (signer) => {
      if (signer !== deviceId) throw new Error('The device identity changed');
    },
    giveUpAfterMs: GIVE_UP_AFTER_MS,
  });
  if (answer.outcome !== 'answered') return answer.outcome;
  const said = jsonIn(answer.body);
  if (
    answer.status === 200 &&
    isJoinRequestResponse(said) &&
    said.code === code
  )
    return 'confirmed';
  if (
    isJoinRequestRefusal(said) &&
    answer.status === JOIN_REQUEST_REFUSAL_STATUS[said.error]
  )
    return { refused: refusalMessages[said.error] };
  if (
    isRefusal(said) &&
    said.error === 'too-large' &&
    answer.status === REFUSAL_STATUS[said.error]
  )
    return { refused: wentWrong };
  return 'unexpected';
}

// Bind late replies to the original application and device even if an import replaced local data.
const sameRequest = `(code, secret, name, memberId) IS (?, ?, ?, ?)
  AND EXISTS (SELECT 1 FROM device_identity WHERE deviceId = ?)`;
const requestKey = (request: JoinRequest, deviceId: string) => [
  request.code,
  request.secret,
  request.name,
  request.memberId,
  deviceId,
];

class SeedReadError extends Error {}
export type SendResult =
  | { kind: 'blocked'; message: string }
  | { kind: 'refused'; message: string }
  | { kind: 'request'; request: JoinRequest; reason?: string };

/** The local row commits before registration or upload. An ambiguous result always leaves it retryable. */
export async function sendJoinRequest(
  db: Database,
  request: JoinRequest,
  userId: string,
  isNew: boolean,
  onStored: () => void,
): Promise<SendResult> {
  let device: SigningDevice | 'lost' | undefined;
  try {
    device = await prepareSigningDevice(db, (cause) => {
      throw new SeedReadError('Cannot read seed', { cause });
    });
  } catch (error) {
    // The ID exists even if the secure store is temporarily unreadable. Save the draft for retry.
    if (!(error instanceof SeedReadError))
      return { kind: 'blocked', message: wentWrong };
  }
  if (device === 'lost') return { kind: 'blocked', message: cannotJoin };
  if (isNew) {
    try {
      const saved = await db.run(
        `INSERT INTO join_requests (code, secret, groupName, name, memberId)
         SELECT ?, ?, ?, ?, ? FROM local_identity, device_identity
         WHERE userId = ? AND deviceId = COALESCE(?, deviceId)`,
        [
          request.code,
          request.secret,
          request.groupName,
          request.name,
          request.memberId,
          userId,
          device?.deviceId ?? null,
        ],
      );
      if (!saved.changes) return { kind: 'blocked', message: wentWrong };
      onStored();
    } catch {
      return { kind: 'blocked', message: wentWrong };
    }
  }
  try {
    if (device) {
      const result = await exchange(
        db,
        request.code,
        device.deviceId,
        'PUT',
        encryptedBody(request, userId, device),
      );
      const key = requestKey(request, device.deviceId);
      if (result === 'confirmed') {
        await db.run(
          `UPDATE join_requests SET sent = 1 WHERE ${sameRequest}`,
          key,
        );
        return { kind: 'request', request: { ...request, sent: 1 } };
      }
      if (result === 'no-answer')
        return { kind: 'request', request, reason: connectAgain };
      if (typeof result === 'object') {
        await db.run(`DELETE FROM join_requests WHERE ${sameRequest}`, key);
        return { kind: 'refused', message: result.refused };
      }
    }
  } catch {
    // A failed exchange or local write leaves the durable, unconfirmed request in place.
  }
  return { kind: 'request', request, reason: wentWrong };
}

/** A confirmed DELETE is safe to repeat if removing its local row failed. */
export async function cancelJoinRequest(
  db: Database,
  request: JoinRequest,
): Promise<string | undefined> {
  try {
    const identity = await readDeviceIdentity(db);
    if (identity.status === 'none') return wentWrong;
    if (identity.status === 'ready') {
      const answer = await exchange(
        db,
        request.code,
        identity.deviceId,
        'DELETE',
      );
      if (answer === 'no-answer') return connectAgain;
      if (answer !== 'confirmed' && answer !== 'authorization-lost')
        return wentWrong;
    }
    await db.run(
      `DELETE FROM join_requests WHERE ${sameRequest}`,
      requestKey(request, identity.deviceId),
    );
  } catch {
    return wentWrong;
  }
}
