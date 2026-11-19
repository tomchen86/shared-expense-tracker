import { DEVICES_PATH } from '@shared-expense/domain/api';
import {
  BODY_LIMIT,
  CASEY,
  NO_ROUTE,
  T,
  TAYLOR,
  expectPassed,
  expectRefused,
  fieldOf,
  leavingTheDatabaseAsItWas,
  newPhone,
  registered,
  registrationBy,
  send,
  sendPartly,
  signedBy,
  timesDeviceIdStored,
  useSharingApi,
  withField,
  withOneBitChanged,
  type Answer,
  type Phone,
  type SentRequest,
} from './sharing-api';

// How large a body the API takes, and that it answers a request it will refuse for its
// fields or its size without waiting for the rest of the body (issue #205): a body the API
// does not wait for is one it does not have to hold. A test shows this by sending the
// headers and only part of a body, or none of it, and leaving the request unfinished: an
// API that read the whole body before it answered would give no answer.

useSharingApi();

const SIGNATURE = { error: 'signature' } as const;
const TOO_LARGE = { error: 'too-large' } as const;
const OVER = BODY_LIMIT + 1;
const HUNDRED_GIB = 107_374_182_400;
const EARLY = T - 3_600_000;

/** `length` bytes, each the letter a. */
const bytes = (length: number) => new Uint8Array(length).fill(0x61);

/** A `POST` of a path with no route that `phone` signed, with a body of `length` bytes. */
const posted = (phone: Phone, length: number, input = {}) =>
  signedBy(phone, { method: 'POST', body: bytes(length), ...input });

function expectAnswered(
  answer: Answer | 'no answer',
): asserts answer is Answer {
  expect(answer).not.toBe('no answer');
}

describe('SHARING-48.1', () => {
  test('[SHARING-48.1] refuses a signed request whose body is one byte over 1 MiB, with status 413, and stores nothing', async () => {
    const taylor = await registered(TAYLOR);

    const answer = await leavingTheDatabaseAsItWas(() =>
      send(posted(taylor, OVER)),
    );

    expectRefused(answer, TOO_LARGE);
    expect(answer.status).toBe(413);
  });

  test('[SHARING-48.1] takes a body of exactly 1 MiB, with its length declared', async () => {
    const taylor = await registered(TAYLOR);

    const answer = await send(posted(taylor, BODY_LIMIT));

    expectPassed(answer);
  });

  test('[SHARING-48.1] takes a body of exactly 1 MiB sent in chunks with no length declared', async () => {
    const taylor = await registered(TAYLOR);
    const request = posted(taylor, BODY_LIMIT);

    const answer = await sendPartly(request, {
      sent: request.body,
      ended: true,
    });

    expectAnswered(answer);
    expectPassed(answer);
  });

  test('[SHARING-48.1] refuses a body of exactly 1 MiB for its signature, not for its size', async () => {
    const taylor = await registered(TAYLOR);
    const request = posted(taylor, BODY_LIMIT);

    const answer = await send(
      withField(
        request,
        'signature',
        withOneBitChanged(fieldOf(request, 'signature')),
      ),
    );

    expectRefused(answer, SIGNATURE);
  });

  test('[SHARING-48.1] counts the bytes of a body sent in chunks with no length declared', async () => {
    const taylor = await registered(TAYLOR);
    const request = posted(taylor, OVER);

    const answer = await leavingTheDatabaseAsItWas(() =>
      sendPartly(request, { sent: request.body, ended: true }),
    );

    expectAnswered(answer);
    expectRefused(answer, TOO_LARGE);
  });

  test('[SHARING-48.1] refuses a registration whose body is over 1 MiB, though its key and its signature are right', async () => {
    const casey = newPhone(CASEY);
    const key = JSON.stringify({ publicKey: casey.publicKey });
    const registration = registrationBy(casey, {
      body: key + ' '.repeat(OVER - key.length),
    });

    const answer = await leavingTheDatabaseAsItWas(() => send(registration));

    expect(registration.body).toHaveLength(OVER);
    expectRefused(answer, TOO_LARGE);
    expect(await timesDeviceIdStored(CASEY)).toBe(0);
    expectRefused(await send(signedBy(casey)), SIGNATURE);
  });
});

describe('SHARING-31.2', () => {
  // Each request declares a body one byte over the limit, and none of it is sent.
  const declaringTooMuch = (request: SentRequest) =>
    leavingTheDatabaseAsItWas(() =>
      sendPartly(request, { declaredLength: OVER }),
    );

  test.each([
    [
      'without its signature',
      (taylor: Phone) =>
        withField(posted(taylor, OVER), 'signature', undefined),
    ],
    [
      'whose device ID is in capitals',
      (taylor: Phone) =>
        withField(posted(taylor, OVER), 'deviceId', TAYLOR.toUpperCase()),
    ],
  ])(
    '[SHARING-31.2] checks the fields before the size: a request %s is refused for its signature',
    async (_, requestOf) => {
      const taylor = await registered(TAYLOR);

      const answer = await declaringTooMuch(requestOf(taylor));

      expectAnswered(answer);
      expectRefused(answer, SIGNATURE);
    },
  );

  test.each([
    [
      'whose signature is changed and whose time is an hour early',
      (taylor: Phone) => {
        const request = posted(taylor, OVER, { timestampMs: EARLY });
        return withField(
          request,
          'signature',
          withOneBitChanged(fieldOf(request, 'signature')),
        );
      },
    ],
    [
      'whose time is an hour early',
      (taylor: Phone) => posted(taylor, OVER, { timestampMs: EARLY }),
    ],
    [
      'from a device that has not registered',
      () => posted(newPhone(CASEY), OVER),
    ],
    [
      'for a path that cannot be signed',
      (taylor: Phone) => posted(taylor, OVER, { path: `${NO_ROUTE}//x` }),
    ],
    [
      'that is a registration whose body is not JSON',
      () =>
        signedBy(newPhone(CASEY), {
          method: 'POST',
          path: DEVICES_PATH,
          body: bytes(OVER),
        }),
    ],
  ])(
    '[SHARING-31.2] checks the size before everything after the fields: a request %s is refused as too large',
    async (_, requestOf) => {
      const taylor = await registered(TAYLOR);

      const answer = await declaringTooMuch(requestOf(taylor));

      expectAnswered(answer);
      expectRefused(answer, TOO_LARGE);
    },
  );
});

describe('SHARING-49.1', () => {
  test.each([
    ['one byte over 1 MiB', OVER],
    ['100 GiB', HUNDRED_GIB],
  ])(
    '[SHARING-49.1] refuses a request that declares a body of %s before any of the body is sent',
    async (_, declaredLength) => {
      const taylor = await registered(TAYLOR);

      const answer = await leavingTheDatabaseAsItWas(() =>
        sendPartly(posted(taylor, OVER), { declaredLength }),
      );

      expectAnswered(answer);
      expectRefused(answer, TOO_LARGE);
    },
  );

  test('[SHARING-49.1] refuses a request with no length declared once more than 1 MiB of it has come, without waiting for its end', async () => {
    const taylor = await registered(TAYLOR);
    const request = posted(taylor, OVER);

    const answer = await leavingTheDatabaseAsItWas(() =>
      sendPartly(request, { sent: request.body }),
    );

    expectAnswered(answer);
    expectRefused(answer, TOO_LARGE);
  });

  test.each([
    ['POST', NO_ROUTE],
    ['POST', '/health'],
  ])(
    '[SHARING-49.1] refuses an unsigned %s %s for its signature before any of its body is sent',
    async (method, path) => {
      const declared = await sendPartly(
        { method, path },
        { declaredLength: OVER },
      );
      const inChunks = await sendPartly({ method, path }, {});

      expectAnswered(declared);
      expectRefused(declared, SIGNATURE);
      expectAnswered(inChunks);
      expectRefused(inChunks, SIGNATURE);
    },
  );
});

describe('SHARING-50.1', () => {
  test.each([
    '/health',
    '/.well-known/apple-app-site-association',
    '/.well-known/assetlinks.json',
    '/i/a',
  ])(
    '[SHARING-50.1] answers GET %s as it does without a body, whatever body the request declares or starts to send',
    async (path) => {
      const plain = await send({ path });

      const declared = await sendPartly({ path }, { declaredLength: OVER });
      const inChunks = await sendPartly({ path }, { sent: bytes(1_024) });

      expect(plain.status).toBe(200);
      expect(declared).toEqual(plain);
      expect(inChunks).toEqual(plain);
    },
  );
});
