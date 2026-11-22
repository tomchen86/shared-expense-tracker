import type { Sql } from './database/connect';

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
  void sql;
  void now;
  throw new Error('Not implemented');
}
