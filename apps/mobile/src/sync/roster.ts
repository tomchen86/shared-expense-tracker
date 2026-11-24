import {
  compareSyncStamps,
  type SyncRecord,
  type SyncStamp,
  type SyncUnits,
} from '@shared-expense/domain';
import type { SqlExecutor } from '../storage';

type Entry = { value: SyncUnits['device']['member']; stamp: SyncStamp };

/**
 * A shared ledger's roster entries by device ID: which member each device represents, or
 * null for a device that left and represents nobody (SYNC-250.2).
 */
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
 * The members of a shared ledger that another phone represents: those a roster entry of
 * another device names, whatever user ID that entry carries (SYNC-251.2). None for a group
 * that is no shared ledger.
 */
export async function membersWithPhones(
  database: SqlExecutor,
  groupId: string,
): Promise<string[]> {
  const rows = await database.all<{ memberId: string }>(
    `SELECT DISTINCT json_extract(r.record, '$.units.member.value.memberId') AS memberId
     FROM sync_records r JOIN sync_groups s ON s.groupId = r.groupId
     WHERE r.groupId = ? AND r.type = 'device' AND r.id <> s.device
       AND json_extract(r.record, '$.units.member.value.memberId') IS NOT NULL`,
    [groupId],
  );
  return rows.map(({ memberId }) => memberId);
}

/**
 * Gives every member and former member of a shared ledger the user ID that its roster and
 * which phone this is decide (SYNC-251.2), in whatever order the events came. You are
 * the member this phone's own entry names, and the member it created the group as or
 * joined as while that entry names none. Every other member has the user ID of the latest
 * entry of another device that names it, unless that is your user ID. You, and a member
 * that another device's entry names, whatever user ID that entry carries, are members of
 * the group whatever their `removed` unit says (SYNC-36.4); once every entry that named a
 * member represents nobody, the unit decides again.
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
  const own = roster.get(ledger.device)?.value?.memberId;
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
        entry.value?.memberId === memberId &&
        entry.value.userId !== ledger.userId &&
        (!latest || compareSyncStamps(entry.stamp, latest.stamp) > 0)
      )
        latest = entry;
    return latest?.value?.userId ?? null;
  };
  /** The members another device represents, whatever user ID its entry carries. */
  const represented = new Set<string>();
  for (const [device, entry] of roster)
    if (device !== ledger.device && entry.value)
      represented.add(entry.value.memberId);

  let changed = false;
  for (const member of members) {
    const userId = userIdOf(member.id);
    const removed =
      member.id === you || represented.has(member.id) ? 0 : member.left;
    if (userId === member.userId && removed === member.removed) continue;
    await tx.run(
      'UPDATE group_members SET userId = ?, removed = ? WHERE id = ?',
      [userId, removed, member.id],
    );
    changed = true;
  }
  return changed;
}
