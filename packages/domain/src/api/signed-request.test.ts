import {
  REFUSAL_STATUS,
  isRefusal,
  isRegisterDeviceRequest,
  isRegisterDeviceResponse,
  signedRequestBytes,
  type Refusal,
} from './signed-request';

const DEVICE_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const PUBLIC_KEY = 'ab'.repeat(32);

describe('isRegisterDeviceRequest', () => {
  test('accepts exactly one Ed25519 public key in lowercase hexadecimal', () => {
    expect(isRegisterDeviceRequest({ publicKey: PUBLIC_KEY })).toBe(true);
    expect(isRegisterDeviceRequest({ publicKey: '0'.repeat(64) })).toBe(true);
  });

  test.each<[string, unknown]>([
    ['null', null],
    ['undefined', undefined],
    ['text', PUBLIC_KEY],
    ['a number', 7],
    ['an array', [PUBLIC_KEY]],
    ['an array with the key as a property', [{ publicKey: PUBLIC_KEY }]],
    ['an empty object', {}],
    ['another key', { key: PUBLIC_KEY }],
    ['a key of 31 bytes', { publicKey: 'ab'.repeat(31) }],
    ['a key of 33 bytes', { publicKey: 'ab'.repeat(33) }],
    ['a key in capitals', { publicKey: PUBLIC_KEY.toUpperCase() }],
    ['a key followed by a line feed', { publicKey: `${PUBLIC_KEY}\n` }],
    ['a key that is not hexadecimal', { publicKey: 'g'.repeat(64) }],
    ['a key that is not text', { publicKey: 7 }],
    ['a key that is null', { publicKey: null }],
    ['a key as bytes', { publicKey: new Uint8Array(32) }],
    ['one more field', { publicKey: PUBLIC_KEY, name: 'Casey' }],
    [
      'one more field that is undefined',
      { publicKey: PUBLIC_KEY, name: undefined },
    ],
  ])('refuses %s', (_, value) => {
    expect(isRegisterDeviceRequest(value)).toBe(false);
  });

  test('does not take a public key the value only inherits', () => {
    expect(
      isRegisterDeviceRequest(Object.create({ publicKey: PUBLIC_KEY })),
    ).toBe(false);
  });
});

describe('isRegisterDeviceResponse', () => {
  test('accepts exactly one device ID that is a lowercase version-4 UUID', () => {
    expect(isRegisterDeviceResponse({ deviceId: DEVICE_ID })).toBe(true);
  });

  test.each<[string, unknown]>([
    ['null', null],
    ['text', DEVICE_ID],
    ['an array', [DEVICE_ID]],
    ['an empty object', {}],
    ['a device ID in capitals', { deviceId: DEVICE_ID.toUpperCase() }],
    ['a version-1 UUID', { deviceId: '0f8fad5b-d9cb-169f-a165-70867728950e' }],
    ['a device ID that is not text', { deviceId: 7 }],
    ['one more field', { deviceId: DEVICE_ID, status: 'ok' }],
    ['a refusal', { error: 'signature' }],
  ])('refuses %s', (_, value) => {
    expect(isRegisterDeviceResponse(value)).toBe(false);
  });
});

describe('isRefusal', () => {
  const refusals: Refusal[] = [
    { error: 'signature' },
    { error: 'clock', serverTimeMs: 1794983520000 },
    { error: 'clock', serverTimeMs: 0 },
    { error: 'clock', serverTimeMs: Number.MAX_SAFE_INTEGER },
    { error: 'replayed' },
    { error: 'too-many-requests', retryAfterMs: 30_000 },
    { error: 'too-many-requests', retryAfterMs: 0 },
    { error: 'request' },
    { error: 'too-many-registrations' },
  ];

  test.each(refusals)('accepts %j', (refusal) => {
    expect(isRefusal(refusal)).toBe(true);
    expect(isRefusal(JSON.parse(JSON.stringify(refusal)))).toBe(true);
  });

  test('knows every reason that has a status', () => {
    expect(new Set(refusals.map((refusal) => refusal.error))).toEqual(
      new Set(Object.keys(REFUSAL_STATUS)),
    );
  });

  test.each<[string, unknown]>([
    ['null', null],
    ['undefined', undefined],
    ['text', 'signature'],
    ['an array', [{ error: 'signature' }]],
    ['an empty object', {}],
    ['a reason it does not know', { error: 'teapot' }],
    ['a reason that is not text', { error: 401 }],
    ['a reason with one more field', { error: 'signature', detail: 'x' }],
    ['a clock refusal without the time', { error: 'clock' }],
    [
      'a clock refusal whose time is text',
      { error: 'clock', serverTimeMs: '1' },
    ],
    [
      'a clock refusal whose time is negative',
      { error: 'clock', serverTimeMs: -1 },
    ],
    [
      'a clock refusal whose time is a fraction',
      { error: 'clock', serverTimeMs: 1.5 },
    ],
    [
      'a clock refusal whose time is past the largest integer',
      { error: 'clock', serverTimeMs: 2 ** 53 },
    ],
    [
      'a clock refusal whose time is null',
      { error: 'clock', serverTimeMs: null },
    ],
    [
      'a clock refusal with one more field',
      { error: 'clock', serverTimeMs: 1, retryAfterMs: 1 },
    ],
    [
      'a refusal for too many requests without the wait',
      { error: 'too-many-requests' },
    ],
    [
      'a refusal for too many requests whose wait is negative',
      { error: 'too-many-requests', retryAfterMs: -1 },
    ],
    [
      'a refusal for too many requests whose wait is a fraction',
      { error: 'too-many-requests', retryAfterMs: 0.5 },
    ],
    [
      'a refusal for too many requests whose wait is text',
      { error: 'too-many-requests', retryAfterMs: '30000' },
    ],
    [
      'another reason that carries a time',
      { error: 'signature', serverTimeMs: 1 },
    ],
    [
      'another reason that carries a wait',
      { error: 'too-many-registrations', retryAfterMs: 1 },
    ],
  ])('refuses %s', (_, value) => {
    expect(isRefusal(value)).toBe(false);
  });
});

describe('signedRequestBytes', () => {
  const input = () => ({
    method: 'POST',
    path: '/devices',
    bodyHash: new Uint8Array(32),
    deviceId: DEVICE_ID,
    timestampMs: 0,
    nonce: '0'.repeat(32),
  });

  test('takes a Uint8Array subclass, and refuses a typed array of another kind and a view that is no typed array', () => {
    class Bytes extends Uint8Array {}
    expect(signedRequestBytes({ ...input(), bodyHash: new Bytes(32) })).toEqual(
      signedRequestBytes(input()),
    );

    for (const bodyHash of [
      new Uint8ClampedArray(32),
      new Int8Array(32),
      new DataView(new ArrayBuffer(32)),
      new ArrayBuffer(32),
    ]) {
      expect(() =>
        signedRequestBytes({
          ...input(),
          bodyHash: bodyHash as unknown as Uint8Array,
        }),
      ).toThrow('body hash');
    }
  });

  test('refuses no input at all', () => {
    expect(() =>
      signedRequestBytes(undefined as unknown as ReturnType<typeof input>),
    ).toThrow();
  });
});
