import type { Database } from '../storage';

// A phone's side of a snapshot (ADR-0028): making one of a shared ledger and uploading it
// for one device, and fetching the one a group stores for this phone and taking it in.
// Nothing here starts either: the features that need a snapshot do (#141, #156).

/** What became of an upload of a snapshot (SYNC-115.1 to SYNC-120.1). */
export type SendSnapshotResult =
  /** Every chunk is stored: the snapshot's ID, and the sequence number it covers. */
  | { outcome: 'uploaded'; snapshotId: string; sequence: number }
  /** Not made: the shared ledger has events that are not uploaded yet. */
  | { outcome: 'unsent-events' }
  /** Not made: this phone lacks the group key of its key epoch. */
  | { outcome: 'no-key' }
  /** Not sent: the snapshot would take more chunks than a snapshot may have. */
  | { outcome: 'too-large' }
  /** The API has no room for it in the group. */
  | { outcome: 'snapshots-full' }
  /** A request had no answer, or one that is no confirmation. */
  | { outcome: 'failed' };

/** What became of taking a snapshot in (SYNC-121.1 to SYNC-128.1). */
export type TakeSnapshotResult =
  /** The snapshot is merged into the local data. */
  | { outcome: 'imported' }
  /** The group stores no snapshot for this phone. */
  | { outcome: 'none' }
  /** This phone lacks the group key of the snapshot's key epoch. */
  | { outcome: 'no-key' }
  /** The snapshot is in a format version this app does not know. */
  | { outcome: 'update-needed' }
  /** The snapshot cannot be used on this phone: it does not decrypt, is not valid, or collides with local data. */
  | { outcome: 'unusable' }
  /** A request had no answer, or one that is not what was asked for. */
  | { outcome: 'failed' };

/**
 * Makes a snapshot of a shared ledger and uploads it for the device `deviceId`. Rejects
 * when the group is no shared ledger on this phone.
 */
export function sendSnapshot(
  database: Database,
  snapshot: { apiUrl: string; groupId: string; deviceId: string },
): Promise<SendSnapshotResult> {
  void database;
  void snapshot;
  return Promise.reject(new Error('Not implemented'));
}

/** Fetches the snapshot the group stores for this phone, and merges it into the local data. */
export function takeSnapshot(
  database: Database,
  group: { apiUrl: string; groupId: string },
): Promise<TakeSnapshotResult> {
  void database;
  void group;
  return Promise.reject(new Error('Not implemented'));
}
