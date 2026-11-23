import { setTimeout as delay } from 'node:timers/promises';
import postgres from 'postgres';
import { cleanUp } from '../../src/cleanup';
import { putInvite } from '../../src/sharing/invites';
import {
  CASEY,
  T,
  TAYLOR,
  databaseContents,
  databaseUrl,
  registered,
  sql,
} from '../acceptance/sharing-api';
import {
  CODE_A,
  WEEK,
  bothInBrisbane,
} from '../acceptance/sharing-invites-api';
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

/** Return the pending cleanup once this transaction holds a lock it needs. */
async function blockedCleanup(locker: postgres.TransactionSql, now: number) {
  const [{ pid }] = await cleanupSession();
  const cleanup = cleanUp(cleaner, now);
  const endedEarly = cleanup.then(() => {
    throw new Error('Cleanup finished before waiting for the lock');
  });
  for (;;) {
    const [lock] = await Promise.race([
      locker<{ blocked: boolean }[]>`
        SELECT pg_backend_pid() = ANY(pg_blocking_pids(${pid})) AS blocked`,
      endedEarly,
    ]);
    if (lock.blocked) return { cleanup };
    await delay(10);
  }
}

test('cleanup waits for a download that lowers its cursor before deciding which events to delete', async () => {
  const { cleanup } = await sql().begin(async (download) => {
    await download`SELECT id FROM groups WHERE id = ${BRISBANE} FOR SHARE`;
    await download`UPDATE group_members SET progress_cursor = 2, progress_at_ms = ${T + 1}
      WHERE group_id = ${BRISBANE} AND device_id = ${CASEY}`;
    return blockedCleanup(download, T + 1_000);
  });
  await cleanup;

  const events = await sql()<{ sequence: number }[]>`
    SELECT sequence::int FROM group_events WHERE group_id = ${BRISBANE} ORDER BY sequence`;
  expect(events.map(({ sequence }) => sequence)).toEqual([3, 4, 5]);
});

test('cleanup deletes a join request committed while it waits for the expired invite', async () => {
  const expires = T + WEEK;
  const phone = await registered();
  await putInvite(
    sql(),
    BRISBANE,
    TAYLOR,
    CODE_A,
    { cursor: 0, card: 'ab' },
    () => T,
  );
  const { cleanup } = await sql().begin(async (applicant) => {
    // Hold the locks and the insert of a request accepted just before expiry.
    await applicant`SELECT code FROM group_invites WHERE code = ${CODE_A} FOR UPDATE`;
    await applicant`INSERT INTO invite_join_requests (code, device_id, received_at_ms, content)
      VALUES (${CODE_A}, ${phone.deviceId}, ${expires - 1}, decode('cd', 'hex'))`;
    return blockedCleanup(applicant, expires);
  });
  await cleanup;

  expect(await sql()`SELECT code FROM invite_join_requests`).toEqual([]);
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
