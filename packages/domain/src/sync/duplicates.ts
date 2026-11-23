import type { SyncStamp } from './sync';

/** What the rule for possible duplicates reads of one expense of a shared ledger (SYNC-201.1). */
export interface SyncDuplicateCandidate {
  id: string;
  /** The expense's creation stamp: its device is the phone that recorded the expense. */
  created: SyncStamp;
  /** YYYY-MM-DD */
  date: string;
  amountMinor: number;
  currency: string;
  /** Whether the expense is in the trash. */
  trashed: boolean;
}

/** A possible duplicate on this phone, and the earlier expense it is compared with. */
export interface SyncPossibleDuplicate {
  /** The ID of the possible duplicate: the expense of the pair that was created later. */
  id: string;
  /** The ID of the other expense of the pair. */
  of: string;
}

/**
 * The pairs of a shared ledger that the phone whose device ID is `device` shows as possible
 * duplicates (SYNC-201.1). `distinct` holds the two expense IDs of each "not a duplicate"
 * record of the ledger.
 */
export function possibleSyncDuplicates(input: {
  device: string;
  expenses: readonly SyncDuplicateCandidate[];
  distinct: readonly (readonly [string, string])[];
}): SyncPossibleDuplicate[] {
  throw new Error(
    `Not implemented: the possible duplicates among ${input.expenses.length} expenses`,
  );
}
