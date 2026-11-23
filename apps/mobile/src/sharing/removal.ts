import type { Database } from '../storage';

// Removing the phones of a member, and leaving a shared ledger
// (docs/specs/sharing/spec.md, SHARING-270.1 to 287.1; ADR-0041). What follows a sync by
// itself, rotating the key for a group that needs it, fetching a new key and revoking an
// invite a phone that left knows, has no function here: a sync of the ledger does it.
// Not built yet: issue 143's implementation replaces these bodies.

/** How removing a member who is represented by other phones ended (SHARING-270.1 to 274.1). */
export interface RemoveResult {
  /**
   * `removed`: the API took the phones off, or they were off already. `no-answer`: a
   * request of the sync or of the rotation got no answer. `failed`: anything else.
   */
  outcome: 'removed' | 'no-answer' | 'failed';
}

/** How leaving a shared ledger ended (SHARING-276.1, SHARING-277.1). */
export interface LeaveResult {
  /**
   * `left`: the ledger is a read-only copy on this phone now, also when the API says the
   * phone was no member device any more. `no-answer`: the request got no answer.
   */
  outcome: 'left' | 'no-answer' | 'failed';
}

const notBuilt = (): never => {
  throw new Error('Not implemented: issue 143');
};

/**
 * Takes every other phone that represents the member out of the shared ledger and rotates
 * its key, as pressing Remove in the confirmation does (SHARING-270.1).
 */
export const removeMemberDevices: (
  database: Database,
  groupId: string,
  memberId: string,
) => Promise<RemoveResult> = notBuilt;

/** Leaves the shared ledger, as pressing Leave in the confirmation does (SHARING-276.1). */
export const leaveSharedGroup: (
  database: Database,
  groupId: string,
) => Promise<LeaveResult> = notBuilt;
