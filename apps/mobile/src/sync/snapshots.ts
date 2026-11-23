import {
  bytesToHex,
  concatBytes,
  hexToBytes,
  utf8ToBytes,
} from '@noble/hashes/utils.js';
import { checkSyncSnapshot, type SyncSnapshot } from '@shared-expense/domain';
import {
  GROUP_REFUSAL_STATUS,
  SNAPSHOT_CHUNK_COUNT_LIMIT,
  SNAPSHOT_CHUNK_LIMIT,
  SNAPSHOT_CHUNK_MINIMUM,
  SNAPSHOT_REFUSAL_STATUS,
  isGroupRefusal,
  isSnapshotChunkResponse,
  isSnapshotChunkStoredResponse,
  isSnapshotRefusal,
  isSnapshotResponse,
  type SnapshotResponse,
  type UploadSnapshotChunkRequest,
} from '@shared-expense/domain/api';
import { decrypt, encrypt } from '@shared-expense/domain/crypto';
import { getRandomValues, randomUUID } from 'expo-crypto';
import { sendApiRequest, type ApiRequest } from '../sharing/api-request';
import { readDeviceIdentity } from '../sharing/device-identity';
import type { Database, SqlExecutor } from '../storage';
import { notifyApplied } from './apply';
import { makeSnapshot, importSnapshot } from './snapshot-ledger';
import { GIVE_UP_AFTER_MS, jsonIn, readGroupKey } from './transport';

// A phone's side of a snapshot (ADR-0028): making one of a shared ledger and uploading it
// for one device, and fetching the one a group stores for this phone and taking it in.
// Nothing here starts either: the features that need a snapshot do: approving a join
// request and joining (sharing), and catching up (#156).

/** What became of an upload of a snapshot (SYNC-115.1 to SYNC-120.1). */
export type SendSnapshotResult =
  /** Every chunk is stored: the snapshot's ID, and the sequence number it covers. */
  | { outcome: 'uploaded'; snapshotId: string; sequence: number }
  /** Not made: the shared ledger has events that are not uploaded yet. */
  | { outcome: 'unsent-events' }
  /** The group key is missing or the secure store cannot be read during upload. */
  | { outcome: 'no-key' }
  /** Not sent: the snapshot would take more chunks than a snapshot may have. */
  | { outcome: 'too-large' }
  /** The API has no room for it in the group. */
  | { outcome: 'snapshots-full' }
  /** A request had no answer, or one that is no confirmation. */
  | { outcome: 'failed' };

/** What became of taking a snapshot in (SYNC-121.1 to SYNC-128.3). */
export type TakeSnapshotResult =
  /** The snapshot is merged into the local data. */
  | { outcome: 'imported' }
  /** The group stores no snapshot for this phone. */
  | { outcome: 'none' }
  /** The group key for the snapshot's epoch is missing or the secure store cannot be read. */
  | { outcome: 'no-key' }
  /** The snapshot is in a format version this app does not know. */
  | { outcome: 'update-needed' }
  /** The snapshot cannot be used on this phone: it does not decrypt, is not valid, or collides with local data. */
  | { outcome: 'unusable' }
  /** A request had no answer, or one that is not what was asked for. */
  | { outcome: 'failed' };

/** A request of the upload or the fetch got no answer: `failed`, to callers that do not ask which. */
type NoAnswer = { outcome: 'no-answer' };

/** A snapshot as `makeSnapshot` made it, with the key to encrypt it under. */
export type MadeSnapshot = Extract<
  Awaited<ReturnType<typeof makeSnapshot>>,
  { outcome: 'made' }
>;

const PIECE_BYTES = SNAPSHOT_CHUNK_LIMIT - SNAPSHOT_CHUNK_MINIMUM;

type Envelope = SnapshotResponse & { groupId: string };

function chunkPath({ groupId, snapshotId }: Envelope, index: number) {
  return `/groups/${groupId}/snapshots/${snapshotId}/chunks/${index}`;
}

function chunkData(
  { groupId, snapshotId, deviceId, epoch, count }: Envelope,
  index: number,
) {
  return utf8ToBytes(
    [
      'shared-expense/snapshot/v1',
      groupId,
      snapshotId,
      deviceId,
      epoch,
      index,
      count,
    ].join('\n'),
  );
}

class SnapshotKeyReadError extends Error {}

function onKeyReadError(cause: unknown): never {
  throw new SnapshotKeyReadError('Cannot read the secure store', { cause });
}

function reportKeyReadError(error: unknown): { outcome: 'no-key' } {
  if (error instanceof SnapshotKeyReadError) return { outcome: 'no-key' };
  throw error;
}

async function request(database: Database, input: ApiRequest) {
  const answer = await sendApiRequest(database, {
    ...input,
    giveUpAfterMs: GIVE_UP_AFTER_MS,
    onSeedReadError: onKeyReadError,
  });
  if (answer.outcome === 'answered')
    return { status: answer.status, body: jsonIn(answer.body) };
}

async function uploadChunks(
  database: Database,
  apiUrl: string,
  recipient: string,
  envelope: Envelope,
  key: Uint8Array,
  plaintext: Uint8Array,
): Promise<
  SendSnapshotResult | NoAnswer | { outcome: 'epoch'; epoch: number }
> {
  const { snapshotId, sequence, epoch, count } = envelope;
  for (let index = 0; index < count; index++) {
    const start = index * PIECE_BYTES;
    const chunk: UploadSnapshotChunkRequest = {
      deviceId: recipient,
      sequence,
      epoch,
      count,
      content: bytesToHex(
        encrypt({
          key,
          nonce: getRandomValues(new Uint8Array(24)),
          associatedData: chunkData(envelope, index),
          plaintext: plaintext.subarray(start, start + PIECE_BYTES),
        }),
      ),
    };
    const answer = await request(database, {
      apiUrl,
      path: chunkPath(envelope, index),
      method: 'PUT',
      body: JSON.stringify(chunk),
    });
    if (!answer) return { outcome: 'no-answer' };
    const { status, body } = answer;
    if (
      index === 0 &&
      status === GROUP_REFUSAL_STATUS.epoch &&
      isGroupRefusal(body) &&
      body.error === 'epoch'
    )
      return { outcome: 'epoch', epoch: body.epoch };
    if (
      status === SNAPSHOT_REFUSAL_STATUS['snapshots-full'] &&
      isSnapshotRefusal(body) &&
      body.error === 'snapshots-full'
    )
      return { outcome: 'snapshots-full' };
    if (
      status !== 200 ||
      !isSnapshotChunkStoredResponse(body) ||
      body.snapshotId !== snapshotId ||
      body.index !== index
    )
      return { outcome: 'failed' };
  }
  return { outcome: 'uploaded', snapshotId, sequence };
}

/** Uploads a snapshot that was made, for the device `deviceId`. */
export async function uploadSnapshot(
  database: Database,
  snapshot: { apiUrl: string; groupId: string; deviceId: string },
  made: MadeSnapshot,
): Promise<SendSnapshotResult | NoAnswer> {
  const { apiUrl, groupId, deviceId: recipient } = snapshot;
  const plaintext = utf8ToBytes(JSON.stringify(made.content));
  const count = Math.ceil(plaintext.length / PIECE_BYTES);
  if (count > SNAPSHOT_CHUNK_COUNT_LIMIT) return { outcome: 'too-large' };

  try {
    const identity = await readDeviceIdentity(database, onKeyReadError);
    if (identity.status !== 'ready') return { outcome: 'failed' };
    const send = (epoch: number, key: Uint8Array) =>
      uploadChunks(
        database,
        apiUrl,
        recipient,
        {
          groupId,
          deviceId: identity.deviceId,
          sequence: made.content.sequence,
          count,
          epoch,
          snapshotId: randomUUID(),
        },
        key,
        plaintext,
      );
    const first = await send(made.epoch, made.key);
    if (first.outcome !== 'epoch') return first;
    const key = await readGroupKey(groupId, first.epoch, onKeyReadError);
    if (!key) return { outcome: 'failed' };
    const second = await send(first.epoch, key);
    return second.outcome === 'epoch' ? { outcome: 'failed' } : second;
  } catch (error) {
    return reportKeyReadError(error);
  }
}

<<<<<<< HEAD
/** The result as the callers that do not tell a missing answer from another failure get it. */
function withoutNoAnswer<Result extends { outcome: string }>(
  result: Result | NoAnswer,
): Result | { outcome: 'failed' } {
  return result.outcome === 'no-answer'
    ? { outcome: 'failed' }
    : (result as Result);
}

/**
 * Makes a snapshot of a shared ledger and uploads it for the device `deviceId`. Rejects
 * when the group is no shared ledger on this phone.
 */
export async function sendSnapshot(
  database: Database,
  snapshot: { apiUrl: string; groupId: string; deviceId: string },
): Promise<SendSnapshotResult> {
  const made = await database.transaction((tx) =>
    makeSnapshot(tx, snapshot.groupId),
  );
  if (made.outcome !== 'made') return made;
  return withoutNoAnswer<SendSnapshotResult>(
    await uploadSnapshot(database, snapshot, made),
  );
}

/** What the phone that joins a group checks and does as it takes its snapshot in. */
export interface Joining {
  /** Whether the snapshot is one to take in: asked once it is judged, before anything is written. */
  accepts: (snapshot: SyncSnapshot) => boolean;
  /** Runs in the transaction that takes the snapshot in, once it is in. */
  alsoIn: (tx: SqlExecutor) => Promise<void>;
}

async function downloadAndImport(
  database: Database,
  group: { apiUrl: string; groupId: string },
  joining?: Joining,
): Promise<TakeSnapshotResult | NoAnswer> {
  const { groupId, apiUrl } = group;
  const get = (path: string) =>
    request(database, {
      apiUrl,
      path,
      method: 'GET',
    });
  const asked = await get(`/groups/${groupId}/snapshot`);
  if (!asked) return { outcome: 'no-answer' };
  if (
    asked.status === SNAPSHOT_REFUSAL_STATUS['no-snapshot'] &&
    isSnapshotRefusal(asked.body) &&
    asked.body.error === 'no-snapshot'
  )
    return { outcome: 'none' };
  if (asked.status !== 200 || !isSnapshotResponse(asked.body))
    return { outcome: 'failed' };
  const envelope = { groupId, ...asked.body };
=======
interface SnapshotGroup {
  apiUrl: string;
  groupId: string;
  /** Catching up only takes a snapshot ahead of the cursor and records its update notice. */
  catchUp?: boolean;
}

/** Check before requesting chunks, and against the decrypted sequence when committing the import. */
async function takeAtSequence(
  tx: SqlExecutor,
  group: SnapshotGroup,
  sequence: number,
  take: () => Promise<TakeSnapshotResult>,
): Promise<TakeSnapshotResult> {
  if (group.catchUp) {
    const behind = await tx.all(
      'SELECT 1 FROM sync_groups WHERE groupId = ? AND cursor < ?',
      [group.groupId, sequence],
    );
    if (behind.length === 0) return { outcome: 'none' };
  }
  return take();
}

async function downloadChunks(
  database: Database,
  group: SnapshotGroup,
  envelope: Envelope,
): Promise<TakeSnapshotResult> {
  const { apiUrl, groupId } = group;
>>>>>>> ede771979593bf3eed8a78b64844c619097f5e05
  const key = await readGroupKey(groupId, envelope.epoch);
  if (!key) return { outcome: 'no-key' };

  const pieces: Uint8Array[] = [];
  for (let index = 0; index < envelope.count; index++) {
<<<<<<< HEAD
    const answer = await get(chunkPath(envelope, index));
    if (!answer) return { outcome: 'no-answer' };
    if (answer.status !== 200 || !isSnapshotChunkResponse(answer.body))
=======
    const answer = await request(database, {
      apiUrl,
      method: 'GET',
      path: chunkPath(envelope, index),
    });
    if (answer?.status !== 200 || !isSnapshotChunkResponse(answer.body))
>>>>>>> ede771979593bf3eed8a78b64844c619097f5e05
      return { outcome: 'failed' };
    const opened = decrypt({
      key,
      associatedData: chunkData(envelope, index),
      ciphertext: hexToBytes(answer.body.content),
    });
    if (!opened.ok)
      return {
        outcome:
          opened.reason === 'unsupported-version'
            ? 'update-needed'
            : 'unusable',
      };
    pieces.push(opened.plaintext);
  }
  const verdict = checkSyncSnapshot(jsonIn(concatBytes(...pieces)));
  if (verdict.status === 'unsupported') return { outcome: 'update-needed' };
  if (
    verdict.status !== 'valid' ||
    verdict.snapshot.groupId !== groupId ||
    joining?.accepts(verdict.snapshot) === false
  )
    return { outcome: 'unusable' };
<<<<<<< HEAD
  const imported = await database.transaction(async (tx) => {
    const taken = await importSnapshot(tx, verdict.snapshot, envelope.epoch);
    if (taken) await joining?.alsoIn(tx);
    return taken;
  });
  if (!imported) return { outcome: 'unusable' };
  notifyApplied(database, groupId);
  return { outcome: 'imported' };
=======
  const result = await database.transaction((tx) =>
    takeAtSequence(tx, group, verdict.snapshot.sequence, async () => ({
      outcome: (await importSnapshot(tx, verdict.snapshot, envelope.epoch))
        ? 'imported'
        : 'unusable',
    })),
  );
  if (result.outcome === 'imported') notifyApplied(database, groupId);
  return result;
}

async function downloadAndImport(
  database: Database,
  group: SnapshotGroup,
): Promise<TakeSnapshotResult> {
  const { apiUrl, groupId } = group;
  const asked = await request(database, {
    apiUrl,
    path: `/groups/${groupId}/snapshot`,
    method: 'GET',
  });
  if (!asked) return { outcome: 'failed' };
  let snapshotId: string | null = null;
  let result: TakeSnapshotResult;
  if (asked.status === 200 && isSnapshotResponse(asked.body)) {
    const envelope = { groupId, ...asked.body };
    snapshotId = envelope.snapshotId;
    result = await takeAtSequence(database, group, envelope.sequence, () =>
      downloadChunks(database, group, envelope).catch(reportKeyReadError),
    );
  } else if (
    asked.status === SNAPSHOT_REFUSAL_STATUS['no-snapshot'] &&
    isSnapshotRefusal(asked.body) &&
    asked.body.error === 'no-snapshot'
  ) {
    result = { outcome: 'none' };
  } else {
    return { outcome: 'failed' };
  }

  if (group.catchUp) {
    // An unanswered lookup leaves the previous notice alone. If a chunk could not
    // be read, preserve a known update requirement only for that same snapshot.
    const needsUpdate = result.outcome === 'update-needed' ? snapshotId : null;
    const unread = result.outcome === 'failed' || result.outcome === 'no-key';
    const { changes } = await database.run(
      `UPDATE sync_groups SET snapshotNeedingUpdate = ?
       WHERE groupId = ? AND waitsForSnapshot = 1 AND snapshotNeedingUpdate IS NOT ?
         AND (? = 0 OR snapshotNeedingUpdate IS NOT ?)`,
      [needsUpdate, groupId, needsUpdate, Number(unread), snapshotId],
    );
    if (changes) notifyApplied(database, groupId);
  }
  return result;
>>>>>>> ede771979593bf3eed8a78b64844c619097f5e05
}

/**
 * Fetches the snapshot the group stores for this phone, and merges it into the local
 * data. A phone that joins the group gives `joining`.
 */
export function fetchSnapshot(
  database: Database,
  group: { apiUrl: string; groupId: string },
  joining?: Joining,
): Promise<TakeSnapshotResult | NoAnswer> {
  return downloadAndImport(database, group, joining).catch(reportKeyReadError);
}

/** Fetches the snapshot the group stores for this phone, and merges it into the local data. */
export async function takeSnapshot(
  database: Database,
  group: SnapshotGroup,
): Promise<TakeSnapshotResult> {
  return withoutNoAnswer<TakeSnapshotResult>(
    await fetchSnapshot(database, group),
  );
}
