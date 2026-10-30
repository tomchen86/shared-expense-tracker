import { createUuid, type Database, type SqlExecutor } from '../storage';
import type { LocalIdentity } from '../shell';

export interface GroupMember {
  id: string;
  userId: string;
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
    userId: string;
    memberName: string;
  }>(`SELECT g.id, g.name, m.id AS memberId, m.userId, m.name AS memberName
      FROM groups g LEFT JOIN group_members m ON m.groupId = g.id
      ORDER BY g.position, m.rowid`);
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
    const existing = await transaction.all<{ id: string }>(
      'SELECT id FROM categories UNION SELECT id FROM groups UNION SELECT id FROM group_members',
    );
    const ids = new Set([
      identity.userId,
      identity.personalSpaceId,
      identity.personalParticipantId,
      ...existing.map((row) => row.id),
    ]);
    async function nextId() {
      let id = await createUuid(transaction);
      while (ids.has(id)) id = await createUuid(transaction);
      ids.add(id);
      return id;
    }
    const id = await nextId();
    const memberId = await nextId();
    await transaction.run(
      `INSERT INTO groups (id, name, position)
       SELECT ?, ?, COALESCE(MAX(position), 0) + 1 FROM groups`,
      [id, name],
    );
    await transaction.run(
      'INSERT INTO group_members (id, groupId, userId, name) VALUES (?, ?, ?, ?)',
      [memberId, id, identity.userId, identity.name],
    );
  });
}
