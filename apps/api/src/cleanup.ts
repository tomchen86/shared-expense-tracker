import type { Sql } from './database/connect';
import { CLOCK_TOLERANCE_MS, REGISTRATION_WINDOW_MS } from './sharing/devices';

const EVENT_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

/**
 * The cleanup (ADR-0033, SYNC-134.1 to SYNC-144.1): deletes what the API no longer has to
 * keep. In each group, the events every member device has and the ones received more than
 * 30 days ago; the cards of invites that have expired; and what the checks of signed
 * requests no longer need. `now` is the API's time, in milliseconds since the Unix epoch.
 *
 * It runs on Node as on Workers, on whatever client it is given. Only the Workers entry
 * file knows that a Cron trigger starts it (SYNC-145.1).
 */
export async function cleanUp(sql: Sql, now: number): Promise<void> {
  await sql.begin('isolation level read committed', async (tx) => {
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
           WHERE group_id = g.id AND received_at_ms < ${now - EVENT_RETENTION_MS})
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
    await tx`UPDATE group_invites SET card = NULL, cursor = NULL
      WHERE card IS NOT NULL AND expires_at_ms <= ${now}`;
  });
}
