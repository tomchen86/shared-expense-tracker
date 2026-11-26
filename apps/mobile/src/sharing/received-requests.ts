import { useCallback, useSyncExternalStore } from 'react';
import type { Database } from '../storage';
import { subscribeToSyncEnds } from '../sync/loop';
import {
  approveJoinRequest,
  listReceivedJoinRequests,
  rejectJoinRequest,
  type ApproveResult,
  type ReceivedJoinRequest,
  type RejectResult,
} from './join-decisions';

// The join requests a member's phone has listed for its shared ledgers. They are kept
// here, in memory, and nowhere else (SHARING-193.1): a phone that starts again has none
// until it lists them.

/** What this phone holds of a shared ledger's join requests. */
export interface ReceivedRequests {
  /** In the API's order. */
  requests: readonly ReceivedJoinRequest[];
  /** The request this phone is approving or rejecting now (SHARING-202.1). */
  processing?: { deviceId: string; action: 'approve' | 'reject' };
}

const NONE: ReceivedRequests = { requests: [] };

interface Store {
  ledgers: Map<string, ReceivedRequests>;
  /** Lists in progress per ledger, including overlapping lists on opening Members and after sync. */
  listing: Map<string, number>;
  listeners: Set<() => void>;
}
const stores = new WeakMap<Database, Store>();

function storeOf(database: Database): Store {
  let store = stores.get(database);
  if (!store) {
    store = { ledgers: new Map(), listing: new Map(), listeners: new Set() };
    stores.set(database, store);
  }
  return store;
}

const held = (database: Database, groupId: string) =>
  storeOf(database).ledgers.get(groupId) ?? NONE;

function hold(database: Database, groupId: string, next: ReceivedRequests) {
  const store = storeOf(database);
  store.ledgers.set(groupId, next);
  store.listeners.forEach((listener) => listener());
}

/**
 * Lists a shared ledger's requests again (SHARING-190.2), and holds what the phone could
 * read in place of what it held. A ledger that is archived has none, and one with a
 * request being answered is not listed. A list that fails changes nothing.
 */
export async function refreshReceivedRequests(
  database: Database,
  groupId: string,
  source?: 'timer',
): Promise<void> {
  const { listing } = storeOf(database);
  const count = listing.get(groupId) ?? 0;
  if (held(database, groupId).processing || (source === 'timer' && count > 0))
    return;
  listing.set(groupId, count + 1);
  let requests: ReceivedJoinRequest[];
  try {
    // A read-only copy lists none: nothing is sent for it (SYNC-302.1).
    const [ledger] = await database.all<{
      archived: number;
      signer: string | null;
    }>(
      `SELECT g.archived, (SELECT deviceId FROM device_identity) AS signer
       FROM sync_groups s JOIN groups g ON g.id = s.groupId
       WHERE s.groupId = ? AND s.readOnly IS NULL`,
      [groupId],
    );
    requests =
      ledger && !ledger.archived
        ? await listReceivedJoinRequests(database, groupId, ledger.signer)
        : [];
  } catch {
    return;
  } finally {
    const remaining = listing.get(groupId)! - 1;
    if (remaining === 0) listing.delete(groupId);
    else listing.set(groupId, remaining);
  }
  const now = held(database, groupId);
  // A request that started to be answered meanwhile is the one its row showed.
  if (now.processing) return;
  if (requests.length > 0 || now.requests.length > 0)
    hold(database, groupId, { requests });
}

/**
 * Approves or rejects a request, one at a time for a ledger (SHARING-202.1). Resolves
 * with how it ended, or with nothing when the ledger has a request being answered. It
 * goes on whatever screen is open. `addBack` is the former member an approval adds back
 * in place of a new member (SHARING-288.1).
 */
export async function answerJoinRequest(
  database: Database,
  groupId: string,
  request: ReceivedJoinRequest,
  action: 'approve' | 'reject',
  addBack?: string,
): Promise<ApproveResult | RejectResult | undefined> {
  const before = held(database, groupId);
  if (before.processing) return undefined;
  hold(database, groupId, {
    ...before,
    processing: { deviceId: request.deviceId, action },
  });
  const result = await (
    action === 'approve'
      ? approveJoinRequest(database, groupId, request, addBack)
      : rejectJoinRequest(database, groupId, request)
  ).catch((): RejectResult => ({ outcome: 'failed' }));
  const answered =
    result.outcome === 'approved' || result.outcome === 'rejected';
  hold(database, groupId, {
    requests: held(database, groupId).requests.filter(
      (each) => !answered || each.deviceId !== request.deviceId,
    ),
  });
  // What the API holds now: nothing of a request that was approved, and whatever took
  // the place of one that somebody else answered (SHARING-199.1, SHARING-200.2).
  if (result.outcome === 'approved' || result.outcome === 'answered')
    void refreshReceivedRequests(database, groupId);
  return result;
}

/** Lists a ledger's requests after each sync whose first download finished (SHARING-190.2). */
export const watchReceivedRequests = (database: Database) =>
  subscribeToSyncEnds(database, (groupId, { downloaded }) => {
    if (downloaded) void refreshReceivedRequests(database, groupId);
  });

/** The requests this phone holds for a group, as they change. */
export function useReceivedRequests(
  database: Database,
  groupId: string,
): ReceivedRequests {
  return useSyncExternalStore(
    useCallback(
      (listener: () => void) => {
        const { listeners } = storeOf(database);
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      [database],
    ),
    () => held(database, groupId),
  );
}
