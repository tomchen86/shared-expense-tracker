import type { UploadedEvent } from '@shared-expense/domain/api';
import {
  CASEY,
  T,
  TAYLOR,
  expectRefused,
  registered,
  setTime,
  type Phone,
} from './sharing-api';
import {
  BRISBANE,
  EMPTY_PAGE,
  LARGEST,
  REQUEST,
  TOKYO,
  addMember,
  answerHeaders,
  createGroup,
  download,
  downloadWith,
  event,
  events,
  eventsPath,
  expectCreated,
  expectPage,
  expectUploaded,
  leavingGroupsAsTheyWere,
  relayedFrom,
  rowsHolding,
  upload,
  useSyncApi,
} from './sync-api';

// Downloading a shared ledger's events (ADR-0016): a phone asks for what follows its
// cursor and gets a small page (ADR-0007), in the order the events were stored. The
// cursor it sends is what the API records as its progress, with the time.

useSyncApi();

/** Taylor's phone, registered, with Brisbane created and `sent` uploaded to it at T, in uploads of up to 100. */
async function taylorWithEvents(sent: UploadedEvent[]): Promise<Phone> {
  const taylor = await registered(TAYLOR);
  expectCreated(await createGroup(taylor, BRISBANE), BRISBANE);
  for (let first = 0; first < sent.length; first += 100) {
    const batch = sent.slice(first, first + 100);
    expectUploaded(
      await upload(taylor, BRISBANE, batch),
      batch,
      batch.map((_, index) => first + index + 1),
    );
  }
  return taylor;
}

describe('SYNC-57.1', () => {
  test('[SYNC-57.1] returns the events after the cursor, in order, and says there are no more', async () => {
    const sent = events(5);
    const taylor = await taylorWithEvents(sent);
    const all = relayedFrom(1, sent, { by: taylor, at: T });

    setTime(T + 1_000);
    const fromTheStart = await download(taylor, BRISBANE, 0);
    const afterThree = await download(taylor, BRISBANE, 3);
    const afterFour = await download(taylor, BRISBANE, 4);
    const afterAll = await download(taylor, BRISBANE, 5);

    expectPage(fromTheStart, { events: all, more: false });
    expectPage(afterThree, { events: all.slice(3), more: false });
    expectPage(afterFour, { events: all.slice(4), more: false });
    expectPage(afterAll, EMPTY_PAGE);
  });

  test('[SYNC-57.1] returns an empty page for a group with no events', async () => {
    const taylor = await taylorWithEvents([]);

    expectPage(await download(taylor, BRISBANE, 0), EMPTY_PAGE);
  });

  test('[SYNC-57.1] returns at most 100 events, and says whether more follow', async () => {
    const sent = events(250, 20);
    const taylor = await taylorWithEvents(sent);
    const all = relayedFrom(1, sent, { by: taylor, at: T });

    const first = await download(taylor, BRISBANE, 0);
    const second = await download(taylor, BRISBANE, 100);
    const third = await download(taylor, BRISBANE, 200);
    const lastHundred = await download(taylor, BRISBANE, 150);
    const lastHundredAndOne = await download(taylor, BRISBANE, 149);

    expectPage(first, { events: all.slice(0, 100), more: true });
    expectPage(second, { events: all.slice(100, 200), more: true });
    expectPage(third, { events: all.slice(200), more: false });
    expectPage(lastHundred, { events: all.slice(150), more: false });
    expectPage(lastHundredAndOne, { events: all.slice(149, 249), more: true });
  });

  test('[SYNC-57.1] ends a page before the event that would take its contents past 262,144 bytes', async () => {
    const sent = events(5, LARGEST);
    const taylor = await taylorWithEvents(sent);
    const all = relayedFrom(1, sent, { by: taylor, at: T });

    const first = await download(taylor, BRISBANE, 0);
    const second = await download(taylor, BRISBANE, 4);

    // Four of 65,536 bytes are exactly 262,144.
    expectPage(first, { events: all.slice(0, 4), more: true });
    expectPage(second, { events: all.slice(4), more: false });
  });

  test('[SYNC-57.1] counts the bytes of the contents from the cursor on, whatever came before it', async () => {
    const sent = [
      event(1),
      ...events(3, LARGEST),
      event(LARGEST - 1),
      event(1),
      event(1),
    ];
    const taylor = await taylorWithEvents(sent);
    const all = relayedFrom(1, sent, { by: taylor, at: T });

    const fromTheStart = await download(taylor, BRISBANE, 0);
    const afterOne = await download(taylor, BRISBANE, 1);
    const afterFive = await download(taylor, BRISBANE, 5);

    // 1 + 3 × 65,536 + 65,535 bytes are exactly 262,144, so the sixth event does not fit.
    expectPage(fromTheStart, { events: all.slice(0, 5), more: true });
    // Without the first, the sixth fits and the seventh does not.
    expectPage(afterOne, { events: all.slice(1, 6), more: true });
    expectPage(afterFive, { events: all.slice(5), more: false });
  });

  test("[SYNC-57.1] returns only the group's own events", async () => {
    const inBrisbane = events(2);
    const taylor = await taylorWithEvents(inBrisbane);
    expectCreated(await createGroup(taylor, TOKYO), TOKYO);
    const inTokyo = events(3);
    expectUploaded(await upload(taylor, TOKYO, inTokyo), inTokyo, [1, 2, 3]);

    expectPage(await download(taylor, BRISBANE, 0), {
      events: relayedFrom(1, inBrisbane, { by: taylor, at: T }),
      more: false,
    });
    expectPage(await download(taylor, TOKYO, 2), {
      events: relayedFrom(3, inTokyo.slice(2), { by: taylor, at: T }),
      more: false,
    });
  });

  test('[SYNC-57.1] returns to each member device the events every member device uploaded, its own too', async () => {
    const fromTaylor = events(2);
    const taylor = await taylorWithEvents(fromTaylor);
    const casey = await registered(CASEY);
    await addMember(BRISBANE, casey);
    const fromCasey = events(2);
    setTime(T + 2_000);
    expectUploaded(await upload(casey, BRISBANE, fromCasey), fromCasey, [3, 4]);

    const page = {
      events: [
        ...relayedFrom(1, fromTaylor, { by: taylor, at: T }),
        ...relayedFrom(3, fromCasey, { by: casey, at: T + 2_000 }),
      ],
      more: false,
    };
    expectPage(await download(taylor, BRISBANE, 0), page);
    expectPage(await download(casey, BRISBANE, 0), page);
  });

  test('[SYNC-57.1] answers the same cursor with what the group has by then, and marks the answer as not to be stored', async () => {
    const sent = events(2);
    const taylor = await taylorWithEvents(sent);
    expectPage(await download(taylor, BRISBANE, 2), EMPTY_PAGE);
    const later = events(1);
    setTime(T + 2_000);
    expectUploaded(await upload(taylor, BRISBANE, later), later, [3]);

    const again = await download(taylor, BRISBANE, 2);
    const headers = await answerHeaders(taylor, {
      path: `${eventsPath(BRISBANE)}?after=2`,
    });

    expectPage(again, {
      events: relayedFrom(3, later, { by: taylor, at: T + 2_000 }),
      more: false,
    });
    expect(headers.get('cache-control')).toBe('no-store');
  });
});

describe('SYNC-58.1', () => {
  test('[SYNC-58.1] records the cursor a phone sends and the time, not the events it returned', async () => {
    const taylor = await taylorWithEvents(events(5));

    setTime(T + 1_000);
    expect((await download(taylor, BRISBANE, 3)).status).toBe(200);

    expect(await rowsHolding(BRISBANE, TAYLOR, 3, T + 1_000)).toBe(1);
    expect(await rowsHolding(BRISBANE, TAYLOR, 5, T + 1_000)).toBe(0);
  });

  test('[SYNC-58.1] replaces what it recorded each time the phone downloads, also with a smaller cursor', async () => {
    const taylor = await taylorWithEvents(events(5));
    setTime(T + 1_000);
    expect((await download(taylor, BRISBANE, 3)).status).toBe(200);

    setTime(T + 2_000);
    expect((await download(taylor, BRISBANE, 5)).status).toBe(200);
    const afterTheSecond = [
      await rowsHolding(BRISBANE, TAYLOR, 5, T + 2_000),
      await rowsHolding(BRISBANE, TAYLOR, 3, T + 1_000),
    ];
    setTime(T + 3_000);
    expect((await download(taylor, BRISBANE, 2)).status).toBe(200);
    const afterTheThird = [
      await rowsHolding(BRISBANE, TAYLOR, 2, T + 3_000),
      await rowsHolding(BRISBANE, TAYLOR, 5, T + 2_000),
    ];

    expect(afterTheSecond).toEqual([1, 0]);
    expect(afterTheThird).toEqual([1, 0]);
  });

  test('[SYNC-58.1] records a download that returns an empty page, from cursor 0 too', async () => {
    const taylor = await taylorWithEvents([]);

    setTime(T + 1_000);
    expectPage(await download(taylor, BRISBANE, 0), EMPTY_PAGE);

    expect(await rowsHolding(BRISBANE, TAYLOR, 0, T + 1_000)).toBe(1);
  });

  test('[SYNC-58.1] records each member device and each group by itself', async () => {
    const taylor = await taylorWithEvents(events(5));
    const casey = await registered(CASEY);
    await addMember(BRISBANE, casey);
    expectCreated(await createGroup(taylor, TOKYO), TOKYO);
    const inTokyo = events(2);
    expectUploaded(await upload(taylor, TOKYO, inTokyo), inTokyo, [1, 2]);

    setTime(T + 1_000);
    expect((await download(taylor, BRISBANE, 4)).status).toBe(200);
    setTime(T + 2_000);
    expect((await download(casey, BRISBANE, 1)).status).toBe(200);
    setTime(T + 3_000);
    expect((await download(taylor, TOKYO, 2)).status).toBe(200);

    expect(await rowsHolding(BRISBANE, TAYLOR, 4, T + 1_000)).toBe(1);
    expect(await rowsHolding(BRISBANE, CASEY, 1, T + 2_000)).toBe(1);
    expect(await rowsHolding(TOKYO, TAYLOR, 2, T + 3_000)).toBe(1);
  });

  test('[SYNC-58.1] leaves what it recorded as it is when the phone uploads, and when a download is refused', async () => {
    const taylor = await taylorWithEvents(events(5));
    setTime(T + 1_000);
    expect((await download(taylor, BRISBANE, 3)).status).toBe(200);

    setTime(T + 2_000);
    const more = events(1);
    expectUploaded(await upload(taylor, BRISBANE, more), more, [6]);
    setTime(T + 3_000);
    const pastTheEnd = await leavingGroupsAsTheyWere(() =>
      download(taylor, BRISBANE, 7),
    );
    const noCursor = await leavingGroupsAsTheyWere(() =>
      downloadWith(taylor, BRISBANE, ''),
    );

    expectRefused(pastTheEnd, REQUEST);
    expectRefused(noCursor, REQUEST);
    expect(await rowsHolding(BRISBANE, TAYLOR, 3, T + 1_000)).toBe(1);
  });
});

describe('SYNC-59.1', () => {
  test.each([
    ['no query', ''],
    ['an empty cursor', '?after='],
    ['a negative cursor', '?after=-1'],
    ['a cursor with a decimal point', '?after=1.5'],
    ['a cursor with a leading zero', '?after=01'],
    ['a cursor of two zeros', '?after=00'],
    ['a cursor with an exponent', '?after=1e0'],
    ['a cursor in hexadecimal', '?after=0x1'],
    ['a cursor that is no number', '?after=abc'],
    ['a cursor written with an escape', '?after=%31'],
    ['a cursor past the largest integer', '?after=9007199254740992'],
    ['another name for the cursor', '?cursor=1'],
    ['the name in capitals', '?After=1'],
    ['a cursor and something else', '?after=1&limit=5'],
    ['something else and a cursor', '?limit=5&after=1'],
    ['two cursors', '?after=1&after=1'],
    ['a cursor and a stray mark', '?after=1&'],
    ['only something else', '?limit=5'],
  ])('[SYNC-59.1] refuses a download with %s', async (_, query) => {
    const taylor = await taylorWithEvents(events(3));

    const answer = await leavingGroupsAsTheyWere(() =>
      downloadWith(taylor, BRISBANE, query),
    );

    expectRefused(answer, REQUEST);
    // Written as it must be, the same cursor gets a page.
    expect((await download(taylor, BRISBANE, 1)).status).toBe(200);
  });

  test("[SYNC-59.1] refuses a cursor past the group's last event, and takes the last event's own number", async () => {
    const sent = events(3);
    const taylor = await taylorWithEvents(sent);

    const onePast = await leavingGroupsAsTheyWere(() =>
      download(taylor, BRISBANE, 4),
    );
    const farPast = await leavingGroupsAsTheyWere(() =>
      download(taylor, BRISBANE, 9007199254740991),
    );
    const atTheEnd = await download(taylor, BRISBANE, 3);

    expectRefused(onePast, REQUEST);
    expectRefused(farPast, REQUEST);
    expectPage(atTheEnd, EMPTY_PAGE);
  });

  test('[SYNC-59.1] refuses any cursor but 0 for a group with no events', async () => {
    const taylor = await taylorWithEvents([]);

    const answer = await leavingGroupsAsTheyWere(() =>
      download(taylor, BRISBANE, 1),
    );

    expectRefused(answer, REQUEST);
    expectPage(await download(taylor, BRISBANE, 0), EMPTY_PAGE);
  });

  test('[SYNC-59.1] takes a cursor again once the group has the event it names', async () => {
    const taylor = await taylorWithEvents(events(3));
    expectRefused(await download(taylor, BRISBANE, 4), REQUEST);
    const next = events(1);
    setTime(T + 1_000);
    expectUploaded(await upload(taylor, BRISBANE, next), next, [4]);

    expectPage(await download(taylor, BRISBANE, 4), EMPTY_PAGE);
    expectPage(await download(taylor, BRISBANE, 3), {
      events: relayedFrom(4, next, { by: taylor, at: T + 1_000 }),
      more: false,
    });
  });
});
