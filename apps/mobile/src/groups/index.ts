import {
  canAddGroupMember,
  syncRecordValues,
  type SyncRecord,
} from '@shared-expense/domain';
import { createUuid, type Database, type SqlExecutor } from '../storage';
import { ensureDefaultCategories } from '../categories/repository';
import type { LocalIdentity } from '../shell';
import { sharedGroup, writeLocalChange } from '../sync/records';

export interface GroupMember {
  id: string;
  userId: string | null;
  name: string;
}

export interface Group {
  id: string;
  name: string;
  archived: boolean;
  /** Whether it is a shared ledger. A read-only copy is none (SYNC-302.1). */
  shared: boolean;
  /**
   * Why the group is a read-only copy on this phone: the API says the phone is no member
   * device, the user left, or the phone's authorization has lapsed. Absent when it is none.
   */
  readOnlyCopy?: 'not-a-member' | 'left' | 'lapsed';
  members: GroupMember[];
}

/** Whether the group can only be looked at: it is archived, or a read-only copy (GROUPS-156.1). */
export const isReadOnlyGroup = (group: {
  archived: boolean;
  readOnlyCopy?: string;
}) => group.archived || group.readOnlyCopy !== undefined;

export async function applyMergedGroup(
  tx: SqlExecutor,
  groupId: string,
  record: Extract<SyncRecord, { type: 'group' | 'member' }>,
) {
  if (record.type === 'group') {
    const name = record.units.name!.value; // A group's only unit.
    const { changes } = await tx.run(
      'UPDATE groups SET name = ? WHERE id = ? AND name <> ?',
      [name, groupId, name],
    );
    return changes > 0;
  }
  const member = syncRecordValues(record);
  if (!member) {
    const { changes } = await tx.run(
      'DELETE FROM group_members WHERE groupId = ? AND id = ?',
      [groupId, record.id],
    );
    return changes > 0;
  }
  // A member with a user ID is you or has a phone: a member of the group whatever this
  // unit says. The roster, read once the page's events are in, has the last word
  // (SYNC-36.4). Sync storage keeps the unit, with its stamp for ordering.
  const removed = 'excluded.removed AND group_members.userId IS NULL';
  const { changes } = await tx.run(
    `INSERT INTO group_members (id, groupId, name, removed, position)
     VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM group_members WHERE groupId = ?))
     ON CONFLICT (id) DO UPDATE SET name = excluded.name, removed = ${removed}
     WHERE group_members.groupId = excluded.groupId
       AND (group_members.name, group_members.removed) IS NOT (excluded.name, ${removed})`,
    [record.id, groupId, member.name, Number(member.removed), groupId],
  );
  return changes > 0;
}

/** Every group in the local data, in the order they were created. */
export async function listGroups(database: SqlExecutor): Promise<Group[]> {
  const rows = await database.all<{
    id: string;
    name: string;
    archived: number;
    shared: number;
    readOnly: Group['readOnlyCopy'] | null;
    memberId: string | null;
    userId: string | null;
    memberName: string;
  }>(`SELECT g.id, g.name, g.archived,
             s.groupId IS NOT NULL AND s.readOnly IS NULL AS shared, s.readOnly,
             m.id AS memberId, m.userId, m.name AS memberName
      FROM groups g LEFT JOIN sync_groups s ON s.groupId = g.id
      LEFT JOIN group_members m ON m.groupId = g.id AND m.removed = 0
      ORDER BY g.position, m.position`);
  const groups = new Map<string, Group>();
  for (const row of rows) {
    let group = groups.get(row.id);
    if (!group) {
      group = {
        id: row.id,
        name: row.name,
        archived: row.archived === 1,
        shared: row.shared === 1,
        ...(row.readOnly && { readOnlyCopy: row.readOnly }),
        members: [],
      };
      groups.set(row.id, group);
    }
    if (row.memberId !== null) {
      group.members.push({
        id: row.memberId,
        userId: row.userId,
        name: row.memberName,
      });
    }
  }
  return [...groups.values()];
}

export function setGroupArchived(
  database: Database,
  id: string,
  archived: boolean,
): Promise<void> {
  return database.transaction(async (transaction) => {
    const result = await transaction.run(
      'UPDATE groups SET archived = ? WHERE id = ?',
      [archived ? 1 : 0, id],
    );
    if (result.changes !== 1) throw new Error('Group not found');
  });
}

export async function createGroup(
  database: Database,
  name: string,
  identity: LocalIdentity,
): Promise<void> {
  await database.transaction(async (transaction) => {
    const id = await nextId(transaction);
    await transaction.run(
      `INSERT INTO groups (id, name, position)
       SELECT ?, ?, COALESCE(MAX(position), 0) + 1 FROM groups`,
      [id, name],
    );
    const memberId = await nextId(transaction);
    await transaction.run(
      'INSERT INTO group_members (id, groupId, userId, name, position) VALUES (?, ?, ?, ?, 1)',
      [memberId, id, identity.userId, identity.name],
    );
    await ensureDefaultCategories(transaction, id);
  });
}

async function nextId(transaction: SqlExecutor): Promise<string> {
  const existing = await transaction.all<{ id: string }>(
    `SELECT userId AS id FROM local_identity
     UNION SELECT personalSpaceId FROM local_identity
     UNION SELECT personalParticipantId FROM local_identity
     UNION SELECT id FROM categories UNION SELECT id FROM groups
     UNION SELECT id FROM group_members UNION SELECT id FROM expenses`,
  );
  const ids = new Set(existing.map((row) => row.id));
  let id = await createUuid(transaction);
  while (ids.has(id)) id = await createUuid(transaction);
  return id;
}

export function listFormerMembers(
  database: SqlExecutor,
  groupId: string,
): Promise<GroupMember[]> {
  return database.all<GroupMember>(
    `SELECT id, userId, name FROM group_members
     WHERE groupId = ? AND removed = 1 ORDER BY position DESC`,
    [groupId],
  );
}

export const memberNameKey = (name: string) => name.trim().toLowerCase();

export class MemberNameExistsError extends Error {}

function listCurrentMembers(transaction: SqlExecutor, groupId: string) {
  return transaction.all<GroupMember>(
    'SELECT id, userId, name FROM group_members WHERE groupId = ? AND removed = 0',
    [groupId],
  );
}

function checkMemberName(
  members: readonly GroupMember[],
  name: string,
  memberId?: string,
) {
  const key = memberNameKey(name);
  if (!key) throw new Error('A member name is required');
  if (
    members.some(
      (member) => member.id !== memberId && memberNameKey(member.name) === key,
    )
  )
    throw new MemberNameExistsError();
}

export function addGroupMember(
  database: Database,
  groupId: string,
  name: string,
  formerMemberId?: string,
): Promise<void> {
  return database.transaction(async (transaction) => {
    const former = formerMemberId
      ? (await listFormerMembers(transaction, groupId)).find(
          (member) => member.id === formerMemberId,
        )
      : undefined;
    if (formerMemberId && !former) throw new Error('Former member not found');
    const memberName = former?.name ?? name.trim();
    const members = await listCurrentMembers(transaction, groupId);
    checkMemberName(members, memberName);
    const shared = await sharedGroup(transaction, groupId);
    if (!canAddGroupMember(shared !== undefined, members.length))
      throw new Error('Shared group member limit reached');
    const id = former?.id ?? (await nextId(transaction));
    if (former) {
      await transaction.run(
        `UPDATE group_members SET removed = 0,
         position = (SELECT COALESCE(MAX(position), 0) + 1 FROM group_members WHERE groupId = ?)
         WHERE id = ? AND groupId = ?`,
        [groupId, id, groupId],
      );
    } else {
      await transaction.run(
        `INSERT INTO group_members (id, groupId, userId, name, position)
         SELECT ?, ?, NULL, ?, COALESCE(MAX(position), 0) + 1 FROM group_members WHERE groupId = ?`,
        [id, groupId, memberName, groupId],
      );
    }
    if (shared)
      await writeLocalChange(transaction, shared, 'member', id, {
        name: memberName,
        removed: false,
      });
  });
}

export function removeGroupMember(
  database: Database,
  groupId: string,
  memberId: string,
): Promise<void> {
  return database.transaction(async (transaction) => {
    const result = await transaction.run(
      `UPDATE group_members SET removed = 1,
       position = (SELECT COALESCE(MAX(position), 0) + 1 FROM group_members WHERE groupId = ?)
       WHERE groupId = ? AND id = ? AND userId IS NULL AND removed = 0`,
      [groupId, groupId, memberId],
    );
    if (result.changes !== 1) throw new Error('Member cannot be removed');
    const shared = await sharedGroup(transaction, groupId);
    if (shared)
      await writeLocalChange(transaction, shared, 'member', memberId, {
        removed: true,
      });
  });
}

export function renameGroupMember(
  database: Database,
  groupId: string,
  memberId: string,
  name: string,
): Promise<void> {
  return database.transaction(async (transaction) => {
    const memberName = name.trim();
    const members = await listCurrentMembers(transaction, groupId);
    checkMemberName(members, memberName, memberId);
    const result = await transaction.run(
      'UPDATE group_members SET name = ? WHERE groupId = ? AND id = ? AND removed = 0',
      [memberName, groupId, memberId],
    );
    if (result.changes !== 1) throw new Error('Member not found');
    const shared = await sharedGroup(transaction, groupId);
    if (shared)
      await writeLocalChange(transaction, shared, 'member', memberId, {
        name: memberName,
      });
  });
}

export function renameGroup(
  database: Database,
  groupId: string,
  name: string,
): Promise<void> {
  return database.transaction(async (transaction) => {
    const groupName = name.trim();
    if (!groupName) throw new Error('A group name is required');
    const result = await transaction.run(
      'UPDATE groups SET name = ? WHERE id = ?',
      [groupName, groupId],
    );
    if (result.changes !== 1) throw new Error('Group not found');
    const shared = await sharedGroup(transaction, groupId);
    if (shared)
      await writeLocalChange(transaction, shared, 'group', groupId, {
        name: groupName,
      });
  });
}
