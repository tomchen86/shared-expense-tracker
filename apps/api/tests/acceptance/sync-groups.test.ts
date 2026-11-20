import { randomUUID } from 'node:crypto';
import {
  CASEY,
  T,
  TAYLOR,
  expectRefused,
  registered,
  setTime,
  timesStored,
} from './sharing-api';
import {
  BRISBANE,
  EMPTY_PAGE,
  NOT_A_MEMBER,
  REQUEST,
  TOKYO,
  addMember,
  createGroup,
  download,
  event,
  events,
  everyEvent,
  expectCreated,
  expectGroupRefused,
  expectPage,
  expectUploaded,
  leavingGroupsAsTheyWere,
  relayedFrom,
  upload,
  uploadBody,
  useSyncApi,
  wrongEpoch,
} from './sync-api';

// A group on the API (ADR-0003, ADR-0015): which devices may exchange a shared ledger's
// events. A phone creates it under the ledger's own ID, and is its only member device
// until another one is let in, which no route does yet.

useSyncApi();

describe('SYNC-45.1', () => {
  test('[SYNC-45.1] creates a group whose only member device is the phone that asked', async () => {
    const taylor = await registered(TAYLOR);
    const casey = await registered(CASEY);

    const answer = await createGroup(taylor, BRISBANE);

    expectCreated(answer, BRISBANE);
    expectPage(await download(taylor, BRISBANE, 0), EMPTY_PAGE);
    expectGroupRefused(await download(casey, BRISBANE, 0), NOT_A_MEMBER);
  });

  test('[SYNC-45.1] a new group has no events, and its key epoch is 1', async () => {
    const taylor = await registered(TAYLOR);
    expectCreated(await createGroup(taylor, BRISBANE), BRISBANE);
    const first = event();

    const underEpoch2 = await upload(taylor, BRISBANE, [first], 2);
    const underEpoch1 = await upload(taylor, BRISBANE, [first]);

    expectGroupRefused(underEpoch2, wrongEpoch(1));
    expectUploaded(underEpoch1, [first], [1]);
  });

  test('[SYNC-45.1] one phone creates two groups, each with its own events', async () => {
    const taylor = await registered(TAYLOR);
    const inBrisbane = events(2);

    expectCreated(await createGroup(taylor, BRISBANE), BRISBANE);
    expectCreated(await createGroup(taylor, TOKYO), TOKYO);
    expectUploaded(
      await upload(taylor, BRISBANE, inBrisbane),
      inBrisbane,
      [1, 2],
    );

    expectPage(await download(taylor, TOKYO, 0), EMPTY_PAGE);
    expectPage(await download(taylor, BRISBANE, 0), {
      events: relayedFrom(1, inBrisbane, { by: taylor, at: T }),
      more: false,
    });
  });

  test('[SYNC-45.1] two phones each create a group, and neither is a member device of the other', async () => {
    const taylor = await registered(TAYLOR);
    const casey = await registered(CASEY);

    expectCreated(await createGroup(taylor, BRISBANE), BRISBANE);
    expectCreated(await createGroup(casey, TOKYO), TOKYO);

    expectPage(await download(casey, TOKYO, 0), EMPTY_PAGE);
    expectGroupRefused(await download(taylor, TOKYO, 0), NOT_A_MEMBER);
    expectGroupRefused(await download(casey, BRISBANE, 0), NOT_A_MEMBER);
  });
});

describe('SYNC-46.1', () => {
  test('[SYNC-46.1] answers a member device that creates its group again, and changes nothing', async () => {
    const taylor = await registered(TAYLOR);
    const stored = events(3);
    expectCreated(await createGroup(taylor, BRISBANE), BRISBANE);
    expectUploaded(await upload(taylor, BRISBANE, stored), stored, [1, 2, 3]);
    setTime(T + 1_000);
    expect((await download(taylor, BRISBANE, 2)).status).toBe(200);

    setTime(T + 2_000);
    const again = await leavingGroupsAsTheyWere(() =>
      createGroup(taylor, BRISBANE),
    );
    const andAgain = await leavingGroupsAsTheyWere(() =>
      createGroup(taylor, BRISBANE),
    );

    expectCreated(again, BRISBANE);
    expectCreated(andAgain, BRISBANE);
    // The events it had are still there, and the next one continues their numbers.
    const next = event();
    expectUploaded(await upload(taylor, BRISBANE, [next]), [next], [4]);
    expect(await everyEvent(taylor, BRISBANE)).toEqual([
      ...relayedFrom(1, stored, { by: taylor, at: T }),
      ...relayedFrom(4, [next], { by: taylor, at: T + 2_000 }),
    ]);
  });

  test('[SYNC-46.1] answers a member device that did not create the group the same way', async () => {
    const taylor = await registered(TAYLOR);
    const casey = await registered(CASEY);
    expectCreated(await createGroup(taylor, BRISBANE), BRISBANE);
    await addMember(BRISBANE, casey);

    const answer = await leavingGroupsAsTheyWere(() =>
      createGroup(casey, BRISBANE),
    );

    expectCreated(answer, BRISBANE);
    expectPage(await download(taylor, BRISBANE, 0), EMPTY_PAGE);
  });

  test('[SYNC-46.1] creates one group when five requests of one phone for it arrive together', async () => {
    // Requests of one phone pass the checks one after another, so these five hardly meet
    // in the route, and no test can make them without knowing the tables. This shows that
    // each is answered and one group comes of them; that two that do meet still make one
    // group is for the review to read in the code.
    const taylor = await registered(TAYLOR);

    const answers = await Promise.all(
      Array.from({ length: 5 }, () => createGroup(taylor, BRISBANE)),
    );

    for (const answer of answers) expectCreated(answer, BRISBANE);
    // One group: a sixth request finds it and changes nothing, and its first event is number 1.
    expectCreated(
      await leavingGroupsAsTheyWere(() => createGroup(taylor, BRISBANE)),
      BRISBANE,
    );
    const first = event();
    expectUploaded(await upload(taylor, BRISBANE, [first]), [first], [1]);
    expect(await everyEvent(taylor, BRISBANE)).toHaveLength(1);
  });
});

describe('SYNC-47.1', () => {
  test('[SYNC-47.1] refuses a phone that creates a group under the ID of a group it is no member device of', async () => {
    const taylor = await registered(TAYLOR);
    const casey = await registered(CASEY);
    const stored = events(2);
    expectCreated(await createGroup(taylor, BRISBANE), BRISBANE);
    expectUploaded(await upload(taylor, BRISBANE, stored), stored, [1, 2]);

    const answer = await leavingGroupsAsTheyWere(() =>
      createGroup(casey, BRISBANE),
    );

    expectGroupRefused(answer, NOT_A_MEMBER);
    // Casey's phone got nothing by it, and the group is Taylor's as before.
    expectGroupRefused(await download(casey, BRISBANE, 0), NOT_A_MEMBER);
    expectGroupRefused(await upload(casey, BRISBANE, events(1)), NOT_A_MEMBER);
    expect(await everyEvent(taylor, BRISBANE)).toEqual(
      relayedFrom(1, stored, { by: taylor, at: T }),
    );
  });

  test('[SYNC-47.1] lets one of two phones that create a group under one ID together have it', async () => {
    const taylor = await registered(TAYLOR);
    const casey = await registered(CASEY);

    // Five group IDs, each asked for by both phones at once.
    for (const groupId of Array.from({ length: 5 }, () => randomUUID())) {
      const answers = await Promise.all([
        createGroup(taylor, groupId),
        createGroup(casey, groupId),
      ]);

      const won = answers[0].status === 200 ? 0 : 1;
      const [winner, loser] = won === 0 ? [taylor, casey] : [casey, taylor];
      expectCreated(answers[won], groupId);
      expectGroupRefused(answers[1 - won], NOT_A_MEMBER);
      expectPage(await download(winner, groupId, 0), EMPTY_PAGE);
      expectGroupRefused(await download(loser, groupId, 0), NOT_A_MEMBER);
    }
  });
});

describe('SYNC-48.1', () => {
  const NOT_GROUP_IDS: [string, string][] = [
    ['in capitals', BRISBANE.toUpperCase()],
    ['a version-1 UUID', '9b2f6c1e-8d47-1f3a-b1c5-2e7d90a4f6b8'],
    ['a UUID of another variant', '9b2f6c1e-8d47-4f3a-c1c5-2e7d90a4f6b8'],
    ['without its hyphens', BRISBANE.replaceAll('-', '')],
    ['one character short', BRISBANE.slice(0, -1)],
    ['a name', 'brisbane'],
  ];

  test.each(NOT_GROUP_IDS)(
    '[SYNC-48.1] refuses to create a group whose ID is %s',
    async (_, groupId) => {
      const taylor = await registered(TAYLOR);

      const answer = await leavingGroupsAsTheyWere(() =>
        createGroup(taylor, groupId),
      );

      expectRefused(answer, REQUEST);
    },
  );

  test.each(NOT_GROUP_IDS)(
    '[SYNC-48.1] refuses an upload and a download for a group ID that is %s',
    async (_, groupId) => {
      const taylor = await registered(TAYLOR);
      expectCreated(await createGroup(taylor, BRISBANE), BRISBANE);

      const uploaded = await leavingGroupsAsTheyWere(() =>
        upload(taylor, groupId, events(1)),
      );
      const downloaded = await leavingGroupsAsTheyWere(() =>
        download(taylor, groupId, 0),
      );

      expectRefused(uploaded, REQUEST);
      expectRefused(downloaded, REQUEST);
    },
  );

  test.each<[string, Uint8Array | string]>([
    ['a name', '{"name":"Brisbane"}'],
    ['its own group ID', JSON.stringify({ groupId: BRISBANE })],
    ['an empty object', '{}'],
    ['one byte', Uint8Array.of(0)],
  ])(
    '[SYNC-48.1] refuses to create a group with a request that carries %s, and creates nothing',
    async (_, body) => {
      const taylor = await registered(TAYLOR);

      const answer = await leavingGroupsAsTheyWere(() =>
        createGroup(taylor, BRISBANE, body),
      );

      expectRefused(answer, REQUEST);
      expectGroupRefused(await download(taylor, BRISBANE, 0), NOT_A_MEMBER);
      expect(await timesStored('Brisbane')).toBe(0);
      // Without content, the same request creates the group.
      expectCreated(await createGroup(taylor, BRISBANE), BRISBANE);
    },
  );

  test('[SYNC-48.1] refuses a member device that sends content when it creates its group again', async () => {
    const taylor = await registered(TAYLOR);
    expectCreated(await createGroup(taylor, BRISBANE), BRISBANE);

    const answer = await leavingGroupsAsTheyWere(() =>
      createGroup(taylor, BRISBANE, '{"name":"Brisbane"}'),
    );

    expectRefused(answer, REQUEST);
    expect(await timesStored('Brisbane')).toBe(0);
  });
});

describe('SYNC-49.1', () => {
  test('[SYNC-49.1] refuses an upload and a download from a phone that is no member device of the group', async () => {
    const taylor = await registered(TAYLOR);
    const casey = await registered(CASEY);
    const stored = events(2);
    expectCreated(await createGroup(taylor, BRISBANE), BRISBANE);
    expectUploaded(await upload(taylor, BRISBANE, stored), stored, [1, 2]);

    const uploaded = await leavingGroupsAsTheyWere(() =>
      upload(casey, BRISBANE, events(1)),
    );
    const downloaded = await leavingGroupsAsTheyWere(() =>
      download(casey, BRISBANE, 0),
    );

    expectGroupRefused(uploaded, NOT_A_MEMBER);
    expectGroupRefused(downloaded, NOT_A_MEMBER);
    expect(await everyEvent(taylor, BRISBANE)).toEqual(
      relayedFrom(1, stored, { by: taylor, at: T }),
    );
  });

  test('[SYNC-49.1] answers a phone the same whether the group exists or not', async () => {
    const taylor = await registered(TAYLOR);
    const casey = await registered(CASEY);
    const stored = events(3);
    expectCreated(await createGroup(taylor, BRISBANE), BRISBANE);
    expectUploaded(await upload(taylor, BRISBANE, stored), stored, [1, 2, 3]);

    // Brisbane exists and Tokyo does not. An upload, an upload of an event Brisbane
    // has, and downloads from cursors within and past Brisbane's events.
    const answers = [];
    for (const groupId of [BRISBANE, TOKYO]) {
      answers.push([
        await leavingGroupsAsTheyWere(() => upload(casey, groupId, events(1))),
        await leavingGroupsAsTheyWere(() =>
          upload(casey, groupId, [stored[0]]),
        ),
        await leavingGroupsAsTheyWere(() =>
          upload(casey, groupId, events(1), 2),
        ),
        await leavingGroupsAsTheyWere(() => download(casey, groupId, 0)),
        await leavingGroupsAsTheyWere(() => download(casey, groupId, 3)),
        await leavingGroupsAsTheyWere(() => download(casey, groupId, 4)),
      ]);
    }

    for (const answer of answers.flat()) {
      expectGroupRefused(answer, NOT_A_MEMBER);
    }
    expect(answers[0]).toEqual(answers[1]);
  });

  test('[SYNC-49.1] a member device of one group is none of another', async () => {
    const taylor = await registered(TAYLOR);
    const casey = await registered(CASEY);
    expectCreated(await createGroup(taylor, BRISBANE), BRISBANE);
    expectCreated(await createGroup(casey, TOKYO), TOKYO);

    expectGroupRefused(await upload(casey, BRISBANE, events(1)), NOT_A_MEMBER);
    expectGroupRefused(await upload(taylor, TOKYO, events(1)), NOT_A_MEMBER);
    expectGroupRefused(await download(taylor, TOKYO, 0), NOT_A_MEMBER);
  });

  test('[SYNC-49.1] takes an upload and a download from a phone once it is a member device', async () => {
    const taylor = await registered(TAYLOR);
    const casey = await registered(CASEY);
    const fromTaylor = events(1);
    const fromCasey = events(1);
    expectCreated(await createGroup(taylor, BRISBANE), BRISBANE);
    expectUploaded(await upload(taylor, BRISBANE, fromTaylor), fromTaylor, [1]);
    expectGroupRefused(await download(casey, BRISBANE, 0), NOT_A_MEMBER);

    await addMember(BRISBANE, casey);

    expectUploaded(await upload(casey, BRISBANE, fromCasey), fromCasey, [2]);
    expectPage(await download(casey, BRISBANE, 0), {
      events: [
        ...relayedFrom(1, fromTaylor, { by: taylor, at: T }),
        ...relayedFrom(2, fromCasey, { by: casey, at: T }),
      ],
      more: false,
    });
  });

  test('[SYNC-49.1] refuses a body it would otherwise take, when the phone is no member device', async () => {
    const taylor = await registered(TAYLOR);
    const casey = await registered(CASEY);
    const sent = events(1);
    expectCreated(await createGroup(taylor, BRISBANE), BRISBANE);

    const fromCasey = await uploadBody(
      casey,
      BRISBANE,
      JSON.stringify({ epoch: 1, events: sent }),
    );
    const fromTaylor = await uploadBody(
      taylor,
      BRISBANE,
      JSON.stringify({ epoch: 1, events: sent }),
    );

    expectGroupRefused(fromCasey, NOT_A_MEMBER);
    expectUploaded(fromTaylor, sent, [1]);
  });
});
