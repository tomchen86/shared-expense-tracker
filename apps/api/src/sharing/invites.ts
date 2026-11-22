import type {
  InviteRefusal,
  PutInviteRequest,
  PutInviteResponse,
  ReadInviteResponse,
  RevokeInviteResponse,
} from '@shared-expense/domain/api';
import type { Sql } from '../database/connect';
import { lockMemberGroup } from '../sync/groups';

const INVITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

/** Writes of one group's invites and events take turns on the same group row. */
export function putInvite(
  sql: Sql,
  groupId: string,
  deviceId: string,
  code: string,
  { cursor, card }: PutInviteRequest,
  now: () => number,
): Promise<PutInviteResponse | InviteRefusal> {
  return sql.begin<PutInviteResponse | InviteRefusal>(
    'isolation level read committed',
    async (tx) => {
      const group = await lockMemberGroup(tx, groupId, deviceId);
      if (!group) return { error: 'not-a-member' };
      if (cursor > Number(group.last_sequence)) return { error: 'request' };

      const [current] = await tx<
        { code: string; cursor: string; expires_at_ms: string }[]
      >`
        SELECT code, cursor, expires_at_ms FROM group_invites
        WHERE group_id = ${groupId} AND card IS NOT NULL`;
      const nowMs = now();
      let expiresAtMs: number;
      if (current && Number(current.expires_at_ms) > nowMs) {
        if (current.code !== code) {
          const [used] =
            await tx`SELECT 1 FROM group_invites WHERE code = ${code}`;
          return { error: used ? 'no-invite' : 'invite-exists' };
        }
        expiresAtMs = Number(current.expires_at_ms);
        const storedCursor = Number(current.cursor);
        if (cursor < storedCursor)
          return { code, expiresAtMs, cursor: storedCursor };
      } else {
        // Claim the code before discarding any expired card. Two groups may try the same code.
        expiresAtMs = nowMs + INVITE_LIFETIME_MS;
        const [claimed] = await tx`
          INSERT INTO group_invites (code, group_id, created_at_ms, expires_at_ms)
          VALUES (${code}, ${groupId}, ${nowMs}, ${expiresAtMs})
          ON CONFLICT (code) DO NOTHING
          RETURNING code`;
        if (!claimed) return { error: 'no-invite' };
        if (current) {
          await tx`
            UPDATE group_invites SET card = NULL, cursor = NULL
            WHERE code = ${current.code}`;
        }
      }

      await tx`
        UPDATE group_invites SET card = decode(${card}, 'hex'), cursor = ${cursor}
        WHERE code = ${code}`;
      return { code, expiresAtMs, cursor };
    },
  );
}

export function revokeInvite(
  sql: Sql,
  groupId: string,
  deviceId: string,
  code: string,
  now: () => number,
): Promise<RevokeInviteResponse | InviteRefusal> {
  return sql.begin<RevokeInviteResponse | InviteRefusal>(
    'isolation level read committed',
    async (tx) => {
      if (!(await lockMemberGroup(tx, groupId, deviceId))) {
        return { error: 'not-a-member' };
      }
      await tx`
        UPDATE group_invites SET revoked = true, card = NULL, cursor = NULL
        WHERE group_id = ${groupId} AND code = ${code}
          AND card IS NOT NULL AND expires_at_ms > ${now()}`;
      return { code };
    },
  );
}

export async function readInvite(
  sql: Sql,
  code: string,
  now: number,
): Promise<ReadInviteResponse | InviteRefusal> {
  const [invite] = await sql<{ expires_at_ms: string; card: string }[]>`
    SELECT expires_at_ms, encode(card, 'hex') AS card FROM group_invites
    WHERE code = ${code} AND card IS NOT NULL AND expires_at_ms > ${now}`;
  return invite
    ? { expiresAtMs: Number(invite.expires_at_ms), card: invite.card }
    : { error: 'no-invite' };
}
