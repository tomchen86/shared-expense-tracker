import { compareSyncStamps, type SyncStamp } from './sync';

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
export function possibleSyncDuplicates({
  device,
  expenses,
  distinct,
}: {
  device: string;
  expenses: readonly SyncDuplicateCandidate[];
  distinct: readonly (readonly [string, string])[];
}): SyncPossibleDuplicate[] {
  const pairKey = (a: string, b: string) =>
    JSON.stringify(a < b ? [a, b] : [b, a]);
  const settled = new Set(distinct.map(([a, b]) => pairKey(a, b)));
  const ordered = expenses
    .filter((expense) => !expense.trashed)
    .sort(
      (a, b) =>
        compareSyncStamps(a.created, b.created) ||
        Number(a.id > b.id) - Number(a.id < b.id),
    );
  // Only earlier expenses with the same values and the opposite recorder can pair.
  const earlier = new Map<string, { mine: string[]; others: string[] }>();
  const pairs: SyncPossibleDuplicate[] = [];
  for (const expense of ordered) {
    const key = JSON.stringify([
      expense.date,
      expense.amountMinor,
      expense.currency,
    ]);
    let alike = earlier.get(key);
    if (!alike) {
      alike = { mine: [], others: [] };
      earlier.set(key, alike);
    }
    const mine = expense.created.device === device;
    for (const otherId of mine ? alike.others : alike.mine) {
      if (!settled.has(pairKey(expense.id, otherId)))
        pairs.push({ id: expense.id, of: otherId });
    }
    (mine ? alike.mine : alike.others).push(expense.id);
  }
  return pairs;
}
