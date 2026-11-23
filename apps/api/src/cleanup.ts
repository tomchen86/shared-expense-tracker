import type { Sql } from './database/connect';
import { CLOCK_TOLERANCE_MS, REGISTRATION_WINDOW_MS } from './sharing/devices';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1_000;

/**
 * Clears event prefixes, old request and registration records, and the cards and join
 * requests of expired invites (ADR-0033, SYNC-134.1 to SYNC-144.1, SYNC-151.1).
 * A snapshot goes when the group is cleared past it or it began over 30 days ago
 * (SYNC-147.1, SYNC-148.1). `now` is the API's time in milliseconds since the Unix epoch.
 *
 * It runs on Node as on Workers, on whatever client it is given. Only the Workers entry
 * file knows that a Cron trigger starts it (SYNC-145.2).
 */
export async function cleanUp(sql: Sql, now: number): Promise<void> {
  const retainFromMs = now - THIRTY_DAYS_MS;
  await sql.begin('isolation level read committed', async (tx) => {
    // A waiting EXCLUSIVE lock queues other groups' uploads and downloads behind it.
    await tx`SET LOCAL lock_timeout = '3s'`;
    await tx`DELETE FROM device_requests
      WHERE accepted_at_ms < ${now - 2 * CLOCK_TOLERANCE_MS}`;
    await tx`DELETE FROM device_registrations
      WHERE registered_at_ms <= ${now - REGISTRATION_WINDOW_MS}`;

    // Uploads lock their group FOR UPDATE and downloads lock it FOR SHARE. The daily
    // sweep covers all groups, including any created while it waited for this lock.
    // Read the cutoffs in a fresh statement so they include progress committed during the wait.
    await tx`LOCK TABLE groups IN EXCLUSIVE MODE`;
    await tx`
      WITH cutoffs AS MATERIALIZED (
        SELECT g.id, greatest(
          (SELECT min(coalesce(progress_cursor, 0)) FROM group_members WHERE group_id = g.id),
          (SELECT max(sequence) FROM group_events
           WHERE group_id = g.id AND received_at_ms < ${retainFromMs})
        ) AS through
        FROM groups g WHERE g.stored_bytes > 0
      ), removed AS (
        DELETE FROM group_events e USING cutoffs c
        WHERE e.group_id = c.id AND e.sequence <= c.through
        RETURNING e.group_id, e.size
      )
      UPDATE groups g SET stored_bytes = g.stored_bytes - totals.bytes
      FROM (SELECT group_id, sum(size) AS bytes FROM removed GROUP BY group_id) totals
      WHERE g.id = totals.group_id`;
    // Read the cleared prefix from the events left by this run. Deleting the
    // envelope cascades to its chunks, including those of an incomplete snapshot.
    await tx`DELETE FROM group_snapshots s USING groups g
      WHERE s.group_id = g.id AND (
        s.started_at_ms < ${retainFromMs} OR s.sequence < coalesce(
          (SELECT min(sequence) - 1 FROM group_events WHERE group_id = g.id),
          g.last_sequence
        )
      )`;
    await tx`UPDATE group_invites SET card = NULL, cursor = NULL
      WHERE card IS NOT NULL AND expires_at_ms <= ${now}`;
    // Clearing the card waits for any applicant holding the invite row. A new
    // statement sees its committed request, even if putInvite cleared the card earlier.
    await tx`DELETE FROM invite_join_requests r USING group_invites i
      WHERE r.code = i.code AND i.expires_at_ms <= ${now}`;
  });
}
