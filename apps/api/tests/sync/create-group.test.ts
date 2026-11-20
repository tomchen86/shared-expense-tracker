import { runMigrations } from '../../src/database/migrate';
import { migrations } from '../../src/migrations';
import { createGroup } from '../../src/sync/groups';
import { useTestDatabase } from '../support/database';

// Two creations of one group that meet, which no request can be made to show: the checks
// before routing let a device's requests through one after another, so the requests of
// the acceptance tests hardly overlap in the route. Here the first creation is a
// transaction the test holds open, with the rows a creation writes.

const BRISBANE = '9b2f6c1e-8d47-4f3a-b1c5-2e7d90a4f6b8';
const TAYLOR = '0f8fad5b-d9cb-469f-a165-70867728950e';
const CASEY = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

const database = useTestDatabase();

beforeEach(async () => {
  await runMigrations(database.sql, migrations);
  await database.sql`
    INSERT INTO devices (id, public_key)
    VALUES (${TAYLOR}, decode(${'ab'.repeat(32)}, 'hex')),
           (${CASEY}, decode(${'cd'.repeat(32)}, 'hex'))`;
});

/** How many of this database's queries wait for a lock. */
const waiting = async () =>
  (
    await database.sql`
      SELECT 1 FROM pg_locks JOIN pg_stat_activity USING (pid)
      WHERE NOT granted AND backend_type = 'client backend'
        AND datname = current_database()`
  ).length;

test('a creation that waits for another of the same group answers by what that one committed', async () => {
  let answers: Promise<boolean[]> | undefined;
  let answered = false;
  let waitedForTheFirst = false;

  await database.sql.begin(async (first) => {
    // Taylor's creation, which has not committed.
    await first`INSERT INTO groups (id) VALUES (${BRISBANE})`;
    await first`
      INSERT INTO group_members (group_id, device_id)
      VALUES (${BRISBANE}, ${TAYLOR})`;

    // The same device once more, and another device. Both wait for the first to end.
    answers = Promise.all([
      createGroup(database.sql, BRISBANE, TAYLOR),
      createGroup(database.sql, BRISBANE, CASEY),
    ]);
    const mark = () => {
      answered = true;
    };
    answers.then(mark, mark);
    while (!answered && (await waiting()) < 2) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    waitedForTheFirst = !answered;
  });

  // Neither was answered before the first committed, and each by what it committed.
  expect(waitedForTheFirst).toBe(true);
  expect(await answers).toEqual([true, false]);
  expect(
    await database.sql`SELECT group_id, device_id FROM group_members`,
  ).toEqual([{ group_id: BRISBANE, device_id: TAYLOR }]);
});
