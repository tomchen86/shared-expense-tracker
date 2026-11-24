import {
  MEMBER_DEVICE_LIMIT,
  REQUESTS_PAGE_CONTENT_LIMIT,
  type ApproveJoinRequestBody,
  type ApproveJoinRequestResponse,
  type JoinDecisionRefusal,
  type JoinRequestRefusal,
  type JoinRequestsPageResponse,
  type JoinResultResponse,
  type RejectJoinRequestResponse,
  type SnapshotRefusal,
} from '@shared-expense/domain/api';
import type { Sql } from '../database/connect';
import {
  lockMemberGroup,
  storeLockedGroupEvents,
  type EventApiRefusal,
} from '../sync/groups';

// Answering join requests (ADR-0039): a member device lists its group's requests, rejects
// one, or approves one, and the device that asked learns what became of its request.

type DecisionRefusal = EventApiRefusal | JoinDecisionRefusal | SnapshotRefusal;

/** A page of the requests under the group's active invite, in the order of their device IDs. */
export async function listJoinRequests(
  sql: Sql,
  groupId: string,
  deviceId: string,
  /** The device ID to go on after, when the page before had more. */
  after: string | null,
  now: number,
): Promise<JoinRequestsPageResponse | EventApiRefusal> {
  // One statement, so the page is of the moment the device was a member device. Read
  // one request past what a page holds to tell whether more follow (SHARING-171.1).
  const rows = await sql<
    {
      code: string | null;
      device_id: string;
      request: string;
      following: number;
    }[]
  >`
    SELECT r.code, r.device_id, encode(r.content, 'hex') AS request, r.following
    FROM group_members m
    LEFT JOIN LATERAL (
      SELECT * FROM (
        SELECT q.code, q.device_id, q.content,
          sum(octet_length(q.content)) OVER (ORDER BY q.device_id) AS bytes,
          (count(*) OVER ())::int AS following
        FROM invite_join_requests q
        JOIN group_invites i ON i.code = q.code
        WHERE i.group_id = m.group_id AND i.card IS NOT NULL
          AND i.expires_at_ms > ${now}
          AND (${after}::uuid IS NULL OR q.device_id > ${after}::uuid)
      ) AS counted
      WHERE bytes <= ${REQUESTS_PAGE_CONTENT_LIMIT}
    ) r ON true
    WHERE m.group_id = ${groupId} AND m.device_id = ${deviceId}
    ORDER BY r.device_id`;
  if (rows.length === 0) return { error: 'not-a-member' };
  // A member device of a group with no request gets one row that holds none.
  const page = rows.filter(({ code }) => code !== null);
  return {
    requests: page.map((row) => ({
      code: row.code!,
      deviceId: row.device_id,
      request: row.request,
    })),
    more: page.length > 0 && page[0].following > page.length,
  };
}

/** Deletes the request the member's phone listed, and keeps nothing of it (SHARING-172.1). */
export function rejectJoinRequest(
  sql: Sql,
  groupId: string,
  deviceId: string,
  applicant: string,
  /** The SHA-256 of the content it rejects, in lowercase hexadecimal. */
  request: string,
  now: () => number,
): Promise<RejectJoinRequestResponse | DecisionRefusal> {
  return sql.begin<RejectJoinRequestResponse | DecisionRefusal>(
    'isolation level read committed',
    async (tx) => {
      // An approval holds the same lock, so one of the two finds the request gone.
      if (!(await lockMemberGroup(tx, groupId, deviceId))) {
        return { error: 'not-a-member' };
      }
      const [gone] = await tx`
        DELETE FROM invite_join_requests r USING group_invites i
        WHERE r.code = i.code AND i.group_id = ${groupId} AND i.card IS NOT NULL
          AND i.expires_at_ms > ${now()}
          AND r.device_id = ${applicant}
          AND sha256(r.content) = decode(${request}, 'hex')
        RETURNING r.code`;
      return gone ? { deviceId: applicant } : { error: 'no-request' };
    },
  ) as Promise<RejectJoinRequestResponse | DecisionRefusal>;
}

/**
 * Approves a request in one transaction under the group's lock (SHARING-173.1): it
 * stores the approval's events, makes the device a member device whose progress is what
 * its snapshot covers, keeps the handover and deletes the request, or does none of it
 * and resolves with the first reason of SHARING-182.1.
 */
export function approveJoinRequest(
  sql: Sql,
  groupId: string,
  deviceId: string,
  applicant: string,
  approval: ApproveJoinRequestBody,
  now: () => number,
): Promise<ApproveJoinRequestResponse | DecisionRefusal> {
  const { request, cursor, snapshotId, senderKey, epoch, box, events } =
    approval;
  return sql.begin<ApproveJoinRequestResponse | DecisionRefusal>(
    'isolation level read committed',
    async (tx) => {
      const group = await lockMemberGroup(tx, groupId, deviceId);
      if (!group) return { error: 'not-a-member' };
      if (cursor > Number(group.last_sequence)) return { error: 'request' };

      // The device that asked replaces and cancels its request under this row's lock, so
      // either it finds itself a member device, or this finds its request changed
      // (SHARING-188.1). The time is read once the lock is held.
      const [invite] = await tx<{ code: string; expires_at_ms: string }[]>`
        SELECT code, expires_at_ms FROM group_invites
        WHERE group_id = ${groupId} AND card IS NOT NULL
        FOR UPDATE`;
      const nowMs = now();
      if (!invite || Number(invite.expires_at_ms) <= nowMs) {
        return { error: 'no-request' };
      }
      const [found] = await tx<
        { asked: boolean; snapshot: string | null; members: number }[]
      >`
        SELECT
          EXISTS (
            SELECT FROM invite_join_requests
            WHERE code = ${invite.code} AND device_id = ${applicant}
              AND sha256(content) = decode(${request}, 'hex')
          ) AS asked,
          -- A complete snapshot for the device that still joins the group's events:
          -- the cleared prefix ends just before the first event the group stores.
          (
            SELECT s.sequence FROM group_snapshots s
            WHERE s.group_id = ${groupId} AND s.id = ${snapshotId}
              AND s.recipient = ${applicant}
              AND s.chunk_count = (
                SELECT count(*) FROM snapshot_chunks c
                WHERE c.group_id = s.group_id AND c.snapshot_id = s.id
              )
              AND s.sequence >= (
                SELECT coalesce(min(sequence) - 1, ${group.last_sequence}::bigint)
                FROM group_events WHERE group_id = ${groupId}
              )
          ) AS snapshot,
          (
            SELECT count(*)::int FROM group_members WHERE group_id = ${groupId}
          ) AS members`;
      if (!found.asked) return { error: 'no-request' };
      if (cursor < Number(group.last_sequence)) return { error: 'behind' };
      if (epoch !== Number(group.epoch)) {
        return { error: 'epoch', epoch: Number(group.epoch) };
      }
      if (found.snapshot === null) return { error: 'no-snapshot' };
      if (found.members >= MEMBER_DEVICE_LIMIT) {
        return { error: 'members-full' };
      }

      // Nothing is written before this: a refusal leaves the database as it was.
      const stored = await storeLockedGroupEvents(tx, group, {
        groupId,
        deviceId,
        epoch,
        events,
        now: nowMs,
      });
      if ('error' in stored) return stored;
      await tx`
        WITH admitted AS (
          INSERT INTO group_members
            (group_id, device_id, progress_cursor, progress_at_ms)
          VALUES (${groupId}, ${applicant}, ${found.snapshot}, ${nowMs})
        ), handed AS (
          INSERT INTO invite_handovers
            (code, device_id, approver, sender_key, epoch, box)
          VALUES (${invite.code}, ${applicant}, ${deviceId},
            decode(${senderKey}, 'hex'), ${epoch}, decode(${box}, 'hex'))
        )
        DELETE FROM invite_join_requests
        WHERE code = ${invite.code} AND device_id = ${applicant}`;
      return { deviceId: applicant, events: stored.events };
    },
  ) as Promise<ApproveJoinRequestResponse | DecisionRefusal>;
}

/** What became of the device's request under the code, in the order of SHARING-183.1. */
export async function readJoinResult(
  sql: Sql,
  code: string,
  deviceId: string,
  now: number,
): Promise<JoinResultResponse | JoinRequestRefusal> {
  // One statement: an approval that commits between two would show a member device with
  // no handover, and the phone would drop its request (SHARING-222.1).
  const [found] = await sql<
    {
      group_id: string | null;
      approver: string;
      sender_key: string;
      epoch: string;
      box: string;
      active: boolean;
      member: boolean;
      waiting: boolean;
    }[]
  >`
    SELECT g.group_id, h.approver, encode(h.sender_key, 'hex') AS sender_key,
      h.epoch, encode(h.box, 'hex') AS box,
      i.code IS NOT NULL AS active,
      EXISTS (
        SELECT FROM group_members m
        WHERE m.group_id = i.group_id AND m.device_id = ${deviceId}
      ) AS member,
      EXISTS (
        SELECT FROM invite_join_requests r
        WHERE r.code = i.code AND r.device_id = ${deviceId}
      ) AS waiting
    FROM (SELECT ${code}::text AS code) AS asked
    LEFT JOIN invite_handovers h
      ON h.code = asked.code AND h.device_id = ${deviceId}
    LEFT JOIN group_invites g ON g.code = h.code
    LEFT JOIN group_invites i
      ON i.code = asked.code AND i.card IS NOT NULL AND i.expires_at_ms > ${now}`;
  if (found.group_id !== null) {
    return {
      state: 'approved',
      groupId: found.group_id,
      deviceId: found.approver,
      senderKey: found.sender_key,
      epoch: Number(found.epoch),
      box: found.box,
    };
  }
  if (!found.active) return { error: 'no-invite' };
  if (found.member) return { error: 'already-a-member' };
  return { state: found.waiting ? 'waiting' : 'none' };
}
