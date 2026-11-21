import { hasExactly, isHexContent, isId, isWhole } from './wire';

// What the snapshot API's requests and answers look like on the wire (ADR-0028,
// docs/specs/sync/spec.md): a phone uploads a snapshot of a shared ledger chunk by chunk for
// one device, and that device asks for it and downloads it chunk by chunk. The phone and
// the API both use this file (ADR-0007).
//
// Every request here is a signed request, so the API can also refuse it with a `Refusal`,
// and with the `GroupRefusal`s `not-a-member` and `epoch`.

/** The fewest and the most bytes a chunk's content may have. */
export const SNAPSHOT_CHUNK_MINIMUM = 41;
export const SNAPSHOT_CHUNK_LIMIT = 262_144;
/** The most chunks a snapshot may have. */
export const SNAPSHOT_CHUNK_COUNT_LIMIT = 64;
/** The most bytes the chunks of the snapshots a group has stored add up to: 16 MiB. */
export const GROUP_SNAPSHOT_LIMIT = 16_777_216;

/** The body of the upload of one chunk, as JSON. Every chunk repeats what its snapshot is. */
export interface UploadSnapshotChunkRequest {
  /** The device the snapshot is for. */
  deviceId: string;
  /** The key epoch the chunks are encrypted under. */
  epoch: number;
  /** The sequence number the snapshot covers. */
  sequence: number;
  /** How many chunks the snapshot has: 1 to 64. */
  count: number;
  /** This chunk's content: 41 to 262,144 bytes, in lowercase hexadecimal. */
  content: string;
}

/** What the API answers, with status 200, once it has the chunk. */
export interface SnapshotChunkStoredResponse {
  snapshotId: string;
  /** The chunk's index: 0 to 63. */
  index: number;
}

/** What the API answers, with status 200, to a device a group stores a complete snapshot for. */
export interface SnapshotResponse {
  snapshotId: string;
  /** The device that uploaded it. */
  deviceId: string;
  epoch: number;
  sequence: number;
  count: number;
}

/** What the API answers, with status 200, to the download of one chunk. */
export interface SnapshotChunkResponse {
  /** The content as it was uploaded, in lowercase hexadecimal. */
  content: string;
}

/** Why the snapshot API refused a request, besides the reasons it shares with the event API. */
export type SnapshotRefusal =
  /** The group stores no such snapshot, or none that is complete, for the device. */
  | { error: 'no-snapshot' }
  /** The group cannot store the chunk within its limit. */
  | { error: 'snapshots-full' };

export type SnapshotRefusalReason = SnapshotRefusal['error'];

/** The HTTP status of each of these refusals. */
export const SNAPSHOT_REFUSAL_STATUS: Record<SnapshotRefusalReason, number> = {
  'no-snapshot': 404,
  'snapshots-full': 413,
};

const isChunk = (value: unknown) =>
  isHexContent(value, SNAPSHOT_CHUNK_MINIMUM, SNAPSHOT_CHUNK_LIMIT);

function hasSnapshotMetadata(
  value: Record<'deviceId' | 'epoch' | 'sequence' | 'count', unknown>,
) {
  return (
    isId(value.deviceId) &&
    isWhole(value.epoch, 1) &&
    isWhole(value.sequence, 0) &&
    isWhole(value.count, 1) &&
    value.count <= SNAPSHOT_CHUNK_COUNT_LIMIT
  );
}

/** Whether `value` is exactly the body of the upload of one chunk (SYNC-100.1). */
export function isUploadSnapshotChunkRequest(
  value: unknown,
): value is UploadSnapshotChunkRequest {
  return (
    hasExactly(value, ['deviceId', 'epoch', 'sequence', 'count', 'content']) &&
    hasSnapshotMetadata(value) &&
    isChunk(value.content)
  );
}

/** Whether `value` is exactly what the API answers once it has a chunk (SYNC-100.1). */
export function isSnapshotChunkStoredResponse(
  value: unknown,
): value is SnapshotChunkStoredResponse {
  return (
    hasExactly(value, ['snapshotId', 'index']) &&
    isId(value.snapshotId) &&
    isWhole(value.index, 0) &&
    value.index < SNAPSHOT_CHUNK_COUNT_LIMIT
  );
}

/** Whether `value` is exactly what the API answers to a device that has a snapshot waiting (SYNC-100.1). */
export function isSnapshotResponse(value: unknown): value is SnapshotResponse {
  return (
    hasExactly(value, [
      'snapshotId',
      'deviceId',
      'epoch',
      'sequence',
      'count',
    ]) &&
    isId(value.snapshotId) &&
    hasSnapshotMetadata(value)
  );
}

/** Whether `value` is exactly what the API answers to the download of one chunk (SYNC-100.1). */
export function isSnapshotChunkResponse(
  value: unknown,
): value is SnapshotChunkResponse {
  return hasExactly(value, ['content']) && isChunk(value.content);
}

/** Whether `value` is exactly the body of one of the snapshot API's own refusals (SYNC-100.1). */
export function isSnapshotRefusal(value: unknown): value is SnapshotRefusal {
  return (
    hasExactly(value, ['error']) &&
    (value.error === 'no-snapshot' || value.error === 'snapshots-full')
  );
}
