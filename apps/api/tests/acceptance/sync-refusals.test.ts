import { randomBytes } from 'node:crypto';
import {
  CASEY,
  T,
  TAYLOR,
  expectPassed,
  expectRefused,
  newPhone,
  registered,
  send,
  setTime,
  signedBy,
  timesStored,
  type Phone,
} from './sharing-api';
import {
  BRISBANE,
  EMPTY_PAGE,
  NOT_A_MEMBER,
  REQUEST,
  call,
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
  leavingGroupsAsTheyWere,
  relayedFrom,
  rowsHolding,
  upload,
  uploadBody,
  useSyncApi,
} from './sync-api';

// What the event API refuses first when a request is wrong in more than one way, and what
// the API keeps about a group: the envelope of each event and nothing a request merely
// carried (ADR-0003, ADR-0022).

useSyncApi();

const SIGNATURE = { error: 'signature' } as const;
const REPLAYED = { error: 'replayed' } as const;

/** Taylor's phone, registered, with Brisbane created; and Casey's, registered and no member device. */
async function taylorWithBrisbaneAndCasey(): Promise<[Phone, Phone]> {
  const taylor = await registered(TAYLOR);
  const casey = await registered(CASEY);
  expectCreated(await createGroup(taylor, BRISBANE), BRISBANE);
  return [taylor, casey];
}

describe('SYNC-60.1', () => {
  test('[SYNC-60.1] takes none of the three requests without a signature, or from a device that has not registered', async () => {
    const [taylor] = await taylorWithBrisbaneAndCasey();
    const stranger = newPhone();
    const body = new Uint8Array(
      Buffer.from(JSON.stringify({ epoch: 1, events: events(1) })),
    );
    const requests = [
      { method: 'PUT', path: `/groups/${BRISBANE}` },
      { method: 'POST', path: eventsPath(BRISBANE), body },
      { method: 'GET', path: `${eventsPath(BRISBANE)}?after=0` },
    ];

    for (const request of requests) {
      const unsigned = await leavingGroupsAsTheyWere(() => send(request));
      const unregistered = await leavingGroupsAsTheyWere(() =>
        send(signedBy(stranger, request)),
      );

      expectRefused(unsigned, SIGNATURE);
      expectRefused(unregistered, SIGNATURE);
    }
    // Signed by a member device, each of them is taken.
    const sent = events(1);
    expectCreated(await createGroup(taylor, BRISBANE), BRISBANE);
    expectUploaded(await upload(taylor, BRISBANE, sent), sent, [1]);
    expectPage(await download(taylor, BRISBANE, 0), {
      events: relayedFrom(1, sent, { by: taylor, at: T }),
      more: false,
    });
  });

  test('[SYNC-60.1] refuses a request that is written wrongly for that, whether or not the phone is a member device', async () => {
    const [taylor, casey] = await taylorWithBrisbaneAndCasey();

    for (const phone of [taylor, casey]) {
      const noEvents = await leavingGroupsAsTheyWere(() =>
        uploadBody(phone, BRISBANE, JSON.stringify({ epoch: 1, events: [] })),
      );
      const noCursor = await leavingGroupsAsTheyWere(() =>
        downloadWith(phone, BRISBANE, ''),
      );
      const withContent = await leavingGroupsAsTheyWere(() =>
        createGroup(phone, BRISBANE, '{}'),
      );

      expectRefused(noEvents, REQUEST);
      expectRefused(noCursor, REQUEST);
      expectRefused(withContent, REQUEST);
    }
  });

  test('[SYNC-60.1] refuses a phone that is no member device for that, before it looks at the key epoch or at the cursor', async () => {
    const [taylor, casey] = await taylorWithBrisbaneAndCasey();
    const stored = events(2);
    expectUploaded(await upload(taylor, BRISBANE, stored), stored, [1, 2]);

    const otherEpoch = await leavingGroupsAsTheyWere(() =>
      upload(casey, BRISBANE, events(1), 2),
    );
    const pastTheEnd = await leavingGroupsAsTheyWere(() =>
      download(casey, BRISBANE, 3),
    );

    expectGroupRefused(otherEpoch, NOT_A_MEMBER);
    expectGroupRefused(pastTheEnd, NOT_A_MEMBER);
    // From a member device, the same two requests are refused for what they ask.
    expectGroupRefused(await upload(taylor, BRISBANE, events(1), 2), {
      error: 'epoch',
      epoch: 1,
    });
    expectRefused(await download(taylor, BRISBANE, 3), REQUEST);
  });

  test('[SYNC-60.1] has accepted a request it then refuses: sent again as it was, it is a replay', async () => {
    const [, casey] = await taylorWithBrisbaneAndCasey();
    const request = signedBy(casey, {
      path: `${eventsPath(BRISBANE)}?after=0`,
    });

    const first = await send(request);
    const again = await send(request);

    expectGroupRefused(first, NOT_A_MEMBER);
    expectRefused(again, REPLAYED);
  });

  test("[SYNC-60.1] counts a request it refuses towards the device's 60 a minute", async () => {
    const [, casey] = await taylorWithBrisbaneAndCasey();
    // With its registration, 59 more make 60 in this minute.
    for (let sent = 0; sent < 59; sent += 1) {
      expectGroupRefused(await download(casey, BRISBANE, 0), NOT_A_MEMBER);
    }

    const next = await download(casey, BRISBANE, 0);

    expectRefused(next, { error: 'too-many-requests', retryAfterMs: 60_000 });
  });
});

describe('SYNC-61.3', () => {
  const HEADERS = {
    'User-Agent': 'TaylorsPhone/1.0',
    'X-Group-Name': 'Brisbane-Trip',
  };

  test("[SYNC-61.3] keeps each event's content once, and nothing a request carries beside what the event API takes", async () => {
    const taylor = await registered(TAYLOR);
    const content = new Uint8Array(randomBytes(64));
    const other = new Uint8Array(randomBytes(64));
    const sent = [event(content), event(other)];

    expectCreated(
      await call(
        taylor,
        { method: 'PUT', path: `/groups/${BRISBANE}` },
        HEADERS,
      ),
      BRISBANE,
    );
    expectUploaded(
      await call(
        taylor,
        {
          method: 'POST',
          path: eventsPath(BRISBANE),
          body: JSON.stringify({ epoch: 1, events: sent }),
        },
        HEADERS,
      ),
      sent,
      [1, 2],
    );
    expectPage(
      await call(taylor, { path: `${eventsPath(BRISBANE)}?after=0` }, HEADERS),
      { events: relayedFrom(1, sent, { by: taylor, at: T }), more: false },
    );

    const stored = await timesStored(content);
    expect(stored).toBeGreaterThan(0);
    expect(await timesStored(other)).toBe(stored);
    expect(await timesStored('TaylorsPhone')).toBe(0);
    expect(await timesStored('Brisbane-Trip')).toBe(0);
  });

  test('[SYNC-61.3] keeps nothing of an event that comes again with other content, or of an upload it refused', async () => {
    const [taylor, casey] = await taylorWithBrisbaneAndCasey();
    const content = new Uint8Array(randomBytes(64));
    const [sent] = [event(content)];
    expectUploaded(await upload(taylor, BRISBANE, [sent]), [sent], [1]);
    const stored = await timesStored(content);
    const again = new Uint8Array(randomBytes(64));
    const fromCasey = new Uint8Array(randomBytes(64));
    const underEpoch2 = new Uint8Array(randomBytes(64));

    expectUploaded(
      await upload(taylor, BRISBANE, [event(again, sent.id)]),
      [sent],
      [1],
    );
    expectGroupRefused(
      await upload(casey, BRISBANE, [event(fromCasey)]),
      NOT_A_MEMBER,
    );
    expectGroupRefused(
      await upload(taylor, BRISBANE, [event(underEpoch2)], 2),
      {
        error: 'epoch',
        epoch: 1,
      },
    );

    expect(stored).toBeGreaterThan(0);
    expect(await timesStored(content)).toBe(stored);
    for (const refused of [again, fromCasey, underEpoch2]) {
      expect(await timesStored(refused)).toBe(0);
    }
    expectPage(await download(taylor, BRISBANE, 1), EMPTY_PAGE);
  });
});

describe('SYNC-63.1', () => {
  test('[SYNC-63.1] takes a HEAD for no download: it answers "not found" and records no progress', async () => {
    const [taylor] = await taylorWithBrisbaneAndCasey();
    const stored = events(3);
    expectUploaded(await upload(taylor, BRISBANE, stored), stored, [1, 2, 3]);
    setTime(T + 1_000);
    expect((await download(taylor, BRISBANE, 1)).status).toBe(200);

    setTime(T + 2_000);
    const answer = await leavingGroupsAsTheyWere(() =>
      call(taylor, { method: 'HEAD', path: `${eventsPath(BRISBANE)}?after=2` }),
    );

    // The answer to a HEAD has no body, only the status.
    expect(answer.status).toBe(404);
    expect(await rowsHolding(BRISBANE, TAYLOR, 1, T + 1_000)).toBe(1);
    expect(await rowsHolding(BRISBANE, TAYLOR, 2, T + 2_000)).toBe(0);
  });

  test('[SYNC-63.1] answers "not found" to every other method on the two paths, and does nothing', async () => {
    const [taylor] = await taylorWithBrisbaneAndCasey();
    const stored = events(2);
    expectUploaded(await upload(taylor, BRISBANE, stored), stored, [1, 2]);
    const anUpload = JSON.stringify({ epoch: 1, events: events(1) });

    for (const [method, path, body] of [
      ['GET', `/groups/${BRISBANE}`, undefined],
      ['POST', `/groups/${BRISBANE}`, anUpload],
      ['DELETE', `/groups/${BRISBANE}`, undefined],
      ['PATCH', `/groups/${BRISBANE}`, '{}'],
      ['PUT', eventsPath(BRISBANE), anUpload],
      ['DELETE', eventsPath(BRISBANE), undefined],
      ['DELETE', `${eventsPath(BRISBANE)}?after=0`, undefined],
      ['PATCH', eventsPath(BRISBANE), anUpload],
    ] as const) {
      const answer = await leavingGroupsAsTheyWere(() =>
        call(taylor, { method, path, body }),
      );

      expectPassed(answer);
    }
    // The group and its events are as they were.
    expectPage(await download(taylor, BRISBANE, 0), {
      events: relayedFrom(1, stored, { by: taylor, at: T }),
      more: false,
    });
  });
});

describe('SYNC-64.1', () => {
  const QUERIES = ['?name=Brisbane', '?x', '?after=0', '?epoch=1'];

  test.each(QUERIES)(
    '[SYNC-64.1] refuses to create a group with a request whose URL carries the query %s, and creates nothing',
    async (query) => {
      const taylor = await registered(TAYLOR);

      const answer = await leavingGroupsAsTheyWere(() =>
        call(taylor, { method: 'PUT', path: `/groups/${BRISBANE}${query}` }),
      );

      expectRefused(answer, REQUEST);
      expectGroupRefused(await download(taylor, BRISBANE, 0), NOT_A_MEMBER);
      expect(await timesStored('Brisbane')).toBe(0);
      // Without the query, the same request creates the group.
      expectCreated(await createGroup(taylor, BRISBANE), BRISBANE);
    },
  );

  test('[SYNC-64.1] refuses a member device that creates its group again with a query', async () => {
    const [taylor] = await taylorWithBrisbaneAndCasey();
    const stored = events(2);
    expectUploaded(await upload(taylor, BRISBANE, stored), stored, [1, 2]);

    const answer = await leavingGroupsAsTheyWere(() =>
      call(taylor, {
        method: 'PUT',
        path: `/groups/${BRISBANE}?name=Brisbane`,
      }),
    );

    expectRefused(answer, REQUEST);
    expect(await timesStored('Brisbane')).toBe(0);
    expectCreated(await createGroup(taylor, BRISBANE), BRISBANE);
  });

  test.each(QUERIES)(
    '[SYNC-64.1] refuses an upload whose URL carries the query %s, and stores none of its events',
    async (query) => {
      const [taylor] = await taylorWithBrisbaneAndCasey();
      const sent = events(1);

      const answer = await leavingGroupsAsTheyWere(() =>
        call(taylor, {
          method: 'POST',
          path: `${eventsPath(BRISBANE)}${query}`,
          body: JSON.stringify({ epoch: 1, events: sent }),
        }),
      );

      expectRefused(answer, REQUEST);
      expectPage(await download(taylor, BRISBANE, 0), EMPTY_PAGE);
      // Without the query, the same upload is stored.
      expectUploaded(await upload(taylor, BRISBANE, sent), sent, [1]);
    },
  );

  test('[SYNC-64.1] refuses a query for that, whether or not the phone is a member device', async () => {
    const [taylor, casey] = await taylorWithBrisbaneAndCasey();
    const body = JSON.stringify({ epoch: 1, events: events(1) });

    for (const phone of [casey, taylor]) {
      const created = await leavingGroupsAsTheyWere(() =>
        call(phone, { method: 'PUT', path: `/groups/${BRISBANE}?x` }),
      );
      const uploaded = await leavingGroupsAsTheyWere(() =>
        call(phone, {
          method: 'POST',
          path: `${eventsPath(BRISBANE)}?x`,
          body,
        }),
      );

      expectRefused(created, REQUEST);
      expectRefused(uploaded, REQUEST);
    }
    // Without the query, Casey's phone is refused as no member device.
    expectGroupRefused(await createGroup(casey, BRISBANE), NOT_A_MEMBER);
    expectGroupRefused(await uploadBody(casey, BRISBANE, body), NOT_A_MEMBER);
  });
});
