import type { SyncRecord, SyncUnits } from '@shared-expense/domain';
import { readCorrectedTime } from '../sharing/device-identity';
import { readCard, type InviteCredentials } from '../sharing/invite-card';
import type { SqlExecutor } from '../storage';
import {
  readSyncRecord,
  writeLocalChange,
  writeLocalDeletion,
  type SharedGroup,
} from './records';

export type Invite = { code: string } & SyncUnits['invite']['link'];

interface StoredInvite extends Invite {
  cardHash: string;
  cardPending: number;
}

export async function activeInvite(tx: SqlExecutor, groupId: string) {
  const [invite] = await tx.all<StoredInvite>(
    `SELECT id AS code, secret, expiresAtMs, cardHash, cardPending FROM group_invites
     WHERE groupId = ? AND expiresAtMs > ? ORDER BY expiresAtMs DESC, id DESC LIMIT 1`,
    [groupId, await readCorrectedTime(tx)],
  );
  return invite;
}

export async function inviteByCode(
  tx: SqlExecutor,
  groupId: string,
  code: string,
) {
  const [invite] = await tx.all<Invite>(
    'SELECT id AS code, secret, expiresAtMs FROM group_invites WHERE groupId = ? AND id = ?',
    [groupId, code],
  );
  return invite;
}

async function storeInvite(
  tx: SqlExecutor,
  groupId: string,
  invite: Invite,
  cardHash: string,
) {
  const { changes } = await tx.run(
    `INSERT INTO group_invites (id, groupId, secret, expiresAtMs, cardHash) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET secret = excluded.secret, expiresAtMs = excluded.expiresAtMs
     WHERE group_invites.groupId = excluded.groupId
       AND (group_invites.secret, group_invites.expiresAtMs) IS NOT (excluded.secret, excluded.expiresAtMs)`,
    [invite.code, groupId, invite.secret, invite.expiresAtMs, cardHash],
  );
  return changes > 0;
}

async function deleteInvite(tx: SqlExecutor, groupId: string, code: string) {
  const { changes } = await tx.run(
    'DELETE FROM group_invites WHERE groupId = ? AND id = ?',
    [groupId, code],
  );
  return changes > 0;
}

/** The visible projection. The shared sync record holds the link's stamp or its permanent tombstone. */
export async function applyMergedInvite(
  tx: SqlExecutor,
  groupId: string,
  record: Extract<SyncRecord, { type: 'invite' }>,
) {
  if (record.deleted) return deleteInvite(tx, groupId, record.id);
  const link = record.units.link!.value; // The only unit of an invite.
  return storeInvite(
    tx,
    groupId,
    { code: record.id, ...link },
    (await readCard(tx, groupId)).hash,
  );
}

export function discardPendingInvite(
  tx: SqlExecutor,
  groupId: string,
  { code, secret }: InviteCredentials,
) {
  return tx.run(
    'DELETE FROM pending_invites WHERE groupId = ? AND code = ? AND secret = ?',
    [groupId, code, secret],
  );
}

export async function recordCreatedInvite(
  tx: SqlExecutor,
  group: SharedGroup,
  invite: Invite,
  cardHash: string,
) {
  // An import or a remote revocation may have landed while the request was in flight.
  const discarded = await discardPendingInvite(tx, group.groupId, invite);
  const previous = await readSyncRecord(
    tx,
    group.groupId,
    'invite',
    invite.code,
  );
  if (!discarded.changes || previous?.record.deleted)
    throw new Error('Invite is no longer pending');
  await storeInvite(tx, group.groupId, invite, cardHash);
  const { secret, expiresAtMs } = invite;
  await writeLocalChange(tx, group, 'invite', invite.code, {
    link: { secret, expiresAtMs },
  });
}

export async function recordRevokedInvite(
  tx: SqlExecutor,
  group: SharedGroup,
  code: string,
) {
  if (await deleteInvite(tx, group.groupId, code))
    await writeLocalDeletion(tx, group, 'invite', code);
}
