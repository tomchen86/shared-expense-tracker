import { createUuid, type Database, type SqlExecutor } from '../storage';
import { ensureDefaultCategories } from '../categories/repository';
import type { LocalIdentity } from '../shell';

export interface GroupMember {
  id: string;
  userId: string | null;
  name: string;
}

export interface Group {
  id: string;
  name: string;
  members: GroupMember[];
}

/** Every group in the local data, in the order they were created. */
export async function listGroups(database: SqlExecutor): Promise<Group[]> {
  const rows = await database.all<{
    id: string;
    name: string;
    memberId: string | null;
    userId: string | null;
    memberName: string;
  }>(`SELECT g.id, g.name, m.id AS memberId, m.userId, m.name AS memberName
      FROM groups g LEFT JOIN group_members m ON m.groupId = g.id AND m.removed = 0
      ORDER BY g.position, m.position`);
  const groups = new Map<string, Group>();
  for (const row of rows) {
    let group = groups.get(row.id);
    if (!group) {
      group = { id: row.id, name: row.name, members: [] };
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

async function checkMemberName(
  transaction: SqlExecutor,
  groupId: string,
  name: string,
  memberId?: string,
) {
  if (!name.trim()) throw new Error('A member name is required');
  const members = await transaction.all<GroupMember>(
    'SELECT id, userId, name FROM group_members WHERE groupId = ? AND removed = 0',
    [groupId],
  );
  if (
    members.some(
      (member) =>
        member.id !== memberId &&
        memberNameKey(member.name) === memberNameKey(name),
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
    await checkMemberName(transaction, groupId, former?.name ?? name);
    if (former) {
      await transaction.run(
        `UPDATE group_members SET removed = 0,
         position = (SELECT COALESCE(MAX(position), 0) + 1 FROM group_members WHERE groupId = ?)
         WHERE id = ? AND groupId = ?`,
        [groupId, former.id, groupId],
      );
    } else {
      const id = await nextId(transaction);
      await transaction.run(
        `INSERT INTO group_members (id, groupId, userId, name, position)
         SELECT ?, ?, NULL, ?, COALESCE(MAX(position), 0) + 1 FROM group_members WHERE groupId = ?`,
        [id, groupId, name.trim(), groupId],
      );
    }
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
  });
}

export function renameGroupMember(
  database: Database,
  groupId: string,
  memberId: string,
  name: string,
): Promise<void> {
  return database.transaction(async (transaction) => {
    await checkMemberName(transaction, groupId, name, memberId);
    const result = await transaction.run(
      'UPDATE group_members SET name = ? WHERE groupId = ? AND id = ? AND removed = 0',
      [name.trim(), groupId, memberId],
    );
    if (result.changes !== 1) throw new Error('Member not found');
  });
}

export function renameGroup(
  database: Database,
  groupId: string,
  name: string,
): Promise<void> {
  return database.transaction(async (transaction) => {
    if (!name.trim()) throw new Error('A group name is required');
    const result = await transaction.run(
      'UPDATE groups SET name = ? WHERE id = ?',
      [name.trim(), groupId],
    );
    if (result.changes !== 1) throw new Error('Group not found');
  });
}
