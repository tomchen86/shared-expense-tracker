import {
  T,
  expectRefused,
  leavingTheDatabaseAsItWas,
  newPhone,
  registered,
  send,
  setTime,
  signedBy,
  timesStored,
} from './sharing-api';
import {
  ALREADY_A_MEMBER,
  CODE_A,
  CODE_B,
  CODE_C,
  MOST_REQUESTS,
  NO_INVITE,
  REQUEST,
  REQUESTS_FULL,
  WEEK,
  applicants,
  brisbaneInvitesCasey,
  cancelRequest,
  card,
  expectRequestAnswered,
  expectRequestRefused,
  expectRevoked,
  joinRequest,
  putInvite,
  requestBody,
  requestPath,
  revokeInvite,
  sendRequest,
  sendRequestBody,
} from './sharing-invites-api';
import {
  BRISBANE,
  TOKYO,
  addMember,
  call,
  callOn,
  createGroup,
  expectCreated,
  leavingGroupsAsTheyWere,
  ownServer,
  useSyncApi,
} from './sync-api';

// Join requests on the API (ADR-0015, ADR-0032): a phone that holds an invite link sends
// a request the API cannot read, under the invite's code, replaces it, or cancels it. An
// invite takes 20, none from a member device, and loses them when it is revoked.

useSyncApi();

const P = joinRequest();
const Q = joinRequest();
const R = joinRequest();

/** Taylor's phone makes Tokyo and its invite under code B. */
async function tokyoInvites(taylor: Awaited<ReturnType<typeof registered>>) {
  expectCreated(await createGroup(taylor, TOKYO), TOKYO);
  expect((await putInvite(taylor, TOKYO, CODE_B, card())).status).toBe(200);
}

describe('SHARING-112.1', () => {
  test('[SHARING-112.1] takes a request from a registered device that is no member device, and stores it once', async () => {
    const [, casey] = await brisbaneInvitesCasey();
    setTime(T + 1_000);

    const answer = await sendRequest(casey, CODE_A, P);

    expect(answer).toEqual({ status: 200, body: { code: CODE_A } });
    expect(await timesStored(P)).toBe(1);
  });

  test('[SHARING-112.1] takes a request from each of two devices', async () => {
    const [, casey] = await brisbaneInvitesCasey();
    const other = await registered();

    expectRequestAnswered(await sendRequest(casey, CODE_A, P), CODE_A);
    expectRequestAnswered(await sendRequest(other, CODE_A, Q), CODE_A);

    expect(await timesStored(P)).toBe(1);
    expect(await timesStored(Q)).toBe(1);
  });

  test('[SHARING-112.1] takes a request of 41 bytes and one of 65,536 bytes', async () => {
    const [, casey] = await brisbaneInvitesCasey();
    const other = await registered();
    const smallest = joinRequest(41);
    const largest = joinRequest(65_536);

    expectRequestAnswered(await sendRequest(casey, CODE_A, smallest), CODE_A);
    expectRequestAnswered(await sendRequest(other, CODE_A, largest), CODE_A);

    expect(await timesStored(smallest)).toBe(1);
    expect(await timesStored(largest)).toBe(1);
  });

  test("[SHARING-112.1] takes one device's requests for the invites of two groups", async () => {
    const [taylor, casey] = await brisbaneInvitesCasey();
    await tokyoInvites(taylor);

    expectRequestAnswered(await sendRequest(casey, CODE_A, P), CODE_A);
    expectRequestAnswered(await sendRequest(casey, CODE_B, Q), CODE_B);

    expect(await timesStored(P)).toBe(1);
    expect(await timesStored(Q)).toBe(1);
  });

  test('[SHARING-112.1] takes a request from a member device of another group', async () => {
    const [, casey] = await brisbaneInvitesCasey();
    expectCreated(await createGroup(casey, TOKYO), TOKYO);

    expectRequestAnswered(await sendRequest(casey, CODE_A, P), CODE_A);
  });
});

describe('SHARING-113.1', () => {
  test('[SHARING-113.1] answers the same when the request is sent again, and still holds one', async () => {
    const [, casey] = await brisbaneInvitesCasey();

    expectRequestAnswered(await sendRequest(casey, CODE_A, P), CODE_A);
    expectRequestAnswered(await sendRequest(casey, CODE_A, P), CODE_A);

    expect(await timesStored(P)).toBe(1);
  });

  test('[SHARING-113.1] replaces the content with what the device sends next', async () => {
    const [, casey] = await brisbaneInvitesCasey();
    expectRequestAnswered(await sendRequest(casey, CODE_A, P), CODE_A);

    expectRequestAnswered(await sendRequest(casey, CODE_A, Q), CODE_A);

    expect(await timesStored(Q)).toBe(1);
    expect(await timesStored(P)).toBe(0);
  });

  test('[SHARING-113.1] makes one request of five that arrive together from one device', async () => {
    const [, casey] = await brisbaneInvitesCasey();
    const servers = await Promise.all(
      Array.from({ length: 5 }, () => ownServer()),
    );

    const answers = await Promise.all(
      servers.map((server) =>
        callOn(server, casey, {
          method: 'PUT',
          path: requestPath(CODE_A),
          body: requestBody(P),
        }),
      ),
    );

    for (const answer of answers) expectRequestAnswered(answer, CODE_A);
    expect(await timesStored(P)).toBe(1);
  });
});

describe('SHARING-114.1', () => {
  test('[SHARING-114.1] answers a revoked invite, an expired one and a code it has never seen in one way, and stores nothing', async () => {
    const [taylor, casey] = await brisbaneInvitesCasey();
    expectRevoked(await revokeInvite(taylor, BRISBANE, CODE_A), CODE_A);
    await tokyoInvites(taylor);
    setTime(T + WEEK);

    const answers = [
      await sendRequest(casey, CODE_A, P),
      await sendRequest(casey, CODE_B, P),
      await sendRequest(casey, CODE_C, P),
    ];

    for (const answer of answers) {
      expect(answer).toEqual({ status: 404, body: { error: 'no-invite' } });
    }
    expect(await timesStored(P)).toBe(0);
  });

  test('[SHARING-114.1] takes a request a millisecond before the invite expires, and none at the millisecond it does', async () => {
    const [, casey] = await brisbaneInvitesCasey();
    const other = await registered();

    setTime(T + WEEK - 1);
    const before = await sendRequest(casey, CODE_A, P);
    setTime(T + WEEK);
    const after = await sendRequest(other, CODE_A, Q);

    expectRequestAnswered(before, CODE_A);
    expectRequestRefused(after, NO_INVITE);
    expect(await timesStored(Q)).toBe(0);
  });
});

describe('SHARING-115.1', () => {
  test('[SHARING-115.1] refuses the device that created the group, with the reason alone', async () => {
    const [taylor] = await brisbaneInvitesCasey();

    const answer = await sendRequest(taylor, CODE_A, P);

    expect(answer).toEqual({
      status: 409,
      body: { error: 'already-a-member' },
    });
    expect(await timesStored(P)).toBe(0);
  });

  test('[SHARING-115.1] refuses any other member device of the group', async () => {
    const [, casey] = await brisbaneInvitesCasey();
    await addMember(BRISBANE, casey);

    expectRequestRefused(await sendRequest(casey, CODE_A, P), ALREADY_A_MEMBER);
    expect(await timesStored(P)).toBe(0);
  });
});

describe('SHARING-116.1', () => {
  test('[SHARING-116.1] refuses the 21st device, and stores nothing of it', async () => {
    const [, casey] = await brisbaneInvitesCasey();
    await applicants(CODE_A, MOST_REQUESTS);

    const answer = await sendRequest(casey, CODE_A, P);

    expect(answer).toEqual({ status: 409, body: { error: 'requests-full' } });
    expect(await timesStored(P)).toBe(0);
  });

  test('[SHARING-116.1] still replaces the request of a device that has one', async () => {
    await brisbaneInvitesCasey();
    const [first] = await applicants(CODE_A, MOST_REQUESTS);

    expectRequestAnswered(await sendRequest(first, CODE_A, Q), CODE_A);

    expect(await timesStored(Q)).toBe(1);
  });

  test('[SHARING-116.1] takes a new request once one of the 20 is cancelled', async () => {
    const [, casey] = await brisbaneInvitesCasey();
    const [, second] = await applicants(CODE_A, MOST_REQUESTS);
    expectRequestRefused(await sendRequest(casey, CODE_A, P), REQUESTS_FULL);

    expectRequestAnswered(await cancelRequest(second, CODE_A), CODE_A);

    expectRequestAnswered(await sendRequest(casey, CODE_A, P), CODE_A);
  });

  test('[SHARING-116.1] gives the last place to exactly one of three devices that ask at the same moment', async () => {
    await brisbaneInvitesCasey();
    await applicants(CODE_A, MOST_REQUESTS - 1);
    const racers = await Promise.all([
      registered(),
      registered(),
      registered(),
    ]);
    const servers = await Promise.all(racers.map(() => ownServer()));

    const answers = await Promise.all(
      racers.map((phone, index) =>
        callOn(servers[index], phone, {
          method: 'PUT',
          path: requestPath(CODE_A),
          body: requestBody(joinRequest()),
        }),
      ),
    );

    expect(answers.map(({ status }) => status).sort()).toEqual([200, 409, 409]);
    for (const answer of answers) {
      if (answer.status === 200) expectRequestAnswered(answer, CODE_A);
      else expectRequestRefused(answer, REQUESTS_FULL);
    }
  });

  test("[SHARING-116.1] does not count another invite's requests", async () => {
    const [taylor, casey] = await brisbaneInvitesCasey();
    await applicants(CODE_A, MOST_REQUESTS);
    await tokyoInvites(taylor);

    expectRequestAnswered(await sendRequest(casey, CODE_B, P), CODE_B);
  });
});

describe('SHARING-117.1', () => {
  test("[SHARING-117.1] cancels the device's request and leaves another device's", async () => {
    const [, casey] = await brisbaneInvitesCasey();
    const other = await registered();
    expectRequestAnswered(await sendRequest(casey, CODE_A, P), CODE_A);
    expectRequestAnswered(await sendRequest(other, CODE_A, Q), CODE_A);

    const answer = await cancelRequest(casey, CODE_A);

    expect(answer).toEqual({ status: 200, body: { code: CODE_A } });
    expect(await timesStored(P)).toBe(0);
    expect(await timesStored(Q)).toBe(1);
  });

  test('[SHARING-117.1] answers a second cancellation the same, and changes nothing', async () => {
    const [, casey] = await brisbaneInvitesCasey();
    const other = await registered();
    expectRequestAnswered(await sendRequest(casey, CODE_A, P), CODE_A);
    expectRequestAnswered(await sendRequest(other, CODE_A, Q), CODE_A);
    expectRequestAnswered(await cancelRequest(casey, CODE_A), CODE_A);

    const again = await leavingGroupsAsTheyWere(() =>
      cancelRequest(casey, CODE_A),
    );

    expectRequestAnswered(again, CODE_A);
    expect(await timesStored(Q)).toBe(1);
  });

  test('[SHARING-117.1] takes a new request from a device that cancelled its own', async () => {
    const [, casey] = await brisbaneInvitesCasey();
    expectRequestAnswered(await sendRequest(casey, CODE_A, P), CODE_A);
    expectRequestAnswered(await cancelRequest(casey, CODE_A), CODE_A);

    expectRequestAnswered(await sendRequest(casey, CODE_A, R), CODE_A);

    expect(await timesStored(R)).toBe(1);
  });

  test('[SHARING-117.1] answers the cancellation for a revoked invite, an expired one and a code it has never seen, and changes nothing', async () => {
    const [taylor, casey] = await brisbaneInvitesCasey();
    expectRevoked(await revokeInvite(taylor, BRISBANE, CODE_A), CODE_A);
    await tokyoInvites(taylor);
    setTime(T + WEEK);

    for (const code of [CODE_A, CODE_B, CODE_C]) {
      const answer = await leavingGroupsAsTheyWere(() =>
        cancelRequest(casey, code),
      );
      expectRequestAnswered(answer, code);
    }
  });

  test('[SHARING-117.1] answers a member device that cancels, and changes nothing', async () => {
    const [taylor, casey] = await brisbaneInvitesCasey();
    expectRequestAnswered(await sendRequest(casey, CODE_A, P), CODE_A);

    const answer = await leavingGroupsAsTheyWere(() =>
      cancelRequest(taylor, CODE_A),
    );

    expectRequestAnswered(answer, CODE_A);
    expect(await timesStored(P)).toBe(1);
  });
});

describe('SHARING-118.1', () => {
  const WRONG_CODES = [
    ['one character short', '3q2-7wEjRWeJq83vEjRWe'],
    ['one character long', '3q2-7wEjRWeJq83vEjRWeAA'],
    ['a last character 16 bytes cannot end in', '3q2-7wEjRWeJq83vEjRWeB'],
    ['a dot in it', '3q2-7wEjRWe.q83vEjRWeA'],
    ['a word', 'invite'],
  ];

  test.each(WRONG_CODES)(
    '[SHARING-118.1] refuses to send or cancel a request under a code with %s',
    async (_, code) => {
      const [, casey] = await brisbaneInvitesCasey();

      expectRequestRefused(await sendRequest(casey, code, P), REQUEST);
      expectRequestRefused(await cancelRequest(casey, code), REQUEST);
    },
  );

  const hex = (content: Uint8Array) => Buffer.from(content).toString('hex');
  const WRONG_BODIES: [string, string | undefined][] = [
    ['no body', undefined],
    ['an empty object', '{}'],
    [
      'a field beside the request',
      JSON.stringify({ request: hex(P), name: 'Casey' }),
    ],
    ['an array', JSON.stringify([hex(P)])],
    ['text that is no JSON', 'request'],
    ['a number for the request', '{"request":7}'],
    [
      'uppercase hexadecimal',
      JSON.stringify({ request: hex(P).toUpperCase() }),
    ],
    ['an odd number of digits', JSON.stringify({ request: hex(P).slice(1) })],
    ['40 bytes', requestBody(joinRequest(40))],
    ['65,537 bytes', requestBody(joinRequest(65_537))],
  ];

  test.each(WRONG_BODIES)(
    '[SHARING-118.1] refuses a request whose body is %s, and stores none of it',
    async (_, body) => {
      const [, casey] = await brisbaneInvitesCasey();

      const answer = await leavingGroupsAsTheyWere(() =>
        sendRequestBody(casey, CODE_A, body),
      );

      expectRequestRefused(answer, REQUEST);
      expect(await timesStored('Casey')).toBe(0);
    },
  );

  test('[SHARING-118.1] refuses both requests when their URL carries a query', async () => {
    const [, casey] = await brisbaneInvitesCasey();

    const sending = await call(casey, {
      method: 'PUT',
      path: `${requestPath(CODE_A)}?x=1`,
      body: requestBody(P),
    });
    const cancelling = await call(casey, {
      method: 'DELETE',
      path: `${requestPath(CODE_A)}?x=1`,
    });

    expectRequestRefused(sending, REQUEST);
    expectRequestRefused(cancelling, REQUEST);
    expect(await timesStored(P)).toBe(0);
  });

  test('[SHARING-118.1] refuses a cancellation that carries a body, and the request stays', async () => {
    const [, casey] = await brisbaneInvitesCasey();
    expectRequestAnswered(await sendRequest(casey, CODE_A, P), CODE_A);

    expectRequestRefused(await cancelRequest(casey, CODE_A, '{}'), REQUEST);

    expect(await timesStored(P)).toBe(1);
  });
});

describe('SHARING-119.1', () => {
  const SIGNATURE = { error: 'signature' } as const;

  test('[SHARING-119.1] takes neither request without a signature, or from a device that has not registered', async () => {
    await brisbaneInvitesCasey();
    const stranger = newPhone();
    const requests = [
      {
        method: 'PUT',
        path: requestPath(CODE_A),
        body: new Uint8Array(Buffer.from(requestBody(P))),
      },
      { method: 'DELETE', path: requestPath(CODE_A) },
    ];

    for (const request of requests) {
      const unsigned = await leavingTheDatabaseAsItWas(() => send(request));
      const unregistered = await leavingTheDatabaseAsItWas(() =>
        send(signedBy(stranger, request)),
      );

      expectRefused(unsigned, SIGNATURE);
      expectRefused(unregistered, SIGNATURE);
    }
  });

  test("[SHARING-119.1] says how a request is written before the invite's state", async () => {
    const [, casey] = await brisbaneInvitesCasey();

    expectRequestRefused(await sendRequestBody(casey, CODE_C, '{}'), REQUEST);
  });

  test("[SHARING-119.1] says the invite's state before whether the device is a member device", async () => {
    const [taylor] = await brisbaneInvitesCasey();
    expectRevoked(await revokeInvite(taylor, BRISBANE, CODE_A), CODE_A);

    expectRequestRefused(await sendRequest(taylor, CODE_A, P), NO_INVITE);
  });

  test('[SHARING-119.1] says a device is a member device before it says the invite is full', async () => {
    const [taylor] = await brisbaneInvitesCasey();
    await applicants(CODE_A, MOST_REQUESTS);

    expectRequestRefused(
      await sendRequest(taylor, CODE_A, P),
      ALREADY_A_MEMBER,
    );
  });

  test('[SHARING-119.1] has accepted a request it then refuses: sent again as it was, it is a replay', async () => {
    const [, casey] = await brisbaneInvitesCasey();
    const request = signedBy(casey, {
      method: 'PUT',
      path: requestPath(CODE_C),
      body: requestBody(P),
    });

    const first = await send(request);
    const again = await send(request);

    expectRequestRefused(first, NO_INVITE);
    expectRefused(again, { error: 'replayed' });
  });

  test('[SHARING-119.1] leaves every invite and request as it was when it refuses', async () => {
    const [taylor, casey] = await brisbaneInvitesCasey();
    expectRequestAnswered(await sendRequest(casey, CODE_A, P), CODE_A);

    const answers = await leavingGroupsAsTheyWere(async () => [
      await sendRequest(taylor, CODE_A, Q),
      await sendRequest(casey, CODE_C, Q),
      await sendRequestBody(casey, CODE_A, '{}'),
    ]);

    expectRequestRefused(answers[0], ALREADY_A_MEMBER);
    expectRequestRefused(answers[1], NO_INVITE);
    expectRequestRefused(answers[2], REQUEST);
    expect(await timesStored(P)).toBe(1);
  });
});

describe('SHARING-120.1', () => {
  test('[SHARING-120.1] stores the request once, and none of the other headers it came with', async () => {
    const [, casey] = await brisbaneInvitesCasey();

    const answer = await call(
      casey,
      { method: 'PUT', path: requestPath(CODE_A), body: requestBody(P) },
      {
        'User-Agent': 'CaseysPhone/1.0',
        'X-Applicant-Name': 'Casey-Lee',
      },
    );

    expectRequestAnswered(answer, CODE_A);
    expect(await timesStored(P)).toBe(1);
    expect(await timesStored('CaseysPhone')).toBe(0);
    expect(await timesStored('Casey-Lee')).toBe(0);
  });

  test('[SHARING-120.1] keeps no content it replaced, cancelled or refused', async () => {
    const [taylor, casey] = await brisbaneInvitesCasey();
    expectRequestAnswered(await sendRequest(casey, CODE_A, P), CODE_A);
    expectRequestAnswered(await sendRequest(casey, CODE_A, Q), CODE_A);
    expectRequestAnswered(await cancelRequest(casey, CODE_A), CODE_A);
    expectRequestRefused(
      await sendRequest(taylor, CODE_A, R),
      ALREADY_A_MEMBER,
    );

    expect(await timesStored(P)).toBe(0);
    expect(await timesStored(Q)).toBe(0);
    expect(await timesStored(R)).toBe(0);
  });
});

describe('SHARING-121.1', () => {
  test("[SHARING-121.1] keeps none of an invite's requests once the invite is revoked", async () => {
    const [taylor, casey] = await brisbaneInvitesCasey();
    const other = await registered();
    expectRequestAnswered(await sendRequest(casey, CODE_A, P), CODE_A);
    expectRequestAnswered(await sendRequest(other, CODE_A, Q), CODE_A);

    expectRevoked(await revokeInvite(taylor, BRISBANE, CODE_A), CODE_A);

    expect(await timesStored(P)).toBe(0);
    expect(await timesStored(Q)).toBe(0);
  });

  test("[SHARING-121.1] starts the group's next invite with no requests after a revocation", async () => {
    const [taylor, casey] = await brisbaneInvitesCasey();
    await applicants(CODE_A, MOST_REQUESTS);
    expectRevoked(await revokeInvite(taylor, BRISBANE, CODE_A), CODE_A);
    expect((await putInvite(taylor, BRISBANE, CODE_B, card())).status).toBe(
      200,
    );

    expectRequestAnswered(await sendRequest(casey, CODE_B, P), CODE_B);
  });

  test("[SHARING-121.1] starts the group's next invite with no requests after the last one expired", async () => {
    const [taylor, casey] = await brisbaneInvitesCasey();
    await applicants(CODE_A, MOST_REQUESTS);
    setTime(T + WEEK);
    expect((await putInvite(taylor, BRISBANE, CODE_B, card())).status).toBe(
      200,
    );

    expectRequestAnswered(await sendRequest(casey, CODE_B, P), CODE_B);
  });
});

describe('SHARING-122.1', () => {
  test('[SHARING-122.1] answers "not found" to every other method on the path, and changes no request', async () => {
    const [, casey] = await brisbaneInvitesCasey();
    expectRequestAnswered(await sendRequest(casey, CODE_A, P), CODE_A);

    const answers = await leavingGroupsAsTheyWere(async () => [
      await call(casey, { method: 'GET', path: requestPath(CODE_A) }),
      await call(casey, { method: 'HEAD', path: requestPath(CODE_A) }),
      await call(casey, {
        method: 'POST',
        path: requestPath(CODE_A),
        body: requestBody(Q),
      }),
      await call(casey, {
        method: 'PATCH',
        path: requestPath(CODE_A),
        body: requestBody(Q),
      }),
    ]);

    for (const answer of answers) {
      expect(answer.status).toBe(404);
      expect(answer.body).not.toEqual(NO_INVITE);
    }
    // The request is the one sent first: the device can still cancel it, and it was not replaced.
    expect(await timesStored(P)).toBe(1);
    expect(await timesStored(Q)).toBe(0);
  });
});
