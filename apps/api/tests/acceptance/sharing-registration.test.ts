import { DEVICES_PATH } from '@shared-expense/domain/api';
import {
  CASEY,
  HOME,
  T,
  TAYLOR,
  comeFrom,
  expectPassed,
  expectRefused,
  expectRegistered,
  leavingTheDatabaseAsItWas,
  newPhone,
  plainDigestsOf,
  register,
  registered,
  registrationBy,
  send,
  setTime,
  signedBy,
  timesDeviceIdStored,
  timesPublicKeyStored,
  timesStored,
  useSharingApi,
  withField,
  type Phone,
} from './sharing-api';

// Registering a phone (ADR-0015): the API keeps a device ID and an Ed25519 public key once
// the phone has proved it holds the private key, limits how many new devices one IP
// registers, and stores nothing else about the phone.

const SIGNATURE = { error: 'signature' } as const;
const REQUEST = { error: 'request' } as const;
const TOO_MANY_REGISTRATIONS = { error: 'too-many-registrations' } as const;

/** `phone`'s own requests are refused: its device ID is not registered. */
async function expectNotRegistered(phone: Phone) {
  expectRefused(await send(signedBy(phone)), SIGNATURE);
}

/** Registers `count` new devices, one after another, and returns them. */
async function registerNew(count: number): Promise<Phone[]> {
  const phones: Phone[] = [];
  for (let index = 0; index < count; index += 1) {
    phones.push(await registered());
  }
  return phones;
}

describe('with requests from the address a test gives', () => {
  useSharingApi();

  describe('SHARING-38.1', () => {
    test('[SHARING-38.1] registers a new device, whose signed requests then pass', async () => {
      const casey = newPhone(CASEY);
      await expectNotRegistered(casey);

      const answer = await send(registrationBy(casey));

      expectRegistered(answer, casey);
      expectPassed(await send(signedBy(casey)));
      expect(await timesDeviceIdStored(CASEY)).toBeGreaterThan(0);
      expect(await timesPublicKeyStored(casey)).toBeGreaterThan(0);
    });

    test('[SHARING-38.1] verifies later requests with the registered public key only', async () => {
      const casey = await registered(CASEY);
      const other = newPhone(CASEY);

      expectPassed(await send(signedBy(casey)));
      expectRefused(await send(signedBy(other)), SIGNATURE);
    });

    test('[SHARING-38.1] refuses a registration that was not signed with the private key of the public key it carries', async () => {
      const casey = newPhone(CASEY);
      const taylor = await registered(TAYLOR);
      const stranger = newPhone();

      for (const request of [
        // Casey's public key, signed with Taylor's and with a stranger's private key.
        registrationBy(taylor, { deviceId: CASEY, publicKey: casey.publicKey }),
        registrationBy(stranger, {
          deviceId: CASEY,
          publicKey: casey.publicKey,
        }),
        withField(registrationBy(casey), 'signature', '0'.repeat(128)),
      ]) {
        const answer = await leavingTheDatabaseAsItWas(() => send(request));

        expectRefused(answer, SIGNATURE);
      }
      await expectNotRegistered(casey);
    });

    test('[SHARING-38.1] answers a device that registers again with the same public key, and stores no second device', async () => {
      const casey = await registered(CASEY);
      const keysStored = await timesPublicKeyStored(casey);

      const again = await send(registrationBy(casey));
      const andAgain = await send(registrationBy(casey));

      expectRegistered(again, casey);
      expectRegistered(andAgain, casey);
      expect(keysStored).toBeGreaterThan(0);
      expect(await timesPublicKeyStored(casey)).toBe(keysStored);
      expectPassed(await send(signedBy(casey)));
    });

    test('[SHARING-38.1] answers every one of five registrations of one new device that arrive together, and stores one device', async () => {
      comeFrom('198.51.100.30');
      const casey = newPhone(CASEY);

      const answers = await Promise.all(
        Array.from({ length: 5 }, () => send(registrationBy(casey))),
      );

      for (const answer of answers) expectRegistered(answer, casey);
      expectPassed(await send(signedBy(casey)));
      // It is one new device for this IP: 29 more register, and one more does not.
      const [another] = await registerNew(29);
      expect(await timesPublicKeyStored(another)).toBeGreaterThan(0);
      expect(await timesPublicKeyStored(casey)).toBe(
        await timesPublicKeyStored(another),
      );
      expectRefused(
        await send(registrationBy(newPhone())),
        TOO_MANY_REGISTRATIONS,
      );
    });

    test('[SHARING-38.1] registers two devices, each verified with its own key', async () => {
      const taylor = await registered(TAYLOR);
      const casey = await registered(CASEY);

      expectPassed(await send(signedBy(taylor)));
      expectPassed(await send(signedBy(casey)));
      expectRefused(
        await send(signedBy(taylor, { deviceId: CASEY })),
        SIGNATURE,
      );
    });
  });

  describe('SHARING-39.1', () => {
    const KEY_OF_31_BYTES = 'ab'.repeat(31);
    const KEY_OF_33_BYTES = 'ab'.repeat(33);

    test.each<[string, (phone: Phone) => string]>([
      ['is empty', () => ''],
      ['is text that is not JSON', () => 'hello'],
      ['is JSON cut short', (phone) => `{"publicKey":"${phone.publicKey}"`],
      ['is an array', (phone) => JSON.stringify([phone.publicKey])],
      ['is only the key as text', (phone) => JSON.stringify(phone.publicKey)],
      ['is null', () => 'null'],
      ['has no public key', () => '{}'],
      [
        'has a public key of 31 bytes',
        () => JSON.stringify({ publicKey: KEY_OF_31_BYTES }),
      ],
      [
        'has a public key of 33 bytes',
        () => JSON.stringify({ publicKey: KEY_OF_33_BYTES }),
      ],
      ['has an empty public key', () => JSON.stringify({ publicKey: '' })],
      [
        'has its public key in capitals',
        (phone) => JSON.stringify({ publicKey: phone.publicKey.toUpperCase() }),
      ],
      [
        'has its public key in Base64',
        (phone) =>
          JSON.stringify({
            publicKey: Buffer.from(phone.publicKey, 'hex').toString('base64'),
          }),
      ],
      [
        'has a public key that is not text',
        () => JSON.stringify({ publicKey: 7 }),
      ],
      [
        'has a public key that is null',
        () => JSON.stringify({ publicKey: null }),
      ],
      [
        'carries a name as well',
        (phone) =>
          JSON.stringify({ publicKey: phone.publicKey, name: 'Casey' }),
      ],
      [
        'carries its device ID as well',
        (phone) =>
          JSON.stringify({ publicKey: phone.publicKey, deviceId: CASEY }),
      ],
    ])(
      '[SHARING-39.1] refuses a registration whose body %s',
      async (_, bodyOf) => {
        const casey = newPhone(CASEY);

        const answer = await leavingTheDatabaseAsItWas(() =>
          send(
            signedBy(casey, {
              method: 'POST',
              path: DEVICES_PATH,
              body: bodyOf(casey),
            }),
          ),
        );

        expectRefused(answer, REQUEST);
        await expectNotRegistered(casey);
        // The same phone registers once its body is right.
        await register(casey);
      },
    );

    test('[SHARING-39.1] refuses a body that is not right from a device that has already registered, too', async () => {
      const casey = await registered(CASEY);

      const answer = await leavingTheDatabaseAsItWas(() =>
        send(signedBy(casey, { method: 'POST', path: DEVICES_PATH })),
      );

      expectRefused(answer, REQUEST);
      expectPassed(await send(signedBy(casey)));
    });
  });

  describe('SHARING-40.1', () => {
    test('[SHARING-40.1] refuses another key pair that registers a device ID already taken, and keeps the first public key', async () => {
      const taylor = await registered(TAYLOR);
      const casey = newPhone(TAYLOR);

      const answer = await leavingTheDatabaseAsItWas(() =>
        send(registrationBy(casey)),
      );

      expectRefused(answer, SIGNATURE);
      expectPassed(await send(signedBy(taylor)));
      expectRefused(await send(signedBy(casey)), SIGNATURE);
      expect(await timesPublicKeyStored(casey)).toBe(0);
    });

    test('[SHARING-40.1] refuses the registered key pair when it asks to register another public key', async () => {
      const taylor = await registered(TAYLOR);
      const casey = newPhone(TAYLOR);

      const answer = await leavingTheDatabaseAsItWas(() =>
        send(registrationBy(taylor, { publicKey: casey.publicKey })),
      );

      expectRefused(answer, SIGNATURE);
      expectPassed(await send(signedBy(taylor)));
      expectRefused(await send(signedBy(casey)), SIGNATURE);
      expect(await timesPublicKeyStored(casey)).toBe(0);
    });
  });

  describe('SHARING-40.1, together', () => {
    test('[SHARING-40.1] registers one of two key pairs that register one new device ID together', async () => {
      // Eight device IDs at once, each claimed by two key pairs.
      const pairs = Array.from({ length: 8 }, () => {
        const first = newPhone();
        return [first, newPhone(first.deviceId)] as const;
      });

      const answers = await Promise.all(
        pairs.map((pair) =>
          Promise.all(pair.map((phone) => send(registrationBy(phone)))),
        ),
      );

      for (const [index, pair] of pairs.entries()) {
        const won = answers[index][0].status === 200 ? 0 : 1;
        const lost = 1 - won;
        expectRegistered(answers[index][won], pair[won]);
        expectRefused(answers[index][lost], SIGNATURE);
        expectPassed(await send(signedBy(pair[won])));
        expectRefused(await send(signedBy(pair[lost])), SIGNATURE);
        expect(await timesPublicKeyStored(pair[lost])).toBe(0);
      }
    });
  });

  describe('SHARING-47.1', () => {
    const LOW_ORDER = [
      '0000000000000000000000000000000000000000000000000000000000000000',
      '0100000000000000000000000000000000000000000000000000000000000000',
      '26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05',
      'c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a',
      'ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
      'edffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
      'eeffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
    ];
    /** `key` with the highest bit of its last byte set. */
    const withTopBit = (key: string) =>
      key.slice(0, 62) +
      (parseInt(key.slice(62), 16) | 0x80).toString(16).padStart(2, '0');
    /**
     * R is the identity element and S is 0: where a runtime lets a low-order public key
     * verify at all, this is a signature of anything under the identity element.
     */
    const FORGED = `01${'00'.repeat(63)}`;

    test('[SHARING-47.1] the fourteen writings are the seven listed and those with the highest bit set', () => {
      const all = [...LOW_ORDER, ...LOW_ORDER.map(withTopBit)];

      expect(new Set(all).size).toBe(14);
      expect(LOW_ORDER.map(withTopBit).map((key) => key.slice(62))).toEqual([
        '80',
        '80',
        '85',
        'fa',
        'ff',
        'ff',
        'ff',
      ]);
      expect(all.every((key) => /^[0-9a-f]{64}$/.test(key))).toBe(true);
    });

    test.each([...LOW_ORDER, ...LOW_ORDER.map(withTopBit)])(
      '[SHARING-47.1] refuses to register the low-order public key %s',
      async (publicKey) => {
        const casey = newPhone(CASEY);

        for (const request of [
          withField(registrationBy(casey, { publicKey }), 'signature', FORGED),
          registrationBy(casey, { publicKey }),
        ]) {
          const answer = await leavingTheDatabaseAsItWas(() => send(request));

          expectRefused(answer, REQUEST);
        }
        // Nothing passes under that device ID afterwards, forged or signed by Casey.
        expectRefused(
          await send(withField(signedBy(casey), 'signature', FORGED)),
          SIGNATURE,
        );
        await expectNotRegistered(casey);
        expect(await timesDeviceIdStored(CASEY)).toBe(0);
      },
    );

    test('[SHARING-47.1] takes a public key that is no low-order point as one, and refuses it for its signature', async () => {
      const casey = newPhone(CASEY);
      const publicKey = `03${'00'.repeat(31)}`;

      const answer = await leavingTheDatabaseAsItWas(() =>
        send(
          withField(registrationBy(casey, { publicKey }), 'signature', FORGED),
        ),
      );

      expectRefused(answer, SIGNATURE);
      // And Casey's own key registers as before.
      await register(casey);
    });
  });

  describe('SHARING-41.1', () => {
    const BUSY = '198.51.100.20';

    test('[SHARING-41.1] refuses the 31st new device from one IP within an hour', async () => {
      comeFrom(BUSY);
      const phones = await registerNew(30);
      const late = newPhone();

      setTime(T + 1_000);
      const answer = await leavingTheDatabaseAsItWas(() =>
        send(registrationBy(late)),
      );

      expectRefused(answer, TOO_MANY_REGISTRATIONS);
      await expectNotRegistered(late);
      for (const phone of phones) expectPassed(await send(signedBy(phone)));
    });

    test('[SHARING-41.1] counts each IP by itself', async () => {
      comeFrom(BUSY);
      await registerNew(30);

      comeFrom('198.51.100.21');
      const fromAnother = await send(registrationBy(newPhone(CASEY)));
      comeFrom(BUSY);
      const fromTheSame = await send(registrationBy(newPhone()));

      expect(fromAnother.status).toBe(200);
      expectRefused(fromTheSame, TOO_MANY_REGISTRATIONS);
    });

    test('[SHARING-41.1] lets the IP register again once those 30 are an hour old', async () => {
      comeFrom(BUSY);
      await registerNew(30);
      const casey = newPhone(CASEY);

      setTime(T + 3_599_999);
      const oneMillisecondEarly = await send(registrationBy(casey));
      setTime(T + 3_600_000);
      const onTheHour = await send(registrationBy(casey));

      expectRefused(oneMillisecondEarly, TOO_MANY_REGISTRATIONS);
      expectRegistered(onTheHour, casey);
    });

    test('[SHARING-41.1] counts the registrations of the last hour, not of a fixed hour', async () => {
      comeFrom(BUSY);
      await registerNew(10);
      setTime(T + 1_800_000);
      await registerNew(20);

      // The 10 from T are an hour old; the 20 from half past are not.
      setTime(T + 3_600_000);
      await registerNew(10);
      const eleventh = await send(registrationBy(newPhone()));

      expectRefused(eleventh, TOO_MANY_REGISTRATIONS);
    });

    test('[SHARING-41.1] does not count, or refuse, a device that registers again', async () => {
      comeFrom(BUSY);
      const [first] = await registerNew(30);

      setTime(T + 1_000);
      const again = await send(registrationBy(first));

      expectRegistered(again, first);
    });

    test('[SHARING-41.1] does not count a device that registers again towards the 30', async () => {
      comeFrom(BUSY);
      const [first] = await registerNew(29);
      for (let index = 0; index < 5; index += 1) {
        expectRegistered(await send(registrationBy(first)), first);
      }

      const thirtieth = await send(registrationBy(newPhone(CASEY)));
      const thirtyFirst = await send(registrationBy(newPhone()));

      expect(thirtieth.status).toBe(200);
      expectRefused(thirtyFirst, TOO_MANY_REGISTRATIONS);
    });

    test('[SHARING-41.1] does not count the registrations it refused', async () => {
      comeFrom(BUSY);
      for (let index = 0; index < 40; index += 1) {
        expectRefused(
          await send(
            withField(registrationBy(newPhone()), 'signature', '0'.repeat(128)),
          ),
          SIGNATURE,
        );
      }

      await registerNew(30);

      // Nor those it refused for the limit. Had the five at half past counted, only 25
      // could register once the 30 from T are an hour old.
      setTime(T + 1_800_000);
      for (let index = 0; index < 5; index += 1) {
        expectRefused(
          await send(registrationBy(newPhone())),
          TOO_MANY_REGISTRATIONS,
        );
      }
      setTime(T + 3_600_000);
      await registerNew(30);
      expectRefused(
        await send(registrationBy(newPhone())),
        TOO_MANY_REGISTRATIONS,
      );
    });

    test('[SHARING-41.1] registers exactly 30 of 40 new devices whose registrations arrive together', async () => {
      comeFrom(BUSY);
      const phones = Array.from({ length: 40 }, () => newPhone());

      const answers = await Promise.all(
        phones.map((phone) => send(registrationBy(phone))),
      );

      const accepted = phones.filter(
        (_, index) => answers[index].status === 200,
      );
      const refused = phones.filter(
        (_, index) => answers[index].status !== 200,
      );
      expect(accepted).toHaveLength(30);
      expect(refused).toHaveLength(10);
      phones.forEach((phone, index) => {
        if (answers[index].status === 200) {
          expectRegistered(answers[index], phone);
        } else {
          expectRefused(answers[index], TOO_MANY_REGISTRATIONS);
        }
      });
      for (const phone of accepted) expectPassed(await send(signedBy(phone)));
      for (const phone of refused) await expectNotRegistered(phone);
    });

    test('[SHARING-41.1] counts IPv6 addresses with the same first 64 bits as one IP', async () => {
      comeFrom('2001:db8:1:2::1');
      await registerNew(15);
      comeFrom('2001:db8:1:2:aaaa:bbbb:cccc:dddd');
      await registerNew(15);

      comeFrom('2001:0db8:0001:0002:ffff:ffff:ffff:ffff');
      const sameFirst64Bits = await send(registrationBy(newPhone()));
      comeFrom('2001:DB8:1:2::2');
      const inCapitals = await send(registrationBy(newPhone()));
      comeFrom('2001:db8:1:3::1');
      const otherFirst64Bits = await send(registrationBy(newPhone(CASEY)));

      expectRefused(sameFirst64Bits, TOO_MANY_REGISTRATIONS);
      expectRefused(inCapitals, TOO_MANY_REGISTRATIONS);
      expect(otherFirst64Bits.status).toBe(200);
    });

    test('[SHARING-41.1] counts an IPv4 address written as IPv6 as that IPv4 address', async () => {
      comeFrom(BUSY);
      await registerNew(15);
      comeFrom(`::ffff:${BUSY}`);
      await registerNew(15);

      const writtenAsIpv6 = await send(registrationBy(newPhone()));
      comeFrom(BUSY);
      const writtenAsIpv4 = await send(registrationBy(newPhone()));
      comeFrom('::ffff:198.51.100.21');
      const another = await send(registrationBy(newPhone(CASEY)));

      expectRefused(writtenAsIpv6, TOO_MANY_REGISTRATIONS);
      expectRefused(writtenAsIpv4, TOO_MANY_REGISTRATIONS);
      expect(another.status).toBe(200);
    });
  });

  describe('SHARING-31.2', () => {
    const EARLY = T - 3_600_000;
    const emptyRegistration = (phone: Phone, timestampMs = T) =>
      signedBy(phone, {
        method: 'POST',
        path: DEVICES_PATH,
        body: '{}',
        timestampMs,
      });

    test('[SHARING-31.2] checks the fields of a registration before its body', async () => {
      const casey = newPhone(CASEY);

      const answer = await leavingTheDatabaseAsItWas(() =>
        send(withField(emptyRegistration(casey), 'signature', undefined)),
      );

      expectRefused(answer, SIGNATURE);
    });

    test('[SHARING-31.2] checks the body of a registration before its signature and its time', async () => {
      const casey = newPhone(CASEY);

      for (const request of [
        withField(
          emptyRegistration(casey, EARLY),
          'signature',
          '0'.repeat(128),
        ),
        emptyRegistration(casey, EARLY),
        withField(emptyRegistration(casey), 'signature', '0'.repeat(128)),
      ]) {
        const answer = await leavingTheDatabaseAsItWas(() => send(request));

        expectRefused(answer, REQUEST);
      }
    });

    test('[SHARING-31.2] checks whose device ID a registration names before its time', async () => {
      await registered(TAYLOR);
      const casey = newPhone(TAYLOR);

      const answer = await leavingTheDatabaseAsItWas(() =>
        send(registrationBy(casey, { timestampMs: EARLY })),
      );

      expectRefused(answer, SIGNATURE);
    });

    test("[SHARING-31.2] checks the time of a registration before its IP's limit, and the limit last", async () => {
      comeFrom('198.51.100.40');
      await registerNew(30);
      const casey = newPhone(CASEY);

      const early = await leavingTheDatabaseAsItWas(() =>
        send(registrationBy(casey, { timestampMs: EARLY })),
      );
      const onTime = await leavingTheDatabaseAsItWas(() =>
        send(registrationBy(casey)),
      );

      expectRefused(early, { error: 'clock', serverTimeMs: T });
      expectRefused(onTime, TOO_MANY_REGISTRATIONS);
    });
  });

  describe('SHARING-44.1', () => {
    test.each([
      ['an empty text', ''],
      ['no IP address', 'unknown'],
      ['a host name', 'localhost'],
    ])(
      '[SHARING-44.1] registers no new device when where the request came from is %s',
      async (_, source) => {
        const taylor = await registered(TAYLOR);
        const casey = newPhone(CASEY);
        comeFrom(source);

        const answer = await leavingTheDatabaseAsItWas(() =>
          send(registrationBy(casey)),
        );

        expect(answer.status).toBe(500);
        await expectNotRegistered(casey);
        // A device that has registered goes on as before.
        expectPassed(await send(signedBy(taylor)));
        expectRegistered(await send(registrationBy(taylor)), taylor);
        // And so does Casey's, once the API knows where requests come from.
        comeFrom(HOME);
        await register(casey);
      },
    );

    test('[SHARING-44.1] still gives a registration that fails another check that reason', async () => {
      const casey = newPhone(CASEY);
      comeFrom('unknown');

      const badSignature = await send(
        withField(registrationBy(casey), 'signature', '0'.repeat(128)),
      );
      const early = await send(
        registrationBy(casey, { timestampMs: T - 3_600_000 }),
      );

      expectRefused(badSignature, SIGNATURE);
      expectRefused(early, { error: 'clock', serverTimeMs: T });
    });
  });

  describe('SHARING-42.1', () => {
    const AGENT = { 'user-agent': 'CaseysPhone/1.0' };
    const withAgent = <R extends { headers: Record<string, string> }>(
      request: R,
    ): R => ({ ...request, headers: { ...request.headers, ...AGENT } });

    test('[SHARING-42.1] stores the device ID and the public key, and neither the IP, a plain digest of it, nor another header', async () => {
      const casey = newPhone(CASEY);

      expectRegistered(await send(withAgent(registrationBy(casey))), casey);
      expectPassed(await send(withAgent(signedBy(casey))));

      expect(await timesDeviceIdStored(CASEY)).toBeGreaterThan(0);
      expect(await timesPublicKeyStored(casey)).toBeGreaterThan(0);
      expect(await timesStored(HOME)).toBe(0);
      expect(await timesStored(Uint8Array.of(203, 0, 113, 7))).toBe(0);
      for (const digest of plainDigestsOf(HOME)) {
        expect(await timesStored(digest)).toBe(0);
      }
      for (const digest of plainDigestsOf(Uint8Array.of(203, 0, 113, 7))) {
        expect(await timesStored(digest)).toBe(0);
      }
      expect(await timesStored('CaseysPhone')).toBe(0);
    });

    test('[SHARING-42.1] stores no IPv6 address, none of its first 64 bits, and no plain digest of them', async () => {
      const address = '2001:db8:1:2::1';
      const prefixBytes = Uint8Array.of(0x20, 0x01, 0x0d, 0xb8, 0, 1, 0, 2);
      const addressBytes = Uint8Array.of(
        ...prefixBytes,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        1,
      );
      const writings = [
        address,
        '2001:db8:1:2',
        '2001:0db8:0001:0002',
        '2001:db8:1:2::',
        '2001:db8:1:2::/64',
      ];
      comeFrom(address);

      await register(newPhone(CASEY));

      expect(await timesDeviceIdStored(CASEY)).toBeGreaterThan(0);
      for (const writing of writings) {
        expect(await timesStored(writing)).toBe(0);
        for (const digest of plainDigestsOf(writing)) {
          expect(await timesStored(digest)).toBe(0);
        }
      }
      for (const bytes of [prefixBytes, addressBytes]) {
        expect(await timesStored(bytes)).toBe(0);
        for (const digest of plainDigestsOf(bytes)) {
          expect(await timesStored(digest)).toBe(0);
        }
      }
    });

    test('[SHARING-42.1] stores nothing about a phone whose registration it refused', async () => {
      const casey = newPhone(CASEY);

      const answer = await send(
        withAgent(
          withField(registrationBy(casey), 'signature', '0'.repeat(128)),
        ),
      );

      expectRefused(answer, { error: 'signature' });
      expect(await timesDeviceIdStored(CASEY)).toBe(0);
      expect(await timesPublicKeyStored(casey)).toBe(0);
      expect(await timesStored(HOME)).toBe(0);
    });
  });
});

describe.each([
  ['no key', null],
  ['an empty key', ''],
])('with %s for the keyed hash of an IP', (_, ipHashKey) => {
  useSharingApi({ ipHashKey });

  test('[SHARING-44.1] registers no new device, and stores nothing', async () => {
    const casey = newPhone(CASEY);

    const answer = await leavingTheDatabaseAsItWas(() =>
      send(registrationBy(casey)),
    );
    const again = await leavingTheDatabaseAsItWas(() =>
      send(registrationBy(casey)),
    );

    expect(answer.status).toBe(500);
    expect(again.status).toBe(500);
    await expectNotRegistered(casey);
    expect(await timesDeviceIdStored(CASEY)).toBe(0);
    expect(await timesPublicKeyStored(casey)).toBe(0);
  });

  test('[SHARING-44.1] still refuses a registration that fails another check for that reason', async () => {
    const casey = newPhone(CASEY);

    const badSignature = await send(
      withField(registrationBy(casey), 'signature', '0'.repeat(128)),
    );
    const noBody = await send(
      signedBy(casey, { method: 'POST', path: DEVICES_PATH }),
    );

    expectRefused(badSignature, { error: 'signature' });
    expectRefused(noBody, { error: 'request' });
  });
});

describe('with the server left to find where a request comes from', () => {
  useSharingApi({ ownClientIp: false });

  test("[SHARING-41.1] counts by the connection's address, whatever address the request claims in a header", async () => {
    await registerNew(30);
    const late = newPhone(CASEY);
    const registration = registrationBy(late);

    const answer = await send({
      ...registration,
      headers: {
        ...registration.headers,
        'x-forwarded-for': '198.51.100.99',
        'cf-connecting-ip': '198.51.100.99',
        'x-real-ip': '198.51.100.99',
        forwarded: 'for=198.51.100.99',
      },
    });

    expectRefused(answer, { error: 'too-many-registrations' });
  });
});
