import { randomBytes, randomUUID } from 'node:crypto';
import type {
  EventsPageResponse,
  RelayedEvent,
  UploadEventsResponse,
  UploadedEvent,
} from '@shared-expense/domain/api';
import type { NodeServer } from '../../src/node';
import {
  CASEY,
  T,
  TAYLOR,
  expectRefused,
  registered,
  setTime,
  type Answer,
  type Phone,
} from './sharing-api';
import {
  BRISBANE,
  GROUP_FULL,
  GROUP_LIMIT,
  LARGEST,
  REQUEST,
  SMALLEST,
  TOKYO,
  aMinuteLater,
  addMember,
  callOn,
  createGroup,
  download,
  event,
  events,
  eventsPath,
  everyEvent,
  expectCreated,
  expectGroupRefused,
  expectPage,
  expectUploaded,
  leavingGroupsAsTheyWere,
  ownServer,
  relayed,
  relayedFrom,
  upload,
  uploadBody,
  uploadOf,
  useSyncApi,
  wrongEpoch,
} from './sync-api';

// Uploading a shared ledger's events (ADR-0016): the API numbers them in the order they
// are stored, keeps each event once however often it is uploaded, and refuses what is
// not an upload, what is encrypted under another key epoch than the group's, and what
// the group has no room for. It never reads an event's content (ADR-0003).

useSyncApi();

/** Taylor's phone, registered, with Brisbane created. */
async function taylorWithBrisbane(): Promise<Phone> {
  const taylor = await registered(TAYLOR);
  expectCreated(await createGroup(taylor, BRISBANE), BRISBANE);
  return taylor;
}

describe('SYNC-50.1', () => {
  test('[SYNC-50.1] numbers the events of a group from 1 in the order of the request, and relays what it recorded with each', async () => {
    const taylor = await taylorWithBrisbane();
    const sent = events(3);

    setTime(T + 5_000);
    const answer = await upload(taylor, BRISBANE, sent);

    expectUploaded(answer, sent, [1, 2, 3]);
    expectPage(await download(taylor, BRISBANE, 0), {
      events: [
        relayed(sent[0], { sequence: 1, by: taylor, at: T + 5_000 }),
        relayed(sent[1], { sequence: 2, by: taylor, at: T + 5_000 }),
        relayed(sent[2], { sequence: 3, by: taylor, at: T + 5_000 }),
      ],
      more: false,
    });
  });

  test('[SYNC-50.1] gives a later upload the next numbers and its own receive time', async () => {
    const taylor = await taylorWithBrisbane();
    const first = events(3);
    const second = events(2);
    setTime(T + 5_000);
    expectUploaded(await upload(taylor, BRISBANE, first), first, [1, 2, 3]);

    setTime(T + 9_000);
    const answer = await upload(taylor, BRISBANE, second);

    expectUploaded(answer, second, [4, 5]);
    expect(await everyEvent(taylor, BRISBANE)).toEqual([
      ...relayedFrom(1, first, { by: taylor, at: T + 5_000 }),
      ...relayedFrom(4, second, { by: taylor, at: T + 9_000 }),
    ]);
  });

  test('[SYNC-50.1] stores an upload of 100 events in the order of the request', async () => {
    const taylor = await taylorWithBrisbane();
    const sent = events(100);

    const answer = await upload(taylor, BRISBANE, sent);

    expectUploaded(
      answer,
      sent,
      sent.map((_, index) => index + 1),
    );
    expect(await everyEvent(taylor, BRISBANE)).toEqual(
      relayedFrom(1, sent, { by: taylor, at: T }),
    );
  });

  test('[SYNC-50.1] stores contents of any bytes and relays them as they were', async () => {
    const taylor = await taylorWithBrisbane();
    const sent = [
      event(new Uint8Array(SMALLEST)),
      event(Uint8Array.from({ length: 256 }, (_, byte) => byte)),
      event(
        new Uint8Array(
          Buffer.from('{"not":"ciphertext","note":"晚餐 🍜 at the corner"}'),
        ),
      ),
      event(new Uint8Array(1_000)),
      event(LARGEST),
    ];

    const answer = await upload(taylor, BRISBANE, sent);

    expectUploaded(answer, sent, [1, 2, 3, 4, 5]);
    expect(await everyEvent(taylor, BRISBANE)).toEqual(
      relayedFrom(1, sent, { by: taylor, at: T }),
    );
  });

  test("[SYNC-50.1] gives the events of one upload one receive time, though the API's time moves on while it stores them", async () => {
    const taylor = await taylorWithBrisbane();
    // A server whose time is a millisecond later every time it is read.
    let reads = 0;
    const ticking = await ownServer(() => T + 1_000 + (reads += 1));
    const first = events(5);
    const second = events(5);

    const answers = [
      await callOn(ticking, taylor, uploadOf(BRISBANE, first)),
      await callOn(ticking, taylor, uploadOf(BRISBANE, second)),
    ];

    expectUploaded(answers[0], first, [1, 2, 3, 4, 5]);
    expectUploaded(answers[1], second, [6, 7, 8, 9, 10]);
    const times = (await everyEvent(taylor, BRISBANE)).map(
      ({ receivedAtMs }) => receivedAtMs,
    );
    expect(new Set(times.slice(0, 5)).size).toBe(1);
    expect(new Set(times.slice(5)).size).toBe(1);
    expect(times[0]).toBeGreaterThan(T + 1_000);
    expect(times[5]).toBeGreaterThan(times[0]);
    expect(times[5]).toBeLessThanOrEqual(T + 1_000 + reads);
  });

  test('[SYNC-50.1] numbers each group by itself', async () => {
    const taylor = await taylorWithBrisbane();
    expectCreated(await createGroup(taylor, TOKYO), TOKYO);
    const inBrisbane = events(3);
    const inTokyo = events(2);

    expectUploaded(
      await upload(taylor, BRISBANE, inBrisbane),
      inBrisbane,
      [1, 2, 3],
    );
    expectUploaded(await upload(taylor, TOKYO, inTokyo), inTokyo, [1, 2]);

    expect(await everyEvent(taylor, TOKYO)).toEqual(
      relayedFrom(1, inTokyo, { by: taylor, at: T }),
    );
    expect(await everyEvent(taylor, BRISBANE)).toEqual(
      relayedFrom(1, inBrisbane, { by: taylor, at: T }),
    );
  });

  test('[SYNC-50.1] records the device that uploaded each event, for every member device to download', async () => {
    const taylor = await taylorWithBrisbane();
    const casey = await registered(CASEY);
    await addMember(BRISBANE, casey);
    const fromTaylor = events(2);
    const fromCasey = events(2);

    expectUploaded(
      await upload(taylor, BRISBANE, fromTaylor),
      fromTaylor,
      [1, 2],
    );
    setTime(T + 3_000);
    expectUploaded(await upload(casey, BRISBANE, fromCasey), fromCasey, [3, 4]);

    const all = [
      ...relayedFrom(1, fromTaylor, { by: taylor, at: T }),
      ...relayedFrom(3, fromCasey, { by: casey, at: T + 3_000 }),
    ];
    expect(await everyEvent(taylor, BRISBANE)).toEqual(all);
    expect(await everyEvent(casey, BRISBANE)).toEqual(all);
  });
});

describe('SYNC-51.1', () => {
  test('[SYNC-51.1] stores an upload that is sent again only once, and answers with the same numbers', async () => {
    const taylor = await taylorWithBrisbane();
    const sent = events(3);
    expectUploaded(await upload(taylor, BRISBANE, sent), sent, [1, 2, 3]);

    setTime(T + 4_000);
    const again = await leavingGroupsAsTheyWere(() =>
      upload(taylor, BRISBANE, sent),
    );
    const andAgain = await leavingGroupsAsTheyWere(() =>
      upload(taylor, BRISBANE, sent),
    );

    expectUploaded(again, sent, [1, 2, 3]);
    expectUploaded(andAgain, sent, [1, 2, 3]);
    expect(await everyEvent(taylor, BRISBANE)).toEqual(
      relayedFrom(1, sent, { by: taylor, at: T }),
    );
  });

  test('[SYNC-51.1] keeps what it stored when an event comes again with other content and another key epoch', async () => {
    const taylor = await taylorWithBrisbane();
    const sent = events(2);
    expectUploaded(await upload(taylor, BRISBANE, sent), sent, [1, 2]);
    const encryptedAgain = sent.map(({ id }) => event(300, id));

    setTime(T + 4_000);
    const answer = await leavingGroupsAsTheyWere(() =>
      upload(taylor, BRISBANE, encryptedAgain, 7),
    );

    expectUploaded(answer, sent, [1, 2]);
    expect(await everyEvent(taylor, BRISBANE)).toEqual(
      relayedFrom(1, sent, { by: taylor, at: T }),
    );
  });

  test('[SYNC-51.1] stores the new events of a request that also carries events the group has', async () => {
    const taylor = await taylorWithBrisbane();
    const [a, b, c] = events(3);
    expectUploaded(
      await upload(taylor, BRISBANE, [a, b, c]),
      [a, b, c],
      [1, 2, 3],
    );
    const [d, e] = events(2);

    setTime(T + 4_000);
    const answer = await upload(taylor, BRISBANE, [b, d, a, e]);

    expectUploaded(answer, [b, d, a, e], [2, 4, 1, 5]);
    expect(await everyEvent(taylor, BRISBANE)).toEqual([
      ...relayedFrom(1, [a, b, c], { by: taylor, at: T }),
      ...relayedFrom(4, [d, e], { by: taylor, at: T + 4_000 }),
    ]);
  });

  test('[SYNC-51.1] stores an event once when two member devices upload it together, round after round', async () => {
    const ROUNDS = 20;
    const taylor = await taylorWithBrisbane();
    const casey = await registered(CASEY);
    await addMember(BRISBANE, casey);
    // Requests of one phone pass the checks one after another, so they hardly meet in the
    // route. Two phones, each on a server with connections of its own, do.
    const uploaders = [
      { phone: taylor, server: await ownServer() },
      { phone: casey, server: await ownServer() },
    ];
    const rounds: UploadedEvent[][] = [];

    for (let round = 1; round <= ROUNDS; round += 1) {
      // One new event ID, with each phone's own content.
      const id = randomUUID();
      const sent = uploaders.map(() => event(200, id));
      rounds.push(sent);

      const answers = await Promise.all(
        uploaders.map(({ phone, server }, index) =>
          callOn(server, phone, uploadOf(BRISBANE, [sent[index]])),
        ),
      );

      // Both are answered with the one number the event got.
      expectUploaded(answers[0], [sent[0]], [round]);
      expectUploaded(answers[1], [sent[1]], [round]);
    }

    // One event a round: each is one phone's upload, its content with its device ID.
    const stored = await everyEvent(taylor, BRISBANE);
    expect(stored).toHaveLength(ROUNDS);
    stored.forEach((each, index) => {
      expect(
        uploaders.map(({ phone }, uploader) =>
          relayed(rounds[index][uploader], {
            sequence: index + 1,
            by: phone,
            at: T,
          }),
        ),
      ).toContainEqual(each);
    });
  });

  test('[SYNC-51.1] takes an event ID another group has as a new event', async () => {
    const taylor = await taylorWithBrisbane();
    expectCreated(await createGroup(taylor, TOKYO), TOKYO);
    const inBrisbane = events(2);
    expectUploaded(
      await upload(taylor, BRISBANE, inBrisbane),
      inBrisbane,
      [1, 2],
    );
    const inTokyo = [event(300, inBrisbane[1].id)];

    const answer = await upload(taylor, TOKYO, inTokyo);

    expectUploaded(answer, inTokyo, [1]);
    expect(await everyEvent(taylor, TOKYO)).toEqual(
      relayedFrom(1, inTokyo, { by: taylor, at: T }),
    );
    expect(await everyEvent(taylor, BRISBANE)).toEqual(
      relayedFrom(1, inBrisbane, { by: taylor, at: T }),
    );
  });

  test('[SYNC-51.1] answers another member device that uploads an event the group has with its number, and keeps the first upload', async () => {
    const taylor = await taylorWithBrisbane();
    const casey = await registered(CASEY);
    await addMember(BRISBANE, casey);
    const fromTaylor = events(1);
    expectUploaded(await upload(taylor, BRISBANE, fromTaylor), fromTaylor, [1]);
    const sameId = [event(300, fromTaylor[0].id)];

    setTime(T + 4_000);
    const answer = await leavingGroupsAsTheyWere(() =>
      upload(casey, BRISBANE, sameId),
    );

    expectUploaded(answer, sameId, [1]);
    expect(await everyEvent(casey, BRISBANE)).toEqual(
      relayedFrom(1, fromTaylor, { by: taylor, at: T }),
    );
  });
});

describe('SYNC-52.1', () => {
  test('[SYNC-52.1] numbers the events of uploads that arrive together with no number twice and none left out, and phones that follow their cursors meanwhile miss none', async () => {
    const ROUNDS = 3;
    const UPLOADS_EACH = 15;
    const EVENTS_EACH = 3;
    const READS_EACH = 50;
    const taylor = await taylorWithBrisbane();
    const casey = await registered(CASEY);
    await addMember(BRISBANE, casey);
    // Every phone sends to a server of its own, each with its own connections to the one
    // database, so that no request waits behind another's for a connection.
    const uploaders = [
      { phone: taylor, server: await ownServer() },
      { phone: casey, server: await ownServer() },
    ];
    const readers: {
      phone: Phone;
      server: NodeServer;
      seen: RelayedEvent[];
    }[] = [];
    for (let index = 0; index < 2; index += 1) {
      const phone = await registered();
      await addMember(BRISBANE, phone);
      readers.push({ phone, server: await ownServer(), seen: [] });
    }
    const uploads: { by: Phone; sent: UploadedEvent[]; answer: Answer }[] = [];

    /** A reader downloads the page after the last event it has, which must begin right there and have no gap. */
    async function readOn(
      reader: (typeof readers)[number],
    ): Promise<EventsPageResponse> {
      const answer = await callOn(reader.server, reader.phone, {
        path: `${eventsPath(BRISBANE)}?after=${reader.seen.length}`,
      });
      expect(answer.status).toBe(200);
      const page = answer.body as EventsPageResponse;
      expect(page.events.map(({ sequence }) => sequence)).toEqual(
        page.events.map((_, index) => reader.seen.length + index + 1),
      );
      reader.seen.push(...page.events);
      return page;
    }

    for (let round = 0; round < ROUNDS; round += 1) {
      // A minute of its own, for the request limit of each phone.
      aMinuteLater();
      let uploading = true;
      const stored = Promise.all(
        Array.from({ length: UPLOADS_EACH * 2 }, async (_, index) => {
          const { phone, server } = uploaders[index % 2];
          const sent = events(EVENTS_EACH, 50);
          const answer = await callOn(server, phone, uploadOf(BRISBANE, sent));
          uploads.push({ by: phone, sent, answer });
        }),
      ).finally(() => {
        uploading = false;
      });
      try {
        await Promise.all(
          readers.map(async (reader) => {
            for (let reads = 0; uploading && reads < READS_EACH; reads += 1) {
              await readOn(reader);
            }
          }),
        );
      } finally {
        // Nothing is still on its way when the test ends, whether it passed or not.
        await stored.catch(() => {});
      }
    }
    aMinuteLater();
    for (const reader of readers) while ((await readOn(reader)).more);

    // Every upload was stored, its events next to each other in its own order.
    const total = ROUNDS * UPLOADS_EACH * 2 * EVENTS_EACH;
    const numbered = new Map<number, { id: string; deviceId: string }>();
    expect(uploads).toHaveLength(ROUNDS * UPLOADS_EACH * 2);
    for (const { by, sent, answer } of uploads) {
      expect(answer.status).toBe(200);
      const stored = (answer.body as UploadEventsResponse).events;
      expect(stored.map(({ id }) => id)).toEqual(sent.map(({ id }) => id));
      expect(stored.map(({ sequence }) => sequence)).toEqual(
        stored.map((_, index) => stored[0].sequence + index),
      );
      for (const { id, sequence } of stored) {
        numbered.set(sequence, { id, deviceId: by.deviceId });
      }
    }
    // The numbers are 1 to the number of events, each once.
    expect([...numbered.keys()].sort((a, b) => a - b)).toEqual(
      Array.from({ length: total }, (_, index) => index + 1),
    );
    // Each reader got every event once, under the number its upload was answered with.
    for (const { seen } of readers) {
      expect(
        seen.map(({ sequence, id, deviceId }) => [sequence, id, deviceId]),
      ).toEqual(
        Array.from({ length: total }, (_, index) => [
          index + 1,
          numbered.get(index + 1)!.id,
          numbered.get(index + 1)!.deviceId,
        ]),
      );
    }
  }, 60_000);
});

describe('SYNC-54.1', () => {
  const body = (value: unknown) => JSON.stringify(value);
  const one = () => event();

  test.each<[string, () => Uint8Array | string]>([
    ['is empty', () => ''],
    ['is no JSON', () => 'hello'],
    [
      'is JSON cut short',
      () => body({ epoch: 1, events: [one()] }).slice(0, -1),
    ],
    ['is not UTF-8', () => Uint8Array.of(0xff, 0xfe, 0x7b, 0x7d)],
    ['is an array', () => body([{ epoch: 1, events: [one()] }])],
    ['is a text', () => body('upload')],
    ['is null', () => body(null)],
    ['has no key epoch', () => body({ events: [one()] })],
    ['has no events', () => body({ epoch: 1 })],
    ['has an empty list of events', () => body({ epoch: 1, events: [] })],
    ['has events that are no list', () => body({ epoch: 1, events: one() })],
    ['has key epoch 0', () => body({ epoch: 0, events: [one()] })],
    ['has key epoch -1', () => body({ epoch: -1, events: [one()] })],
    ['has key epoch 1.5', () => body({ epoch: 1.5, events: [one()] })],
    ['has its key epoch as text', () => body({ epoch: '1', events: [one()] })],
    [
      'has a key epoch past the largest integer',
      () => `{"epoch":9007199254740992,"events":${body([one()])}}`,
    ],
    [
      'carries a group name',
      () => body({ epoch: 1, events: [one()], name: 'Brisbane' }),
    ],
    [
      'has an event with no ID',
      () => body({ epoch: 1, events: [{ content: one().content }] }),
    ],
    [
      'has an event with no content',
      () => body({ epoch: 1, events: [{ id: randomUUID() }] }),
    ],
    [
      'has an event that is a text',
      () => body({ epoch: 1, events: ['event'] }),
    ],
    [
      'has an event that names its device',
      () => body({ epoch: 1, events: [{ ...one(), deviceId: TAYLOR }] }),
    ],
    [
      'has an event that names its number',
      () => body({ epoch: 1, events: [{ ...one(), sequence: 1 }] }),
    ],
    [
      'has an event ID in capitals',
      () =>
        body({ epoch: 1, events: [event(200, randomUUID().toUpperCase())] }),
    ],
    [
      'has an event ID that is a version-1 UUID',
      () =>
        body({
          epoch: 1,
          events: [event(200, '9b2f6c1e-8d47-1f3a-b1c5-2e7d90a4f6b8')],
        }),
    ],
    [
      'has an event ID that is no UUID',
      () => body({ epoch: 1, events: [event(200, 'event-1')] }),
    ],
    [
      'has an event ID that is a number',
      () => body({ epoch: 1, events: [{ id: 1, content: one().content }] }),
    ],
    [
      'has an event with empty content',
      () => body({ epoch: 1, events: [{ id: randomUUID(), content: '' }] }),
    ],
    [
      'has content of 40 bytes',
      () => body({ epoch: 1, events: [event(SMALLEST - 1)] }),
    ],
    [
      'has content of one byte',
      () => body({ epoch: 1, events: [{ id: randomUUID(), content: '00' }] }),
    ],
    [
      'has content in capitals',
      () =>
        body({
          epoch: 1,
          events: [{ id: randomUUID(), content: 'AB12'.repeat(50) }],
        }),
    ],
    [
      'has content of an odd number of characters',
      () =>
        body({
          epoch: 1,
          events: [{ id: randomUUID(), content: 'a'.repeat(201) }],
        }),
    ],
    [
      'has content that is not hexadecimal',
      () =>
        body({
          epoch: 1,
          events: [{ id: randomUUID(), content: 'zz'.repeat(100) }],
        }),
    ],
    [
      'has content in Base64',
      () =>
        body({
          epoch: 1,
          events: [
            { id: randomUUID(), content: randomBytes(150).toString('base64') },
          ],
        }),
    ],
    [
      'has content that is a list of numbers',
      () =>
        body({ epoch: 1, events: [{ id: randomUUID(), content: [1, 2, 3] }] }),
    ],
  ])('[SYNC-54.1] refuses an upload whose body %s', async (_, written) => {
    const taylor = await taylorWithBrisbane();

    const answer = await leavingGroupsAsTheyWere(() =>
      uploadBody(taylor, BRISBANE, written()),
    );

    expectRefused(answer, REQUEST);
    expectPage(await download(taylor, BRISBANE, 0), {
      events: [],
      more: false,
    });
  });

  test('[SYNC-54.1] refuses an event of 65,537 bytes, and takes one of 65,536', async () => {
    const taylor = await taylorWithBrisbane();
    const largest = [event(LARGEST)];

    const tooLarge = await leavingGroupsAsTheyWere(() =>
      upload(taylor, BRISBANE, [event(LARGEST + 1)]),
    );
    const justRight = await upload(taylor, BRISBANE, largest);

    expectRefused(tooLarge, REQUEST);
    expectUploaded(justRight, largest, [1]);
  });

  test('[SYNC-54.1] refuses an event of 40 bytes, and takes one of 41', async () => {
    const taylor = await taylorWithBrisbane();
    const smallest = [event(SMALLEST)];

    const tooSmall = await leavingGroupsAsTheyWere(() =>
      upload(taylor, BRISBANE, [event(SMALLEST - 1)]),
    );
    const justRight = await upload(taylor, BRISBANE, smallest);

    expectRefused(tooSmall, REQUEST);
    expectUploaded(justRight, smallest, [1]);
  });

  test('[SYNC-54.1] refuses an upload of 101 events, and takes one of 100', async () => {
    const taylor = await taylorWithBrisbane();
    const hundred = events(100, 50);

    const tooMany = await leavingGroupsAsTheyWere(() =>
      upload(taylor, BRISBANE, events(101, 50)),
    );
    const justRight = await upload(taylor, BRISBANE, hundred);

    expectRefused(tooMany, REQUEST);
    expectUploaded(
      justRight,
      hundred,
      hundred.map((_, index) => index + 1),
    );
  });

  test('[SYNC-54.1] refuses an upload that carries one event ID twice, whether or not the contents differ', async () => {
    const taylor = await taylorWithBrisbane();
    const [a, b] = events(2);

    const sameContent = await leavingGroupsAsTheyWere(() =>
      upload(taylor, BRISBANE, [a, b, a]),
    );
    const otherContent = await leavingGroupsAsTheyWere(() =>
      upload(taylor, BRISBANE, [a, event(300, a.id)]),
    );

    expectRefused(sameContent, REQUEST);
    expectRefused(otherContent, REQUEST);
    expectUploaded(await upload(taylor, BRISBANE, [a, b]), [a, b], [1, 2]);
  });

  test('[SYNC-54.1] stores none of the events of an upload in which one is wrong', async () => {
    const taylor = await taylorWithBrisbane();
    const good = events(3);

    const tooLarge = await leavingGroupsAsTheyWere(() =>
      upload(taylor, BRISBANE, [good[0], event(LARGEST + 1), good[1]]),
    );
    const emptied = await leavingGroupsAsTheyWere(() =>
      upload(taylor, BRISBANE, [
        good[0],
        good[1],
        { id: good[2].id, content: '' },
      ]),
    );

    expectRefused(tooLarge, REQUEST);
    expectRefused(emptied, REQUEST);
    expectUploaded(await upload(taylor, BRISBANE, good), good, [1, 2, 3]);
  });

  test('[SYNC-54.1] refuses an event the group has when it comes again written wrongly', async () => {
    const taylor = await taylorWithBrisbane();
    const [stored] = events(1);
    expectUploaded(await upload(taylor, BRISBANE, [stored]), [stored], [1]);

    const answer = await leavingGroupsAsTheyWere(() =>
      upload(taylor, BRISBANE, [{ id: stored.id, content: '' }]),
    );

    expectRefused(answer, REQUEST);
  });

  test('[SYNC-54.1] takes an upload whose body is written with spaces and in another order of keys', async () => {
    const taylor = await taylorWithBrisbane();
    const [sent] = events(1);

    const answer = await uploadBody(
      taylor,
      BRISBANE,
      ` { "events" : [ { "content" : "${sent.content}", "id" : "${sent.id}" } ],\n "epoch" : 1 } `,
    );

    expectUploaded(answer, [sent], [1]);
    expectPage(await download(taylor, BRISBANE, 0), {
      events: [relayed(sent, { sequence: 1, by: taylor, at: T })],
      more: false,
    });
  });
});

describe('SYNC-55.1', () => {
  test.each([2, 3, 9007199254740991])(
    "[SYNC-55.1] refuses new events under key epoch %d, tells the group's key epoch, and stores none",
    async (epoch) => {
      const taylor = await taylorWithBrisbane();
      const sent = events(2);

      const answer = await leavingGroupsAsTheyWere(() =>
        upload(taylor, BRISBANE, sent, epoch),
      );

      expectGroupRefused(answer, wrongEpoch(1));
      // Under the group's key epoch, the same events are stored.
      expectUploaded(await upload(taylor, BRISBANE, sent), sent, [1, 2]);
    },
  );

  test('[SYNC-55.1] refuses an upload under another key epoch that carries a new event beside ones the group has', async () => {
    const taylor = await taylorWithBrisbane();
    const [a, b] = events(2);
    expectUploaded(await upload(taylor, BRISBANE, [a, b]), [a, b], [1, 2]);
    const [c] = events(1);

    const answer = await leavingGroupsAsTheyWere(() =>
      upload(taylor, BRISBANE, [a, c, b], 2),
    );

    expectGroupRefused(answer, wrongEpoch(1));
    expect(await everyEvent(taylor, BRISBANE)).toEqual(
      relayedFrom(1, [a, b], { by: taylor, at: T }),
    );
  });

  test('[SYNC-55.1] records the key epoch an upload named with each of its events', async () => {
    const taylor = await taylorWithBrisbane();
    const sent = events(2);

    expectUploaded(await upload(taylor, BRISBANE, sent, 1), sent, [1, 2]);

    expect(
      (await everyEvent(taylor, BRISBANE)).map(({ epoch }) => epoch),
    ).toEqual([1, 1]);
  });
});

describe('SYNC-56.1', () => {
  test('[SYNC-56.1] stores events until those the group has add up to 10,485,760 bytes, and refuses what would go past it; before that, [SYNC-60.2] it refuses another key epoch', async () => {
    const taylor = await taylorWithBrisbane();
    expectCreated(await createGroup(taylor, TOKYO), TOKYO);
    // 159 events of 65,536 bytes, seven to an upload: 10,420,224 bytes.
    let stored = 0;
    for (const count of [...Array.from({ length: 22 }, () => 7), 5]) {
      const sent = events(count, LARGEST);
      expectUploaded(
        await upload(taylor, BRISBANE, sent),
        sent,
        sent.map((_, index) => stored + index + 1),
      );
      stored += count;
    }
    expect(stored * LARGEST).toBe(GROUP_LIMIT - LARGEST);
    aMinuteLater();

    // Two more of them would make 10,551,296 bytes: neither is stored.
    const twoMore = await leavingGroupsAsTheyWere(() =>
      upload(taylor, BRISBANE, events(2, LARGEST)),
    );
    // 41 bytes short of the limit, then two events of 41 bytes, then one: exactly the limit.
    const almost = events(1, LARGEST - SMALLEST);
    const upToAlmost = await upload(taylor, BRISBANE, almost);
    const twoSmallest = await leavingGroupsAsTheyWere(() =>
      upload(taylor, BRISBANE, events(2, SMALLEST)),
    );
    const last = events(1, SMALLEST);
    const upToTheLimit = await upload(taylor, BRISBANE, last);

    expectGroupRefused(twoMore, GROUP_FULL);
    expectUploaded(upToAlmost, almost, [160]);
    expectGroupRefused(twoSmallest, GROUP_FULL);
    expectUploaded(upToTheLimit, last, [161]);

    // The group is full: the smallest event is refused, from any member device.
    const casey = await registered(CASEY);
    await addMember(BRISBANE, casey);
    const oneMore = await leavingGroupsAsTheyWere(() =>
      upload(taylor, BRISBANE, events(1, SMALLEST)),
    );
    const fromCasey = await leavingGroupsAsTheyWere(() =>
      upload(casey, BRISBANE, events(1, SMALLEST)),
    );
    // An event the group has is no new event, whatever content it comes with.
    const again = await leavingGroupsAsTheyWere(() =>
      upload(taylor, BRISBANE, [event(LARGEST, almost[0].id), last[0]]),
    );
    const againWithOneNew = await leavingGroupsAsTheyWere(() =>
      upload(taylor, BRISBANE, [last[0], ...events(1, SMALLEST)]),
    );
    // Another key epoch is refused for that, full or not (SYNC-60.2).
    const underEpoch2 = await leavingGroupsAsTheyWere(() =>
      upload(taylor, BRISBANE, events(1, SMALLEST), 2),
    );

    expectGroupRefused(oneMore, GROUP_FULL);
    expectGroupRefused(fromCasey, GROUP_FULL);
    expectUploaded(again, [almost[0], last[0]], [160, 161]);
    expectGroupRefused(againWithOneNew, GROUP_FULL);
    expectGroupRefused(underEpoch2, wrongEpoch(1));

    // Downloads go on, and the phone's other group has room of its own.
    expectPage(await download(taylor, BRISBANE, 160), {
      events: relayedFrom(161, last, { by: taylor, at: T + 60_000 }),
      more: false,
    });
    const inTokyo = events(1, LARGEST);
    expectUploaded(await upload(taylor, TOKYO, inTokyo), inTokyo, [1]);
  }, 120_000);
});
