import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import {
  MAX_SHARED_GROUP_MEMBERS,
  MAX_SYNC_PLAINTEXT_BYTES,
  checkSyncEvent,
  type SyncSnapshot,
  type SyncSnapshotRecord,
} from '@shared-expense/domain';
import {
  GROUP_REFUSAL_STATUS,
  JOIN_DECISION_REFUSAL_STATUS,
  JOIN_REQUEST_REFUSAL_STATUS,
  SNAPSHOT_REFUSAL_STATUS,
  confirmsTakeover,
  isApproveJoinRequestResponse,
  isGroupId,
  isGroupRefusal,
  isJoinDecisionRefusal,
  isJoinRequestRefusal,
  isJoinRequestsPageResponse,
  isJoinResultResponse,
  isRejectJoinRequestResponse,
  isSnapshotRefusal,
  type ApproveJoinRequestBody,
  type JoinResultResponse,
  type ListedJoinRequest,
  type TakeoverRequestBody,
} from '@shared-expense/domain/api';
import {
  decrypt,
  deriveKey,
  openBox,
  sealBox,
} from '@shared-expense/domain/crypto';
import { toByteArray } from 'base64-js';
import { getRandomValues } from 'expo-crypto';
import { memberNameKey, type GroupMember } from '../groups';
import { createUuid, type Database, type SqlExecutor } from '../storage';
import {
  GIVE_UP_AFTER_MS,
  encryptEvents,
  jsonIn,
  syncGroup,
} from '../sync/loop';
import { isWaitingForSnapshot } from '../sync';
import {
  departingEntries,
  fetchKeysToJoin,
  inviteDueForRevocation,
  latestDeparture,
  rotationDevices,
  saveGroupKey,
  sealRotation,
} from '../sync/key-rotation';
import { deleteGroupData } from '../sync/read-only-copy';
import { mergeRecordEvent, readSyncRecord } from '../sync/records';
import { readRoster, type Roster } from '../sync/roster';
import { makeSnapshot } from '../sync/snapshot-ledger';
import {
  fetchSnapshot,
  uploadSnapshot,
  type MadeSnapshot,
} from '../sync/snapshots';
import { takeCheckedStamps } from '../sync/stamps';
import { apiUrl } from './api-address';
import { prepareSigningDevice, sendApiRequest } from './api-request';
import { readCorrectedTime, type SigningDevice } from './device-identity';
import { storeGroupKey } from './group-key';
import type { InviteCredentials } from './invite-card';
import { readInviteCard, type CardUnread, type JoinCard } from './join-invite';
import { dropJoinKeys, forgetJoinKeys, rememberJoinKeys } from './join-keys';
import {
  REQUEST_PURPOSE,
  requestByCode,
  type JoinRequest,
} from './join-requests';

// Approving and rejecting join requests on a member's phone, and learning the answer on
// the phone that asked (docs/specs/sharing/spec.md, SHARING-190.2 to 229.1; ADR-0039).
// Nothing here shows anything: the screens of `groups` and Join Group call these.

/** A join request a member's phone listed and could read (SHARING-191.2). It is kept in memory only. */
export interface ReceivedJoinRequest {
  /** The code of the invite it was sent under. */
  code: string;
  /** The device that asked. */
  deviceId: string;
  /** The name the applicant entered, trimmed. */
  name: string;
  /** The member the applicant picked, or null for a new member. */
  memberId: string | null;
  /** Whether the applicant asks to take over the member, who has a phone (SHARING-191.2). */
  takeover?: boolean;
  /**
   * The SHA-256 of the content the API listed, in lowercase hexadecimal. An approval and a
   * rejection name the request by it (SHARING-172.1, SHARING-173.2).
   */
  request: string;
}

/** Why a request cannot be approved as it is (SHARING-194.2). */
export type CannotApprove =
  | 'not-a-member'
  | 'is-you'
  | 'has-a-phone'
  | 'no-phone'
  | 'group-full'
  | 'same-name'
  | 'revoking';

/** How approving a request ended (SHARING-195.3 to 200.2). */
export type ApproveResult =
  | { outcome: 'approved' }
  /** A request of the sync, the snapshot or the approval got no answer. */
  | { outcome: 'no-answer' }
  /** The API holds no such request any more: someone answered it. */
  | { outcome: 'answered' }
  /** The group has its 20 member devices. */
  | { outcome: 'members-full' }
  | { outcome: 'waiting-for-snapshot' }
  | { outcome: 'cannot-approve'; reason: CannotApprove }
  | { outcome: 'failed' };

/** How rejecting a request ended (SHARING-201.1). */
export interface RejectResult {
  outcome: 'rejected' | 'no-answer' | 'answered' | 'failed';
}

/** What asking about this phone's own request found, and did (SHARING-210.1 to 222.1). */
export type JoinResult =
  /** The phone took the snapshot in: the group is a shared ledger on it. */
  | { outcome: 'joined'; groupId: string }
  /** Approved, and joining did not finish. */
  | { outcome: 'approved'; reason: 'no-answer' | 'update-needed' | 'failed' }
  | {
      outcome:
        | 'not-sent'
        | 'waiting'
        | 'choose-again'
        | 'declined'
        | 'invalid'
        | 'already-a-member'
        /** The question got no answer. */
        | 'no-answer'
        /** The question got an answer that tells nothing. */
        | 'failed';
    };

const HANDOVER = 'shared-expense/invite/handover/v1';
const NONCE_LENGTH = 24;

/**
 * What an approval needs of a request besides what a list shows: the applicant's user ID
 * and box public key. They stay with the listed object, in memory only (SHARING-193.1),
 * so an approval uses those of the content it names, whatever was listed since.
 */
const applicants = new WeakMap<
  ReceivedJoinRequest,
  { userId: string; boxKey: string }
>();

const secretBytes = (secret: string) => toByteArray(secret + '=');

interface Answer {
  status: number;
  said: unknown;
}

/** Sends a signed request to this build's API. Resolves with nothing when it got no answer. */
async function send(
  database: Database,
  method: string,
  path: string,
  body?: unknown,
  deviceId?: string,
): Promise<Answer | undefined> {
  const url = apiUrl();
  if (!url) return undefined;
  const result = await sendApiRequest(database, {
    apiUrl: url,
    method,
    path,
    ...(body !== undefined && { body: JSON.stringify(body) }),
    deviceId,
    giveUpAfterMs: GIVE_UP_AFTER_MS,
  });
  if (result.outcome !== 'answered') return undefined;
  return { status: result.status, said: jsonIn(result.body) };
}

const REFUSAL_STATUS: Record<string, number> = {
  ...GROUP_REFUSAL_STATUS,
  ...SNAPSHOT_REFUSAL_STATUS,
  ...JOIN_REQUEST_REFUSAL_STATUS,
  ...JOIN_DECISION_REFUSAL_STATUS,
};

/** The reason of the refusal that an answer is, when its status and its body both say so. */
function refusalIn({ status, said }: Answer): string | undefined {
  return (isGroupRefusal(said) ||
    isSnapshotRefusal(said) ||
    isJoinRequestRefusal(said) ||
    isJoinDecisionRefusal(said)) &&
    REFUSAL_STATUS[said.error] === status
    ? said.error
    : undefined;
}

// Listing

const BOX_KEY = /^[0-9a-f]{64}$/;
const PROBE_KEY = new Uint8Array(32).fill(1);

/** Whether a box can be sealed for the public key: the tool refuses the low-order ones (SHARING-11.1). */
function sealsFor(publicKey: Uint8Array): boolean {
  try {
    sealBox({
      senderSecretKey: PROBE_KEY,
      recipientPublicKey: publicKey,
      context: new Uint8Array(0),
      nonce: new Uint8Array(NONCE_LENGTH),
      plaintext: new Uint8Array(0),
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * What a listed request holds, opened with the secret of the invite it was sent under
 * (SHARING-191.2): nothing when it does not open or holds no request, and `newer` when
 * its ciphertext is in a format version this phone does not know.
 */
function readRequest(
  invite: InviteCredentials,
  { deviceId, request }: ListedJoinRequest,
): ReceivedJoinRequest | 'newer' | undefined {
  const content = hexToBytes(request);
  const opened = decrypt({
    key: deriveKey({
      secret: secretBytes(invite.secret),
      purpose: REQUEST_PURPOSE,
    }),
    ciphertext: content,
    associatedData: utf8ToBytes(
      `${REQUEST_PURPOSE}\n${invite.code}\n${deviceId}`,
    ),
  });
  if (!opened.ok)
    return opened.reason === 'unsupported-version' ? 'newer' : undefined;
  // The padding is spaces, which JSON allows after a value.
  const said = jsonIn(opened.plaintext);
  if (typeof said !== 'object' || said === null) return undefined;
  const { name, memberId, userId, boxKey, takeover } = said as Record<
    string,
    unknown
  >;
  if (
    typeof name !== 'string' ||
    name.trim() === '' ||
    (memberId !== null && !isGroupId(memberId)) ||
    (takeover !== undefined && (takeover !== true || memberId === null)) ||
    !isGroupId(userId) ||
    typeof boxKey !== 'string' ||
    !BOX_KEY.test(boxKey) ||
    !sealsFor(hexToBytes(boxKey))
  )
    return undefined;
  const received = {
    code: invite.code,
    deviceId,
    name: name.trim(),
    memberId,
    ...(takeover === true && { takeover }),
    request: bytesToHex(sha256(content)),
  };
  applicants.set(received, { userId, boxKey });
  return received;
}

const decisionPath = (groupId: string, deviceId: string) =>
  `/groups/${groupId}/requests/${deviceId}`;

const rejection = (
  groupId: string,
  { deviceId, request }: { deviceId: string; request: string },
) => `${decisionPath(groupId, deviceId)}?request=${request}`;

/**
 * Lists the group's requests from the API, rejects the ones this phone cannot read, and
 * resolves with the ones it can, in the API's order (SHARING-190.2 to 192.1). It lists
 * none without an invite of the ledger that has not expired. Rejects when a request of
 * the list got no answer, or one that is no page.
 */
export async function listReceivedJoinRequests(
  database: Database,
  groupId: string,
): Promise<ReceivedJoinRequest[]> {
  const invites = await database.all<InviteCredentials & { live: number }>(
    `SELECT id AS code, secret, expiresAtMs > ? AS live FROM group_invites
     WHERE groupId = ?`,
    [await readCorrectedTime(database), groupId],
  );
  if (!invites.some(({ live }) => live)) return [];

  const listed: ListedJoinRequest[] = [];
  for (let query = ''; ;) {
    const answer = await send(
      database,
      'GET',
      `/groups/${groupId}/requests${query}`,
    );
    if (answer?.status !== 200 || !isJoinRequestsPageResponse(answer.said))
      throw new Error('The join requests could not be listed');
    const { requests, more } = answer.said;
    listed.push(...requests);
    // A page with no request ends the list whatever it says, as a page of events does.
    if (!more || requests.length === 0) break;
    query = `?after=${requests[requests.length - 1].deviceId}`;
  }

  const received: ReceivedJoinRequest[] = [];
  for (const each of listed) {
    // Another member's phone may hold the invite, or know the format version.
    const invite = invites.find(({ code }) => code === each.code);
    const read = invite && readRequest(invite, each);
    if (!invite || read === 'newer') continue;
    if (read) received.push(read);
    // Whoever holds only the code can fill the invite's places with these. Once: it is
    // rejected again the next time it is listed (SHARING-192.1).
    else
      await send(
        database,
        'DELETE',
        rejection(groupId, {
          deviceId: each.deviceId,
          request: bytesToHex(sha256(hexToBytes(each.request))),
        }),
      ).catch(() => undefined);
  }
  return received;
}

/** Rejects `request`, as pressing Decline in its menu does (SHARING-201.1). */
export async function rejectJoinRequest(
  database: Database,
  groupId: string,
  request: ReceivedJoinRequest,
): Promise<RejectResult> {
  const answer = await send(database, 'DELETE', rejection(groupId, request));
  if (!answer) return { outcome: 'no-answer' };
  if (
    answer.status === 200 &&
    isRejectJoinRequestResponse(answer.said) &&
    answer.said.deviceId === request.deviceId
  )
    return { outcome: 'rejected' };
  return {
    outcome: refusalIn(answer) === 'no-request' ? 'answered' : 'failed',
  };
}

// Approving

export interface JoinDecision {
  member?: GroupMember;
  reason?: CannotApprove;
}

/** Checks the member and roster rules in their order of precedence (SHARING-194.2). */
function memberDecision(
  members: readonly GroupMember[],
  userId: string,
  request: ReceivedJoinRequest,
  represented: boolean,
): JoinDecision {
  if (request.memberId !== null) {
    const member = members.find(({ id }) => id === request.memberId);
    if (!member) return { reason: 'not-a-member' };
    if (member.userId === userId) return { reason: 'is-you', member };
    if (request.takeover) {
      if (!represented) return { reason: 'no-phone', member };
    } else if (member.userId !== null || represented)
      return { reason: 'has-a-phone', member };
    return { member };
  }
  if (members.length >= MAX_SHARED_GROUP_MEMBERS)
    return { reason: 'group-full' };
  const member = members.find(
    ({ name }) => memberNameKey(name) === memberNameKey(request.name),
  );
  return member ? { reason: 'same-name', member } : {};
}

interface TakeoverDevices {
  remove: string[];
  staying: string[];
  roster: Roster;
}

/** Reads the same local facts for the menu, the preparation and each permitted retry. */
async function readDecision(
  tx: SqlExecutor,
  groupId: string,
  request: ReceivedJoinRequest,
) {
  const [group] = await tx.all<{
    device: string;
    cursor: number;
    epoch: number;
    waitsForSnapshot: number;
  }>(
    'SELECT device, cursor, epoch, waitsForSnapshot FROM sync_groups WHERE groupId = ? AND readOnly IS NULL',
    [groupId],
  );
  if (!group) return undefined;
  const members = await tx.all<GroupMember>(
    `SELECT id, userId, name FROM group_members
     WHERE groupId = ? AND removed = 0 ORDER BY position`,
    [groupId],
  );
  const [{ userId }] = await tx.all<{ userId: string }>(
    'SELECT userId FROM local_identity',
  );
  const roster = await readRoster(tx, groupId);
  const devices =
    request.memberId === null
      ? undefined
      : rotationDevices(
          roster,
          group.device,
          { memberId: request.memberId },
          request.takeover ? request.deviceId : undefined,
        );
  const decision = memberDecision(
    members,
    userId,
    request,
    !!devices?.remove.length,
  );
  if (
    !decision.reason &&
    (await inviteDueForRevocation(
      tx,
      groupId,
      request.code,
      latestDeparture(roster),
    ))
  )
    decision.reason = 'revoking';
  const takeover: TakeoverDevices | undefined =
    request.takeover && devices
      ? { remove: devices.remove, staying: devices.staying, roster }
      : undefined;
  return { group, members, userId, roster, decision, takeover };
}

export async function joinRequestDecision(
  database: Database,
  groupId: string,
  request: ReceivedJoinRequest,
) {
  const state = await database.transaction((tx) =>
    readDecision(tx, groupId, request),
  );
  return state?.decision;
}

async function checkApproval(
  tx: SqlExecutor,
  groupId: string,
  request: ReceivedJoinRequest,
) {
  const [invite] = await tx.all<InviteCredentials>(
    `SELECT id AS code, secret FROM group_invites
     WHERE groupId = ? AND id = ? AND expiresAtMs > ?`,
    [groupId, request.code, await readCorrectedTime(tx)],
  );
  // An expired or revoked invite no longer has a request at the API (SHARING-200.2).
  if (!invite) return { outcome: 'answered' } as const;
  const state = await readDecision(tx, groupId, request);
  if (!state) return { outcome: 'failed' } as const;
  if (request.takeover && state.group.waitsForSnapshot)
    return { outcome: 'waiting-for-snapshot' } as const;
  if (state.decision.reason)
    return {
      outcome: 'cannot-approve',
      reason: state.decision.reason,
    } as const;
  return { ...state, invite };
}

interface Applicant {
  userId: string;
  boxKey: string;
}

interface Prepared {
  invite: InviteCredentials;
  takeover?: TakeoverDevices;
  /** The snapshot for the applicant, which holds the approval's records too. */
  made: MadeSnapshot;
  /** The approval's records, for a snapshot that has to be made again. */
  records: SyncSnapshotRecord[];
  /** The approval's events as they are before encryption, each under its event ID. */
  events: { id: string; content: string }[];
}

/**
 * Checks the request, stamps the approval or takeover events, and reads their snapshot
 * and cursor in this transaction (SHARING-195.3, SHARING-322.1). Only the phone's
 * latest stamp is stored. `addBack` is the former member the applicant becomes in
 * place of a new one (SHARING-288.1).
 */
async function prepareApproval(
  tx: SqlExecutor,
  groupId: string,
  request: ReceivedJoinRequest,
  applicant: Applicant,
  device: SigningDevice,
  addBack?: string,
): Promise<Prepared | ApproveResult> {
  const state = await checkApproval(tx, groupId, request);
  if (state.outcome) return state;
  const { group, members, userId, roster, takeover, invite } = state;

  const changes: object[] = [];
  // This phone's own entry goes with the first approval it gives.
  const you = members.find((member) => member.userId === userId);
  if (you && !roster.has(group.device))
    changes.push({
      type: 'device',
      id: group.device,
      units: {
        member: {
          value: { memberId: you.id, userId, boxKey: device.boxKey },
        },
      },
    });
  const memberId = request.memberId ?? addBack ?? (await createUuid(tx));
  if (request.memberId === null && addBack !== undefined) {
    // Only while he is still a former member: someone may have added him back since.
    const [former] = await tx.all<{ removedAt: string }>(
      `SELECT json_extract(r.record, '$.units.removed.stamp') AS removedAt
       FROM group_members m JOIN sync_records r
         ON r.groupId = m.groupId AND r.type = 'member' AND r.id = m.id
       WHERE m.groupId = ? AND m.id = ? AND m.removed = 1`,
      [groupId, addBack],
    );
    if (!former) return { outcome: 'failed' };
    changes.push({
      type: 'member',
      id: addBack,
      units: {
        removed: { value: false, base: JSON.parse(former.removedAt) as object },
      },
    });
  } else if (request.memberId === null)
    changes.push({
      type: 'member',
      id: memberId,
      units: { name: { value: request.name }, removed: { value: false } },
    });
  // A device that left has an entry that represents nobody, which this one follows.
  const left = roster.get(request.deviceId);
  changes.push({
    type: 'device',
    id: request.deviceId,
    units: {
      member: {
        value: { memberId, ...applicant },
        ...(left && { base: left.stamp }),
      },
    },
  });
  if (takeover) changes.push(...departingEntries(roster, takeover.remove));

  const stamps = await takeCheckedStamps(tx, group.device, changes.length);
  const events: Prepared['events'] = [];
  const records: SyncSnapshotRecord[] = [];
  for (const [index, change] of changes.entries()) {
    const stamp = stamps[index];
    const verdict = checkSyncEvent({ version: 1, stamp, ...change }, null);
    // The applicant's name is the only part that can be too long for an event.
    if (verdict.status !== 'valid' || 'deleted' in verdict.event)
      return { outcome: 'failed' };
    const { event } = verdict;
    const content = JSON.stringify(event);
    if (utf8ToBytes(content).length > MAX_SYNC_PLAINTEXT_BYTES)
      return { outcome: 'failed' };
    events.push({ id: await createUuid(tx), content });
    // The record as the event leaves it: a new one, or the one the ledger holds with
    // this change merged in, as every phone will merge it.
    const merged = mergeRecordEvent(
      await readSyncRecord(tx, groupId, event.type, event.id),
      event,
    );
    records.push({
      ...merged.record,
      created: merged.created,
      seeded: merged.seeded,
    } as SyncSnapshotRecord);
  }
  const made = await makeSnapshot(tx, groupId, records);
  return made.outcome === 'made'
    ? { made, records, events, invite, takeover }
    : { outcome: 'failed' };
}

/** The box that hands the group's keys to the applicant (SHARING-198.1), in hexadecimal. */
function handoverBox(
  device: SigningDevice,
  applicant: Applicant,
  invite: InviteCredentials,
  groupId: string,
  snapshot: MadeSnapshot,
  next?: { epoch: number; key: Uint8Array },
): string {
  const keys = (next ? [snapshot, next] : [snapshot]).map(({ epoch, key }) => ({
    epoch,
    key: bytesToHex(key),
  }));
  return bytesToHex(
    sealBox({
      senderSecretKey: device.boxSecretKey,
      recipientPublicKey: hexToBytes(applicant.boxKey),
      salt: deriveKey({
        secret: secretBytes(invite.secret),
        purpose: HANDOVER,
      }),
      context: handoverContext(
        invite.code,
        groupId,
        next?.epoch ?? snapshot.epoch,
      ),
      nonce: getRandomValues(new Uint8Array(NONCE_LENGTH)),
      plaintext: utf8ToBytes(JSON.stringify({ keys })),
    }),
  );
}

const handoverContext = (code: string, groupId: string, epoch: number) =>
  utf8ToBytes([HANDOVER, code, groupId, String(epoch)].join('\n'));

/** A secure store that cannot be read is no reason to lose track of an approval. */
const signingDevice = (database: Database) =>
  prepareSigningDevice(database, (cause) => {
    throw new Error('Cannot read the secure store', { cause });
  }).catch(() => 'lost' as const);

/** Both lists have a stable order. A box must still address the same public key as well. */
function sameTakeoverDevices(
  before: TakeoverDevices,
  now: TakeoverDevices,
  own: string,
) {
  return (
    before.remove.length === now.remove.length &&
    before.remove.every((id, at) => id === now.remove[at]) &&
    before.staying.length === now.staying.length &&
    before.staying.every(
      (id, at) =>
        id === now.staying[at] &&
        (id === own ||
          before.roster.get(id)!.value!.boxKey ===
            now.roster.get(id)!.value!.boxKey),
    )
  );
}

/** Read the cursor with the decision that justifies retrying at that cursor. */
async function recheckApproval(
  tx: SqlExecutor,
  groupId: string,
  request: ReceivedJoinRequest,
  prepared: Prepared,
  remake: boolean,
): Promise<{ cursor: number; made?: MadeSnapshot } | ApproveResult> {
  const state = await checkApproval(tx, groupId, request);
  if (state.outcome) return state;
  if (
    prepared.takeover &&
    (state.group.epoch !== prepared.made.epoch ||
      !state.takeover ||
      !sameTakeoverDevices(
        prepared.takeover,
        state.takeover,
        state.group.device,
      ))
  )
    return { outcome: 'failed' } as const;
  const made = remake
    ? await makeSnapshot(tx, groupId, prepared.records)
    : undefined;
  if (made && made.outcome !== 'made') return { outcome: 'failed' } as const;
  return { cursor: state.group.cursor, made };
}

/**
 * Approves `request`, as pressing Approve in the menu that was opened for it does
 * (SHARING-195.3, SHARING-322.1): the approval names the content the request held when it was listed.
 * Other syncs of the ledger go on meanwhile.
 * `addBack` is the former member the user chose to add back in place of a new member
 * (SHARING-288.1, issue 143): the approval then carries no new member (SHARING-196.2).
 */
export async function approveJoinRequest(
  database: Database,
  groupId: string,
  request: ReceivedJoinRequest,
  addBack?: string,
): Promise<ApproveResult> {
  const url = apiUrl();
  const applicant = applicants.get(request);
  if (!url || !applicant) return { outcome: 'failed' };
  const ledger = { apiUrl: url, groupId };
  /** Syncs; resolves with how the approval ends when the sync did not download to the end. */
  const sync = async (): Promise<ApproveResult | undefined> => {
    let end = await syncGroup(database, ledger);
    // Once more, so that the cursor is past what this phone has just uploaded.
    if (end.uploaded) end = await syncGroup(database, ledger);
    if (request.takeover && (await isWaitingForSnapshot(database, groupId)))
      return { outcome: 'waiting-for-snapshot' };
    if (end.noAnswer) return { outcome: 'no-answer' };
    return end.downloaded ? undefined : { outcome: 'failed' };
  };

  try {
    const stopped = await sync();
    if (stopped) return stopped;
    const device = await signingDevice(database);
    if (device === 'lost') return { outcome: 'failed' };

    const prepared = await database.transaction((tx) =>
      prepareApproval(tx, groupId, request, applicant, device, addBack),
    );
    if ('outcome' in prepared) return prepared;
    const { made, takeover, invite } = prepared;
    /** Uploads a snapshot, or says how the approval ends when it cannot. */
    const upload = async (snapshot: MadeSnapshot) => {
      const uploaded = await uploadSnapshot(
        database,
        { ...ledger, deviceId: request.deviceId },
        snapshot,
      );
      return uploaded.outcome === 'uploaded'
        ? uploaded
        : ({
            outcome: uploaded.outcome === 'no-answer' ? 'no-answer' : 'failed',
          } as const);
    };
    const snapshot = await upload(made);
    if (snapshot.outcome !== 'uploaded') return snapshot;

    // The snapshot uses the current key. Only after it is stored do we generate the next
    // key. It stays in memory until the API confirms this particular takeover.
    const rotation =
      takeover &&
      sealRotation(groupId, device, takeover.roster, takeover.staying, made);
    const { epoch, key } = rotation ?? made;
    const approval: ApproveJoinRequestBody = {
      request: request.request,
      cursor: made.content.sequence,
      snapshotId: snapshot.snapshotId,
      senderKey: device.boxKey,
      epoch,
      box: handoverBox(device, applicant, invite, groupId, made, rotation),
      events: encryptEvents(
        groupId,
        device.deviceId,
        epoch,
        key,
        prepared.events,
      ),
    };
    const body =
      rotation && takeover
        ? ({
            ...approval,
            remove: takeover.remove,
            boxes: rotation.boxes,
          } satisfies TakeoverRequestBody)
        : approval;
    const path = `${decisionPath(groupId, request.deviceId)}/${takeover ? 'takeover' : 'approval'}`;
    for (let behind = 0, again = false; ;) {
      const answer = await send(database, 'POST', path, body, device.deviceId);
      if (!answer) return { outcome: 'no-answer' };
      // Any other answer with status 200 is no refusal either, and ends in a failure.
      if (
        answer.status === 200 &&
        (rotation
          ? confirmsTakeover(answer.said, request.deviceId, body)
          : isApproveJoinRequestResponse(answer.said) &&
            answer.said.deviceId === request.deviceId)
      ) {
        // A failed write is recoverable from our own box in the following sync.
        if (rotation)
          await saveGroupKey(database, { groupId, epoch, key }).catch(
            () => undefined,
          );
        break;
      }
      if (takeover && again) return { outcome: 'failed' };
      const refusal = refusalIn(answer);
      if (refusal === 'no-request') return { outcome: 'answered' };
      if (!takeover && refusal === 'members-full')
        return { outcome: 'members-full' };
      const retry =
        (refusal === 'behind' && (behind += 1) <= 2) ||
        (refusal === 'no-snapshot' && !again);
      if (!retry) return { outcome: 'failed' };

      // Behind: this phone has not checked the request against the group's last events
      // (SHARING-200.2). It syncs and looks again, and sends the same snapshot and
      // events with the cursor it has then. Without a snapshot it uploads another.
      if (takeover || refusal === 'behind') {
        const unsynced = await sync();
        if (unsynced) return unsynced;
      }
      const checked = await database.transaction((tx) =>
        recheckApproval(
          tx,
          groupId,
          request,
          prepared,
          refusal === 'no-snapshot',
        ),
      );
      if ('outcome' in checked) return checked;
      body.cursor = checked.cursor;
      if (checked.made) {
        again = true;
        const replacement = await upload(checked.made);
        if (replacement.outcome !== 'uploaded') return replacement;
        body.snapshotId = replacement.snapshotId;
      }
    }
  } catch {
    return { outcome: 'failed' };
  }
  // The new member and the roster entries reach the local data as events it downloads
  // (SHARING-199.1). The approval stands whether or not this sync finishes.
  await syncGroup(database, ledger).catch(() => undefined);
  return { outcome: 'approved' };
}

// Learning the answer, and joining

const ended = (outcome: 'declined' | 'invalid') =>
  `UPDATE join_requests SET code = NULL, secret = NULL, name = NULL, memberId = NULL,
     takeover = NULL, copyGroupId = NULL, sent = 0, outcome = '${outcome}' WHERE code = ? AND secret = ?`;

/** Whether the request still fits the invite's card, so that a member can approve it (SHARING-212.2). */
function fitsCard(
  { members }: JoinCard,
  {
    name,
    memberId,
    takeover,
  }: Pick<JoinRequest, 'name' | 'memberId' | 'takeover'>,
): boolean {
  if (memberId !== null) {
    const member = members.find(({ id }) => id === memberId);
    return (
      !!member &&
      (takeover
        ? member.hasDevice &&
          members.some((other) => other.id !== memberId && other.hasDevice)
        : !member.hasDevice)
    );
  }
  return (
    members.length < MAX_SHARED_GROUP_MEMBERS &&
    !members.some(
      (member) => memberNameKey(member.name) === memberNameKey(name),
    )
  );
}

/** The keys a handover's box holds, when it holds what SHARING-198.1 says. */
function keysIn(
  content: unknown,
  epoch: number,
): { epoch: number; key: string }[] | undefined {
  const keys =
    typeof content === 'object' && content !== null && 'keys' in content
      ? content.keys
      : undefined;
  if (!Array.isArray(keys) || keys.length === 0) return undefined;
  let last = 0;
  for (const each of keys as unknown[]) {
    if (typeof each !== 'object' || each === null) return undefined;
    const { epoch: of, key } = each as Record<string, unknown>;
    if (
      typeof of !== 'number' ||
      !Number.isSafeInteger(of) ||
      of <= last ||
      typeof key !== 'string' ||
      !BOX_KEY.test(key)
    )
      return undefined;
    last = of;
  }
  return last === epoch
    ? (keys as { epoch: number; key: string }[])
    : undefined;
}

type Handover = Extract<JoinResultResponse, { state: 'approved' }>;

/**
 * Whether the snapshot's roster names the device that approved with the key that sealed
 * the box, and this phone with its own user ID and key as a member the snapshot holds
 * (SHARING-218.1).
 */
function rosterFits(
  { records }: SyncSnapshot,
  handover: Handover,
  device: SigningDevice,
  userId: string,
): boolean {
  const entry = (deviceId: string) => {
    const record = records.find(
      (each) => each.type === 'device' && each.id === deviceId,
    );
    return record?.type === 'device' ? record.units.member?.value : undefined;
  };
  const own = entry(device.deviceId);
  return (
    entry(handover.deviceId)?.boxKey === handover.senderKey &&
    own?.userId === userId &&
    own.boxKey === device.boxKey &&
    records.some(
      (each) =>
        each.type === 'member' &&
        each.id === own.memberId &&
        each.units.name !== undefined &&
        each.units.removed?.value === false,
    )
  );
}

type Unfinished = Extract<JoinResult, { outcome: 'approved' }>;
const unfinished = (reason: Unfinished['reason']): Unfinished => ({
  outcome: 'approved',
  reason,
});

/**
 * What the phone holds under a group ID: nothing, a copy that an approval may replace,
 * which is a read-only copy or a group that is no shared ledger, or a shared ledger it
 * is in (SHARING-217.2).
 */
async function heldGroup(
  database: SqlExecutor,
  groupId: string,
): Promise<'none' | 'copy' | 'ledger'> {
  const [group] = await database.all<{ ledger: number }>(
    `SELECT s.groupId IS NOT NULL AND s.readOnly IS NULL AS ledger
     FROM groups g LEFT JOIN sync_groups s ON s.groupId = g.id WHERE g.id = ?`,
    [groupId],
  );
  if (!group) return 'none';
  return group.ledger ? 'ledger' : 'copy';
}

/**
 * Joins the group this phone was approved for (SHARING-216.1 to 219.2): opens the box,
 * saves its keys, takes the snapshot in with the request deleted in the same transaction,
 * and syncs. A copy of the group that the request recorded is replaced in that
 * transaction (SHARING-289.1); any other group of that ID stops the join before a key is
 * saved.
 */
async function join(
  database: Database,
  request: JoinRequest,
  handover: Handover,
): Promise<JoinResult> {
  const url = apiUrl();
  const device = await signingDevice(database);
  if (!url || device === 'lost') return unfinished('failed');
  const { groupId, epoch } = handover;
  // Whoever sealed the box hands over the invite's group, not any group whose ID it
  // knows: only the copy the user agreed to replace may be replaced.
  const held = await heldGroup(database, groupId);
  if (held === 'ledger' || (held === 'copy' && request.copyGroupId !== groupId))
    return unfinished('failed');
  const opened = openBox({
    recipientSecretKey: device.boxSecretKey,
    senderPublicKey: hexToBytes(handover.senderKey),
    salt: deriveKey({ secret: secretBytes(request.secret), purpose: HANDOVER }),
    context: handoverContext(request.code, groupId, epoch),
    box: hexToBytes(handover.box),
  });
  if (!opened.ok)
    return unfinished(
      opened.reason === 'unsupported-version' ? 'update-needed' : 'failed',
    );
  const keys = keysIn(jsonIn(opened.plaintext), epoch);
  if (!keys) return unfinished('failed');

  const ledger = { apiUrl: url, groupId };
  try {
    // Straight to the secure store: the group is no shared ledger here until the
    // snapshot is in, and the snapshot is what these keys have to open (SHARING-217.2).
    // Whose they are is remembered beside them, for a phone that is removed before it
    // joins (SHARING-282.1).
    const remember = (upTo: number) =>
      rememberJoinKeys(request.code, groupId, upTo);
    await remember(epoch);
    for (const { epoch: of, key } of keys)
      await storeGroupKey(groupId, of, hexToBytes(key));
    const [{ userId }] = await database.all<{ userId: string }>(
      'SELECT userId FROM local_identity',
    );
    const taken = await fetchSnapshot(database, ledger, {
      accepts: (snapshot) => rosterFits(snapshot, handover, device, userId),
      // The group rotated since the approval: the keys after the handover's come from
      // the boxes of those rotations, opened from the handover's key on (SHARING-281.1).
      missingKey: async (of) => {
        await remember(of);
        await fetchKeysToJoin(database, ledger, epoch);
      },
      replaces: async (tx) => {
        if ((await heldGroup(tx, groupId)) === 'copy')
          await deleteGroupData(tx, groupId);
      },
      alsoIn: async (tx) => {
        await tx.run('DELETE FROM join_requests WHERE code = ?', [
          request.code,
        ]);
      },
    });
    if (taken.outcome === 'no-answer' || taken.outcome === 'update-needed')
      return unfinished(taken.outcome);
    if (taken.outcome !== 'imported') return unfinished('failed');
  } catch {
    return unfinished('failed');
  }
  // The keys are the ledger's now.
  await forgetJoinKeys(request.code).catch(() => undefined);
  await syncGroup(database, ledger).catch(() => undefined);
  return { outcome: 'joined', groupId };
}

/** What the screen that shows a request hears of while the question about it is on its way. */
export interface JoinProgress {
  /** The invite's card as it is now, read because the request still waits, or why it was not read. */
  onCard?: (card: JoinCard | CardUnread) => void;
  /** The request was approved, and this phone starts to join. */
  onApproved?: () => void;
}

/**
 * Asks the API what became of this phone's request for the invite `code`, and acts on
 * the answer: joins when it was approved (SHARING-210.1 to 222.1). Only an answer to this
 * question ends a request.
 */
export async function askJoinResult(
  database: Database,
  code: string,
  progress: JoinProgress = {},
): Promise<JoinResult> {
  const request = await requestByCode(database, code);
  if (!request) return { outcome: 'no-answer' };
  const answer = await send(database, 'GET', `/invites/${code}/request`);
  if (!answer) return { outcome: 'no-answer' };
  const mine = [code, request.secret];
  const refusal = refusalIn(answer);
  if (refusal === 'no-invite') {
    // Whatever joining saved for it goes with it.
    await dropJoinKeys(database, code).catch(() => undefined);
    await database.run(ended('invalid'), mine);
    return { outcome: 'invalid' };
  }
  if (refusal === 'already-a-member') {
    await database.run(
      'DELETE FROM join_requests WHERE code = ? AND secret = ?',
      mine,
    );
    return { outcome: 'already-a-member' };
  }
  if (answer.status !== 200 || !isJoinResultResponse(answer.said))
    return { outcome: 'failed' };
  const result = answer.said;

  if (result.state === 'approved') {
    await database.run(
      `UPDATE join_requests SET sent = 1, outcome = 'approved'
       WHERE code = ? AND secret = ?`,
      mine,
    );
    progress.onApproved?.();
    return join(database, request, result);
  }
  if (request.outcome === 'approved') {
    // The API holds no handover for a phone that this phone's data says was approved.
    if (result.state !== 'none') return unfinished('failed');
    // A member removed it before it joined (SHARING-282.1): the keys it saved go too.
    await dropJoinKeys(database, code).catch(() => undefined);
    await database.run(ended('declined'), mine);
    return { outcome: 'declined' };
  }
  if (result.state === 'none') {
    // The API never took a request that is not sent, and nothing sends it again.
    if (!request.sent) return { outcome: 'not-sent' };
    await database.run(ended('declined'), mine);
    return { outcome: 'declined' };
  }

  // It waits: the API has it, whatever this phone knew. A member can approve it only
  // while it fits the card, so the person is asked to choose again when it does not.
  // A card that cannot be read, gone or not, changes nothing (SHARING-211.1).
  const card = await readInviteCard(request).catch(
    (): CardUnread => 'unreadable',
  );
  progress.onCard?.(card);
  const outcome =
    typeof card === 'string'
      ? (request.outcome ?? null)
      : fitsCard(card, request)
        ? null
        : 'choose-again';
  await database.run(
    'UPDATE join_requests SET sent = 1, outcome = ? WHERE code = ? AND secret = ?',
    [outcome, ...mine],
  );
  return { outcome: outcome ?? 'waiting' };
}
