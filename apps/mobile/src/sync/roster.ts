import {
  compareSyncStamps,
  type SyncRecord,
  type SyncStamp,
  type SyncUnits,
} from '@shared-expense/domain';
import type { SqlExecutor } from '../storage';

type Entry = { value: SyncUnits['device']['member']; stamp: SyncStamp };

/** A shared ledger's roster entries by device ID: which member each device represents. */
export async function readRoster(
  tx: SqlExecutor,
  groupId: string,
): Promise<Map<string, Entry>> {
  const rows = await tx.all<{ id: string; record: string }>(
    "SELECT id, record FROM sync_records WHERE groupId = ? AND type = 'device'",
    [groupId],
  );
  return new Map(
    rows.map(({ id, record }) => {
      // A roster entry is never deleted, and its first event holds its one unit.
      const { units } = JSON.parse(record) as Extract<
        SyncRecord,
        { type: 'device' }
      >;
      return [id, units.member!];
    }),
  );
}

/**
 * Gives every member and former member of a shared ledger the user ID that its roster and
 * which phone this is decide (SYNC-251.1), in whatever order the events came. You are
 * the member this phone's own entry names, and the member it created the group as or
 * joined as until an entry names one. Every other member has the user ID of the latest
 * entry of another device that names it, unless that is your user ID. A member with a
 * user ID is a member of the group whatever its `removed` unit says (SYNC-36.3).
 * Resolves with whether that changed a member.
 */
export async function applyRoster(
  tx: SqlExecutor,
  groupId: string,
): Promise<boolean> {
  const [ledger] = await tx.all<{
    device: string;
    ownMemberId: string | null;
    userId: string;
  }>(
    `SELECT s.device, s.ownMemberId, i.userId FROM sync_groups s, local_identity i
     WHERE s.groupId = ?`,
    [groupId],
  );
  const members = await tx.all<{
    id: string;
    userId: string | null;
    removed: number;
    left: number;
  }>(
    `SELECT m.id, m.userId, m.removed,
       json_extract(r.record, '$.units.removed.value') AS left
     FROM group_members m
     JOIN sync_records r ON r.groupId = m.groupId AND r.type = 'member' AND r.id = m.id
     WHERE m.groupId = ?`,
    [groupId],
  );
  const roster = await readRoster(tx, groupId);
  const own = roster.get(ledger.device)?.value.memberId;
  const you =
    own !== undefined && members.some(({ id }) => id === own)
      ? own
      : ledger.ownMemberId;
  // A phone that joined is the member its entry named then, whatever becomes of the entry.
  if (you !== null && ledger.ownMemberId === null)
    await tx.run('UPDATE sync_groups SET ownMemberId = ? WHERE groupId = ?', [
      you,
      groupId,
    ]);

  /** The user ID the member stores: yours for you, else that of the latest entry that names it. */
  const userIdOf = (memberId: string) => {
    if (memberId === you) return ledger.userId;
    let latest: Entry | undefined;
    for (const [device, entry] of roster)
      if (
        device !== ledger.device &&
        entry.value.memberId === memberId &&
        entry.value.userId !== ledger.userId &&
        (!latest || compareSyncStamps(entry.stamp, latest.stamp) > 0)
      )
        latest = entry;
    return latest?.value.userId ?? null;
  };

  let changed = false;
  for (const member of members) {
    const userId = userIdOf(member.id);
    const removed = userId === null ? member.left : 0;
    if (userId === member.userId && removed === member.removed) continue;
    await tx.run(
      'UPDATE group_members SET userId = ?, removed = ? WHERE id = ?',
      [userId, removed, member.id],
    );
    changed = true;
  }
  return changed;
}
