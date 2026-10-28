import type { SqlExecutor } from '../storage';

export interface LocalIdentity {
  userId: string;
  personalSpaceId: string;
  personalParticipantId: string;
  name: string;
}

async function createUuid(transaction: SqlExecutor): Promise<string> {
  const [row] = await transaction.all<{ bytes: string }>(
    'SELECT lower(hex(randomblob(16))) AS bytes',
  );
  const hex = row.bytes;
  const variant = ((parseInt(hex[16], 16) & 3) | 8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20)}`;
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
