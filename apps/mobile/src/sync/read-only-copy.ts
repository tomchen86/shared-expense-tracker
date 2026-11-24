import { deleteGroupKey } from '../sharing/group-key';
import type { Database, SqlExecutor } from '../storage';
import { notifyApplied } from './apply';
import { UNSENT_EVENTS } from './records';

// A shared ledger this phone no longer syncs (docs/specs/sync/spec.md, SYNC-300.1 to
// SYNC-302.1; ADR-0041, ADR-0042): the API said the phone is no member device, the user
// left, or the phone's authorization has lapsed. The copy keeps its records, its cursor
// and its unsent events, and nothing turns it back into a shared ledger.

/** Why a shared ledger is a read-only copy on this phone. */
export type ReadOnlyCopyReason = 'not-a-member' | 'left' | 'lapsed';

/** A read-only copy: why it is one, and how many of its events were never uploaded. */
export interface ReadOnlyCopy {
  reason: ReadOnlyCopyReason;
  unsent: number;
}

/** What makes the group a read-only copy on this phone; undefined when it is none. */
export async function readOnlyCopyOf(
  database: SqlExecutor,
  groupId: string,
): Promise<ReadOnlyCopy | undefined> {
  const [copy] = await database.all<ReadOnlyCopy>(
    `SELECT s.readOnly AS reason,
       (SELECT COUNT(*) FROM ${UNSENT_EVENTS} o WHERE o.groupId = s.groupId) AS unsent
     FROM sync_groups s WHERE s.groupId = ? AND s.readOnly IS NOT NULL`,
    [groupId],
  );
  return copy;
}

/**
 * Records in the local data that the shared ledger is a read-only copy from now on
 * (SYNC-302.1): what a sync does when the API says the phone is no member, what leaving
 * does, and what an import does on a phone whose authorization has lapsed. A copy keeps
 * the reason it has. The caller deletes the group's keys from the secure store.
 */
export async function makeReadOnlyCopy(
  database: SqlExecutor,
  groupId: string,
  reason: ReadOnlyCopyReason,
): Promise<void> {
  await database.run(
    'UPDATE sync_groups SET readOnly = ? WHERE groupId = ? AND readOnly IS NULL',
    [reason, groupId],
  );
}

/**
 * Deletes the group's keys of key epochs 1 to `epoch` from the secure store (SYNC-302.1).
 * A key that cannot be deleted stays: the copy is one all the same.
 */
export async function deleteGroupKeys(groupId: string, epoch: number) {
  for (let each = 1; each <= epoch; each += 1)
    await deleteGroupKey(groupId, each).catch(() => undefined);
}

/**
 * Makes the shared ledger a read-only copy in one transaction, deletes its group keys and
 * tells its screens. A group that is a copy already, or no shared ledger, stays as it is.
 */
export async function becomeReadOnlyCopy(
  database: Database,
  groupId: string,
  reason: ReadOnlyCopyReason,
): Promise<void> {
  const epoch = await database.transaction(async (tx) => {
    // 0 for a group whose keys are not this change's to delete.
    const [{ epoch }] = await tx.all<{ epoch: number }>(
      `SELECT COALESCE((SELECT epoch FROM sync_groups
         WHERE groupId = ? AND readOnly IS NULL), 0) AS epoch`,
      [groupId],
    );
    await makeReadOnlyCopy(tx, groupId, reason);
    return epoch;
  });
  await deleteGroupKeys(groupId, epoch);
  notifyApplied(database, groupId);
}

/**
 * Deletes a group and everything the local data holds for it (GROUPS-158.1): its members
 * and former members, its categories, its expenses with those in the trash, its list's
 * order and filters, and what the phone kept to sync it, its invites included. It is what
 * Delete Copy does, and what joining a group again does to the copy the snapshot replaces
 * (SHARING-289.1). The phone's latest stamp, its device identity and its own join
 * requests stay.
 */
export async function deleteGroupData(tx: SqlExecutor, groupId: string) {
  const expenses = 'SELECT id FROM expenses WHERE spaceId = ?';
  for (const statement of [
    `DELETE FROM sync_unapplied WHERE refusal IN
       (SELECT position FROM sync_refusals WHERE groupId = ?)`,
    'DELETE FROM sync_refusals WHERE groupId = ?',
    `DELETE FROM sync_uploaded_events WHERE eventId IN
       (SELECT id FROM sync_outbox WHERE groupId = ?)`,
    'DELETE FROM sync_outbox WHERE groupId = ?',
    'DELETE FROM sync_received WHERE groupId = ?',
    'DELETE FROM sync_records WHERE groupId = ?',
    'DELETE FROM pending_invites WHERE groupId = ?',
    'DELETE FROM group_invites WHERE groupId = ?',
    `DELETE FROM sync_own_money WHERE expenseId IN (${expenses})`,
    `DELETE FROM expense_changes WHERE expenseId IN (${expenses})`,
    `DELETE FROM expense_payments WHERE expenseId IN (${expenses})`,
    `DELETE FROM expense_shares WHERE expenseId IN (${expenses})`,
    'DELETE FROM expenses WHERE spaceId = ?',
    'DELETE FROM expense_list_orders WHERE spaceId = ?',
    'DELETE FROM categories WHERE spaceId = ?',
    'DELETE FROM sync_groups WHERE groupId = ?',
    'DELETE FROM group_members WHERE groupId = ?',
    'DELETE FROM groups WHERE id = ?',
  ])
    await tx.run(statement, [groupId]);
}

/**
 * Deletes a read-only copy from this phone in one transaction, as pressing Delete in the
 * confirmation does (GROUPS-158.1). It sends nothing and writes no event. Rejects when the
 * group is no read-only copy, or when the local data cannot be written.
 */
export async function deleteReadOnlyCopy(
  database: Database,
  groupId: string,
): Promise<void> {
  await database.transaction(async (tx) => {
    if (!(await readOnlyCopyOf(tx, groupId)))
      throw new Error('Not a read-only copy');
    await deleteGroupData(tx, groupId);
  });
  notifyApplied(database, groupId);
}
