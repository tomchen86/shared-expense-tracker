import {
  GROUP_CONTENT_LIMIT,
  PAGE_CONTENT_LIMIT,
  PAGE_EVENT_LIMIT,
  type EventsPageResponse,
  type GroupRefusal,
  type SnapshotNeededResponse,
  type UploadEventsRequest,
  type UploadEventsResponse,
} from '@shared-expense/domain/api';
import type { TransactionSql } from 'postgres';
import type { Sql } from '../database/connect';

/** Why the event API refuses a request that passed the checks before routing. */
export type EventApiRefusal = GroupRefusal | { error: 'request' };

/** Only a member device may lock the group for a write. A waiter sees the last writer's cursor. */
export async function lockMemberGroup(
  transaction: TransactionSql,
  groupId: string,
  deviceId: string,
) {
  const rows = await transaction<
    { epoch: string; last_sequence: string; stored_bytes: string }[]
  >`
    SELECT g.epoch, g.last_sequence, g.stored_bytes
    FROM groups g
    JOIN group_members m ON m.group_id = g.id
    WHERE g.id = ${groupId} AND m.device_id = ${deviceId}
    FOR UPDATE OF g`;
  return rows.at(0);
}

/**
 * Creates the group with the device as its only member device (SYNC-45.1), or finds that
 * the device is a member device of it already and changes nothing (SYNC-46.1). Resolves
 * with whether the device is a member device of the group now: it is not when the group
 * is another device's (SYNC-47.1).
 */
export async function createGroup(
  sql: Sql,
  groupId: string,
  deviceId: string,
): Promise<boolean> {
  // One statement, so a group is never there without its member device. Requests that
  // create one group together take turns on it: the rest wait until the first has
  // committed, and then add nothing.
  await sql`
    WITH created AS (
      INSERT INTO groups (id) VALUES (${groupId})
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    )
    INSERT INTO group_members (group_id, device_id)
    SELECT id, ${deviceId}::uuid FROM created`;
  // A statement of its own, so that it sees what was committed while the first waited.
  const [member] = await sql`
    SELECT 1 FROM group_members
    WHERE group_id = ${groupId} AND device_id = ${deviceId}`;
  return member !== undefined;
}

/**
 * Stores the events of an upload that the group does not have yet, under the group's
 * next sequence numbers in the order of the request, and resolves with the number of
 * every event of the request (SYNC-50.1, 51.1), or with why none was stored
 * (SYNC-49.1, 55.1, 56.1).
 *
 * It is one transaction that holds the lock on the group's row from its first statement
 * to its commit, so the uploads of a group commit in the order of their sequence
 * numbers: whoever reads an event finds every event before it (SYNC-52.1, ADR-0016).
 */
export function storeEvents(
  sql: Sql,
  upload: UploadEventsRequest & {
    groupId: string;
    deviceId: string;
    /** The API's time, which is the receive time of every event stored. */
    now: number;
  },
): Promise<UploadEventsResponse | GroupRefusal> {
  return sql.begin<UploadEventsResponse | GroupRefusal>(
    'isolation level read committed',
    async (transaction) => {
      const group = await lockMemberGroup(
        transaction,
        upload.groupId,
        upload.deviceId,
      );
      if (!group) return { error: 'not-a-member' };
      return storeLockedGroupEvents(transaction, group, upload);
    },
  ) as Promise<UploadEventsResponse | GroupRefusal>;
}

/**
 * What `storeEvents` does once its transaction holds the group's lock, for an approval
 * to store its events in a transaction of its own (SHARING-173.1).
 */
export async function storeLockedGroupEvents(
  transaction: TransactionSql,
  group: NonNullable<Awaited<ReturnType<typeof lockMemberGroup>>>,
  upload: UploadEventsRequest & {
    groupId: string;
    deviceId: string;
    now: number;
  },
): Promise<UploadEventsResponse | GroupRefusal> {
  const { groupId, deviceId, now, epoch, events } = upload;
  // The events the group has are answered with their numbers and otherwise ignored.
  // The IDs go as one JSON text, and as an array they are looked up in the index of
  // the group's event IDs, however many events the group has.
  const sequences = new Map<string, number>();
  const known = await transaction<{ id: string; sequence: string }[]>`
    SELECT id, sequence FROM group_events
    WHERE group_id = ${groupId}
      AND id = ANY (ARRAY(
        SELECT jsonb_array_elements_text(${JSON.stringify(
          events.map(({ id }) => id),
        )}::text::jsonb)::uuid
      ))`;
  for (const { id, sequence } of known) {
    sequences.set(id, Number(sequence));
  }

  const fresh = events.filter(({ id }) => !sequences.has(id));
  if (fresh.length > 0) {
    if (epoch !== Number(group.epoch)) {
      return { error: 'epoch', epoch: Number(group.epoch) };
    }
    // Two hexadecimal characters write one byte.
    const bytes = fresh.reduce(
      (sum, { content }) => sum + content.length / 2,
      0,
    );
    if (Number(group.stored_bytes) + bytes > GROUP_CONTENT_LIMIT) {
      return { error: 'group-full' };
    }
    // PostgreSQL takes the new events as one JSON text and decodes each content
    // itself. What the group's row counts is what this statement stored.
    await transaction`
      WITH stored AS (
        INSERT INTO group_events
          (group_id, sequence, id, device_id, epoch, received_at_ms, content)
        SELECT
          ${groupId}::uuid,
          ${group.last_sequence}::bigint + sent.position,
          (sent.event->>'id')::uuid,
          ${deviceId}::uuid,
          ${epoch}::bigint,
          ${now}::bigint,
          decode(sent.event->>'content', 'hex')
        FROM jsonb_array_elements(${JSON.stringify(fresh)}::text::jsonb)
          WITH ORDINALITY AS sent (event, position)
        RETURNING size
      )
      UPDATE groups
      SET last_sequence = last_sequence + (SELECT count(*) FROM stored),
          stored_bytes = stored_bytes + (SELECT sum(size) FROM stored)
      WHERE id = ${groupId}`;
    fresh.forEach(({ id }, index) =>
      sequences.set(id, Number(group.last_sequence) + index + 1),
    );
  }
  return {
    events: events.map(({ id }) => ({ id, sequence: sequences.get(id)! })),
  };
}

type DownloadResult =
  EventsPageResponse | SnapshotNeededResponse | EventApiRefusal;

/**
 * Records the requested cursor for both a page and a snapshot-needed answer. Only a
 * page discards the recipient's snapshot when the cursor reaches its sequence, and the
 * handover the device was approved with: it has its snapshot in by now (SHARING-185.1).
 */
export function readPage(
  sql: Sql,
  download: { groupId: string; deviceId: string; after: number; now: number },
): Promise<DownloadResult> {
  const { groupId, deviceId, after, now } = download;
  return sql.begin<DownloadResult>(
    'isolation level read committed',
    async (tx) => {
      // Downloads share the lock. Uploads and cleanup wait until the page, progress
      // and any deletion of the recipient's snapshot have committed.
      const [member] = await tx<{ last_sequence: string }[]>`
        SELECT g.last_sequence
        FROM groups g
        JOIN group_members m ON m.group_id = g.id
        WHERE g.id = ${groupId} AND m.device_id = ${deviceId}
        FOR SHARE OF g`;
      if (!member) return { error: 'not-a-member' };
      if (after > Number(member.last_sequence)) return { error: 'request' };

      // The cleared prefix ends just before the first retained event, or at the last
      // assigned number when none remain. Read it after acquiring the group lock.
      const [progress] = await tx<{ needs_snapshot: boolean }[]>`
        UPDATE group_members SET progress_cursor = ${after}, progress_at_ms = ${now}
        WHERE group_id = ${groupId} AND device_id = ${deviceId}
        RETURNING progress_cursor < (
          SELECT coalesce(min(sequence) - 1, ${member.last_sequence}::bigint)
          FROM group_events WHERE group_id = ${groupId}
        ) AS needs_snapshot`;
      if (progress.needs_snapshot) return { error: 'snapshot-needed' };

      // Read one event past a full page to tell whether more follow, and decode only
      // the contents the page returns (SYNC-57.2).
      const page = await tx<
        {
          id: string;
          sequence: string;
          device_id: string;
          epoch: string;
          received_at_ms: string;
          content: string;
          following: number;
        }[]
      >`
        WITH discarded AS (
          DELETE FROM group_snapshots
          WHERE group_id = ${groupId} AND recipient = ${deviceId} AND sequence <= ${after}
        ), fetched AS (
          DELETE FROM invite_handovers h USING group_invites i
          WHERE h.code = i.code AND i.group_id = ${groupId} AND h.device_id = ${deviceId}
        )
        SELECT id, sequence, device_id, epoch, received_at_ms,
          encode(content, 'hex') AS content, following
        FROM (
          SELECT *,
            sum(size) OVER (ORDER BY sequence) AS bytes,
            (count(*) OVER ())::int AS following
          FROM (
            SELECT * FROM group_events
            WHERE group_id = ${groupId} AND sequence > ${after}::bigint
            ORDER BY sequence
            LIMIT ${PAGE_EVENT_LIMIT + 1}
          ) AS next
        ) AS counted
        WHERE bytes <= ${PAGE_CONTENT_LIMIT}
        ORDER BY sequence
        LIMIT ${PAGE_EVENT_LIMIT}`;

      return {
        events: page.map((event) => ({
          id: event.id,
          sequence: Number(event.sequence),
          deviceId: event.device_id,
          epoch: Number(event.epoch),
          receivedAtMs: Number(event.received_at_ms),
          content: event.content,
        })),
        // The largest event fits a page several times, so a page with no event has none
        // after it either.
        more: page.length > 0 && page[0].following > page.length,
      };
    },
  ) as Promise<DownloadResult>;
}
