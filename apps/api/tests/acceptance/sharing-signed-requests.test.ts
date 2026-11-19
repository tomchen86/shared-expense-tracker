import { REFUSAL_STATUS, isHealthResponse } from '@shared-expense/domain/api';
import {
  CASEY,
  NO_ROUTE,
  T,
  TAYLOR,
  expectPassed,
  expectRefused,
  fieldOf,
  leavingTheDatabaseAsItWas,
  newNonce,
  newPhone,
  register,
  registered,
  registrationBy,
  send,
  setTime,
  signedBy,
  useSharingApi,
  withField,
  withOneBitChanged,
  type Phone,
  type SentRequest,
} from './sharing-api';

// What the API does with a request before any route sees it (ADR-0015): it must be signed
// by a registered device, on time, new, and within that device's limit. A request that
// passes is one for a path with no route, so the answer "not found" shows it passed.

useSharingApi();

const SIGNATURE = { error: 'signature' } as const;
const REPLAYED = { error: 'replayed' } as const;
const tooManyRequests = (retryAfterMs: number) =>
  ({ error: 'too-many-requests', retryAfterMs }) as const;

/** Sends `count` requests `phone` signed, one after another, at the API's time now. */
async function sendPassing(phone: Phone, count: number) {
  for (let index = 0; index < count; index += 1) {
    expectPassed(await send(signedBy(phone)));
  }
}

describe('SHARING-31.1', () => {
  test.each([
    ['POST', '/devices'],
    ['GET', NO_ROUTE],
    ['GET', '/'],
    ['DELETE', '/devices'],
  ])(
    '[SHARING-31.1] refuses an unsigned %s %s for its signature',
    async (method, path) => {
      const answer = await leavingTheDatabaseAsItWas(() =>
        send({ method, path }),
      );

      expectRefused(answer, SIGNATURE);
    },
  );

  test('[SHARING-31.1] answers "not found" to a request for a path with no route only once it has passed the checks', async () => {
    const taylor = await registered(TAYLOR);

    const unsigned = await send({ path: NO_ROUTE });
    const signed = await send(signedBy(taylor));

    expectRefused(unsigned, SIGNATURE);
    expectPassed(signed);
  });

  test('[SHARING-31.1] answers GET /health without a signature, and no other method or path beside it', async () => {
    const health = await send({ path: '/health' });
    const head = await send({ method: 'HEAD', path: '/health' });
    const posted = await send({ method: 'POST', path: '/health' });
    const beside = await send({ path: '/health/more' });

    expect(health.status).toBe(200);
    expect(isHealthResponse(health.body)).toBe(true);
    // The answer to a HEAD has no body to carry the reason, only the refusal's status.
    expect(head.status).toBe(REFUSAL_STATUS.signature);
    expectRefused(posted, SIGNATURE);
    expectRefused(beside, SIGNATURE);
  });

  test('[SHARING-31.1] gives the reason of the first check a request fails: signature before clock', async () => {
    const taylor = await registered(TAYLOR);
    const early = signedBy(taylor, { timestampMs: T - 3_600_000 });

    const answer = await send(
      withField(
        early,
        'signature',
        withOneBitChanged(fieldOf(early, 'signature')),
      ),
    );

    expectRefused(answer, SIGNATURE);
    // The same request with its signature left alone fails the next check.
    expectRefused(await send(early), { error: 'clock', serverTimeMs: T });
  });

  test('[SHARING-31.1] gives the reason of the first check a request fails: clock before replay', async () => {
    const taylor = await registered(TAYLOR);
    const nonce = newNonce();
    expectPassed(await send(signedBy(taylor, { nonce })));

    const answer = await send(
      signedBy(taylor, { nonce, timestampMs: T - 3_600_000 }),
    );

    expectRefused(answer, { error: 'clock', serverTimeMs: T });
  });

  test('[SHARING-31.1] gives the reason of the first check a request fails: replay before too many requests', async () => {
    const taylor = await registered(TAYLOR);
    const nonce = newNonce();
    expectPassed(await send(signedBy(taylor, { nonce })));
    // With its registration, that makes 60 in this minute.
    await sendPassing(taylor, 58);

    const usedNonce = await send(signedBy(taylor, { nonce, path: '/other' }));
    const newNonceAgain = await send(signedBy(taylor));

    expectRefused(usedNonce, REPLAYED);
    expectRefused(newNonceAgain, tooManyRequests(60_000));
  });
});

describe('SHARING-32.1', () => {
  const FIELDS = ['deviceId', 'timestamp', 'nonce', 'signature'] as const;

  test.each(FIELDS)(
    '[SHARING-32.1] refuses a request without its %s',
    async (field) => {
      const taylor = await registered(TAYLOR);
      const request = signedBy(taylor);

      const answer = await leavingTheDatabaseAsItWas(() =>
        send(withField(request, field, undefined)),
      );

      expectRefused(answer, SIGNATURE);
      // Nothing else was wrong with it.
      expectPassed(await send(request));
    },
  );

  test.each(FIELDS)(
    '[SHARING-32.1] refuses a request whose %s is empty',
    async (field) => {
      const taylor = await registered(TAYLOR);
      const request = signedBy(taylor);

      const answer = await leavingTheDatabaseAsItWas(() =>
        send(withField(request, field, '')),
      );

      expectRefused(answer, SIGNATURE);
      expectPassed(await send(request));
    },
  );

  /**
   * Requests whose one field is written as `written`, signed both over the field's proper
   * writing and over the writing that is sent, so that neither reading of the field
   * lets it through.
   */
  function writtenAs(
    taylor: Phone,
    field: 'deviceId' | 'timestamp' | 'nonce',
    written: string,
  ): SentRequest[] {
    const proper = signedBy(taylor);
    const overWritten = signedBy(
      taylor,
      field === 'timestamp'
        ? { timestampText: written }
        : field === 'nonce'
          ? { nonce: written }
          : { deviceId: written },
    );
    return [withField(proper, field, written), overWritten];
  }

  test.each<[string, 'deviceId' | 'timestamp' | 'nonce', string]>([
    ['the device ID in capitals', 'deviceId', TAYLOR.toUpperCase()],
    ['the device ID without hyphens', 'deviceId', TAYLOR.replaceAll('-', '')],
    ['the device ID in braces', 'deviceId', `{${TAYLOR}}`],
    ['the request time with a leading zero', 'timestamp', `0${T}`],
    ['the request time with a decimal point', 'timestamp', `${T}.0`],
    ['the request time with a plus sign', 'timestamp', `+${T}`],
    ['the request time with an exponent', 'timestamp', '1.79498352e12'],
    ['the request time with a space in it', 'timestamp', '17949835 20000'],
    ['the request time in hexadecimal', 'timestamp', `0x${T.toString(16)}`],
    [
      'a request time past the largest integer',
      'timestamp',
      '9007199254740992',
    ],
    ['a negative request time', 'timestamp', '-1'],
    ['a request time that is no number', 'timestamp', 'now'],
    ['the nonce in capitals', 'nonce', 'A0A1A2A3A4A5A6A7A8A9AAABACADAEAF'],
    ['a nonce of 31 characters', 'nonce', 'a0a1a2a3a4a5a6a7a8a9aaabacadaea'],
    ['a nonce of 33 characters', 'nonce', 'a0a1a2a3a4a5a6a7a8a9aaabacadaeaf0'],
    [
      'a nonce that is not hexadecimal',
      'nonce',
      'a0a1a2a3a4a5a6a7a8a9aaabacadaeag',
    ],
  ])('[SHARING-32.1] refuses %s', async (_, field, written) => {
    const taylor = await registered(TAYLOR);

    for (const request of writtenAs(taylor, field, written)) {
      const answer = await leavingTheDatabaseAsItWas(() => send(request));

      expectRefused(answer, SIGNATURE);
    }
    // A request written properly passes.
    expectPassed(await send(signedBy(taylor)));
  });

  test('[SHARING-32.1] refuses a signature in capitals, one character short, one character long, or in Base64', async () => {
    const taylor = await registered(TAYLOR);
    const request = signedBy(taylor);
    const signature = fieldOf(request, 'signature');

    for (const written of [
      signature.toUpperCase(),
      signature.slice(0, -1),
      `${signature}0`,
      Buffer.from(signature, 'hex').toString('base64'),
      Buffer.from(signature, 'hex').toString('base64url'),
    ]) {
      const answer = await leavingTheDatabaseAsItWas(() =>
        send(withField(request, 'signature', written)),
      );

      expectRefused(answer, SIGNATURE);
    }
    expectPassed(await send(request));
  });
});

describe('SHARING-33.1', () => {
  test('[SHARING-33.1] refuses a request from a device that has not registered, until it registers', async () => {
    await registered(TAYLOR);
    const casey = newPhone(CASEY);

    const before = await leavingTheDatabaseAsItWas(() => send(signedBy(casey)));
    await register(casey);
    const after = await send(signedBy(casey));

    expectRefused(before, SIGNATURE);
    expectPassed(after);
  });

  test('[SHARING-33.1] refuses an unregistered device whatever the method and path, except its registration', async () => {
    const casey = newPhone(CASEY);

    for (const [method, path, body] of [
      ['GET', '/devices', undefined],
      ['PUT', '/devices', '{}'],
      ['DELETE', '/devices', undefined],
      ['POST', NO_ROUTE, '{}'],
    ] as const) {
      const answer = await leavingTheDatabaseAsItWas(() =>
        send(signedBy(casey, { method, path, body })),
      );

      expectRefused(answer, SIGNATURE);
    }
  });
});

describe('SHARING-34.1', () => {
  const BODY = '{"note":"晚餐"}';
  const signedPost = (phone: Phone) =>
    signedBy(phone, {
      method: 'POST',
      path: `${NO_ROUTE}?after=41`,
      body: BODY,
    });

  /** Each changed copy of `request` is refused and stores nothing; then `request` itself passes. */
  async function expectOnlyTheOriginalPasses(
    request: SentRequest,
    changed: SentRequest[],
  ) {
    for (const copy of changed) {
      const answer = await leavingTheDatabaseAsItWas(() => send(copy));

      expectRefused(answer, SIGNATURE);
    }
    expectPassed(await send(request));
  }

  test('[SHARING-34.1] passes a request that arrives as it was signed, with a query and a body', async () => {
    const taylor = await registered(TAYLOR);

    expectPassed(await send(signedPost(taylor)));
    expectPassed(await send(signedBy(taylor)));
    expectPassed(
      await send(
        signedBy(taylor, {
          method: 'PUT',
          path: '/a/b?x=%E5%B8%B3&y=1',
          body: new Uint8Array([0, 255, 16, 10, 13]),
        }),
      ),
    );
  });

  test('[SHARING-34.1] refuses a request whose method, path or query was changed', async () => {
    const taylor = await registered(TAYLOR);
    const request = signedPost(taylor);

    await expectOnlyTheOriginalPasses(request, [
      { ...request, method: 'PUT' },
      { ...request, path: `${NO_ROUTE}2?after=41` },
      { ...request, path: `/x${NO_ROUTE}?after=41` },
      { ...request, path: `${NO_ROUTE}?after=42` },
      { ...request, path: NO_ROUTE },
      { ...request, path: `${NO_ROUTE}?after=41&limit=1` },
    ]);
  });

  test('[SHARING-34.1] refuses a request whose body was changed', async () => {
    const taylor = await registered(TAYLOR);
    const request = signedPost(taylor);
    const body = Buffer.from(request.body);
    const oneByteChanged = Uint8Array.from(body);
    oneByteChanged[3] ^= 1;

    await expectOnlyTheOriginalPasses(request, [
      { ...request, body: oneByteChanged },
      { ...request, body: Uint8Array.from([...body, 0x20]) },
      { ...request, body: Uint8Array.from(body.subarray(0, -1)) },
      { ...request, body: new Uint8Array(0) },
    ]);
  });

  test('[SHARING-34.1] refuses a request that was signed without a body and arrives with one', async () => {
    const taylor = await registered(TAYLOR);
    const request = signedBy(taylor, { method: 'POST' });

    await expectOnlyTheOriginalPasses(request, [
      { ...request, body: new Uint8Array(Buffer.from(BODY)) },
    ]);
  });

  test('[SHARING-34.1] refuses a request whose request time, nonce or signature was changed', async () => {
    const taylor = await registered(TAYLOR);
    const request = signedPost(taylor);
    const signature = fieldOf(request, 'signature');

    await expectOnlyTheOriginalPasses(request, [
      withField(request, 'timestamp', String(T + 1)),
      withField(request, 'timestamp', String(T - 1)),
      withField(request, 'nonce', newNonce()),
      withField(request, 'signature', withOneBitChanged(signature)),
      withField(
        request,
        'signature',
        withOneBitChanged(signature.slice(0, 64)) + signature.slice(64),
      ),
      withField(request, 'signature', '0'.repeat(128)),
    ]);
  });

  test('[SHARING-34.1] refuses a request for a path that is not written as the bytes to sign allow', async () => {
    const taylor = await registered(TAYLOR);

    for (const path of [
      `${NO_ROUTE}/it's`,
      `${NO_ROUTE}//x`,
      `${NO_ROUTE}/a%20b`,
      `${NO_ROUTE}/a+b?x=1`,
      `${NO_ROUTE}?x=a+b`,
      `${NO_ROUTE}?x=a,b`,
    ]) {
      // Signed over exactly this path, which arrives as it is sent, so only its writing
      // is wrong.
      const answer = await leavingTheDatabaseAsItWas(() =>
        send(signedBy(taylor, { path })),
      );

      expectRefused(answer, SIGNATURE);
    }
    expectPassed(await send(signedBy(taylor, { path: `${NO_ROUTE}/its?x=1` })));
  });

  test("[SHARING-34.1] refuses a request that names one device and carries another's signature", async () => {
    const taylor = await registered(TAYLOR);
    const casey = await registered(CASEY);
    const request = signedPost(taylor);

    await expectOnlyTheOriginalPasses(request, [
      // Casey's key signs a request that names Taylor's device.
      signedBy(casey, {
        method: 'POST',
        path: `${NO_ROUTE}?after=41`,
        body: BODY,
        deviceId: TAYLOR,
      }),
      // Taylor's signed request, sent under Casey's device ID.
      withField(request, 'deviceId', CASEY),
    ]);
    expectPassed(await send(signedPost(casey)));
  });
});

describe('SHARING-35.1', () => {
  test.each([
    ['300,000 ms before', -300_000],
    ['300,000 ms after', 300_000],
    ['299,999 ms before', -299_999],
    ['the same as', 0],
  ])(
    "[SHARING-35.1] passes a request whose time is %s the API's",
    async (_, difference) => {
      const taylor = await registered(TAYLOR);

      const answer = await send(
        signedBy(taylor, { timestampMs: T + difference }),
      );

      expectPassed(answer);
    },
  );

  test.each([
    ['300,001 ms before', T - 300_001],
    ['300,001 ms after', T + 300_001],
    ['an hour before', T - 3_600_000],
    ['an hour after', T + 3_600_000],
    ['at 0, long before', 0],
    ['at the largest integer, long after', 9007199254740991],
  ])(
    "[SHARING-35.1] refuses a request whose time is %s the API's, and tells the API's time",
    async (_, timestampMs) => {
      const taylor = await registered(TAYLOR);

      const answer = await leavingTheDatabaseAsItWas(() =>
        send(signedBy(taylor, { timestampMs })),
      );

      expectRefused(answer, { error: 'clock', serverTimeMs: T });
    },
  );

  test("[SHARING-35.1] tells the API's time at the moment of each refusal", async () => {
    const taylor = await registered(TAYLOR);
    const request = () => signedBy(taylor, { timestampMs: T - 3_600_000 });

    const first = await send(request());
    setTime(T + 1_234);
    const second = await send(request());

    expectRefused(first, { error: 'clock', serverTimeMs: T });
    expectRefused(second, { error: 'clock', serverTimeMs: T + 1_234 });
  });

  test('[SHARING-35.1] refuses a registration whose time is more than 5 minutes off, and registers nothing', async () => {
    const casey = newPhone(CASEY);

    const answer = await leavingTheDatabaseAsItWas(() =>
      send(registrationBy(casey, { timestampMs: T - 300_001 })),
    );

    expectRefused(answer, { error: 'clock', serverTimeMs: T });
    expectRefused(await send(signedBy(casey)), SIGNATURE);
  });
});

describe('SHARING-36.1', () => {
  test('[SHARING-36.1] refuses a request that is sent again as it was', async () => {
    const taylor = await registered(TAYLOR);
    const request = signedBy(taylor, { method: 'POST', body: 'again' });

    const first = await send(request);
    const second = await leavingTheDatabaseAsItWas(() => send(request));
    const third = await leavingTheDatabaseAsItWas(() => send(request));

    expectPassed(first);
    expectRefused(second, REPLAYED);
    expectRefused(third, REPLAYED);
  });

  test('[SHARING-36.1] refuses another request the device signs with a nonce it has used', async () => {
    const taylor = await registered(TAYLOR);
    const nonce = newNonce();
    expectPassed(await send(signedBy(taylor, { nonce })));

    const answer = await leavingTheDatabaseAsItWas(() =>
      send(signedBy(taylor, { nonce, path: '/other', timestampMs: T + 1_000 })),
    );

    expectRefused(answer, REPLAYED);
  });

  test('[SHARING-36.1] refuses a registration sent again as it was', async () => {
    const casey = newPhone(CASEY);
    const registration = registrationBy(casey);

    expect((await send(registration)).status).toBe(200);
    const again = await leavingTheDatabaseAsItWas(() => send(registration));

    expectRefused(again, REPLAYED);
  });

  test('[SHARING-36.1] passes a request from another device with the same nonce', async () => {
    const taylor = await registered(TAYLOR);
    const casey = await registered(CASEY);
    const nonce = newNonce();

    expectPassed(await send(signedBy(taylor, { nonce })));
    expectPassed(await send(signedBy(casey, { nonce })));
  });

  test('[SHARING-36.1] passes only one of five copies of a request that arrive together', async () => {
    const taylor = await registered(TAYLOR);
    const request = signedBy(taylor);

    const answers = await Promise.all(
      Array.from({ length: 5 }, () => send(request)),
    );

    const passed = answers.filter((answer) => answer.status === 404);
    expect(passed).toHaveLength(1);
    expectPassed(passed[0]);
    for (const answer of answers.filter((each) => each !== passed[0])) {
      expectRefused(answer, REPLAYED);
    }
  });

  test('[SHARING-36.1] refuses a request sent again after 5 minutes, for the clock', async () => {
    const taylor = await registered(TAYLOR);
    const request = signedBy(taylor);
    expectPassed(await send(request));

    setTime(T + 300_000);
    const withinFiveMinutes = await send(request);
    setTime(T + 300_001);
    const afterFiveMinutes = await send(request);

    expectRefused(withinFiveMinutes, REPLAYED);
    expectRefused(afterFiveMinutes, {
      error: 'clock',
      serverTimeMs: T + 300_001,
    });
  });

  test('[SHARING-36.1] a request the API refused has not used up its nonce', async () => {
    const taylor = await registered(TAYLOR);
    const request = signedBy(taylor, { timestampMs: T + 600_000 });

    const tooEarly = await send(request);
    setTime(T + 480_000);
    const onTime = await send(request);
    const again = await send(request);

    expectRefused(tooEarly, { error: 'clock', serverTimeMs: T });
    expectPassed(onTime);
    expectRefused(again, REPLAYED);
  });
});

describe('SHARING-37.1', () => {
  /** Taylor registers at T - 120,000, so that its registration is outside every minute a test counts. */
  async function taylorRegisteredEarlier(): Promise<Phone> {
    setTime(T - 120_000);
    const taylor = await registered(TAYLOR);
    setTime(T);
    return taylor;
  }

  /** 60 requests from T on, one every 500 ms: the last at T + 29,500. */
  async function sixtyFromT(phone: Phone) {
    for (let index = 0; index < 60; index += 1) {
      setTime(T + index * 500);
      expectPassed(await send(signedBy(phone)));
    }
  }

  test('[SHARING-37.1] refuses the 61st request within a minute and tells how long to wait', async () => {
    const taylor = await taylorRegisteredEarlier();
    await sixtyFromT(taylor);

    setTime(T + 30_000);
    const answer = await leavingTheDatabaseAsItWas(() =>
      send(signedBy(taylor)),
    );

    expectRefused(answer, tooManyRequests(30_000));
  });

  test('[SHARING-37.1] passes a request again once the oldest of the 60 is a minute old', async () => {
    const taylor = await taylorRegisteredEarlier();
    await sixtyFromT(taylor);

    setTime(T + 59_999);
    const oneMillisecondEarly = await send(signedBy(taylor));
    setTime(T + 60_000);
    const first = await send(signedBy(taylor));
    const second = await send(signedBy(taylor));

    expectRefused(oneMillisecondEarly, tooManyRequests(1));
    expectPassed(first);
    // The oldest that still counts is the one at T + 500.
    expectRefused(second, tooManyRequests(500));
  });

  test('[SHARING-37.1] counts each device by itself', async () => {
    const taylor = await taylorRegisteredEarlier();
    const casey = await registered(CASEY);
    await sendPassing(taylor, 60);

    const fromTaylor = await send(signedBy(taylor));
    const fromCasey = await send(signedBy(casey));

    expectRefused(fromTaylor, tooManyRequests(60_000));
    expectPassed(fromCasey);
  });

  test('[SHARING-37.1] does not count the requests it refused', async () => {
    const taylor = await taylorRegisteredEarlier();
    const impostor = newPhone(TAYLOR);
    for (let index = 0; index < 100; index += 1) {
      expectRefused(await send(signedBy(impostor)), SIGNATURE);
    }
    expectRefused(
      await send(signedBy(taylor, { timestampMs: T - 3_600_000 })),
      { error: 'clock', serverTimeMs: T },
    );

    await sendPassing(taylor, 60);

    // Refused for the limit, those do not count either. Had the five at T + 30,000
    // counted, only 55 could pass once the 60 from T are a minute old.
    setTime(T + 30_000);
    for (let index = 0; index < 5; index += 1) {
      expectRefused(await send(signedBy(taylor)), tooManyRequests(30_000));
    }
    setTime(T + 60_000);
    await sendPassing(taylor, 60);
    expectRefused(await send(signedBy(taylor)), tooManyRequests(60_000));
  });

  test('[SHARING-37.1] counts registrations and requests for a path with no route', async () => {
    const casey = newPhone(CASEY);
    for (let index = 0; index < 30; index += 1) {
      expect((await send(registrationBy(casey))).status).toBe(200);
    }
    await sendPassing(casey, 30);

    const request = await send(signedBy(casey));
    const registration = await leavingTheDatabaseAsItWas(() =>
      send(registrationBy(casey)),
    );

    expectRefused(request, tooManyRequests(60_000));
    expectRefused(registration, tooManyRequests(60_000));
  });

  test('[SHARING-37.1] passes exactly 60 of 80 requests that arrive together', async () => {
    const taylor = await taylorRegisteredEarlier();

    const answers = await Promise.all(
      Array.from({ length: 80 }, () => send(signedBy(taylor))),
    );

    const passed = answers.filter((answer) => answer.status === 404);
    const refused = answers.filter((answer) => answer.status !== 404);
    expect(passed).toHaveLength(60);
    expect(refused).toHaveLength(20);
    for (const answer of refused) {
      expectRefused(answer, tooManyRequests(60_000));
    }
  });
});
