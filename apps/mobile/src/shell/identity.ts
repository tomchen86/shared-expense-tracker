import { createUuid, type SqlExecutor } from '../storage';

export interface LocalIdentity {
  userId: string;
  personalSpaceId: string;
  personalParticipantId: string;
  name: string;
}

export async function saveLocalName(
  database: SqlExecutor,
  name: string,
): Promise<void> {
  await database.run('UPDATE local_identity SET name = ? WHERE singleton = 1', [
    name,
  ]);
}

export async function ensureLocalIdentity(
  transaction: SqlExecutor,
): Promise<LocalIdentity> {
  const [existing] = await transaction.all<LocalIdentity>(
    'SELECT userId, personalSpaceId, personalParticipantId, name FROM local_identity WHERE singleton = 1',
  );
  if (existing) return existing;

  const ids = new Set<string>();
  while (ids.size < 3) ids.add(await createUuid(transaction));
  const [userId, personalSpaceId, personalParticipantId] = [...ids];
  await transaction.run(
    'INSERT INTO local_identity (singleton, userId, personalSpaceId, personalParticipantId, name) VALUES (1, ?, ?, ?, ?)',
    [userId, personalSpaceId, personalParticipantId, ''],
  );
  return { userId, personalSpaceId, personalParticipantId, name: '' };
}
