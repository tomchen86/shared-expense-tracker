import type { Database } from '../storage';

/**
 * Syncs one shared ledger once with the API at `apiUrl`: downloads until no events
 * follow, then uploads the ledger's unsent events (SYNC-68.1). Resolves once the sync has
 * ended, whether it finished or stopped on the way; what it did shows in the local data.
 * Rejects when the local data cannot be read or written.
 */
export async function syncGroup(
  database: Database,
  ledger: { apiUrl: string; groupId: string },
): Promise<void> {
  void database;
  void ledger;
  throw new Error('Not implemented: #135');
}
