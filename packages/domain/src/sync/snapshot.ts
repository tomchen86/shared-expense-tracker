import type { SyncRecord, SyncStamp } from './sync';

/**
 * One record as a snapshot holds it (ADR-0028): the record as merged so far, the stamp it
 * was created with, and whether it was there when its group became a shared ledger, which
 * fixes that stamp.
 */
export type SyncSnapshotRecord = SyncRecord & {
  created: SyncStamp;
  seeded: boolean;
};

/** What a snapshot of format version 1 holds (SYNC-98.1). */
export interface SyncSnapshot {
  /** The snapshot's own format version. */
  version: 1;
  /** The highest event format version among the events it covers. */
  eventVersion: 1;
  groupId: string;
  /** The sequence number it covers: every event up to it is merged into the records. */
  sequence: number;
  /** The ID of the category that is the group's Uncategorized. */
  uncategorized: string;
  records: SyncSnapshotRecord[];
}

export type SyncSnapshotVerdict =
  | { status: 'valid'; snapshot: SyncSnapshot }
  | { status: 'refused' }
  // The snapshot, or an event it covers, is in a format version newer than these rules know.
  | { status: 'unsupported' };

/** Judges what a snapshot holds once decrypted and parsed (SYNC-98.1). */
export function checkSyncSnapshot(content: unknown): SyncSnapshotVerdict {
  void content;
  throw new Error('Not implemented');
}

/**
 * Merges one record of a snapshot into the same record as a phone holds it; `held` is
 * undefined when the phone has nothing of it yet (SYNC-99.1).
 */
export function mergeSyncSnapshotRecord(input: {
  held?: SyncSnapshotRecord;
  incoming: SyncSnapshotRecord;
  /** The latest stamp the phone has seen, if any. */
  seen?: SyncStamp;
}): { record: SyncSnapshotRecord; seen: SyncStamp } {
  void input;
  throw new Error('Not implemented');
}
