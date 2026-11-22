import {
  isEventsPageResponse,
  type EventsPageResponse,
} from '@shared-expense/domain/api';
import { cleanUp } from '../../src/cleanup';
import type { NodeServer } from '../../src/node';
import {
  CASEY,
  TAYLOR,
  now,
  registered,
  sql,
  type Answer,
  type Phone,
} from './sharing-api';
import {
  BRISBANE,
  GROUP_FULL,
  GROUP_LIMIT,
  LARGEST,
  SMALLEST,
  aMinuteLater,
  addMember,
  callOn,
  createGroup,
  events,
  eventsPath,
  expectCreated,
  expectGroupRefused,
  expectUploaded,
  ownServer,
  upload,
  uploadOf,
  useSyncApi,
} from './sync-api';
import { DAY, expectSnapshotNeeded } from './sync-cleanup-api';

// A cleanup that runs while phones upload and download (ADR-0033). Every phone sends to a
// server of its own, each with its own connections to the one database, as every request
// has on Workers: through one server the requests would wait for one another's
// connection and never meet the cleanup in the database.

useSyncApi();

/** Waits for all of them, so that nothing is on its way when a test ends, then fails with the first that failed. */
async function all<R>(promises: Promise<R>[]): Promise<R[]> {
  const settled = await Promise.allSettled(promises);
  return settled.map((each) => {
    if (each.status === 'rejected') throw each.reason;
    return each.value;
  });
}

describe('SYNC-140.1', () => {
  test('[SYNC-140.1] answers a download that meets a cleanup with a page that starts right after its cursor or with snapshot-needed, numbers the uploads on, and counts what it deletes once', async () => {
    const ROUNDS = 20;
    const taylor = await registered(TAYLOR);
    expectCreated(await createGroup(taylor, BRISBANE), BRISBANE);
    const taylorsServer = await ownServer();
    const readers: { phone: Phone; server: NodeServer }[] = [];
    for (const deviceId of [CASEY, undefined, undefined]) {
      const phone = await registered(deviceId);
      await addMember(BRISBANE, phone);
      readers.push({ phone, server: await ownServer() });
    }
    const numbersFrom = (first: number, count: number) =>
      Array.from({ length: count }, (_, index) => first + index);
    const downloads: { cursor: number; answer: Answer }[] = [];
    let last = 0;

    for (let round = 0; round < ROUNDS; round += 1) {
      // A minute of its own, for the request limit of each phone.
      aMinuteLater();
      const before = last;
      const first = events(5, 50);
      expectUploaded(
        await callOn(taylorsServer, taylor, uploadOf(BRISBANE, first)),
        first,
        numbersFrom(before + 1, 5),
      );

      // Together: two cleanups to which every event so far is over 30 days old, nine
      // downloads from cursors that have events after them, and one more upload.
      const more = events(3, 50);
      const at = now() + 31 * DAY;
      const uploading = callOn(taylorsServer, taylor, uploadOf(BRISBANE, more));
      const reading = readers.flatMap(({ phone, server }) =>
        [before, before, before + 2].map(async (cursor) => {
          const answer = await callOn(server, phone, {
            path: `${eventsPath(BRISBANE)}?after=${cursor}`,
          });
          downloads.push({ cursor, answer });
        }),
      );
      const [uploaded] = await all<unknown>([
        uploading,
        cleanUp(sql(), at),
        cleanUp(sql(), at),
        ...reading,
      ]);

      expectUploaded(uploaded as Answer, more, numbersFrom(before + 6, 3));
      last = before + 8;
    }

    expect(downloads).toHaveLength(ROUNDS * 9);
    for (const { cursor, answer } of downloads) {
      if (answer.status === 200) {
        // Events after this cursor were stored before the download was sent: a page
        // holds the first of them, and none means they were deleted under it.
        expect(isEventsPageResponse(answer.body)).toBe(true);
        const page = answer.body as EventsPageResponse;
        expect([cursor, page.events[0]?.sequence]).toEqual([
          cursor,
          cursor + 1,
        ]);
      } else {
        expectSnapshotNeeded(answer);
      }
    }

    // Once every event is deleted the group has room for exactly its limit again: each
    // event's size came off its count once, however many cleanups met it.
    aMinuteLater();
    await cleanUp(sql(), now() + 31 * DAY);
    let stored = last;
    for (const count of [...Array.from({ length: 22 }, () => 7), 6]) {
      const sent = events(count, LARGEST);
      expectUploaded(
        await upload(taylor, BRISBANE, sent),
        sent,
        numbersFrom(stored + 1, count),
      );
      stored += count;
    }
    expect((stored - last) * LARGEST).toBe(GROUP_LIMIT);
    expectGroupRefused(
      await upload(taylor, BRISBANE, events(1, SMALLEST)),
      GROUP_FULL,
    );
  }, 180_000);
});
