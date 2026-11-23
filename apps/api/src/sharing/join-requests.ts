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

/**
 * Deletes the device's request under an active invite. A device that was approved under
 * the code, or that is a member device of the active invite's group, has none to cancel
 * (SHARING-117.2).
 */
export function cancelJoinRequest(
  sql: Sql,
  code: string,
  deviceId: string,
  now: () => number,
): Promise<JoinRequestResponse | JoinRequestRefusal> {
  return sql.begin<JoinRequestResponse | JoinRequestRefusal>(
    'isolation level read committed',
    async (tx) => {
      // An approval holds this row until it commits, so a cancellation finds the
      // device approved or its request still there, never half of each (SHARING-188.1).
      const [invite] = await tx<
        { group_id: string; has_card: boolean; expires_at_ms: string }[]
      >`
        SELECT group_id, card IS NOT NULL AS has_card, expires_at_ms
        FROM group_invites WHERE code = ${code}
        FOR UPDATE`;
      if (!invite) return { code };
      const active = invite.has_card && Number(invite.expires_at_ms) > now();
      const [member] = await tx`
        SELECT 1 FROM invite_handovers
        WHERE code = ${code} AND device_id = ${deviceId}
        UNION ALL
        SELECT 1 FROM group_members
        WHERE ${active}::boolean AND group_id = ${invite.group_id}
          AND device_id = ${deviceId}
        LIMIT 1`;
      if (member) return { error: 'already-a-member' };
      if (active) {
        await tx`
          DELETE FROM invite_join_requests
          WHERE code = ${code} AND device_id = ${deviceId}`;
      }
      return { code };
    },
  ) as Promise<JoinRequestResponse | JoinRequestRefusal>;
}
