import type { SqlExecutor } from '../storage';

// A shared ledger this phone no longer syncs (docs/specs/sync/spec.md, SYNC-300.1 to
// SYNC-302.1; ADR-0041). Not built yet: issue 143's implementation replaces this body.

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
