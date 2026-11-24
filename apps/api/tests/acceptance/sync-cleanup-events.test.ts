import {
  CASEY,
  T,
  databaseContents,
  expectRefused,
  registered,
  setTime,
  timesPublicKeyStored,
} from './sharing-api';
import {
  bothInBrisbane,
  taylorWithBrisbaneAndCasey,
} from './sharing-invites-api';
import {
  BRISBANE,
  EMPTY_PAGE,
  GROUP_FULL,
  GROUP_LIMIT,
  LARGEST,
  NOT_A_MEMBER,
  REQUEST,
  SMALLEST,
  TOKYO,
  answerHeaders,
  createGroup,
  download,
  downloadWith,
  event,
  events,
  eventsPath,
  expectCreated,
  expectGroupRefused,
  expectPage,
  expectUploaded,
  relayed,
  relayedFrom,
  rowsHolding,
  upload,
  useSyncApi,
  wrongEpoch,
} from './sync-api';
import {
  DAY,
  THIRTY_DAYS,
  cleanUpAt,
  expectDeleted,
  expectKept,
  expectSnapshotNeeded,
  reach,
  store,
} from './sync-cleanup-api';

// The cleanup of a group's events (ADR-0033): what it deletes, what a phone behind the
// deleted events is told, and what the group is afterwards to an upload.

useSyncApi();

describe('SYNC-134.1', () => {
  test('[SYNC-134.1] deletes the events every member device has sent a cursor for; [SYNC-136.2] a cursor before them then needs a snapshot, and the one at their end gets a page', async () => {
    const [taylor, casey] = await bothInBrisbane();
    const sent = await store(taylor, 3);
    await reach(taylor, 3);
    await reach(casey, 3);

    await cleanUpAt();

    await expectDeleted(...sent);
    expectPage(await download(taylor, BRISBANE, 3), EMPTY_PAGE);
    expectPage(await download(casey, BRISBANE, 3), EMPTY_PAGE);
    for (const cursor of [0, 1, 2]) {
      expectSnapshotNeeded(await download(casey, BRISBANE, cursor));
    }
  });

  test('[SYNC-134.1] deletes only up to the cursor of the member device that is furthest behind', async () => {
    const [taylor, casey] = await bothInBrisbane();
    const sent = await store(taylor, 5);
    await reach(taylor, 5);
    await reach(casey, 2);

    await cleanUpAt();

    await expectDeleted(sent[0], sent[1]);
    await expectKept(sent[2], sent[3], sent[4]);
    expectPage(await download(casey, BRISBANE, 2), {
      events: relayedFrom(3, sent.slice(2), { by: taylor, at: T }),
      more: false,
    });
  });

  test('[SYNC-134.1] does not count a page a phone was given until the phone sends the cursor after it', async () => {
    const [taylor, casey] = await bothInBrisbane();
    const sent = await store(taylor, 3);
    const page = {
      events: relayedFrom(1, sent, { by: taylor, at: T }),
      more: false,
    };
    expectPage(await download(taylor, BRISBANE, 0), page);
    expectPage(await download(casey, BRISBANE, 0), page);

    await cleanUpAt();
    await expectKept(...sent);

    await reach(taylor, 3);
    await reach(casey, 3);
    await cleanUpAt();
    await expectDeleted(...sent);
  });

  test("[SYNC-134.1] keeps an event its own uploader has sent no cursor for: an upload does not move the uploader's progress", async () => {
    const [taylor, casey] = await bothInBrisbane();
    await reach(taylor, 0);
    const [a] = await store(taylor, 1);
    await reach(casey, 1);

    await cleanUpAt();

    await expectKept(a);
  });

  test('[SYNC-134.1] deletes nothing by this rule while a member device has no progress', async () => {
    const [taylor] = await bothInBrisbane();
    const sent = await store(taylor, 3);
    await reach(taylor, 3);

    await cleanUpAt();

    await expectKept(...sent);
  });

  test('[SYNC-134.1] deletes the events of a group with one member device once that one has sent a cursor for them', async () => {
    const [taylor] = await taylorWithBrisbaneAndCasey();
    const sent = await store(taylor, 2);
    await reach(taylor, 2);

    await cleanUpAt();

    await expectDeleted(...sent);
  });

  test('[SYNC-134.1] goes by the progress recorded when it runs, also when a phone has sent a smaller cursor since', async () => {
    const [taylor, casey] = await bothInBrisbane();
    const sent = await store(taylor, 5);
    await reach(taylor, 5);
    await reach(casey, 5);
    await reach(taylor, 2);

    await cleanUpAt();

    await expectDeleted(sent[0], sent[1]);
    await expectKept(sent[2], sent[3], sent[4]);
    expectPage(await download(taylor, BRISBANE, 2), {
      events: relayedFrom(3, sent.slice(2), { by: taylor, at: T }),
      more: false,
    });
  });

  test('[SYNC-134.1] takes each group by its own member devices', async () => {
    const [taylor, casey] = await bothInBrisbane();
    expectCreated(await createGroup(taylor, TOKYO), TOKYO);
    const inBrisbane = await store(taylor, 2);
    const inTokyo = events(2);
    expectUploaded(await upload(taylor, TOKYO, inTokyo), inTokyo, [1, 2]);
    await reach(taylor, 2);
    await reach(casey, 2);
    expect((await download(taylor, TOKYO, 0)).status).toBe(200);

    await cleanUpAt();

    await expectDeleted(...inBrisbane);
    await expectKept(...inTokyo);
  });

  test('[SYNC-134.1] changes nothing when it runs again, and nothing when there is nothing to delete', async () => {
    const [taylor, casey] = await bothInBrisbane();
    const sent = await store(taylor, 3);
    await reach(taylor, 2);
    await reach(casey, 0);
    const untouched = await databaseContents();

    await cleanUpAt();
    expect(await databaseContents()).toEqual(untouched);

    await reach(casey, 2);
    await cleanUpAt();
    await expectDeleted(sent[0], sent[1]);
    const cleared = await databaseContents();
    await cleanUpAt();
    await cleanUpAt();
    expect(await databaseContents()).toEqual(cleared);
  });
});

describe('SYNC-135.1', () => {
  test('[SYNC-135.1] deletes events received more than 30 days before, whichever phones have them, and none received exactly 30 days before', async () => {
    const [taylor] = await bothInBrisbane();
    const sent = await store(taylor, 2);

    await cleanUpAt(T + THIRTY_DAYS);
    await expectKept(...sent);

    await cleanUpAt(T + THIRTY_DAYS + 1);
    await expectDeleted(...sent);
  });

  test('[SYNC-135.1] deletes only the events that are older than 30 days', async () => {
    const [taylor] = await bothInBrisbane();
    const [a] = await store(taylor, 1);
    setTime(T + DAY);
    const [b] = await store(taylor, 1, 2);
    setTime(T + 2 * DAY);
    const [c] = await store(taylor, 1, 3);

    await cleanUpAt(T + 31 * DAY);

    await expectDeleted(a);
    // B was received exactly 30 days before.
    await expectKept(b, c);
  });

  test('[SYNC-135.1] deletes with an event that is older than 30 days every event of the group numbered before it', async () => {
    const [taylor] = await bothInBrisbane();
    setTime(T + 5_000);
    const [a] = await store(taylor, 1);
    // The API's time is each Worker's own clock: the second event was received earlier.
    setTime(T);
    const [b] = await store(taylor, 1, 2);

    await cleanUpAt(T + THIRTY_DAYS);
    await expectKept(a, b);

    // B is a millisecond over 30 days, A 4,999 short of them.
    await cleanUpAt(T + THIRTY_DAYS + 1);
    await expectDeleted(a, b);
  });

  test('[SYNC-135.1] deletes them under a phone that has not got them; [SYNC-136.2] that phone then needs a snapshot', async () => {
    const [taylor, casey] = await bothInBrisbane();
    const sent = await store(taylor, 3);
    await reach(taylor, 3);
    await reach(casey, 1);

    await cleanUpAt(T + THIRTY_DAYS + 1);

    await expectDeleted(...sent);
    expectSnapshotNeeded(await download(casey, BRISBANE, 1));
  });

  test.each([
    [3, 3],
    [0, 1],
  ])(
    '[SYNC-135.1] with [SYNC-134.1] deletes up to the higher number of the two rules: every phone at cursor %i and one event over 30 days, up to number %i',
    async (cursor, cleared) => {
      const [taylor, casey] = await bothInBrisbane();
      const [a] = await store(taylor, 1);
      setTime(T + 2 * DAY);
      const all = [a, ...(await store(taylor, 4, 2))];
      await reach(taylor, cursor);
      await reach(casey, cursor);

      await cleanUpAt(T + 31 * DAY);

      await expectDeleted(...all.slice(0, cleared));
      await expectKept(...all.slice(cleared));
    },
  );
});

describe('SYNC-136.2', () => {
  test('[SYNC-136.2] answers a cursor before the deleted events with status 410 and snapshot-needed, no page, and marks the answer as not to be stored', async () => {
    const [taylor, casey] = await bothInBrisbane();
    await store(taylor, 5);
    await cleanUpAt(T + THIRTY_DAYS + 1);

    const answer = await download(casey, BRISBANE, 2);
    const headers = await answerHeaders(casey, {
      path: `${eventsPath(BRISBANE)}?after=2`,
    });

    expect(answer).toEqual({ status: 410, body: { error: 'snapshot-needed' } });
    expectSnapshotNeeded(answer);
    expect(headers.get('cache-control')).toBe('no-store');
  });

  test('[SYNC-136.2] needs a snapshot for every cursor below the number the group is cleared to, and [SYNC-57.2] gives a page from that number on', async () => {
    const [taylor, casey] = await bothInBrisbane();
    const sent = await store(taylor, 5);
    const all = relayedFrom(1, sent, { by: taylor, at: T });
    await reach(taylor, 3);
    await reach(casey, 3);
    await cleanUpAt();

    for (const cursor of [0, 1, 2]) {
      expectSnapshotNeeded(await download(taylor, BRISBANE, cursor));
    }
    expectPage(await download(taylor, BRISBANE, 3), {
      events: all.slice(3),
      more: false,
    });
    expectPage(await download(taylor, BRISBANE, 4), {
      events: all.slice(4),
      more: false,
    });
    expectPage(await download(taylor, BRISBANE, 5), EMPTY_PAGE);
    expectRefused(await download(taylor, BRISBANE, 6), REQUEST);
  });

  test('[SYNC-136.2] gives an empty page only to the cursor at the end of a group whose events are all deleted, and says the same however often it is asked', async () => {
    const [taylor, casey] = await bothInBrisbane();
    await store(taylor, 5);
    await cleanUpAt(T + THIRTY_DAYS + 1);

    expectPage(await download(taylor, BRISBANE, 5), EMPTY_PAGE);
    expectSnapshotNeeded(await download(taylor, BRISBANE, 4));
    for (let asked = 0; asked < 3; asked += 1) {
      expectSnapshotNeeded(await download(casey, BRISBANE, 2));
    }
  });

  test('[SYNC-136.2] records the cursor and the time as the progress of the phone it tells so, and [SYNC-134.1] keeps the events after that cursor for it', async () => {
    const [taylor, casey] = await bothInBrisbane();
    await store(taylor, 5);
    await reach(taylor, 5);
    await reach(casey, 5);
    await cleanUpAt();
    const later = await store(taylor, 2, 6);
    setTime(T + 2_000);
    await reach(taylor, 7);
    await reach(casey, 7);

    // Casey's local data went back.
    setTime(T + 9_000);
    expectSnapshotNeeded(await download(casey, BRISBANE, 2));

    expect(await rowsHolding(BRISBANE, CASEY, 2, T + 9_000)).toBe(1);
    expect(await rowsHolding(BRISBANE, CASEY, 7, T + 2_000)).toBe(0);

    // Every member device had F and G, by what was recorded before; not any more.
    await cleanUpAt(T + 10_000);
    await expectKept(...later);
    expectPage(await download(casey, BRISBANE, 5), {
      events: relayedFrom(6, later, { by: taylor, at: T }),
      more: false,
    });
  });

  test('[SYNC-136.2] tells a device that is no member device nothing about what a group has deleted', async () => {
    const [taylor] = await bothInBrisbane();
    const stranger = await registered();
    await store(taylor, 3);
    await cleanUpAt(T + THIRTY_DAYS + 1);

    const inBrisbane = await download(stranger, BRISBANE, 0);
    const inNoGroup = await download(stranger, TOKYO, 0);

    expectGroupRefused(inBrisbane, NOT_A_MEMBER);
    expect(inBrisbane).toEqual(inNoGroup);
  });

  test('[SYNC-136.2] refuses a download that is written wrongly as before, and records no progress for it', async () => {
    const [taylor, casey] = await bothInBrisbane();
    await store(taylor, 5);
    setTime(T + 1_000);
    await reach(taylor, 5);
    await reach(casey, 5);
    await cleanUpAt(T + 2_000);

    setTime(T + 3_000);
    const leadingZero = await downloadWith(casey, BRISBANE, '?after=01');
    const noQuery = await downloadWith(casey, BRISBANE, '');

    expectRefused(leadingZero, REQUEST);
    expectRefused(noQuery, REQUEST);
    expect(await rowsHolding(BRISBANE, CASEY, 5, T + 1_000)).toBe(1);
  });
});

describe('SYNC-138.1', () => {
  test('[SYNC-138.1] gives a full group the room of the events it deletes, and no more', async () => {
    const [taylor] = await taylorWithBrisbaneAndCasey();
    // 160 events of 65,536 bytes, seven to an upload: exactly 10,485,760 bytes.
    let stored = 0;
    for (const count of [...Array.from({ length: 22 }, () => 7), 6]) {
      const sent = events(count, LARGEST);
      expectUploaded(
        await upload(taylor, BRISBANE, sent),
        sent,
        sent.map((_, index) => stored + index + 1),
      );
      stored += count;
    }
    expect(stored * LARGEST).toBe(GROUP_LIMIT);
    expectGroupRefused(
      await upload(taylor, BRISBANE, events(1, SMALLEST)),
      GROUP_FULL,
    );
    await reach(taylor, 2);

    await cleanUpAt();

    // The first two events are deleted: 131,072 bytes of room.
    const threeMore = await upload(taylor, BRISBANE, events(3, LARGEST));
    const two = events(2, LARGEST);
    const twoMore = await upload(taylor, BRISBANE, two);
    const oneByteMore = await upload(taylor, BRISBANE, events(1, SMALLEST));

    expectGroupRefused(threeMore, GROUP_FULL);
    expectUploaded(twoMore, two, [161, 162]);
    expectGroupRefused(oneByteMore, GROUP_FULL);
  }, 120_000);

  test('[SYNC-138.1] goes on numbering after the last number the group gave, deleted or not', async () => {
    const [taylor] = await bothInBrisbane();
    await store(taylor, 3);
    await cleanUpAt(T + THIRTY_DAYS + 1);

    const [d] = await store(taylor, 1, 4);

    expectPage(await download(taylor, BRISBANE, 3), {
      events: [relayed(d, { sequence: 4, by: taylor, at: T })],
      more: false,
    });
  });
});

describe('SYNC-139.1', () => {
  test('[SYNC-139.1] stores an event the cleanup deleted as a new event, under the next number, with what this upload brings', async () => {
    const [taylor, casey] = await bothInBrisbane();
    const [a] = await store(taylor, 1);
    await cleanUpAt(T + THIRTY_DAYS + 1);

    setTime(T + 5_000);
    const again = event(200, a.id);
    const answer = await upload(casey, BRISBANE, [again]);

    expectUploaded(answer, [again], [2]);
    expectPage(await download(casey, BRISBANE, 1), {
      events: [relayed(again, { sequence: 2, by: casey, at: T + 5_000 })],
      more: false,
    });
    await expectDeleted(a);
  });

  test('[SYNC-139.1] numbers the deleted events of an upload as new ones, and [SYNC-51.1] answers the ones the group still stores with their numbers', async () => {
    const [taylor, casey] = await bothInBrisbane();
    const [a, , c] = await store(taylor, 3);
    await reach(taylor, 2);
    await reach(casey, 2);
    await cleanUpAt();
    const d = event();

    const answer = await upload(taylor, BRISBANE, [c, a, d]);

    expectUploaded(answer, [c, a, d], [3, 4, 5]);
  });

  test("[SYNC-139.1] checks a deleted event's key epoch as a new event's", async () => {
    const [taylor] = await bothInBrisbane();
    const [a] = await store(taylor, 1);
    await cleanUpAt(T + THIRTY_DAYS + 1);

    expectGroupRefused(await upload(taylor, BRISBANE, [a], 2), wrongEpoch(1));
  });
});

describe('SYNC-141.3', () => {
  test('[SYNC-141.3] leaves a phone that has not synced for a year a member device, with its key and its progress', async () => {
    const [taylor, casey] = await bothInBrisbane();
    await reach(casey, 0);
    setTime(T + 364 * DAY);
    const [a] = await store(taylor, 1);

    await cleanUpAt(T + 365 * DAY);

    expect(await timesPublicKeyStored(casey)).toBe(1);
    expect(await rowsHolding(BRISBANE, CASEY, 0, T)).toBe(1);
    setTime(T + 365 * DAY);
    const b = event();
    expectUploaded(await upload(casey, BRISBANE, [b]), [b], [2]);
    expectPage(await download(casey, BRISBANE, 0), {
      events: [
        relayed(a, { sequence: 1, by: taylor, at: T + 364 * DAY }),
        relayed(b, { sequence: 2, by: casey, at: T + 365 * DAY }),
      ],
      more: false,
    });
  });

  test('[SYNC-141.3] leaves a group its key epoch and its last sequence number when every event of it is deleted', async () => {
    const [taylor] = await bothInBrisbane();
    await store(taylor, 3);

    await cleanUpAt(T + 31 * DAY);

    const next = events(1);
    expectGroupRefused(await upload(taylor, BRISBANE, next, 2), wrongEpoch(1));
    expectUploaded(await upload(taylor, BRISBANE, next), next, [4]);
  });
});
