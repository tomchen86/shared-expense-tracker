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
import { notifyApplied } from '../sync/apply';
import { GIVE_UP_AFTER_MS, jsonIn } from '../sync/loop';
import { deleteGroupKeys } from '../sync/read-only-copy';
import { apiUrl } from './api-address';
import { inDeviceTurn, sendApiRequest } from './api-request';
import {
  createDevice,
  ensureDevice,
  readDeviceIdentity,
  type SigningDevice,
} from './device-identity';
import type { InviteCredentials } from './invite-card';
import { cannotUse, wentWrong } from './join-invite';
import { discardJoinKeysForIdentityChange } from './join-keys';

export interface JoinRequest extends InviteCredentials {
  /** Its place among the phone's requests, once it is stored. */
  position?: number;
  groupName: string;
  name: string;
  memberId: string | null;
  /** Whether the request asks to take over the member, who has a phone (SHARING-320.1). */
  takeover?: boolean;
  sent: number;
  /**
   * What asking the API has found since (SHARING-210.1): that the person has to choose
   * again, or that a member approved and joining has not finished. Nothing while the
   * request is unsent or waits.
   */
  outcome?: 'choose-again' | 'approved' | null;
  /**
   * The group ID of the copy of the invite's group this phone held when the request was
   * first stored (SHARING-226.2): the only group an approval of it may replace.
   */
  copyGroupId?: string | null;
}

/**
 * What is left of a request once the phone has learned that it was declined, or that its
 * invite is gone: the group's name, until the person has seen it (SHARING-213.1).
 */
export interface EndedJoinRequest {
  position: number;
  code: null;
  groupName: string;
  outcome: 'declined' | 'invalid';
}

export const connectAgain = 'Connect to the internet and try again.';
export const alreadyIn = 'This phone is already in this group.';
const purpose = 'shared-expense/invite/request/v1';
/** What a join request's key is derived for, and what its associated data starts with (SHARING-135.2). */
export const REQUEST_PURPOSE = purpose;

type StoredJoinRequest = Omit<JoinRequest, 'takeover'> & {
  takeover: number | null;
};

function fromStored({ takeover, ...request }: StoredJoinRequest): JoinRequest {
  return { ...request, ...(takeover === 1 && { takeover: true }) };
}

/** This phone's requests in the order they were stored, those that have ended too. */
export async function listJoinRequests(db: SqlExecutor) {
  const rows = await db.all<StoredJoinRequest | EndedJoinRequest>(
    'SELECT * FROM join_requests ORDER BY position',
  );
  return rows.map((row) => (row.code === null ? row : fromStored(row)));
}

/** What is left of a request at `position` that has ended, if it has. */
export async function endedRequestAt(db: SqlExecutor, position: number) {
  const [request] = await db.all<EndedJoinRequest>(
    'SELECT * FROM join_requests WHERE position = ? AND code IS NULL',
    [position],
  );
  return request;
}

/** Deletes a request that has ended, once the person has seen what became of it. */
export async function forgetEndedRequest(db: SqlExecutor, position: number) {
  await db.run(
    'DELETE FROM join_requests WHERE position = ? AND code IS NULL',
    [position],
  );
}

export async function requestByCode(
  db: SqlExecutor,
  code: string,
): Promise<JoinRequest | undefined> {
  const [request] = await db.all<StoredJoinRequest>(
    'SELECT * FROM join_requests WHERE code = ?',
    [code],
  );
  return request && fromStored(request);
}

function encryptedBody(
  request: JoinRequest,
  userId: string,
  device: SigningDevice,
): JoinRequestBody {
  const { code, secret, name, memberId } = request;
  const bytes = utf8ToBytes(
    JSON.stringify({
      name,
      memberId,
      userId,
      boxKey: device.boxKey,
      ...(request.takeover && { takeover: true }),
    }),
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
  'already-a-member': alreadyIn,
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
    return { refused: said.error };
  if (
    isRefusal(said) &&
    said.error === 'too-large' &&
    answer.status === REFUSAL_STATUS[said.error]
  )
    return { refused: 'request' as const };
  return 'unexpected';
}

// Bind late replies to the original application and device even if an import replaced local data.
const sameRequest = `(code, secret, name, memberId, takeover) IS (?, ?, ?, ?, ?)
  AND EXISTS (SELECT 1 FROM device_identity WHERE deviceId = ?)`;
const requestKey = (request: JoinRequest, deviceId: string) => [
  request.code,
  request.secret,
  request.name,
  request.memberId,
  request.takeover ? 1 : null,
  deviceId,
];

/** Replace a lapsed identity in its device turn, after clearing the discarded requests' keys. */
async function replaceLapsedJoinDevice(
  db: Database,
  previousId: string,
  retryCode: string | null,
) {
  const discarded = await db.all<{ code: string }>(
    'SELECT code FROM join_requests WHERE code IS NOT NULL AND code IS NOT ? ORDER BY position',
    [retryCode],
  );
  const codes = discarded.map(({ code }) => code);
  await discardJoinKeysForIdentityChange(codes);
  let copies: { groupId: string; epoch: number }[] = [];
  const device = await createDevice((deviceId) =>
    db.transaction(async (tx) => {
      copies = await tx.all(
        'SELECT groupId, epoch FROM sync_groups WHERE readOnly IS NULL',
      );
      await tx.run(
        "UPDATE sync_groups SET readOnly = 'lapsed' WHERE readOnly IS NULL",
      );
      await tx.run(
        'DELETE FROM join_requests WHERE code IS NULL OR code IN (SELECT value FROM json_each(?))',
        [JSON.stringify(codes)],
      );
      // An import or a new request since the secure-store cleanup invalidates this change.
      const saved = await tx.run(
        `UPDATE device_identity SET deviceId = ?, registered = 0 WHERE deviceId = ?
         AND NOT EXISTS (SELECT 1 FROM join_requests WHERE code IS NOT ?)`,
        [deviceId, previousId, retryCode],
      );
      if (!saved.changes)
        throw new Error('The device or its join requests changed');
    }),
  );
  for (const { groupId, epoch } of copies) {
    await deleteGroupKeys(groupId, epoch);
    notifyApplied(db, groupId);
  }
  return device;
}

/** Only a lapsed identity changes before the user confirms replacing a copy (SHARING-226.2). */
export function renewBeforeCopyConfirmation(db: Database) {
  return inDeviceTurn(async () => {
    const identity = await readDeviceIdentity(db).catch(() => undefined);
    if (identity?.status !== 'lost') return false;
    await replaceLapsedJoinDevice(db, identity.deviceId, null);
    return true;
  });
}

class SeedReadError extends Error {}
export type SendResult =
  | { kind: 'blocked'; message: string }
  | { kind: 'refused'; message: string }
  | { kind: 'request'; request: JoinRequest; reason?: string }
  /** The API says this phone is a member device: its request may have been approved (SHARING-140.2). */
  | { kind: 'member'; request: JoinRequest };

/**
 * The local row commits before registration or upload. An ambiguous result always leaves
 * it retryable. `stored` is the request as the local data holds it, when `request` is to
 * replace what it chose (SHARING-212.2): the row changes once the API has the new content.
 */
export async function sendJoinRequest(
  db: Database,
  request: JoinRequest,
  userId: string,
  isNew: boolean,
  onStored: () => void,
  stored: JoinRequest = request,
): Promise<SendResult> {
  let device: SigningDevice | undefined;
  try {
    device = await inDeviceTurn(() =>
      ensureDevice(
        db,
        (cause) => {
          throw new SeedReadError('Cannot read seed', { cause });
        },
        (previousId) =>
          replaceLapsedJoinDevice(db, previousId, isNew ? null : stored.code),
      ),
    );
  } catch (error) {
    // The ID exists even if the secure store is temporarily unreadable. Save the draft for retry.
    if (!(error instanceof SeedReadError))
      return { kind: 'blocked', message: wentWrong };
  }
  if (isNew) {
    try {
      const saved = await db.run(
        `INSERT INTO join_requests (code, secret, groupName, name, memberId, takeover, copyGroupId)
         SELECT ?, ?, ?, ?, ?, ?, ? FROM local_identity, device_identity
         WHERE userId = ? AND deviceId = COALESCE(?, deviceId)`,
        [
          request.code,
          request.secret,
          request.groupName,
          request.name,
          request.memberId,
          request.takeover ? 1 : null,
          request.copyGroupId ?? null,
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
      const key = requestKey(stored, device.deviceId);
      if (result === 'confirmed') {
        await db.run(
          `UPDATE join_requests SET name = ?, memberId = ?, takeover = ?, sent = 1, outcome = NULL
           WHERE ${sameRequest}`,
          [request.name, request.memberId, request.takeover ? 1 : null, ...key],
        );
        return {
          kind: 'request',
          request: { ...request, sent: 1, outcome: null },
        };
      }
      if (result === 'no-answer')
        return { kind: 'request', request, reason: connectAgain };
      if (typeof result === 'object') {
        if (result.refused === 'already-a-member')
          return { kind: 'member', request };
        await db.run(`DELETE FROM join_requests WHERE ${sameRequest}`, key);
        return { kind: 'refused', message: refusalMessages[result.refused] };
      }
    }
  } catch {
    // A failed exchange or local write leaves the durable, unconfirmed request in place.
  }
  return { kind: 'request', request, reason: wentWrong };
}

export type CancelResult =
  | { kind: 'cancelled' }
  | { kind: 'failed'; message: string }
  /** The API will not cancel it: this phone is a member device, so it was approved (SHARING-143.2). */
  | { kind: 'member' };

/** A confirmed DELETE is safe to repeat if removing its local row failed. */
export async function cancelJoinRequest(
  db: Database,
  request: JoinRequest,
): Promise<CancelResult> {
  const failed = (message: string): CancelResult => ({
    kind: 'failed',
    message,
  });
  try {
    const identity = await readDeviceIdentity(db);
    if (identity.status === 'none') return failed(wentWrong);
    if (identity.status === 'ready') {
      const answer = await exchange(
        db,
        request.code,
        identity.deviceId,
        'DELETE',
      );
      if (answer === 'no-answer') return failed(connectAgain);
      if (typeof answer === 'object' && answer.refused === 'already-a-member')
        return { kind: 'member' };
      if (answer !== 'confirmed' && answer !== 'authorization-lost')
        return failed(wentWrong);
    }
    await db.run(
      `DELETE FROM join_requests WHERE ${sameRequest}`,
      requestKey(request, identity.deviceId),
    );
    return { kind: 'cancelled' };
  } catch {
    return failed(wentWrong);
  }
}
