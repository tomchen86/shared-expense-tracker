import type { SqlExecutor } from '../storage';

// A shared ledger this phone no longer syncs (docs/specs/sync/spec.md, SYNC-300.1 to
// SYNC-302.1; ADR-0041, ADR-0042). Not built yet: issue 143's implementation replaces
// these bodies.

/** Why a shared ledger is a read-only copy on this phone. */
export type ReadOnlyCopyReason = 'not-a-member' | 'left' | 'lapsed';

/** A read-only copy: why it is one, and how many of its events were never uploaded. */
export interface ReadOnlyCopy {
  reason: ReadOnlyCopyReason;
  unsent: number;
}

/** What makes the group a read-only copy on this phone; undefined when it is none. */
export const readOnlyCopyOf: (
  database: SqlExecutor,
  groupId: string,
) => Promise<ReadOnlyCopy | undefined> = () => {
  throw new Error('Not implemented: issue 143');
};

/**
 * Records in the local data that the shared ledger is a read-only copy from now on
 * (SYNC-302.1): what a sync does when the API says the phone is no member, what leaving
 * does, and what an import does on a phone whose authorization has lapsed. The caller
 * deletes the group's keys from the secure store.
 */
export const makeReadOnlyCopy: (
  database: SqlExecutor,
  groupId: string,
  reason: ReadOnlyCopyReason,
) => Promise<void> = () => {
  throw new Error('Not implemented: issue 143');
};
