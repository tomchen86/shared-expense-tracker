import type {
  JoinRequestBody,
  JoinRequestRefusal,
  JoinRequestResponse,
} from '@shared-expense/domain/api';
import type { Sql } from '../database/connect';

const MAX_REQUESTS_PER_INVITE = 20;

export function putJoinRequest(
  sql: Sql,
  code: string,
  deviceId: string,
  { request }: JoinRequestBody,
  now: () => number,
): Promise<JoinRequestResponse | JoinRequestRefusal> {
  return sql.begin<JoinRequestResponse | JoinRequestRefusal>(
    'isolation level read committed',
    async (tx) => {
      // A revoke updates this same row. Concurrent applicants count places only
      // after the previous applicant has committed, and check expiry after waiting.
      const [invite] = await tx<{ group_id: string; expires_at_ms: string }[]>`
        SELECT group_id, expires_at_ms FROM group_invites
        WHERE code = ${code} AND card IS NOT NULL
        FOR UPDATE`;
      const receivedAtMs = now();
      if (!invite || Number(invite.expires_at_ms) <= receivedAtMs) {
        return { error: 'no-invite' };
      }

      const [member] = await tx`
        SELECT 1 FROM group_members
        WHERE group_id = ${invite.group_id} AND device_id = ${deviceId}`;
      if (member) return { error: 'already-a-member' };

      // The device can replace its own content even when every place is taken.
      const [stored] = await tx`
        INSERT INTO invite_join_requests (code, device_id, received_at_ms, content)
        SELECT ${code}, ${deviceId}, ${receivedAtMs}, decode(${request}, 'hex')
        WHERE (SELECT count(*) FROM invite_join_requests
               WHERE code = ${code} AND device_id <> ${deviceId}) < ${MAX_REQUESTS_PER_INVITE}
        ON CONFLICT (code, device_id) DO UPDATE SET content = EXCLUDED.content
        RETURNING code`;
      return stored ? { code } : { error: 'requests-full' };
    },
  );
}

export async function cancelJoinRequest(
  sql: Sql,
  code: string,
  deviceId: string,
  now: number,
): Promise<JoinRequestResponse> {
  await sql`
    DELETE FROM invite_join_requests r USING group_invites i
    WHERE r.code = ${code} AND r.device_id = ${deviceId} AND i.code = r.code
      AND i.card IS NOT NULL AND i.expires_at_ms > ${now}`;
  return { code };
}
