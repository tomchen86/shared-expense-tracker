import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import {
  checkSyncEvent,
  compareSyncStamps,
  type SyncStamp,
} from '@shared-expense/domain';
import {
  GROUP_REFUSAL_STATUS,
  INVITE_REFUSAL_STATUS,
  ROTATION_REFUSAL_STATUS,
  isGroupKeysResponse,
  isGroupRefusal,
  isInviteRefusal,
  isRevokeInviteResponse,
  isRotateKeyResponse,
  isRotationRefusal,
  type RelayedEvent,
  type RotateKeyRequest,
  type StoredKeyBox,
} from '@shared-expense/domain/api';
import {
  decrypt,
  deriveKey,
  openBox,
  sealBox,
} from '@shared-expense/domain/crypto';
import { getRandomValues } from 'expo-crypto';
import { prepareSigningDevice, sendApiRequest } from '../sharing/api-request';
import {
  readCorrectedTime,
  type SigningDevice,
} from '../sharing/device-identity';
import { GROUP_KEY_HEX, storeGroupKey } from '../sharing/group-key';
import { createUuid, type Database, type SqlExecutor } from '../storage';
import { notifyApplied } from './apply';
import { recordRevokedInvite } from './invites';
import { readSyncRecord, sharedGroup } from './records';
import { readRoster, type Roster } from './roster';
import { takeCheckedStamps } from './stamps';
import {
  GIVE_UP_AFTER_MS,
  associatedData,
  encryptEvents,
  jsonIn,
  readGroupKey,
} from './transport';

// The group key changes when a device loses access (ADR-0015, ADR-0041;
// docs/specs/sharing/spec.md, SHARING-270.1 to 286.1). A phone that stays makes the new
// key and seals it in a box for each device that stays, its own included, with a salt
// only a holder of the key before it can derive. A phone that was away fetches the boxes
// it missed and opens them one after another. And once a device has left, a phone revokes
// the invites that device knows.

/** The purpose of a rotation's box: what its salt is derived for, and its context's first line. */
const ROTATION = 'shared-expense/group-key/rotation/v1';
const KEY_LENGTH = 32;
const NONCE_LENGTH = 24;

interface SyncTarget {
  apiUrl: string;
  groupId: string;
}

const rotationSalt = (previousKey: Uint8Array) =>
  deriveKey({ secret: previousKey, purpose: ROTATION });

/** What a rotation's box is sealed for: four lines (SHARING-272.1). */
const rotationContext = (groupId: string, deviceId: string, epoch: number) =>
  utf8ToBytes([ROTATION, groupId, deviceId, String(epoch)].join('\n'));

/** A secure store that cannot be read is no reason to make another identity. */
const signingDevice = (database: Database) =>
  prepareSigningDevice(database, (cause) => {
    throw new Error('Cannot read the secure store', { cause });
  }).catch(() => 'lost' as const);

/** The key epoch the local data records for a shared ledger; none for a copy or another group. */
async function recordedEpoch(
  database: SqlExecutor,
  groupId: string,
): Promise<number | undefined> {
  const [ledger] = await database.all<{ epoch: number }>(
    'SELECT epoch FROM sync_groups WHERE groupId = ? AND readOnly IS NULL',
    [groupId],
  );
  return ledger?.epoch;
}

// Saving a key

/**
 * Saves a shared ledger's group key of one key epoch on this phone, as the secure-store
 * entry a sync reads (SYNC-66.1), and remembers the key epoch: the phone uploads under
 * the highest one saved this way (SYNC-94.1).
 */
export async function saveGroupKey(
  database: Database,
  groupKey: { groupId: string; epoch: number; key: Uint8Array },
): Promise<void> {
  const { groupId, epoch, key } = groupKey;
  if (
    key.length !== KEY_LENGTH ||
    !Number.isSafeInteger(epoch) ||
    epoch < 1 ||
    (await recordedEpoch(database, groupId)) === undefined
  )
    throw new Error('Not a group key of a shared ledger');
  // The entry first: a phone stopped here has the key, and learns the epoch from the
  // API's refusal of its next upload (SYNC-79.1).
  await storeGroupKey(groupId, epoch, key);
  await database.run(
    'UPDATE sync_groups SET epoch = ? WHERE groupId = ? AND epoch < ?',
    [epoch, groupId, epoch],
  );
}

// Fetching the keys of rotations this phone missed

/**
 * The key a box holds, when the box opens with the key of the epoch before it and holds
 * what SHARING-272.1 says; `unsupported` for a format version this phone does not know.
 */
function keyIn(
  device: SigningDevice,
  groupId: string,
  sealed: StoredKeyBox,
  previousKey: Uint8Array,
): Uint8Array | 'unsupported' | undefined {
  try {
    const opened = openBox({
      recipientSecretKey: device.boxSecretKey,
      senderPublicKey: hexToBytes(sealed.senderKey),
      salt: rotationSalt(previousKey),
      context: rotationContext(groupId, device.deviceId, sealed.epoch),
      box: hexToBytes(sealed.box),
    });
    if (!opened.ok)
      return opened.reason === 'unsupported-version'
        ? 'unsupported'
        : undefined;
    const { keys } = jsonIn(opened.plaintext) as { keys: unknown };
    if (!Array.isArray(keys) || keys.length !== 1) return undefined;
    const [held] = keys as [{ epoch: unknown; key: unknown }];
    return held.epoch === sealed.epoch &&
      typeof held.key === 'string' &&
      GROUP_KEY_HEX.test(held.key)
      ? hexToBytes(held.key)
      : undefined;
  } catch {
    // A public key that is no point to agree a key with, or content that is no object.
    return undefined;
  }
}

/**
 * Asks the API for the boxes it keeps for this phone after `after` and opens them one
 * after another, the lowest epoch first, each with the key of the epoch before it, which
 * the secure store holds (SHARING-278.1, SHARING-279.1). `save` stores the key of each
 * box that passes; the first that does not ends it. Resolves with how many were saved.
 */
async function fetchBoxes(
  database: Database,
  { apiUrl, groupId }: SyncTarget,
  device: SigningDevice,
  after: number,
  save: (epoch: number, key: Uint8Array) => Promise<void>,
  stoppedAt?: RelayedEvent,
): Promise<number> {
  let epoch = after;
  let saved = 0;
  for (;;) {
    const answer = await sendApiRequest(database, {
      apiUrl,
      method: 'GET',
      path: `/groups/${groupId}/keys?after=${epoch}`,
      giveUpAfterMs: GIVE_UP_AFTER_MS,
    });
    if (answer.outcome !== 'answered' || answer.status !== 200) return saved;
    const page = jsonIn(answer.body);
    if (!isGroupKeysResponse(page)) return saved;
    for (const sealed of page.keys) {
      const previous =
        sealed.epoch === epoch + 1
          ? await readGroupKey(groupId, epoch)
          : undefined;
      const key = previous && keyIn(device, groupId, sealed, previous);
      if (key === 'unsupported') {
        // The line that waits for an update of the app (SYNC-75.1).
        const { changes } = await database.run(
          'UPDATE sync_groups SET waitsForUpdate = 1 WHERE groupId = ? AND waitsForUpdate = 0',
          [groupId],
        );
        if (changes) notifyApplied(database, groupId);
      }
      if (!key || key === 'unsupported') return saved;
      if (stoppedAt?.epoch === sealed.epoch) {
        const { id, deviceId, content } = stoppedAt;
        const opened = decrypt({
          key,
          ciphertext: hexToBytes(content),
          associatedData: associatedData(groupId, id, deviceId, sealed.epoch),
        });
        // A wrong key would pass every event of its epoch as empty (SHARING-280.1).
        if (!opened.ok && opened.reason !== 'unsupported-version') return saved;
      }
      await save(sealed.epoch, key);
      epoch = sealed.epoch;
      saved += 1;
    }
    if (!page.more || page.keys.length === 0) return saved;
  }
}

/**
 * Fetches the boxes the API keeps for this phone and saves the key of each that passes
 * (SHARING-278.1 to SHARING-280.1). `stoppedAt` is the event the phone's download stopped
 * at for the lack of a key: the key of its epoch is saved only when it decrypts that
 * event. Resolves with how many keys it saved.
 */
export async function fetchGroupKeys(
  database: Database,
  target: SyncTarget,
  stoppedAt?: RelayedEvent,
): Promise<number> {
  const { groupId } = target;
  const device = await signingDevice(database);
  const recorded = await recordedEpoch(database, groupId);
  if (device === 'lost' || recorded === undefined) return 0;
  // The local data may have gone back to before a rotation whose key the secure store
  // holds: the API has discarded the boxes this phone said it had saved.
  let epoch = recorded;
  while (await readGroupKey(groupId, epoch + 1)) epoch += 1;
  if (epoch > recorded)
    await database.run(
      'UPDATE sync_groups SET epoch = ? WHERE groupId = ? AND epoch < ?',
      [epoch, groupId, epoch],
    );
  return fetchBoxes(
    database,
    target,
    device,
    epoch,
    (of, key) => saveGroupKey(database, { groupId, epoch: of, key }),
    stoppedAt,
  );
}

/**
 * Fetches the keys after `after` for a group this phone was approved for and has not
 * joined (SHARING-281.1): its handover gave it the keys up to `after`, and the group has
 * rotated since. Each key goes straight to the secure store, as the handover's did.
 */
export async function fetchKeysToJoin(
  database: Database,
  target: SyncTarget,
  after: number,
): Promise<number> {
  const device = await signingDevice(database);
  if (device === 'lost') return 0;
  return fetchBoxes(database, target, device, after, (epoch, key) =>
    storeGroupKey(target.groupId, epoch, key),
  );
}

// Rotating

/** Which devices a rotation is for. */
export interface RotationPlan {
  /** The member whose other phones are to be removed; none when the phone rotates for the group. */
  memberId?: string;
  /**
   * The group's member devices as the API listed them. Without it, the devices are those
   * this phone's roster has representing a member, and this phone.
   */
  devices?: readonly string[];
}

interface Prepared {
  request: RotateKeyRequest;
  /** The new group key, of the epoch the request names. */
  key: Uint8Array;
}

/** The applicant gets the handover, so it is outside both sets of a takeover's rotation. */
export function rotationDevices(
  roster: Roster,
  own: string,
  plan: RotationPlan,
  applicant?: string,
) {
  const represented = [...roster.keys()]
    .filter(
      (id) => id !== own && id !== applicant && roster.get(id)!.value !== null,
    )
    .sort();
  const listed = plan.devices;
  const remove = represented.filter(
    (id) =>
      roster.get(id)!.value!.memberId === plan.memberId &&
      (listed?.includes(id) ?? true),
  );
  const staying = listed
    ? listed.filter((id) => !remove.includes(id))
    : [own, ...represented.filter((id) => !remove.includes(id))];
  return { represented, remove, staying };
}

/** Each departing device's entry is based on the version that represented its member. */
export function departingEntries(roster: Roster, leaving: readonly string[]) {
  return leaving.map((id) => ({
    type: 'device',
    id,
    units: { member: { value: null, base: roster.get(id)!.stamp } },
  }));
}

/** Makes one fresh key and seals that same key for each device that stays (SHARING-272.1, SHARING-324.1). */
export function sealRotation(
  groupId: string,
  device: SigningDevice,
  roster: Roster,
  staying: readonly string[],
  previous: { epoch: number; key: Uint8Array },
) {
  const epoch = previous.epoch + 1;
  const key = getRandomValues(new Uint8Array(KEY_LENGTH));
  const salt = rotationSalt(previous.key);
  const plaintext = utf8ToBytes(
    JSON.stringify({ keys: [{ epoch, key: bytesToHex(key) }] }),
  );
  const boxes = staying.map((deviceId) => ({
    deviceId,
    box: bytesToHex(
      sealBox({
        senderSecretKey: device.boxSecretKey,
        recipientPublicKey: hexToBytes(
          deviceId === device.deviceId
            ? device.boxKey
            : roster.get(deviceId)!.value!.boxKey,
        ),
        salt,
        context: rotationContext(groupId, deviceId, epoch),
        nonce: getRandomValues(new Uint8Array(NONCE_LENGTH)),
        plaintext,
      }),
    ),
  }));
  return { epoch, key, boxes };
}

/**
 * In one transaction (SHARING-270.1 to SHARING-272.1): finds the devices that leave and
 * those that stay as the local data has them, writes the events that say who left without
 * storing them, makes the new group key and seals it for every device that stays.
 * Resolves with `nobody` when the plan names a member no other device represents, and
 * with `cannot` when a device that stays has no roster entry to seal for or this phone
 * lacks the key of its epoch.
 */
async function prepareRotation(
  tx: SqlExecutor,
  groupId: string,
  device: SigningDevice,
  plan: RotationPlan,
): Promise<Prepared | 'nobody' | 'cannot'> {
  const group = await sharedGroup(tx, groupId);
  const epoch = await recordedEpoch(tx, groupId);
  if (!group || epoch === undefined) return 'cannot';
  const own = group.device;
  const roster = await readRoster(tx, groupId);
  const { represented, remove, staying } = rotationDevices(roster, own, plan);
  const memberOf = (id: string) => roster.get(id)!.value!.memberId;
  if (plan.memberId !== undefined && !plan.devices && remove.length === 0)
    return 'nobody';
  if (
    !staying.includes(own) ||
    staying.some((id) => id !== own && !represented.includes(id))
  )
    return 'cannot';
  const currentKey = await readGroupKey(groupId, epoch);
  if (!currentKey) return 'cannot';

  // Every device the roster has representing a member that does not stay has left: it is
  // being removed now, or left without an event that says so (SHARING-271.1).
  const leaving = represented.filter((id) => !staying.includes(id));
  const kept = new Set(
    staying.filter((id) => id !== own).map((id) => memberOf(id)),
  );
  // This phone stays, whatever its own roster entry says, or lacks.
  const you = await tx.all<{ id: string }>(
    `SELECT m.id FROM group_members m, local_identity i
     WHERE m.groupId = ? AND m.userId = i.userId`,
    [groupId],
  );
  for (const { id } of you) kept.add(id);
  const changes: object[] = [];
  for (const memberId of new Set(leaving.map(memberOf))) {
    if (kept.has(memberId)) continue;
    const stored = await readSyncRecord(tx, groupId, 'member', memberId);
    const removed =
      stored?.record.type === 'member'
        ? stored.record.units.removed
        : undefined;
    if (removed?.value === false)
      changes.push({
        type: 'member',
        id: memberId,
        units: { removed: { value: true, base: removed.stamp } },
      });
  }
  changes.push(...departingEntries(roster, leaving));

  const stamps: SyncStamp[] =
    changes.length > 0 ? await takeCheckedStamps(tx, own, changes.length) : [];
  const events: { id: string; content: string }[] = [];
  for (const [index, change] of changes.entries()) {
    const verdict = checkSyncEvent(
      { version: 1, stamp: stamps[index], ...change },
      null,
    );
    if (verdict.status !== 'valid') return 'cannot';
    events.push({
      id: await createUuid(tx),
      content: JSON.stringify(verdict.event),
    });
  }

  const {
    epoch: next,
    key,
    boxes,
  } = sealRotation(groupId, device, roster, staying, {
    epoch,
    key: currentKey,
  });
  const request: RotateKeyRequest = {
    epoch: next,
    remove,
    senderKey: device.boxKey,
    boxes,
    events: encryptEvents(groupId, device.deviceId, next, key, events),
  };
  return { request, key };
}

/** How one rotation ended. */
export type RotationResult =
  /** The API rotated; the new key is saved unless the secure store took none. */
  | { outcome: 'rotated' }
  /** Not sent: no other device represents the member the plan names. */
  | { outcome: 'nobody' }
  /** Not sent: a device that stays has no roster entry, or this phone lacks its key or identity. */
  | { outcome: 'cannot' }
  /** Refused: the request did not name the group's member devices, which are these. */
  | { outcome: 'devices'; devices: string[] }
  /** Refused: the group is at this key epoch, not the one before the request's. */
  | { outcome: 'epoch'; epoch: number }
  /** Refused: no device was to be removed, and the group needs no new key. */
  | { outcome: 'rotation-not-needed' }
  | { outcome: 'no-answer' }
  | { outcome: 'failed' };

/**
 * Prepares one rotation from the local data as it is now and sends it. When the API
 * answers that it rotated, saves the new key (SHARING-273.1): a key that cannot be saved
 * comes back in the box the phone sealed for itself.
 */
export async function rotateGroupKey(
  database: Database,
  { apiUrl, groupId }: SyncTarget,
  plan: RotationPlan,
): Promise<RotationResult> {
  const device = await signingDevice(database);
  if (device === 'lost') return { outcome: 'cannot' };
  const prepared = await database.transaction((tx) =>
    prepareRotation(tx, groupId, device, plan),
  );
  if (prepared === 'nobody' || prepared === 'cannot')
    return { outcome: prepared };
  const { request, key } = prepared;
  const answer = await sendApiRequest(database, {
    apiUrl,
    method: 'POST',
    path: `/groups/${groupId}/rotation`,
    body: JSON.stringify(request),
    giveUpAfterMs: GIVE_UP_AFTER_MS,
  });
  if (answer.outcome === 'no-answer') return { outcome: 'no-answer' };
  if (answer.outcome !== 'answered') return { outcome: 'failed' };
  const said = jsonIn(answer.body);
  if (answer.status === 200) {
    if (!isRotateKeyResponse(said) || said.epoch !== request.epoch)
      return { outcome: 'failed' };
    await saveGroupKey(database, { groupId, epoch: said.epoch, key }).catch(
      () => undefined,
    );
    return { outcome: 'rotated' };
  }
  if (
    isRotationRefusal(said) &&
    ROTATION_REFUSAL_STATUS[said.error] === answer.status
  )
    return said.error === 'devices'
      ? { outcome: 'devices', devices: said.devices }
      : { outcome: 'rotation-not-needed' };
  return isGroupRefusal(said) &&
    said.error === 'epoch' &&
    GROUP_REFUSAL_STATUS.epoch === answer.status
    ? { outcome: 'epoch', epoch: said.epoch }
    : { outcome: 'failed' };
}

/**
 * Rotates the key for a group the API says needs it, whose member devices are `devices`
 * (SHARING-275.1). Resolves with whether a sync of the ledger should follow: the phone
 * rotated, or found that another phone had, in which case it has fetched the key it lacked.
 */
export async function rotateForGroup(
  database: Database,
  target: SyncTarget,
  devices: readonly string[],
): Promise<boolean> {
  const result = await rotateGroupKey(database, target, { devices });
  if (result.outcome === 'epoch') {
    if (!(await readGroupKey(target.groupId, result.epoch)))
      await fetchGroupKeys(database, target);
    return true;
  }
  return (
    result.outcome === 'rotated' || result.outcome === 'rotation-not-needed'
  );
}

// Invites a device that left knows

/** A link created before the latest departure is known to a device that left (SHARING-284.1). */
export function latestDeparture(roster: Roster) {
  let left: SyncStamp | undefined;
  for (const { value, stamp } of roster.values())
    if (value === null && (!left || compareSyncStamps(stamp, left) > 0))
      left = stamp;
  return left;
}

export async function inviteDueForRevocation(
  tx: SqlExecutor,
  groupId: string,
  code: string,
  left: SyncStamp | undefined,
): Promise<boolean> {
  if (!left) return false;
  const invite = await readSyncRecord(tx, groupId, 'invite', code);
  return !!invite && compareSyncStamps(invite.created, left) < 0;
}

/**
 * Revokes every invite of the ledger this phone holds that has not expired and was
 * created before a roster entry came to represent nobody (SHARING-284.1): the device that
 * left knows that link. The invite is deleted, with the event that says so, when the API
 * answers that it is revoked or that there is no such invite. Any other answer leaves it
 * for the next sync.
 */
export async function revokeInvitesOfThoseWhoLeft(
  database: Database,
  { apiUrl, groupId }: SyncTarget,
): Promise<void> {
  const due = await database.transaction(async (tx) => {
    if ((await recordedEpoch(tx, groupId)) === undefined) return [];
    const left = latestDeparture(await readRoster(tx, groupId));
    if (!left) return [];
    const invites = await tx.all<{ code: string }>(
      'SELECT id AS code FROM group_invites WHERE groupId = ? AND expiresAtMs > ? ORDER BY id',
      [groupId, await readCorrectedTime(tx)],
    );
    const codes: string[] = [];
    for (const { code } of invites)
      if (await inviteDueForRevocation(tx, groupId, code, left))
        codes.push(code);
    return codes;
  });
  for (const code of due) {
    const answer = await sendApiRequest(database, {
      apiUrl,
      method: 'DELETE',
      path: `/groups/${groupId}/invites/${code}`,
      giveUpAfterMs: GIVE_UP_AFTER_MS,
    });
    if (answer.outcome !== 'answered') continue;
    const said = jsonIn(answer.body);
    const revoked =
      answer.status === 200
        ? isRevokeInviteResponse(said) && said.code === code
        : isInviteRefusal(said) &&
          said.error === 'no-invite' &&
          INVITE_REFUSAL_STATUS[said.error] === answer.status;
    if (!revoked) continue;
    await database.transaction(async (tx) => {
      const group = await sharedGroup(tx, groupId);
      if (group) await recordRevokedInvite(tx, group, code);
    });
    notifyApplied(database, groupId);
  }
}
