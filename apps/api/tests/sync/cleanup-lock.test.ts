import { setTimeout as delay } from 'node:timers/promises';
import postgres from 'postgres';
import { cleanUp } from '../../src/cleanup';
import {
  CASEY,
  T,
  databaseContents,
  databaseUrl,
  sql,
} from '../acceptance/sharing-api';
import { bothInBrisbane } from '../acceptance/sharing-invites-api';
import { BRISBANE, useSyncApi } from '../acceptance/sync-api';
import { DAY, reach, store } from '../acceptance/sync-cleanup-api';

let cleaner: postgres.Sql;
// Close the single cleanup connection before the fixture drops its database.
afterEach(() => cleaner?.end());
useSyncApi();

beforeEach(async () => {
  // Give the backend a distinct lock timeout. The six-second statement timeout ends
  // the test if cleanup omits its own, shorter limit.
  cleaner = postgres(databaseUrl(), {
    max: 1,
    connection: { lock_timeout: 10_000, statement_timeout: 6_000 },
  });
  const [taylor, casey] = await bothInBrisbane();
  await store(taylor, 5);
  await reach(taylor, 5);
  await reach(casey, 5);
});

const cleanupSession = () => cleaner<{ pid: number; timeout: string }[]>`
  SELECT pg_backend_pid() AS pid, current_setting('lock_timeout') AS timeout`;

test('cleanup waits for a download that lowers its cursor before deciding which events to delete', async () => {
  const [{ pid }] = await cleanupSession();
  const { cleanup } = await sql().begin(async (download) => {
    await download`SELECT id FROM groups WHERE id = ${BRISBANE} FOR SHARE`;
    await download`UPDATE group_members SET progress_cursor = 2, progress_at_ms = ${T + 1}
      WHERE group_id = ${BRISBANE} AND device_id = ${CASEY}`;

    const cleanup = cleanUp(cleaner, T + 1_000);
    const endedEarly = cleanup.then(() => {
      throw new Error('Cleanup finished before waiting for the download');
    });
    for (;;) {
      const [lock] = await Promise.race([
        download<{ blocked: boolean }[]>`
          SELECT pg_backend_pid() = ANY(pg_blocking_pids(${pid})) AS blocked`,
        endedEarly,
      ]);
      // Commit the lower cursor before awaiting the cleanup it blocked.
      if (lock.blocked) return { cleanup };
      await delay(10);
    }
  });
  await cleanup;

  const events = await sql()<{ sequence: number }[]>`
    SELECT sequence::int FROM group_events WHERE group_id = ${BRISBANE} ORDER BY sequence`;
  expect(events.map(({ sequence }) => sequence)).toEqual([3, 4, 5]);
});

test('cleanup times out on a held lock, rolls back and succeeds on the next run', async () => {
  const [session] = await cleanupSession();
  const before = await databaseContents();
  expect(before.device_requests.length).toBeGreaterThan(0);
  expect(before.device_registrations).toHaveLength(2);

  await sql().begin(async (download) => {
    await download`SELECT id FROM groups WHERE id = ${BRISBANE} FOR SHARE`;
    const start = performance.now();
    await expect(cleanUp(cleaner, T + DAY)).rejects.toMatchObject({
      code: '55P03',
    });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(2_750);
    expect(elapsed).toBeLessThan(6_000);
    expect(await databaseContents()).toEqual(before);
  });
  expect((await cleanupSession())[0]).toEqual(session);

  await cleanUp(cleaner, T + 2 * DAY);
  expect(await databaseContents()).toMatchObject({
    device_requests: [],
    device_registrations: [],
    group_events: [],
  });
  expect((await cleanupSession())[0]).toEqual(session);
});
