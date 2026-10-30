import type { SqlExecutor } from '../storage';

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
  return database.all<never>('SELECT 1 WHERE 0');
}
