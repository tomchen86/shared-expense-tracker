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
    expect(isRegisterDeviceRequest({ publicKey: `03${'00'.repeat(31)}` })).toBe(
      true,
    );
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

describe('a low-order public key', () => {
  // Ed25519's curve, −x² + y² = 1 + d x² y² over the integers modulo p, with numbers only:
  // the points whose order divides 8 are worked out here, not copied from a list.
  const P = 2n ** 255n - 19n;
  /** The order of the subgroup that key pairs live in. */
  const L = 2n ** 252n + 27742317777372353535851937790883648493n;
  type Point = readonly [x: bigint, y: bigint];
  const IDENTITY: Point = [0n, 1n];

  const mod = (value: bigint) => ((value % P) + P) % P;
  function power(base: bigint, exponent: bigint): bigint {
    let result = 1n;
    for (let b = mod(base), e = exponent; e > 0n; b = mod(b * b), e >>= 1n) {
      if (e & 1n) result = mod(result * b);
    }
    return result;
  }
  const inverse = (value: bigint) => power(value, P - 2n);
  const D = mod(-121665n * inverse(121666n));

  function add([x1, y1]: Point, [x2, y2]: Point): Point {
    const t = mod(D * x1 * x2 * y1 * y2);
    return [
      mod((x1 * y2 + x2 * y1) * inverse(1n + t)),
      mod((y1 * y2 + x1 * x2) * inverse(1n - t)),
    ];
  }
  function times(count: bigint, point: Point): Point {
    let result = IDENTITY;
    for (let q = point, k = count; k > 0n; q = add(q, q), k >>= 1n) {
      if (k & 1n) result = add(result, q);
    }
    return result;
  }
  /** A point with this y, when the curve has one: x² is (y² − 1) / (d y² + 1). */
  function pointWithY(y: bigint): Point | undefined {
    const square = mod((y * y - 1n) * inverse(D * y * y + 1n));
    let x = power(square, (P + 3n) / 8n);
    if (mod(x * x) !== square) x = mod(x * power(2n, (P - 1n) / 4n));
    return mod(x * x) === square ? [x, y] : undefined;
  }
  const same = (a: Point, b: Point) => a[0] === b[0] && a[1] === b[1];

  /** The points whose order divides 8: the multiples of one whose order is 8. */
  function lowOrderPoints(): Point[] {
    for (let y = 2n; ; y += 1n) {
      const point = pointWithY(y);
      if (!point) continue;
      // Multiplying by the order of the large subgroup leaves the low-order part.
      const start = times(L, point);
      const multiples = [start];
      while (!same(multiples.at(-1)!, IDENTITY)) {
        multiples.push(add(multiples.at(-1)!, start));
      }
      if (multiples.length === 8) return multiples;
    }
  }

  /** 32 bytes, least significant first, in hexadecimal. */
  function hexOf(value: bigint): string {
    let text = '';
    for (let index = 0, rest = value; index < 32; index += 1, rest >>= 8n) {
      text += (rest & 255n).toString(16).padStart(2, '0');
    }
    return text;
  }
  /**
   * Every 32 bytes that write the point: y, also as y + p while that fits in 255 bits,
   * with the sign of x in the highest bit, either way when x is 0.
   */
  function writingsOf([x, y]: Point): string[] {
    const writings: string[] = [];
    for (let written = y; written < 2n ** 255n; written += P) {
      for (const sign of x === 0n ? [0n, 1n] : [x & 1n]) {
        writings.push(hexOf(written | (sign << 255n)));
      }
    }
    return writings;
  }

  const points = lowOrderPoints();
  const writings = points.flatMap(writingsOf);

  test('is one of fourteen writings of the eight points whose order divides 8', () => {
    expect(points).toHaveLength(8);
    for (const point of points) {
      expect(same(times(8n, point), IDENTITY)).toBe(true);
    }
    expect(new Set(writings).size).toBe(14);
    expect(writings).toHaveLength(14);
    expect(writings).toContain(`01${'00'.repeat(31)}`);
    expect(writings).toContain(`ee${'ff'.repeat(31)}`);
  });

  test('is no registration, in any of the fourteen writings', () => {
    for (const publicKey of writings) {
      expect([publicKey, isRegisterDeviceRequest({ publicKey })]).toEqual([
        publicKey,
        false,
      ]);
    }
  });

  test('is not a key one bit away from one of them, unless that is another of them', () => {
    for (const writing of writings) {
      for (const at of [0, 30, 62]) {
        const digit = (parseInt(writing[at], 16) ^ 1).toString(16);
        const publicKey = writing.slice(0, at) + digit + writing.slice(at + 1);
        if (writings.includes(publicKey)) continue;

        expect([publicKey, isRegisterDeviceRequest({ publicKey })]).toEqual([
          publicKey,
          true,
        ]);
      }
    }
  });

  test('is not the base point, nor a point of the large subgroup with a low-order one added', () => {
    const base = pointWithY(mod(4n * inverse(5n)))!;
    const ordinary = times(L - 7n, base);
    const keys = [
      `58${'66'.repeat(31)}`,
      ...writingsOf(base),
      // Only the eight points themselves are refused, not every point with a low-order part.
      ...points.flatMap((point) => writingsOf(add(ordinary, point))),
    ];

    for (const publicKey of keys) {
      expect([publicKey, isRegisterDeviceRequest({ publicKey })]).toEqual([
        publicKey,
        true,
      ]);
    }
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
