import type { SyncEvent, SyncRefusal } from '@shared-expense/domain';
import type { Database, SqlExecutor } from '../storage';

// What the phone does with a shared ledger's sync events (docs/specs/sync/spec.md).
// Stubs: the signatures are the boundary the acceptance tests use, and the implementer
// replaces the bodies.

/** An event this phone wrote and has not uploaded yet. */
export interface UnsentSyncEvent {
  /** The event's own ID, the same every time it is uploaded. */
  id: string;
  /** The shared ledger the event belongs to. */
  groupId: string;
  content: SyncEvent;
}

/** An event as the API relays it, decrypted and parsed. */
export interface ReceivedSyncEvent {
  id: string;
  /** The ID of the device that uploaded it. */
  device: string;
  /** When the API received it, in milliseconds since the Unix epoch. */
  receivedAtMs: number;
  content: unknown;
}

/** A received event that was judged not to apply. */
export interface RefusedSyncEvent extends ReceivedSyncEvent {
  groupId: string;
  reason: SyncRefusal;
}

function notImplemented(name: string, ...inputs: unknown[]): never {
  throw new Error(`Not implemented: ${name} (${inputs.length} inputs)`);
}

/** Makes a group a shared ledger on this phone, whose device ID is `device`. */
export async function shareGroup(
  database: Database,
  input: { groupId: string; device: string },
): Promise<void> {
  return notImplemented('shareGroup', database, input);
}

/** The events this phone has not uploaded yet, in the order it wrote them. */
export async function listUnsentSyncEvents(
  database: SqlExecutor,
): Promise<UnsentSyncEvent[]> {
  return notImplemented('listUnsentSyncEvents', database);
}

/**
 * Applies the events received for a shared ledger, in the order given. It throws, and
 * saves nothing of the call, when the group is not a shared ledger or an event is of a
 * format version it does not know.
 */
export async function applySyncEvents(
  database: Database,
  groupId: string,
  events: readonly ReceivedSyncEvent[],
): Promise<void> {
  return notImplemented('applySyncEvents', database, groupId, events);
}

/** The received events that were judged not to apply, in the order they were received. */
export async function listRefusedSyncEvents(
  database: SqlExecutor,
): Promise<RefusedSyncEvent[]> {
  return notImplemented('listRefusedSyncEvents', database);
}
