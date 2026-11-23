import {
  BODY_LIMIT,
  CASEY,
  T,
  TAYLOR,
  expectPassed,
  expectRefused,
  leavingTheDatabaseAsItWas,
  newPhone,
  registered,
  send,
  sendPartly,
  serverUrl,
  setTime,
  signedBy,
  timesStored,
} from './sharing-api';
import {
  CODE_A,
  CODE_B,
  CODE_C,
  INVITE_EXISTS,
  LARGEST_CARD,
  NOT_A_MEMBER,
  NO_INVITE,
  REQUEST,
  SMALLEST_CARD,
  WEEK,
  bothInBrisbane,
  card,
  expectCard,
  expectInvite,
  expectInviteRefused,
  expectRevoked,
  inviteBody,
  invitePath,
  putInvite,
  putInviteBody,
  readInvite,
  readPath,
  revokeInvite,
  taylorWithBrisbaneAndCasey,
  withEvents,
} from './sharing-invites-api';
import {
  BRISBANE,
  TOKYO,
  addMember,
  call,
  callOn,
  createGroup,
  expectCreated,
  hexOf,
  leavingGroupsAsTheyWere,
  ownServer,
  useSyncApi,
} from './sync-api';

// A shared ledger's invite on the API (ADR-0015, ADR-0026): a code the phone picks, when
// it expires, and a card the API cannot read. A group has one active invite at a time,
// any member device creates or revokes it, and anyone reads it by its code, signed or not.

useSyncApi();

const EXPIRES = T + WEEK;
const X = card();
const Y = card();
const Z = card();
const W = card();

describe('SHARING-77.1', () => {
  test('[SHARING-77.1] creates an invite that expires 7 days later and holds the card it came with', async () => {
    const [taylor, casey] = await taylorWithBrisbaneAndCasey();

    const answer = await putInvite(taylor, BRISBANE, CODE_A, X);

    expect(EXPIRES).toBe(1795588320000);
    expectInvite(answer, CODE_A, EXPIRES);
    expectCard(await readInvite(casey, CODE_A), EXPIRES, X);
  });

  test('[SHARING-77.1] lets a member device that did not create the group create its invite', async () => {
    const [, casey] = await bothInBrisbane();

    expectInvite(await putInvite(casey, BRISBANE, CODE_A, X), CODE_A, EXPIRES);
  });

  test('[SHARING-77.1] keeps an invite for each of two groups, each with its own card', async () => {
    const [taylor, casey] = await taylorWithBrisbaneAndCasey();
    expectCreated(await createGroup(taylor, TOKYO), TOKYO);

    expectInvite(await putInvite(taylor, BRISBANE, CODE_A, X), CODE_A, EXPIRES);
    expectInvite(await putInvite(taylor, TOKYO, CODE_B, Y), CODE_B, EXPIRES);

    expectCard(await readInvite(casey, CODE_A), EXPIRES, X);
    expectCard(await readInvite(casey, CODE_B), EXPIRES, Y);
  });

  test('[SHARING-77.1] takes a card of 41 bytes and one of 65,536 bytes', async () => {
    const [taylor, casey] = await taylorWithBrisbaneAndCasey();
    expectCreated(await createGroup(taylor, TOKYO), TOKYO);
    const smallest = card(SMALLEST_CARD);
    const largest = card(LARGEST_CARD);

    expectInvite(
      await putInvite(taylor, BRISBANE, CODE_A, smallest),
      CODE_A,
      EXPIRES,
    );
    expectInvite(
      await putInvite(taylor, TOKYO, CODE_B, largest),
      CODE_B,
      EXPIRES,
    );

    expectCard(await readInvite(casey, CODE_A), EXPIRES, smallest);
    expectCard(await readInvite(casey, CODE_B), EXPIRES, largest);
  });

  test("[SHARING-77.1] labels the card with the cursor the request carries, up to the group's latest sequence number", async () => {
    const [taylor] = await taylorWithBrisbaneAndCasey();
    await withEvents(taylor, BRISBANE, 3);

    expectInvite(
      await putInvite(taylor, BRISBANE, CODE_A, X, 3),
      CODE_A,
      EXPIRES,
      3,
    );
  });
});

describe('SHARING-78.1', () => {
  test('[SHARING-78.1] answers the same when the request is sent again, and keeps the expiry', async () => {
    const [taylor, casey] = await taylorWithBrisbaneAndCasey();
    expectInvite(await putInvite(taylor, BRISBANE, CODE_A, X), CODE_A, EXPIRES);

    setTime(T + 1_000);
    const again = await putInvite(taylor, BRISBANE, CODE_A, X);

    expectInvite(again, CODE_A, EXPIRES);
    expectCard(await readInvite(casey, CODE_A), EXPIRES, X);
  });

  test('[SHARING-78.1] replaces the card with one labelled with a higher cursor, from any member device', async () => {
    const [taylor, casey] = await bothInBrisbane();
    await withEvents(taylor, BRISBANE, 5);
    expectInvite(
      await putInvite(taylor, BRISBANE, CODE_A, X, 2),
      CODE_A,
      EXPIRES,
      2,
    );

    const higher = await putInvite(casey, BRISBANE, CODE_A, Y, 5);

    expectInvite(higher, CODE_A, EXPIRES, 5);
    expectCard(await readInvite(casey, CODE_A), EXPIRES, Y);
  });

  test('[SHARING-78.1] keeps the card it has when one labelled with a lower cursor arrives, and still answers', async () => {
    const [taylor, casey] = await bothInBrisbane();
    await withEvents(taylor, BRISBANE, 5);
    expectInvite(
      await putInvite(casey, BRISBANE, CODE_A, Y, 5),
      CODE_A,
      EXPIRES,
      5,
    );

    const lower = await putInvite(taylor, BRISBANE, CODE_A, Z, 3);

    expectInvite(lower, CODE_A, EXPIRES, 5);
    expectCard(await readInvite(casey, CODE_A), EXPIRES, Y);
  });

  test('[SHARING-78.1] replaces the card with one labelled with the same cursor', async () => {
    const [taylor, casey] = await bothInBrisbane();
    await withEvents(taylor, BRISBANE, 5);
    expectInvite(
      await putInvite(casey, BRISBANE, CODE_A, Y, 5),
      CODE_A,
      EXPIRES,
      5,
    );

    const same = await putInvite(taylor, BRISBANE, CODE_A, Z, 5);

    expectInvite(same, CODE_A, EXPIRES, 5);
    expectCard(await readInvite(casey, CODE_A), EXPIRES, Z);
  });

  test('[SHARING-78.1] does not put the expiry off when a new card arrives three days later', async () => {
    const [taylor, casey] = await taylorWithBrisbaneAndCasey();
    expectInvite(await putInvite(taylor, BRISBANE, CODE_A, X), CODE_A, EXPIRES);

    setTime(T + 259_200_000);
    const later = await putInvite(taylor, BRISBANE, CODE_A, Y);

    expectInvite(later, CODE_A, EXPIRES);
    expectCard(await readInvite(casey, CODE_A), EXPIRES, Y);
  });

  test('[SHARING-78.1] makes one invite of five requests for it that arrive together', async () => {
    const [taylor] = await taylorWithBrisbaneAndCasey();
    const servers = await Promise.all(
      Array.from({ length: 5 }, () => ownServer()),
    );
    const request = {
      method: 'PUT',
      path: invitePath(BRISBANE, CODE_A),
      body: inviteBody(X),
    };

    const answers = await Promise.all(
      servers.map((server) => callOn(server, taylor, request)),
    );

    for (const answer of answers) expectInvite(answer, CODE_A, EXPIRES);
    expectInviteRefused(
      await putInvite(taylor, BRISBANE, CODE_B, Y),
      INVITE_EXISTS,
    );
  });
});

describe('SHARING-79.1', () => {
  test('[SHARING-79.1] refuses a second invite while the group has an active one, and leaves that one as it was', async () => {
    const [taylor, casey] = await bothInBrisbane();
    expectInvite(await putInvite(taylor, BRISBANE, CODE_A, X), CODE_A, EXPIRES);

    const second = await leavingGroupsAsTheyWere(() =>
      putInvite(casey, BRISBANE, CODE_B, Y),
    );

    expectInviteRefused(second, INVITE_EXISTS);
    expectInviteRefused(await readInvite(casey, CODE_B), NO_INVITE);
    expectCard(await readInvite(casey, CODE_A), EXPIRES, X);
  });

  test('[SHARING-79.1] has not seen the code it refused: it can make an invite once the first is revoked', async () => {
    const [taylor, casey] = await bothInBrisbane();
    expectInvite(await putInvite(taylor, BRISBANE, CODE_A, X), CODE_A, EXPIRES);
    expectInviteRefused(
      await putInvite(casey, BRISBANE, CODE_B, Y),
      INVITE_EXISTS,
    );
    expectRevoked(await revokeInvite(taylor, BRISBANE, CODE_A), CODE_A);

    expectInvite(await putInvite(casey, BRISBANE, CODE_B, Y), CODE_B, EXPIRES);
  });

  test('[SHARING-79.1] creates exactly one invite when two member devices create one each at the same moment', async () => {
    const taylor = await registered(TAYLOR);
    const casey = await registered(CASEY);
    const groups = Array.from(
      { length: 5 },
      (_, index) => `${BRISBANE.slice(0, -1)}${index}`,
    );
    for (const groupId of groups) {
      expectCreated(await createGroup(taylor, groupId), groupId);
      await addMember(groupId, casey);
    }
    const codes = (owner: string) =>
      groups.map((_, index) =>
        Buffer.from(`${owner} code ${index}`.padEnd(16, '.')).toString(
          'base64url',
        ),
      );
    const taylors = codes('taylor');
    const caseys = codes('casey');
    const [forTaylor, forCasey] = await Promise.all([ownServer(), ownServer()]);

    const answers = await Promise.all(
      groups.flatMap((groupId, index) => [
        callOn(forTaylor, taylor, {
          method: 'PUT',
          path: invitePath(groupId, taylors[index]),
          body: inviteBody(X),
        }),
        callOn(forCasey, casey, {
          method: 'PUT',
          path: invitePath(groupId, caseys[index]),
          body: inviteBody(Y),
        }),
      ]),
    );

    for (const [index] of groups.entries()) {
      const [byTaylor, byCasey] = answers.slice(index * 2, index * 2 + 2);
      const statuses = [byTaylor.status, byCasey.status].sort();
      expect(statuses).toEqual([200, 409]);
      const [made, refused, madeCode, refusedCode, madeCard] =
        byTaylor.status === 200
          ? [byTaylor, byCasey, taylors[index], caseys[index], X]
          : [byCasey, byTaylor, caseys[index], taylors[index], Y];
      expectInvite(made, madeCode, EXPIRES);
      expectInviteRefused(refused, INVITE_EXISTS);
      expectCard(await readInvite(taylor, madeCode), EXPIRES, madeCard);
      expectInviteRefused(await readInvite(taylor, refusedCode), NO_INVITE);
    }
  });
});

describe('SHARING-80.1', () => {
  test('[SHARING-80.1] refuses a code of an invite the group revoked, and takes another code', async () => {
    const [taylor, casey] = await taylorWithBrisbaneAndCasey();
    expectInvite(await putInvite(taylor, BRISBANE, CODE_A, X), CODE_A, EXPIRES);
    expectRevoked(await revokeInvite(taylor, BRISBANE, CODE_A), CODE_A);

    const again = await leavingGroupsAsTheyWere(() =>
      putInvite(taylor, BRISBANE, CODE_A, Y),
    );

    expectInviteRefused(again, NO_INVITE);
    expectInviteRefused(await readInvite(casey, CODE_A), NO_INVITE);
    expectInvite(await putInvite(taylor, BRISBANE, CODE_B, Y), CODE_B, EXPIRES);
  });

  test('[SHARING-80.1] refuses a new card for an invite that has expired', async () => {
    const [taylor] = await taylorWithBrisbaneAndCasey();
    expectInvite(await putInvite(taylor, BRISBANE, CODE_A, X), CODE_A, EXPIRES);

    setTime(EXPIRES);
    const late = await leavingGroupsAsTheyWere(() =>
      putInvite(taylor, BRISBANE, CODE_A, Y),
    );

    expectInviteRefused(late, NO_INVITE);
  });

  test("[SHARING-80.1] refuses a code that is another group's invite, and leaves that invite alone", async () => {
    const [taylor, casey] = await taylorWithBrisbaneAndCasey();
    expectCreated(await createGroup(casey, TOKYO), TOKYO);
    expectInvite(await putInvite(casey, TOKYO, CODE_B, Y), CODE_B, EXPIRES);

    const taken = await leavingGroupsAsTheyWere(() =>
      putInvite(taylor, BRISBANE, CODE_B, X),
    );

    expectInviteRefused(taken, NO_INVITE);
    expectCard(await readInvite(taylor, CODE_B), EXPIRES, Y);
    expectInvite(await putInvite(taylor, BRISBANE, CODE_A, X), CODE_A, EXPIRES);
  });

  test("[SHARING-80.1] refuses a code that is another group's revoked invite", async () => {
    const [taylor, casey] = await taylorWithBrisbaneAndCasey();
    expectCreated(await createGroup(casey, TOKYO), TOKYO);
    expectInvite(await putInvite(casey, TOKYO, CODE_B, Y), CODE_B, EXPIRES);
    expectRevoked(await revokeInvite(casey, TOKYO, CODE_B), CODE_B);

    expectInviteRefused(
      await putInvite(taylor, BRISBANE, CODE_B, X),
      NO_INVITE,
    );
  });
});

describe('SHARING-81.1', () => {
  test('[SHARING-81.1] keeps an invite active until a millisecond before it expires', async () => {
    const [taylor, casey] = await taylorWithBrisbaneAndCasey();
    expectInvite(await putInvite(taylor, BRISBANE, CODE_A, X), CODE_A, EXPIRES);

    setTime(EXPIRES - 1);

    expectCard(await readInvite(casey, CODE_A), EXPIRES, X);
    expectInviteRefused(
      await putInvite(taylor, BRISBANE, CODE_B, Y),
      INVITE_EXISTS,
    );
  });

  test('[SHARING-81.1] ends an invite at the millisecond it expires, and lets the group make a new one', async () => {
    const [taylor, casey] = await taylorWithBrisbaneAndCasey();
    expectInvite(await putInvite(taylor, BRISBANE, CODE_A, X), CODE_A, EXPIRES);

    setTime(EXPIRES);

    expectInviteRefused(await readInvite(casey, CODE_A), NO_INVITE);
    expect(EXPIRES + WEEK).toBe(1796193120000);
    expectInvite(
      await putInvite(taylor, BRISBANE, CODE_B, Y),
      CODE_B,
      EXPIRES + WEEK,
    );
    expectCard(await readInvite(casey, CODE_B), EXPIRES + WEEK, Y);
  });
});

describe('SHARING-82.1', () => {
  test('[SHARING-82.1] revokes an invite for any member device: at once it cannot be read, and its card is gone', async () => {
    const [taylor, casey] = await bothInBrisbane();
    expectInvite(await putInvite(taylor, BRISBANE, CODE_A, X), CODE_A, EXPIRES);
    expect(await timesStored(X)).toBe(1);

    const answer = await revokeInvite(casey, BRISBANE, CODE_A);

    expectRevoked(answer, CODE_A);
    expectInviteRefused(await readInvite(casey, CODE_A), NO_INVITE);
    expect(await timesStored(X)).toBe(0);
    expectInvite(await putInvite(taylor, BRISBANE, CODE_B, Y), CODE_B, EXPIRES);
  });

  test('[SHARING-82.1] answers a second revocation the same, and leaves the newer invite alone', async () => {
    const [taylor, casey] = await taylorWithBrisbaneAndCasey();
    expectInvite(await putInvite(taylor, BRISBANE, CODE_A, X), CODE_A, EXPIRES);
    expectRevoked(await revokeInvite(taylor, BRISBANE, CODE_A), CODE_A);
    expectInvite(await putInvite(taylor, BRISBANE, CODE_B, Y), CODE_B, EXPIRES);

    const again = await leavingGroupsAsTheyWere(() =>
      revokeInvite(taylor, BRISBANE, CODE_A),
    );

    expectRevoked(again, CODE_A);
    expectCard(await readInvite(casey, CODE_B), EXPIRES, Y);
  });

  test('[SHARING-82.1] answers the revocation of an expired invite, and changes nothing', async () => {
    const [taylor] = await taylorWithBrisbaneAndCasey();
    expectInvite(await putInvite(taylor, BRISBANE, CODE_A, X), CODE_A, EXPIRES);
    setTime(EXPIRES);

    const late = await revokeInvite(taylor, BRISBANE, CODE_A);

    expectRevoked(late, CODE_A);
    expectInviteRefused(
      await putInvite(taylor, BRISBANE, CODE_A, Y),
      NO_INVITE,
    );
  });

  test("[SHARING-82.1] does not revoke another group's invite that has the code", async () => {
    const [taylor, casey] = await taylorWithBrisbaneAndCasey();
    expectCreated(await createGroup(casey, TOKYO), TOKYO);
    expectInvite(await putInvite(casey, TOKYO, CODE_B, Y), CODE_B, EXPIRES);

    const answer = await leavingGroupsAsTheyWere(() =>
      revokeInvite(taylor, BRISBANE, CODE_B),
    );

    expectRevoked(answer, CODE_B);
    expectCard(await readInvite(taylor, CODE_B), EXPIRES, Y);
  });

  test('[SHARING-82.1] answers the revocation of a code it has never seen, and the code can still become an invite', async () => {
    const [taylor] = await taylorWithBrisbaneAndCasey();

    const answer = await leavingGroupsAsTheyWere(() =>
      revokeInvite(taylor, BRISBANE, CODE_A),
    );

    expectRevoked(answer, CODE_A);
    expectInvite(await putInvite(taylor, BRISBANE, CODE_A, X), CODE_A, EXPIRES);
  });
});

describe('SHARING-83.2', () => {
  const unsigned = (code: string) => send({ path: readPath(code) });

  test('[SHARING-83.2] gives the expiry and the card, and no group ID, to a request with no signature', async () => {
    const [taylor] = await taylorWithBrisbaneAndCasey();
    expectInvite(await putInvite(taylor, BRISBANE, CODE_A, X), CODE_A, EXPIRES);

    const answer = await unsigned(CODE_A);

    expect(answer).toEqual({
      status: 200,
      body: { expiresAtMs: 1795588320000, card: hexOf(X) },
    });
    expect(JSON.stringify(answer.body)).not.toContain(BRISBANE);
  });

  test('[SHARING-83.2] gives the same answer to a device that has not registered, to a member device and to any other device', async () => {
    const [taylor, casey] = await taylorWithBrisbaneAndCasey();
    expectInvite(await putInvite(taylor, BRISBANE, CODE_A, X), CODE_A, EXPIRES);
    const plain = await unsigned(CODE_A);

    const stranger = await send(
      signedBy(newPhone(), { path: readPath(CODE_A) }),
    );

    expectCard(plain, EXPIRES, X);
    expect(stranger).toEqual(plain);
    expect(await readInvite(taylor, CODE_A)).toEqual(plain);
    expect(await readInvite(casey, CODE_A)).toEqual(plain);
  });

  test('[SHARING-83.2] does not check a signature it is sent: the same signed request is answered twice', async () => {
    const [taylor, casey] = await taylorWithBrisbaneAndCasey();
    expectInvite(await putInvite(taylor, BRISBANE, CODE_A, X), CODE_A, EXPIRES);
    const request = signedBy(casey, { path: readPath(CODE_A) });

    const first = await send(request);
    const again = await send(request);

    expectCard(first, EXPIRES, X);
    expect(again).toEqual(first);
  });

  test("[SHARING-83.2] counts no read towards a device's 60 requests a minute", async () => {
    const [taylor, casey] = await taylorWithBrisbaneAndCasey();
    expectInvite(await putInvite(taylor, BRISBANE, CODE_A, X), CODE_A, EXPIRES);
    for (let sent = 0; sent < 60; sent += 1) {
      expectCard(await readInvite(casey, CODE_A), EXPIRES, X);
    }

    const next = await revokeInvite(casey, BRISBANE, CODE_B);

    expectInviteRefused(next, NOT_A_MEMBER);
  });

  test('[SHARING-83.2] tells the phone not to store the answer', async () => {
    const [taylor] = await taylorWithBrisbaneAndCasey();
    expectInvite(await putInvite(taylor, BRISBANE, CODE_A, X), CODE_A, EXPIRES);

    const response = await fetch(`${serverUrl()}${readPath(CODE_A)}`);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  test('[SHARING-83.2] leaves the database exactly as it was when an invite is read, signed or not', async () => {
    const [taylor, casey] = await taylorWithBrisbaneAndCasey();
    expectInvite(await putInvite(taylor, BRISBANE, CODE_A, X), CODE_A, EXPIRES);

    const answers = await leavingTheDatabaseAsItWas(async () => [
      await unsigned(CODE_A),
      await readInvite(casey, CODE_A),
      await unsigned(CODE_A),
    ]);

    for (const answer of answers) expectCard(answer, EXPIRES, X);
  });

  test('[SHARING-83.2] answers as it does without a body, whatever body the request declares', async () => {
    const [taylor] = await taylorWithBrisbaneAndCasey();
    expectInvite(await putInvite(taylor, BRISBANE, CODE_A, X), CODE_A, EXPIRES);
    const plain = await unsigned(CODE_A);

    const declared = await sendPartly(
      { path: readPath(CODE_A) },
      { declaredLength: BODY_LIMIT + 1 },
    );

    expect(plain.status).toBe(200);
    expect(declared).toEqual(plain);
  });
});

describe('SHARING-84.1', () => {
  test('[SHARING-84.1] answers a revoked invite, an expired one and a code it has never seen in one way', async () => {
    const [taylor, casey] = await taylorWithBrisbaneAndCasey();
    expectCreated(await createGroup(taylor, TOKYO), TOKYO);
    // B expires a second before A would, so that A is still active when it is revoked.
    expectInvite(await putInvite(taylor, TOKYO, CODE_B, Y), CODE_B, EXPIRES);
    setTime(T + 1_000);
    expectInvite(
      await putInvite(taylor, BRISBANE, CODE_A, X),
      CODE_A,
      EXPIRES + 1_000,
    );
    setTime(EXPIRES);
    expectCard(await readInvite(casey, CODE_A), EXPIRES + 1_000, X);
    expectRevoked(await revokeInvite(taylor, BRISBANE, CODE_A), CODE_A);

    const revoked = await readInvite(casey, CODE_A);
    const expired = await readInvite(casey, CODE_B);
    const unseen = await readInvite(casey, CODE_C);

    expectInviteRefused(revoked, NO_INVITE);
    expect(revoked).toEqual({ status: 404, body: { error: 'no-invite' } });
    expect(expired).toEqual(revoked);
    expect(unseen).toEqual(revoked);
  });
});

describe('SHARING-85.1', () => {
  test('[SHARING-85.1] refuses a device that is no member device, the same whether the group exists and whatever the code', async () => {
    const [taylor, casey] = await taylorWithBrisbaneAndCasey();
    expectInvite(await putInvite(taylor, BRISBANE, CODE_A, X), CODE_A, EXPIRES);
    const requests = (groupId: string) => [
      () => putInvite(casey, groupId, CODE_A, Y),
      () => putInvite(casey, groupId, CODE_B, Y),
      () => revokeInvite(casey, groupId, CODE_A),
    ];

    const inBrisbane = [];
    const inTokyo = [];
    for (const request of requests(BRISBANE)) {
      inBrisbane.push(await leavingGroupsAsTheyWere(request));
    }
    for (const request of requests(TOKYO)) {
      inTokyo.push(await leavingGroupsAsTheyWere(request));
    }

    for (const answer of inBrisbane) {
      expectInviteRefused(answer, NOT_A_MEMBER);
      expect(answer.status).toBe(403);
    }
    expect(inTokyo).toEqual(inBrisbane);
    expectCard(await readInvite(casey, CODE_A), EXPIRES, X);
  });

  test('[SHARING-85.1] lets the device revoke once it is a member device', async () => {
    const [taylor, casey] = await taylorWithBrisbaneAndCasey();
    expectInvite(await putInvite(taylor, BRISBANE, CODE_A, X), CODE_A, EXPIRES);
    expectInviteRefused(
      await revokeInvite(casey, BRISBANE, CODE_A),
      NOT_A_MEMBER,
    );

    await addMember(BRISBANE, casey);

    expectRevoked(await revokeInvite(casey, BRISBANE, CODE_A), CODE_A);
  });
});

describe('SHARING-86.1', () => {
  const WRONG_CODES = [
    ['a character short', CODE_A.slice(0, -1)],
    ['a character long', `${CODE_A}A`],
    [
      'written with a character base64url does not have',
      '3q2-7wEjRWe.q83vEjRWeA',
    ],
    ['ending in a character 16 bytes cannot end in', `${CODE_A.slice(0, -1)}B`],
    ['a word', 'invite'],
  ];

  test.each(WRONG_CODES)(
    '[SHARING-86.1] refuses to create, revoke or read an invite whose code is %s',
    async (_case, code) => {
      const [taylor] = await taylorWithBrisbaneAndCasey();

      const answers = await leavingGroupsAsTheyWere(async () => [
        await putInvite(taylor, BRISBANE, code, X),
        await revokeInvite(taylor, BRISBANE, code),
        await readInvite(taylor, code),
      ]);

      for (const answer of answers) {
        expectInviteRefused(answer, REQUEST);
        expect(answer.status).toBe(400);
      }
      // The same requests with a code as it is written are taken.
      expectInvite(
        await putInvite(taylor, BRISBANE, CODE_A, X),
        CODE_A,
        EXPIRES,
      );
      expectCard(await readInvite(taylor, CODE_A), EXPIRES, X);
      expectRevoked(await revokeInvite(taylor, BRISBANE, CODE_A), CODE_A);
    },
  );

  test.each([
    ['in capitals', BRISBANE.toUpperCase()],
    ['a word', 'brisbane'],
  ])(
    '[SHARING-86.1] refuses to create or revoke an invite in a group whose ID is %s',
    async (_case, groupId) => {
      const [taylor] = await taylorWithBrisbaneAndCasey();

      expectInviteRefused(await putInvite(taylor, groupId, CODE_A, X), REQUEST);
      expectInviteRefused(await revokeInvite(taylor, groupId, CODE_A), REQUEST);
      expectInvite(
        await putInvite(taylor, BRISBANE, CODE_A, X),
        CODE_A,
        EXPIRES,
      );
    },
  );

  const hex = hexOf(X);
  const WRONG_BODIES: [string, string | undefined][] = [
    ['no body', undefined],
    ['an empty object', '{}'],
    ['only a cursor', '{"cursor":0}'],
    ['only a card', `{"card":"${hex}"}`],
    ['a name beside them', `{"cursor":0,"card":"${hex}","name":"Brisbane"}`],
    ['a list', `[{"cursor":0,"card":"${hex}"}]`],
    ['text that is not JSON', `cursor=0&card=${hex}`],
    ['a cursor of -1', `{"cursor":-1,"card":"${hex}"}`],
    ['a cursor of 1.5', `{"cursor":1.5,"card":"${hex}"}`],
    ['a cursor in text', `{"cursor":"0","card":"${hex}"}`],
    [
      'a cursor past the largest whole number',
      `{"cursor":9007199254740992,"card":"${hex}"}`,
    ],
    ['a card that is a number', '{"cursor":0,"card":7}'],
    ['a card in capitals', `{"cursor":0,"card":"${hex.toUpperCase()}"}`],
    ['a card of half a byte more', `{"cursor":0,"card":"${hex}0"}`],
    ['a card of 40 bytes', inviteBody(card(SMALLEST_CARD - 1))],
    ['a card of 65,537 bytes', inviteBody(card(LARGEST_CARD + 1))],
  ];

  test.each(WRONG_BODIES)(
    '[SHARING-86.1] refuses to create an invite with %s, and keeps nothing of it',
    async (_case, body) => {
      const [taylor, casey] = await taylorWithBrisbaneAndCasey();

      const answer = await leavingGroupsAsTheyWere(() =>
        putInviteBody(taylor, BRISBANE, CODE_A, body),
      );

      expectInviteRefused(answer, REQUEST);
      expectInviteRefused(await readInvite(casey, CODE_A), NO_INVITE);
      expect(await timesStored('Brisbane')).toBe(0);
      // The group can still make this invite.
      expectInvite(
        await putInvite(taylor, BRISBANE, CODE_A, X),
        CODE_A,
        EXPIRES,
      );
    },
  );

  test('[SHARING-86.1] refuses each of the three requests when its URL carries a query', async () => {
    const [taylor] = await taylorWithBrisbaneAndCasey();
    expectInvite(await putInvite(taylor, BRISBANE, CODE_A, X), CODE_A, EXPIRES);

    const answers = await leavingGroupsAsTheyWere(async () => [
      await call(taylor, {
        method: 'PUT',
        path: `${invitePath(BRISBANE, CODE_A)}?x=1`,
        body: inviteBody(Y),
      }),
      await call(taylor, {
        method: 'DELETE',
        path: `${invitePath(BRISBANE, CODE_A)}?x=1`,
      }),
      await call(taylor, { path: `${readPath(CODE_A)}?x=1` }),
    ]);

    for (const answer of answers) expectInviteRefused(answer, REQUEST);
    expectCard(await readInvite(taylor, CODE_A), EXPIRES, X);
  });

  test('[SHARING-86.1] refuses a revocation that carries a body, and the invite stays', async () => {
    const [taylor, casey] = await taylorWithBrisbaneAndCasey();
    expectInvite(await putInvite(taylor, BRISBANE, CODE_A, X), CODE_A, EXPIRES);

    const answer = await leavingGroupsAsTheyWere(() =>
      revokeInvite(taylor, BRISBANE, CODE_A, '{}'),
    );

    expectInviteRefused(answer, REQUEST);
    expectCard(await readInvite(casey, CODE_A), EXPIRES, X);
  });

  test("[SHARING-86.1] refuses a card labelled with a cursor past the group's latest sequence number", async () => {
    const [taylor] = await taylorWithBrisbaneAndCasey();
    await withEvents(taylor, BRISBANE, 3);

    const past = await leavingGroupsAsTheyWere(() =>
      putInvite(taylor, BRISBANE, CODE_A, X, 4),
    );
    const atIt = await putInvite(taylor, BRISBANE, CODE_A, X, 3);

    expectInviteRefused(past, REQUEST);
    expectInvite(atIt, CODE_A, EXPIRES, 3);
  });
});

describe('SHARING-87.2', () => {
  const SIGNATURE = { error: 'signature' } as const;

  test('[SHARING-87.2] takes neither a creation nor a revocation without a signature, or from a device that has not registered', async () => {
    const [taylor] = await taylorWithBrisbaneAndCasey();
    const stranger = newPhone();
    const requests = [
      {
        method: 'PUT',
        path: invitePath(BRISBANE, CODE_A),
        body: new Uint8Array(Buffer.from(inviteBody(X))),
      },
      { method: 'DELETE', path: invitePath(BRISBANE, CODE_A) },
    ];

    for (const request of requests) {
      const unsigned = await leavingGroupsAsTheyWere(() => send(request));
      const unregistered = await leavingGroupsAsTheyWere(() =>
        send(signedBy(stranger, request)),
      );

      expectRefused(unsigned, SIGNATURE);
      expectRefused(unregistered, SIGNATURE);
    }
    expectInviteRefused(await readInvite(taylor, CODE_A), NO_INVITE);
  });

  test('[SHARING-87.2] refuses a read with no signature for how it is written or for its code, never for its signature', async () => {
    await taylorWithBrisbaneAndCasey();

    const answers = await leavingTheDatabaseAsItWas(async () => [
      await send({ path: readPath('invite') }),
      await send({ path: readPath(CODE_C) }),
    ]);

    expectInviteRefused(answers[0], REQUEST);
    expectInviteRefused(answers[1], NO_INVITE);
  });

  test('[SHARING-87.2] says how a request is written before whether the device is a member device', async () => {
    const [, casey] = await taylorWithBrisbaneAndCasey();

    const wrongBody = await putInviteBody(casey, BRISBANE, CODE_A, '{}');
    const withQuery = await call(casey, {
      method: 'DELETE',
      path: `${invitePath(BRISBANE, CODE_A)}?x=1`,
    });

    expectInviteRefused(wrongBody, REQUEST);
    expectInviteRefused(withQuery, REQUEST);
  });

  test("[SHARING-87.2] says a device is no member device before the cursor's size and the invite's state", async () => {
    const [taylor, casey] = await taylorWithBrisbaneAndCasey();
    expectInvite(await putInvite(taylor, BRISBANE, CODE_A, X), CODE_A, EXPIRES);

    const byCasey = await putInvite(casey, BRISBANE, CODE_B, Y, 9);
    const byTaylor = await putInvite(taylor, BRISBANE, CODE_B, Y, 9);

    expectInviteRefused(byCasey, NOT_A_MEMBER);
    expectInviteRefused(byTaylor, REQUEST);
  });

  test("[SHARING-87.2] says a cursor is too large before the invite's state", async () => {
    const [taylor] = await taylorWithBrisbaneAndCasey();
    expectInvite(await putInvite(taylor, BRISBANE, CODE_A, X), CODE_A, EXPIRES);
    expectRevoked(await revokeInvite(taylor, BRISBANE, CODE_A), CODE_A);

    expectInviteRefused(
      await putInvite(taylor, BRISBANE, CODE_A, Y, 9),
      REQUEST,
    );
    expectInviteRefused(
      await putInvite(taylor, BRISBANE, CODE_A, Y),
      NO_INVITE,
    );
  });

  test('[SHARING-87.2] says a code was used before it says the group already has an invite', async () => {
    const [taylor] = await taylorWithBrisbaneAndCasey();
    expectInvite(await putInvite(taylor, BRISBANE, CODE_A, X), CODE_A, EXPIRES);
    expectRevoked(await revokeInvite(taylor, BRISBANE, CODE_A), CODE_A);
    expectInvite(await putInvite(taylor, BRISBANE, CODE_B, Y), CODE_B, EXPIRES);

    expectInviteRefused(
      await putInvite(taylor, BRISBANE, CODE_A, Z),
      NO_INVITE,
    );
  });

  test('[SHARING-87.2] has accepted a request it then refuses: sent again as it was, it is a replay', async () => {
    const [taylor] = await taylorWithBrisbaneAndCasey();
    expectInvite(await putInvite(taylor, BRISBANE, CODE_A, X), CODE_A, EXPIRES);
    expectRevoked(await revokeInvite(taylor, BRISBANE, CODE_A), CODE_A);
    const request = signedBy(taylor, {
      method: 'PUT',
      path: invitePath(BRISBANE, CODE_A),
      body: inviteBody(Y),
    });

    const first = await send(request);
    const again = await send(request);

    expectInviteRefused(first, NO_INVITE);
    expectRefused(again, { error: 'replayed' });
  });

  test("[SHARING-87.2] counts a request it refuses towards the device's 60 a minute", async () => {
    const [, casey] = await taylorWithBrisbaneAndCasey();
    // With its registration, 59 more make 60 in this minute.
    for (let sent = 0; sent < 59; sent += 1) {
      expectInviteRefused(
        await revokeInvite(casey, BRISBANE, CODE_A),
        NOT_A_MEMBER,
      );
    }

    const next = await revokeInvite(casey, BRISBANE, CODE_A);

    expectRefused(next, { error: 'too-many-requests', retryAfterMs: 60_000 });
  });
});

describe('SHARING-88.1', () => {
  test('[SHARING-88.1] stores the card once, and none of the other headers a request carries', async () => {
    const [taylor] = await taylorWithBrisbaneAndCasey();

    const answer = await call(
      taylor,
      {
        method: 'PUT',
        path: invitePath(BRISBANE, CODE_A),
        body: inviteBody(X),
      },
      { 'User-Agent': 'TaylorsPhone/1.0', 'X-Group-Name': 'Brisbane-Trip' },
    );

    expectInvite(answer, CODE_A, EXPIRES);
    expect(await timesStored(X)).toBe(1);
    expect(await timesStored('TaylorsPhone')).toBe(0);
    expect(await timesStored('Brisbane-Trip')).toBe(0);
  });

  test('[SHARING-88.1] keeps no card it refused, passed over or replaced', async () => {
    const [taylor, casey] = await taylorWithBrisbaneAndCasey();
    await withEvents(taylor, BRISBANE, 5);
    expectInvite(
      await putInvite(taylor, BRISBANE, CODE_A, X, 5),
      CODE_A,
      EXPIRES,
      5,
    );

    expectInvite(
      await putInvite(taylor, BRISBANE, CODE_A, Y, 3),
      CODE_A,
      EXPIRES,
      5,
    );
    expectInviteRefused(
      await putInvite(casey, BRISBANE, CODE_A, Z, 5),
      NOT_A_MEMBER,
    );
    expectInvite(
      await putInvite(taylor, BRISBANE, CODE_A, W, 5),
      CODE_A,
      EXPIRES,
      5,
    );

    expect(await timesStored(W)).toBe(1);
    for (const gone of [X, Y, Z]) expect(await timesStored(gone)).toBe(0);
  });
});

describe('SHARING-89.1', () => {
  test('[SHARING-89.1] answers "not found" to every other method on the two paths, and changes no invite', async () => {
    const [taylor, casey] = await taylorWithBrisbaneAndCasey();
    expectInvite(await putInvite(taylor, BRISBANE, CODE_A, X), CODE_A, EXPIRES);
    const aCard = inviteBody(Y);

    for (const [method, path, body] of [
      ['GET', invitePath(BRISBANE, CODE_A), undefined],
      ['POST', invitePath(BRISBANE, CODE_A), aCard],
      ['PATCH', invitePath(BRISBANE, CODE_A), aCard],
      ['DELETE', readPath(CODE_A), undefined],
      ['PUT', readPath(CODE_A), aCard],
      ['POST', readPath(CODE_A), aCard],
    ] as const) {
      const answer = await leavingGroupsAsTheyWere(() =>
        call(taylor, { method, path, body }),
      );

      expectPassed(answer);
    }
    expectCard(await readInvite(casey, CODE_A), EXPIRES, X);
  });

  test('[SHARING-89.1] takes a HEAD for no read and no request of the invite API', async () => {
    const [taylor, casey] = await taylorWithBrisbaneAndCasey();
    expectInvite(await putInvite(taylor, BRISBANE, CODE_A, X), CODE_A, EXPIRES);

    for (const path of [invitePath(BRISBANE, CODE_A), readPath(CODE_A)]) {
      const answer = await leavingGroupsAsTheyWere(() =>
        call(taylor, { method: 'HEAD', path }),
      );

      // The answer to a HEAD has no body, only the status.
      expect(answer.status).toBe(404);
    }
    expectCard(await readInvite(casey, CODE_A), EXPIRES, X);
  });
});
