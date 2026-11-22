import worker from '../../src/workers';
import { databaseUrl, setTime } from './sharing-api';
import { taylorWithBrisbaneAndCasey } from './sharing-invites-api';
import {
  BRISBANE,
  download,
  expectPage,
  relayed,
  useSyncApi,
} from './sync-api';
import {
  DAY,
  expectDeleted,
  expectKept,
  expectSnapshotNeeded,
  store,
} from './sync-cleanup-api';

// What starts the cleanup (ADR-0033): on Workers, Cloudflare calls the entry file's
// `scheduled` handler when the Worker's Cron trigger fires. The test calls it the same
// way, on Node, with the test's database in place of the environment's Hyperdrive. The
// handler takes the API's time from the clock, so the events here are as old as they are
// by the clock of the machine the test runs on.

useSyncApi();

/** Where no PostgreSQL answers. */
const NO_DATABASE = 'postgres://postgres:postgres@127.0.0.1:1/postgres';

describe('SYNC-145.1', () => {
  test('[SYNC-145.1] runs the cleanup once, on the database of its environment and at the time it is then, has finished it when the call ends, and ends with an error when it cannot', async () => {
    const [taylor] = await taylorWithBrisbaneAndCasey();
    const today = Date.now();
    setTime(today - 31 * DAY);
    const [a] = await store(taylor, 1);
    setTime(today - 29 * DAY);
    const [b] = await store(taylor, 1, 2);
    const waitedFor: Promise<unknown>[] = [];
    /** Cloudflare calls the handler with the trigger, the Worker's bindings and a context. */
    const cronFires = (connectionString: string) =>
      worker.scheduled(
        { cron: '0 19 * * *', scheduledTime: Date.now() },
        { HYPERDRIVE: { connectionString } },
        {
          waitUntil: (promise: Promise<unknown>) => {
            waitedFor.push(promise);
          },
          passThroughOnException: () => {},
          props: {},
        },
      );

    await cronFires(databaseUrl());

    // Before whatever the handler handed to `waitUntil`: the call itself is the cleanup.
    await expectDeleted(a);
    await expectKept(b);
    await Promise.all(waitedFor);
    setTime(Date.now());
    expectSnapshotNeeded(await download(taylor, BRISBANE, 0));
    expectPage(await download(taylor, BRISBANE, 1), {
      events: [relayed(b, { sequence: 2, by: taylor, at: today - 29 * DAY })],
      more: false,
    });

    // A run that could not clean up shows as a failed run.
    await expect(cronFires(NO_DATABASE)).rejects.toThrow();
  });
});
