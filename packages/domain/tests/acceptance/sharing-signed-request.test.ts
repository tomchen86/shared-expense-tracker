import { signedRequestBytes } from '../../src/api';

// The bytes a phone signs for a request, and the API verifies (ADR-0015). They are
// ASCII text, so the tests read them as text.

type Input = Parameters<typeof signedRequestBytes>[0];

const fromHex = (hex: string) => Uint8Array.from(Buffer.from(hex, 'hex'));
const asText = (bytes: Uint8Array) => Buffer.from(bytes).toString('latin1');

const TAYLOR = '0f8fad5b-d9cb-469f-a165-70867728950e';
const CASEY = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const REGISTRATION_HASH =
  '6909fde5637134de28fc345ef65c422aeb3133035e2dcf77fd56b044348bf87b';
const EMPTY_HASH =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
/** 2026-11-18T06:32:00Z. */
const T = 1794983520000;

/** The first scenario of SHARING-17.1: a registration. */
const registration = (): Input => ({
  method: 'POST',
  path: '/devices',
  bodyHash: fromHex(REGISTRATION_HASH),
  deviceId: TAYLOR,
  timestampMs: T,
  nonce: '000102030405060708090a0b0c0d0e0f',
});

const REGISTRATION_LINES = [
  'shared-expense/request/v1',
  'POST',
  '/devices',
  REGISTRATION_HASH,
  TAYLOR,
  '1794983520000',
  '000102030405060708090a0b0c0d0e0f',
];

/** The registration with some fields replaced, by values of any type. */
const withFields = (fields: Record<string, unknown>) =>
  ({ ...registration(), ...fields }) as Input;

describe('SHARING-17.1', () => {
  test('[SHARING-17.1] a registration gives seven lines of ASCII with one line feed between them', () => {
    const bytes = signedRequestBytes(registration());

    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(asText(bytes)).toBe(REGISTRATION_LINES.join('\n'));
    expect(bytes).toHaveLength(188);
    expect(bytes.filter((byte) => byte === 0x0a)).toHaveLength(6);
    expect(bytes.every((byte) => byte < 0x80)).toBe(true);
  });

  test('[SHARING-17.1] a request with a query and no body keeps its whole path and the hash of zero bytes', () => {
    const bytes = signedRequestBytes({
      method: 'GET',
      path: '/example/items?after=41&limit=100',
      bodyHash: fromHex(EMPTY_HASH),
      deviceId: TAYLOR,
      timestampMs: T,
      nonce: 'a0a1a2a3a4a5a6a7a8a9aaabacadaeaf',
    });

    expect(asText(bytes).split('\n')).toEqual([
      'shared-expense/request/v1',
      'GET',
      '/example/items?after=41&limit=100',
      EMPTY_HASH,
      TAYLOR,
      '1794983520000',
      'a0a1a2a3a4a5a6a7a8a9aaabacadaeaf',
    ]);
  });

  test.each([
    [0, '0'],
    [9007199254740991, '9007199254740991'],
    [1, '1'],
    [1000000000000000, '1000000000000000'],
  ])(
    '[SHARING-17.1] writes the request time %d in decimal, as %s',
    (timestampMs, line) => {
      const lines = asText(
        signedRequestBytes(withFields({ timestampMs })),
      ).split('\n');

      expect(lines).toHaveLength(7);
      expect(lines[5]).toBe(line);
    },
  );

  test.each<[string, Record<string, unknown>]>([
    ['the method', { method: 'PUT' }],
    ['the path', { path: '/devices?x=1' }],
    [
      'one bit of the body hash',
      { bodyHash: fromHex(`e9${REGISTRATION_HASH.slice(2)}`) },
    ],
    ['the device ID', { deviceId: CASEY }],
    ['the request time', { timestampMs: T + 1 }],
    ['the nonce', { nonce: '000102030405060708090a0b0c0d0e10' }],
  ])('[SHARING-17.1] changing %s changes the bytes', (_, fields) => {
    const original = asText(signedRequestBytes(registration()));

    const changed = asText(signedRequestBytes(withFields(fields)));

    expect(original).toBe(REGISTRATION_LINES.join('\n'));
    expect(changed).not.toBe(original);
    expect(changed.split('\n')).toHaveLength(7);
  });

  test('[SHARING-17.1] takes a body hash that is a part of a larger block of bytes', () => {
    const block = new Uint8Array(96).fill(0xee);
    block.set(fromHex(REGISTRATION_HASH), 40);

    const bytes = signedRequestBytes(
      withFields({ bodyHash: block.subarray(40, 72) }),
    );

    expect(asText(bytes)).toBe(REGISTRATION_LINES.join('\n'));
  });

  test('[SHARING-17.1] gives the same bytes every time and leaves its input alone', () => {
    const input = registration();
    const hash = Uint8Array.from(input.bodyHash);

    const first = signedRequestBytes(input);
    const second = signedRequestBytes(input);

    expect(asText(first)).toBe(REGISTRATION_LINES.join('\n'));
    expect(second).toEqual(first);
    expect(input.bodyHash).toEqual(hash);
  });
});

describe('SHARING-18.1', () => {
  /** Refused, while the registration it was made from is not. */
  function expectRefused(fields: Record<string, unknown>) {
    expect(asText(signedRequestBytes(registration()))).toBe(
      REGISTRATION_LINES.join('\n'),
    );
    expect(() => signedRequestBytes(withFields(fields))).toThrow();
  }

  test.each<[string, unknown]>([
    ['lower case', 'get'],
    ['mixed case', 'Get'],
    ['empty', ''],
    ['followed by a space', 'GET '],
    ['with a hyphen', 'G-T'],
    ['two methods on two lines', 'GET\nPOST'],
    ['followed by a line feed', 'POST\n'],
    ['with a digit', 'M1'],
    ['a number', 7],
    ['missing', undefined],
    ['null', null],
  ])('[SHARING-18.1] refuses a method that is %s', (_, method) => {
    expectRefused({ method });
  });

  test.each<[string, unknown]>([
    ['empty', ''],
    ['without its leading slash', 'devices'],
    ['with a space', '/a b'],
    ['with a line feed', '/a\nb'],
    ['with a carriage return', '/a\rb'],
    ['with a tab', '/a\tb'],
    ['followed by a line feed', '/devices\n'],
    ['with characters outside ASCII', '/帳本'],
    ['with a delete character', '/a\u007fb'],
    ['with a null character', '/a\u0000b'],
    ['a number', 7],
    ['missing', undefined],
    ['null', null],
  ])('[SHARING-18.1] refuses a path that is %s', (_, path) => {
    expectRefused({ path });
  });

  test.each([
    ['/a//b'],
    ['//a'],
    ['/a//'],
    ['/a/./b'],
    ['/a/../b'],
    ['/a/..'],
    ['/a/.'],
    ['/.'],
    ['/..'],
    ['/../a'],
    ['/a%20b'],
    ['/a%2e%2e/b'],
    ['/%2E%2E/a'],
    ["/a'b"],
    ['/a"b'],
    ['/a<b'],
    ['/a>b'],
    ['/a{b}'],
    ['/a|b'],
    ['/a\\b'],
    ['/a^b'],
    ['/a`b'],
    ['/a#b'],
    ['/a+b'],
    ['/a,b'],
    ['/a;b'],
    ['/a:b'],
    ['/a@b'],
    ['/a!b'],
    ['/a*b'],
    ['/a(b)'],
    ['/a$b'],
    ['/a=b'],
    ['/a&b'],
    ['/a?'],
    ['/a//b?x=1'],
    ['/a/../b?x=1'],
    ["/a?x='1'"],
    ['/a?x=a b'],
    ['/a?x=a#b'],
    ['/a?x=a+b'],
    ['/a?x="1"'],
    ['/a?x=<1>'],
    ['/a?x=1;y=2'],
    ['/a?x=帳'],
  ])(
    '[SHARING-18.1] refuses the path %s, which may be rewritten on the way',
    (path) => {
      expectRefused({ path });
    },
  );

  test.each([
    ['/'],
    ['/devices'],
    ['/a/'],
    ['/a.b/c-d_e~f'],
    ['/.well-known/x'],
    ['/a/.../b'],
    ['/a/..b/.c/d..'],
    ['/A/b/C0123456789'],
    ['/a?x=1&y=%E5%B8%B3'],
    ['/a?x=/b/../c?d'],
    ['/a?x=%zz&y=.&z=..'],
    ['/a/?x'],
    ['/?x=1'],
  ])('[SHARING-18.1] takes the path %s as it is', (path) => {
    const lines = asText(signedRequestBytes(withFields({ path }))).split('\n');

    expect(lines).toHaveLength(7);
    expect(lines[2]).toBe(path);
  });

  test.each<[string, unknown]>([
    ['0 bytes', new Uint8Array(0)],
    ['31 bytes', new Uint8Array(31)],
    ['33 bytes', new Uint8Array(33)],
    ['64 bytes', new Uint8Array(64)],
    ['its 64 hexadecimal characters as text', REGISTRATION_HASH],
    ['an array of 32 numbers', Array.from(fromHex(REGISTRATION_HASH))],
    ['a Uint16Array of 32 numbers', new Uint16Array(32)],
    ['an object with only a length', { length: 32 }],
    ['missing', undefined],
    ['null', null],
  ])('[SHARING-18.1] refuses a body hash that is %s', (_, bodyHash) => {
    expectRefused({ bodyHash });
  });

  test.each<[string, unknown]>([
    ['in capitals', '0F8FAD5B-D9CB-469F-A165-70867728950E'],
    ['partly in capitals', '0f8fad5b-d9cb-469f-A165-70867728950e'],
    ['a version-1 UUID', '0f8fad5b-d9cb-169f-a165-70867728950e'],
    ['a version-7 UUID', '0f8fad5b-d9cb-769f-a165-70867728950e'],
    ['of another variant', '0f8fad5b-d9cb-469f-c165-70867728950e'],
    ['of the variant 7', '0f8fad5b-d9cb-469f-7165-70867728950e'],
    ['without hyphens', '0f8fad5bd9cb469fa16570867728950e'],
    ['in braces', `{${TAYLOR}}`],
    ['followed by a line feed', `${TAYLOR}\n`],
    ['preceded by a space', ` ${TAYLOR}`],
    ['one character short', TAYLOR.slice(0, -1)],
    ['one character long', `${TAYLOR}0`],
    ['with a character that is not hexadecimal', `g${TAYLOR.slice(1)}`],
    ['not a UUID', 'phone-a'],
    ['empty', ''],
    ['a number', 7],
    ['missing', undefined],
    ['null', null],
  ])('[SHARING-18.1] refuses a device ID that is %s', (_, deviceId) => {
    expectRefused({ deviceId });
  });

  test.each<[string, unknown]>([
    ['negative', -1],
    ['negative zero point five', -0.5],
    ['a fraction', 1.5],
    ['one more than the largest safe integer', 9007199254740992],
    ['not a number', Number.NaN],
    ['infinite', Number.POSITIVE_INFINITY],
    ['its digits as text', '1794983520000'],
    ['a bigint', BigInt(T)],
    ['missing', undefined],
    ['null', null],
  ])('[SHARING-18.1] refuses a request time that is %s', (_, timestampMs) => {
    expectRefused({ timestampMs });
  });

  test.each<[string, unknown]>([
    ['31 characters', '000102030405060708090a0b0c0d0e0'],
    ['33 characters', '000102030405060708090a0b0c0d0e0f0'],
    ['in capitals', '000102030405060708090A0B0C0D0E0F'],
    [
      'ending in a character that is not hexadecimal',
      '000102030405060708090a0b0c0d0e0g',
    ],
    ['followed by a line feed', '000102030405060708090a0b0c0d0e0f\n'],
    [
      '32 characters with a line feed among them',
      '000102030405060\n08090a0b0c0d0e0f',
    ],
    ['empty', ''],
    ['16 bytes', fromHex('000102030405060708090a0b0c0d0e0f')],
    ['a number', 7],
    ['missing', undefined],
    ['null', null],
  ])('[SHARING-18.1] refuses a nonce that is %s', (_, nonce) => {
    expectRefused({ nonce });
  });
});
