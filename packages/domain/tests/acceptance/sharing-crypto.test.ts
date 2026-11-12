import { webcrypto } from 'node:crypto';
import {
  boxPublicKey,
  decrypt,
  deriveKey,
  encrypt,
  openBox,
  sealBox,
  sign,
  signingPublicKey,
  type OpenResult,
} from '../../src/crypto';
import {
  ALICE,
  BOB,
  BOX,
  CAROL,
  DERIVED,
  DERIVED_FROM_TEXT,
  DRAFT,
  ED25519_TESTS,
  HKDF_TESTS,
  LOW_ORDER_PUBLIC_KEYS,
  SHARED_SECRET,
  X25519_ONE_ITERATION,
  X25519_TESTS,
  bytesFrom,
  concat,
  eachBitFlipped,
  flipBit,
  fromHex,
  insideLargerBuffer,
  toHex,
  utf8,
  webCryptoVerifies,
} from './sharing-crypto-vectors';

type Failure = 'undecryptable' | 'unsupported-version';

afterEach(() => {
  jest.restoreAllMocks();
});

const EMPTY = new Uint8Array(0);
const UNDECRYPTABLE = { ok: false, reason: 'undecryptable' };
const UNSUPPORTED_VERSION = { ok: false, reason: 'unsupported-version' };

/** A result with its content as hex, which a failed comparison prints in full. */
const shown = (result: OpenResult) =>
  result.ok ? { ok: true, plaintext: toHex(result.plaintext) } : result;
const opened = (plaintext: Uint8Array) => ({
  ok: true,
  plaintext: toHex(plaintext),
});

/** Where a changed input did not make `open` report `reason`, with no content. */
function exceptions<T>(
  reason: Failure,
  cases: [where: string, input: T][],
  open: (input: T) => OpenResult,
): string[] {
  return cases
    .filter(([, input]) => {
      const result: { ok: boolean; reason?: string; plaintext?: unknown } =
        open(input);
      return (
        result.ok || result.reason !== reason || result.plaintext !== undefined
      );
    })
    .map(([where]) => where);
}

/** A copy whose first byte, the format version, is `version`. */
function withVersion(bytes: Uint8Array, version: number): Uint8Array {
  const changed = Uint8Array.from(bytes);
  changed[0] = version;
  return changed;
}

// SHARING-1.1's first scenario: the draft's key, nonce, associated data and plaintext,
// and the 155 bytes they encrypt to.
const key = fromHex(DRAFT.key);
const nonce = fromHex(DRAFT.nonce);
const associatedData = fromHex(DRAFT.associatedData);
const plaintext = utf8(DRAFT.plaintext);
const sealed = fromHex(`01${DRAFT.nonce}${DRAFT.ciphertext}${DRAFT.tag}`);

const alice = {
  secretKey: fromHex(ALICE.secretKey),
  publicKey: fromHex(ALICE.publicKey),
};
const bob = {
  secretKey: fromHex(BOB.secretKey),
  publicKey: fromHex(BOB.publicKey),
};
const carol = {
  secretKey: fromHex(CAROL.secretKey),
  publicKey: fromHex(CAROL.publicKey),
};

// SHARING-8.1's scenarios: what Alice seals for Bob, and how Bob opens it.
const context = fromHex(BOX.context);
const content = fromHex(BOX.plaintext);
const salt = fromHex(BOX.salt);
const box = fromHex(BOX.sealed);
const boxWithSalt = fromHex(BOX.sealedWithSalt);
const aliceSeals = {
  senderSecretKey: alice.secretKey,
  recipientPublicKey: bob.publicKey,
  context,
  nonce: fromHex(BOX.nonce),
  plaintext: content,
};
const bobOpens = {
  recipientSecretKey: bob.secretKey,
  senderPublicKey: alice.publicKey,
  context,
};

interface BoxParts {
  senderPublicKey: Uint8Array;
  recipientPublicKey: Uint8Array;
  context: Uint8Array;
  salt?: Uint8Array;
  nonce: Uint8Array;
  plaintext: Uint8Array;
}

/**
 * The box of SHARING-8.1, put together from SHARING-12.1 and SHARING-1.1 by someone who
 * knows the two keys' shared secret.
 */
function boxFrom(sharedSecret: Uint8Array, parts: BoxParts): Uint8Array {
  const boxKey = deriveKey({
    secret: sharedSecret,
    purpose: concat(
      utf8(BOX.label),
      parts.senderPublicKey,
      parts.recipientPublicKey,
      parts.context,
    ),
    ...(parts.salt && { salt: parts.salt }),
  });
  return encrypt({
    key: boxKey,
    nonce: parts.nonce,
    plaintext: parts.plaintext,
    associatedData: EMPTY,
  });
}

/** Each content, context and salt of the "各種內容、情境和 salt" scenarios. */
const BOX_VARIETIES = [EMPTY, content, bytesFrom(9, 1000)].flatMap(
  (boxContent) =>
    [EMPTY, context, bytesFrom(0x21, 100)].flatMap((boxContext) =>
      [undefined, salt].map((boxSalt) => ({
        label: `${boxContent.length} bytes, a context of ${boxContext.length} bytes, ${boxSalt ? 'a salt' : 'no salt'}`,
        parts: {
          context: boxContext,
          plaintext: boxContent,
          ...(boxSalt && { salt: boxSalt }),
        },
      })),
    ),
);

// Encrypting

test("[SHARING-1.1][SHARING-13.1] encrypts the draft's A.3.1 plaintext to 01, the nonce, and its ciphertext and tag", () => {
  expect(plaintext).toHaveLength(114);
  const ciphertext = encrypt({ key, nonce, plaintext, associatedData });
  expect(toHex(ciphertext)).toBe(
    `01${DRAFT.nonce}${DRAFT.ciphertext}${DRAFT.tag}`,
  );
  expect(ciphertext).toHaveLength(155);
});

test('[SHARING-1.1] encrypts empty content to 01, the nonce and a tag', () => {
  const ciphertext = encrypt({ key, nonce, plaintext: EMPTY, associatedData });
  expect(toHex(ciphertext)).toBe(`01${DRAFT.nonce}${DRAFT.emptyTag}`);
  expect(ciphertext).toHaveLength(41);
});

test.each([1, 1000, 65_536, 262_144])(
  '[SHARING-1.1] encrypts %i bytes to 41 bytes more, starting with 01 and the nonce',
  (size) => {
    const ciphertext = encrypt({
      key,
      nonce,
      plaintext: bytesFrom(0, size),
      associatedData,
    });
    expect(ciphertext).toHaveLength(size + 41);
    expect(toHex(ciphertext.subarray(0, 25))).toBe(`01${DRAFT.nonce}`);
  },
);

// Decrypting

test("[SHARING-2.1][SHARING-13.1] decrypts the draft's A.3.1 ciphertext to its plaintext", () => {
  expect(shown(decrypt({ key, ciphertext: sealed, associatedData }))).toEqual(
    opened(plaintext),
  );
});

test.each([0, 1, 1000, 65_536, 262_144])(
  '[SHARING-2.1] decrypts %i bytes back to what was encrypted, with and without associated data',
  (size) => {
    const original = bytesFrom(7, size);
    const otherKey = bytesFrom(0x11, 32);
    const otherNonce = bytesFrom(0xc8, 24);
    for (const bound of [EMPTY, associatedData]) {
      const ciphertext = encrypt({
        key: otherKey,
        nonce: otherNonce,
        plaintext: original,
        associatedData: bound,
      });
      expect(
        shown(decrypt({ key: otherKey, ciphertext, associatedData: bound })),
      ).toEqual(opened(original));
    }
  },
);

test('[SHARING-1.1][SHARING-2.1] encrypts and decrypts inputs that are views into larger buffers', () => {
  expect(
    toHex(
      encrypt({
        key: insideLargerBuffer(key),
        nonce: insideLargerBuffer(nonce),
        plaintext: insideLargerBuffer(plaintext),
        associatedData: insideLargerBuffer(associatedData),
      }),
    ),
  ).toBe(toHex(sealed));
  expect(
    shown(
      decrypt({
        key: insideLargerBuffer(key),
        ciphertext: insideLargerBuffer(sealed),
        associatedData: insideLargerBuffer(associatedData),
      }),
    ),
  ).toEqual(opened(plaintext));
});

test('[SHARING-3.1] reports undecryptable when any one bit after the format version is changed', () => {
  expect(shown(decrypt({ key, ciphertext: sealed, associatedData }))).toEqual(
    opened(plaintext),
  );
  expect(
    exceptions('undecryptable', eachBitFlipped(sealed, 1), (ciphertext) =>
      decrypt({ key, ciphertext, associatedData }),
    ),
  ).toEqual([]);
});

test.each<[string, Uint8Array]>([
  ['its last byte cut off', sealed.subarray(0, sealed.length - 1)],
  ['one more byte at its end', concat(sealed, fromHex('00'))],
  ['only its first 41 bytes', sealed.subarray(0, 41)],
  ['only its first 40 bytes', sealed.subarray(0, 40)],
  ['only its format version', sealed.subarray(0, 1)],
  ['no bytes at all', EMPTY],
])(
  '[SHARING-3.1] reports undecryptable for the ciphertext with %s',
  (_, ciphertext) => {
    expect(shown(decrypt({ key, ciphertext: sealed, associatedData }))).toEqual(
      opened(plaintext),
    );
    expect(decrypt({ key, ciphertext, associatedData })).toEqual(UNDECRYPTABLE);
  },
);

test('[SHARING-3.1] reports undecryptable under a key that differs in any one bit', () => {
  expect(shown(decrypt({ key, ciphertext: sealed, associatedData }))).toEqual(
    opened(plaintext),
  );
  expect(
    exceptions('undecryptable', eachBitFlipped(key), (otherKey) =>
      decrypt({ key: otherKey, ciphertext: sealed, associatedData }),
    ),
  ).toEqual([]);
});

test('[SHARING-3.1] reports undecryptable when the associated data is not what was encrypted with', () => {
  expect(shown(decrypt({ key, ciphertext: sealed, associatedData }))).toEqual(
    opened(plaintext),
  );
  expect(
    exceptions(
      'undecryptable',
      [
        ...eachBitFlipped(associatedData),
        ['its last byte cut off', associatedData.subarray(0, 11)],
        ['one more byte', concat(associatedData, fromHex('00'))],
        ['empty', EMPTY],
      ],
      (other) => decrypt({ key, ciphertext: sealed, associatedData: other }),
    ),
  ).toEqual([]);

  const unbound = encrypt({ key, nonce, plaintext, associatedData: EMPTY });
  expect(
    shown(decrypt({ key, ciphertext: unbound, associatedData: EMPTY })),
  ).toEqual(opened(plaintext));
  expect(
    decrypt({ key, ciphertext: unbound, associatedData: fromHex('00') }),
  ).toEqual(UNDECRYPTABLE);
});

test('[SHARING-4.1] reports unsupported-version for every first byte other than 01', () => {
  expect(shown(decrypt({ key, ciphertext: sealed, associatedData }))).toEqual(
    opened(plaintext),
  );
  const others = Array.from({ length: 256 }, (_, version) => version).filter(
    (version) => version !== 1,
  );
  expect(
    exceptions(
      'unsupported-version',
      others.map((version) => [
        `first byte ${version}`,
        withVersion(sealed, version),
      ]),
      (ciphertext) => decrypt({ key, ciphertext, associatedData }),
    ),
  ).toEqual([]);
});

test('[SHARING-4.1] reports unsupported-version whatever the rest of the ciphertext, the key and the associated data are', () => {
  for (const only of ['00', '02', 'ff']) {
    expect(decrypt({ key, ciphertext: fromHex(only), associatedData })).toEqual(
      UNSUPPORTED_VERSION,
    );
  }
  expect(
    decrypt({
      key: flipBit(key, 0),
      ciphertext: withVersion(sealed, 2),
      associatedData: EMPTY,
    }),
  ).toEqual(UNSUPPORTED_VERSION);
});

test('[SHARING-4.1] reports unsupported-version for a box whose first byte is not 01', () => {
  expect(shown(openBox({ ...bobOpens, box }))).toEqual(opened(content));
  const newer = withVersion(box, 2);
  expect(openBox({ ...bobOpens, box: newer })).toEqual(UNSUPPORTED_VERSION);
  expect(
    openBox({
      recipientSecretKey: bob.secretKey,
      senderPublicKey: carol.publicKey,
      context: EMPTY,
      box: newer,
    }),
  ).toEqual(UNSUPPORTED_VERSION);
  expect(openBox({ ...bobOpens, senderPublicKey: EMPTY, box: newer })).toEqual(
    UNSUPPORTED_VERSION,
  );
});

// Signing

test.each(ED25519_TESTS)(
  '[SHARING-5.1][SHARING-13.1] RFC 8032 $name: the public key of its secret key',
  ({ secretKey, publicKey }) => {
    expect(toHex(signingPublicKey(fromHex(secretKey)))).toBe(publicKey);
  },
);

test.each(ED25519_TESTS)(
  '[SHARING-6.1][SHARING-13.1] RFC 8032 $name: the signature of its message',
  ({ secretKey, message, signature }) => {
    expect(
      toHex(sign({ secretKey: fromHex(secretKey), message: fromHex(message) })),
    ).toBe(signature);
  },
);

test.each([0, 1, 200, 65_536])(
  '[SHARING-6.1] Web Crypto verifies the signature of %i bytes with the public key, and nothing else',
  async (size) => {
    const verifies = (
      publicKey: Uint8Array,
      signature: Uint8Array,
      message: Uint8Array,
    ) => webCryptoVerifies(webcrypto.subtle, publicKey, signature, message);
    const secretKey = bytesFrom(0x30, 32);
    const publicKey = signingPublicKey(secretKey);
    const message = bytesFrom(3, size);
    const signature = sign({ secretKey, message });
    expect(publicKey).toHaveLength(32);
    expect(signature).toHaveLength(64);
    expect(await verifies(publicKey, signature, message)).toBe(true);

    const otherMessage = concat(message, fromHex('00'));
    expect(await verifies(publicKey, signature, otherMessage)).toBe(false);
    for (const index of [0, 31, 32, 63]) {
      expect(
        await verifies(publicKey, flipBit(signature, index), message),
      ).toBe(false);
    }
    const otherPublicKey = signingPublicKey(bytesFrom(0x31, 32));
    expect(await verifies(otherPublicKey, signature, message)).toBe(false);
  },
);

test('[SHARING-5.1][SHARING-6.1] gives the public key and the signature when the secret key and the message are views into larger buffers', () => {
  const [, , test3] = ED25519_TESTS;
  const secretKey = insideLargerBuffer(fromHex(test3.secretKey));
  const message = insideLargerBuffer(fromHex(test3.message));
  expect(toHex(signingPublicKey(secretKey))).toBe(test3.publicKey);
  expect(toHex(sign({ secretKey, message }))).toBe(test3.signature);
});

// Boxes

test.each([
  ['Alice', ALICE],
  ['Bob', BOB],
])(
  "[SHARING-7.1][SHARING-13.1] RFC 7748 6.1: the box public key of %s's secret key",
  (_, pair) => {
    expect(toHex(boxPublicKey(fromHex(pair.secretKey)))).toBe(pair.publicKey);
  },
);

test('[SHARING-7.1][SHARING-13.1] RFC 7748 5.2: after one iteration, the box public key of the base point as a secret key', () => {
  expect(toHex(boxPublicKey(fromHex(X25519_ONE_ITERATION.secretKey)))).toBe(
    X25519_ONE_ITERATION.publicKey,
  );
});

test.each([
  CAROL,
  ...X25519_TESTS.map(({ scalar, publicKey }) => ({
    secretKey: scalar,
    publicKey,
  })),
])(
  '[SHARING-7.1] gives the box public key of the secret key $secretKey',
  ({ secretKey, publicKey }) => {
    expect(toHex(boxPublicKey(fromHex(secretKey)))).toBe(publicKey);
  },
);

test.each(X25519_TESTS)(
  '[SHARING-8.1][SHARING-13.1] RFC 7748 5.2, $name vector: its scalar seals a box for its u-coordinate under a key from its output',
  ({ scalar, u, output, publicKey, sealed: expected }) => {
    const parts = { context, nonce: aliceSeals.nonce, plaintext: content };
    const made = sealBox({
      senderSecretKey: fromHex(scalar),
      recipientPublicKey: fromHex(u),
      ...parts,
    });
    expect(toHex(made)).toBe(expected);
    // The same box from the RFC's output: the u-coordinate goes into the key as given.
    expect(toHex(made)).toBe(
      toHex(
        boxFrom(fromHex(output), {
          senderPublicKey: fromHex(publicKey),
          recipientPublicKey: fromHex(u),
          ...parts,
        }),
      ),
    );
  },
);

test.each(X25519_TESTS)(
  '[SHARING-9.1][SHARING-13.1] RFC 7748 5.2, $name vector: its scalar opens a box from its u-coordinate sealed under a key from its output',
  ({ scalar, u, output, publicKey }) => {
    const received = boxFrom(fromHex(output), {
      senderPublicKey: fromHex(u),
      recipientPublicKey: fromHex(publicKey),
      context,
      nonce: aliceSeals.nonce,
      plaintext: content,
    });
    expect(
      shown(
        openBox({
          recipientSecretKey: fromHex(scalar),
          senderPublicKey: fromHex(u),
          context,
          box: received,
        }),
      ),
    ).toEqual(opened(content));
  },
);

test("[SHARING-8.1][SHARING-13.1] seals Alice's box for Bob under a key from RFC 7748 6.1's shared secret", () => {
  const made = sealBox(aliceSeals);
  expect(toHex(made)).toBe(BOX.sealed);
  expect(made).toHaveLength(73);
});

test('[SHARING-8.1] seals under another key when given a salt', () => {
  expect(toHex(sealBox({ ...aliceSeals, salt }))).toBe(BOX.sealedWithSalt);
});

test('[SHARING-8.1] seals with no salt as with 32 zero bytes', () => {
  expect(toHex(sealBox({ ...aliceSeals, salt: new Uint8Array(32) }))).toBe(
    BOX.sealed,
  );
});

test('[SHARING-8.1] seals each content, context and salt as the ciphertext under the key derived from the shared secret', () => {
  const different = BOX_VARIETIES.filter(({ parts }) => {
    const made = sealBox({
      senderSecretKey: alice.secretKey,
      recipientPublicKey: bob.publicKey,
      nonce: aliceSeals.nonce,
      ...parts,
    });
    const expected = boxFrom(fromHex(SHARED_SECRET), {
      senderPublicKey: alice.publicKey,
      recipientPublicKey: bob.publicKey,
      nonce: aliceSeals.nonce,
      ...parts,
    });
    return toHex(made) !== toHex(expected);
  });
  expect(different.map(({ label }) => label)).toEqual([]);
});

test('[SHARING-8.1] seals the same box when every input is a view into a larger buffer', () => {
  const inside = {
    senderSecretKey: insideLargerBuffer(alice.secretKey),
    recipientPublicKey: insideLargerBuffer(bob.publicKey),
    context: insideLargerBuffer(context),
    nonce: insideLargerBuffer(aliceSeals.nonce),
    plaintext: insideLargerBuffer(content),
  };
  expect(toHex(sealBox(inside))).toBe(BOX.sealed);
  expect(toHex(sealBox({ ...inside, salt: insideLargerBuffer(salt) }))).toBe(
    BOX.sealedWithSalt,
  );
});

test("[SHARING-9.1][SHARING-13.1] Bob opens Alice's box, sealed under a key from RFC 7748 6.1's shared secret", () => {
  expect(shown(openBox({ ...bobOpens, box }))).toEqual(opened(content));
});

test("[SHARING-9.1] Bob opens Alice's box sealed with a salt when he gives the same salt", () => {
  expect(shown(openBox({ ...bobOpens, salt, box: boxWithSalt }))).toEqual(
    opened(content),
  );
});

test('[SHARING-9.1] opens a box sealed with no salt when given 32 zero bytes', () => {
  expect(
    shown(openBox({ ...bobOpens, salt: new Uint8Array(32), box })),
  ).toEqual(opened(content));
});

test('[SHARING-9.1] opens each content, context and salt sealed between two other phones', () => {
  const daveSecretKey = bytesFrom(0xd0, 32);
  const davePublicKey = boxPublicKey(daveSecretKey);
  const unopened = BOX_VARIETIES.filter(({ parts }) => {
    const made = sealBox({
      senderSecretKey: carol.secretKey,
      recipientPublicKey: davePublicKey,
      nonce: bytesFrom(0x70, 24),
      ...parts,
    });
    const result = openBox({
      recipientSecretKey: daveSecretKey,
      senderPublicKey: carol.publicKey,
      context: parts.context,
      ...(parts.salt && { salt: parts.salt }),
      box: made,
    });
    return !result.ok || toHex(result.plaintext) !== toHex(parts.plaintext);
  });
  expect(unopened.map(({ label }) => label)).toEqual([]);
});

test('[SHARING-9.1] opens the box when every input is a view into a larger buffer', () => {
  expect(
    shown(
      openBox({
        recipientSecretKey: insideLargerBuffer(bob.secretKey),
        senderPublicKey: insideLargerBuffer(alice.publicKey),
        context: insideLargerBuffer(context),
        salt: insideLargerBuffer(salt),
        box: insideLargerBuffer(boxWithSalt),
      }),
    ),
  ).toEqual(opened(content));
});

test('[SHARING-10.1] reports undecryptable when another phone opens the box', () => {
  expect(shown(openBox({ ...bobOpens, box }))).toEqual(opened(content));
  expect(
    openBox({ ...bobOpens, recipientSecretKey: carol.secretKey, box }),
  ).toEqual(UNDECRYPTABLE);
});

test('[SHARING-10.1] reports undecryptable when the sender named is not the one who sealed the box', () => {
  expect(shown(openBox({ ...bobOpens, box }))).toEqual(opened(content));
  expect(
    exceptions(
      'undecryptable',
      [
        ['the third phone', carol.publicKey],
        ['Bob himself', bob.publicKey],
        ...eachBitFlipped(alice.publicKey),
        ['no bytes', EMPTY],
        ['31 bytes', alice.publicKey.subarray(0, 31)],
        ['33 bytes', concat(alice.publicKey, fromHex('00'))],
      ],
      (senderPublicKey) => openBox({ ...bobOpens, senderPublicKey, box }),
    ),
  ).toEqual([]);
});

test('[SHARING-10.1] reports undecryptable when the sender opens its box as one the recipient sealed for it', () => {
  expect(shown(openBox({ ...bobOpens, box }))).toEqual(opened(content));
  expect(
    openBox({
      recipientSecretKey: alice.secretKey,
      senderPublicKey: bob.publicKey,
      context,
      box,
    }),
  ).toEqual(UNDECRYPTABLE);
});

test('[SHARING-10.1] reports undecryptable when the context is not the one the box was sealed with', () => {
  expect(shown(openBox({ ...bobOpens, box }))).toEqual(opened(content));
  expect(
    exceptions(
      'undecryptable',
      [
        ...eachBitFlipped(context),
        ['its last byte cut off', context.subarray(0, 7)],
        ['one more byte', concat(context, fromHex('00'))],
        ['empty', EMPTY],
      ],
      (other) => openBox({ ...bobOpens, context: other, box }),
    ),
  ).toEqual([]);
});

test('[SHARING-10.1] reports undecryptable when the salt is not the one the box was sealed with', () => {
  expect(shown(openBox({ ...bobOpens, salt, box: boxWithSalt }))).toEqual(
    opened(content),
  );
  expect(openBox({ ...bobOpens, box: boxWithSalt })).toEqual(UNDECRYPTABLE);
  expect(
    exceptions('undecryptable', eachBitFlipped(salt), (other) =>
      openBox({ ...bobOpens, salt: other, box: boxWithSalt }),
    ),
  ).toEqual([]);

  expect(shown(openBox({ ...bobOpens, box }))).toEqual(opened(content));
  expect(openBox({ ...bobOpens, salt, box })).toEqual(UNDECRYPTABLE);
});

test('[SHARING-10.1] reports undecryptable when the box was changed', () => {
  expect(shown(openBox({ ...bobOpens, box }))).toEqual(opened(content));
  expect(
    exceptions(
      'undecryptable',
      [
        ...eachBitFlipped(box, 1),
        ['its last byte cut off', box.subarray(0, box.length - 1)],
        ['one more byte at its end', concat(box, fromHex('00'))],
        ['only its first 41 bytes', box.subarray(0, 41)],
        ['only its first 40 bytes', box.subarray(0, 40)],
        ['only its format version', box.subarray(0, 1)],
        ['no bytes at all', EMPTY],
      ],
      (changed) => openBox({ ...bobOpens, box: changed }),
    ),
  ).toEqual([]);
});

test.each(LOW_ORDER_PUBLIC_KEYS)(
  '[SHARING-11.1] refuses to seal a box for the low-order public key %s',
  (publicKey) => {
    expect(() => sealBox(aliceSeals)).not.toThrow();
    expect(() =>
      sealBox({ ...aliceSeals, recipientPublicKey: fromHex(publicKey) }),
    ).toThrow();
  },
);

test.each(LOW_ORDER_PUBLIC_KEYS)(
  '[SHARING-11.1] reports undecryptable for a box that names the low-order public key %s as its sender',
  (publicKey) => {
    // Put together as boxFrom does, Alice's box opens, so a box made the same way from
    // 32 zero bytes is what anyone could make in the name of a low-order key.
    const parts = { context, nonce: aliceSeals.nonce, plaintext: content };
    const honest = boxFrom(fromHex(SHARED_SECRET), {
      senderPublicKey: alice.publicKey,
      recipientPublicKey: bob.publicKey,
      ...parts,
    });
    expect(shown(openBox({ ...bobOpens, box: honest }))).toEqual(
      opened(content),
    );

    const senderPublicKey = fromHex(publicKey);
    const forged = boxFrom(new Uint8Array(32), {
      senderPublicKey,
      recipientPublicKey: bob.publicKey,
      ...parts,
    });
    expect(openBox({ ...bobOpens, senderPublicKey, box: forged })).toEqual(
      UNDECRYPTABLE,
    );
  },
);

// Deriving keys

test.each(DERIVED_FROM_TEXT)(
  '[SHARING-12.1] derives the same key each time from %j for %j, as from their UTF-8 bytes',
  (secret, purpose, derived) => {
    expect(toHex(deriveKey({ secret, purpose }))).toBe(derived);
    expect(toHex(deriveKey({ secret, purpose }))).toBe(derived);
    expect(
      toHex(deriveKey({ secret: utf8(secret), purpose: utf8(purpose) })),
    ).toBe(derived);
  },
);

test('[SHARING-12.1] takes text as UTF-8: 換機碼é is 11 bytes', () => {
  expect(
    toHex(
      deriveKey({
        secret: fromHex('e68f9be6a99fe7a2bcc3a9'),
        purpose: 'example/bundle',
      }),
    ),
  ).toBe(toHex(deriveKey({ secret: '換機碼é', purpose: 'example/bundle' })));
});

test('[SHARING-12.1] derives a key from bytes', () => {
  expect(
    toHex(deriveKey({ secret: bytesFrom(0, 32), purpose: 'example/signing' })),
  ).toBe(DERIVED.fromBytes);
});

test('[SHARING-12.1] derives another key when given a salt', () => {
  expect(
    toHex(
      deriveKey({
        secret: 'example-link-secret',
        purpose: 'example/card',
        salt,
      }),
    ),
  ).toBe(DERIVED.withSalt);
});

test('[SHARING-12.1] derives a different key for each purpose, and for each secret', () => {
  const purposes = ['example/card', 'example/request', 'example/handover'];
  const secrets = ['example-link-secret', 'example-link-secreT', ''];
  const keys = secrets.flatMap((secret) =>
    purposes.map((purpose) => toHex(deriveKey({ secret, purpose }))),
  );
  expect(new Set(keys).size).toBe(9);
  for (const derived of keys) expect(derived).toHaveLength(64);
});

test.each(HKDF_TESTS)(
  '[SHARING-12.1][SHARING-13.1] RFC 5869 $name: the first 32 bytes of its output',
  ({ secret, salt: hkdfSalt, purpose, key: derived }) => {
    expect(
      toHex(
        deriveKey({
          secret: fromHex(secret),
          purpose: fromHex(purpose),
          salt: fromHex(hkdfSalt),
        }),
      ),
    ).toBe(derived);
  },
);

test('[SHARING-12.1][SHARING-13.1] RFC 5869 A.3 has no salt: leaving the salt out gives its output too', () => {
  const [, , noSalt] = HKDF_TESTS;
  expect(
    toHex(
      deriveKey({
        secret: fromHex(noSalt.secret),
        purpose: fromHex(noSalt.purpose),
      }),
    ),
  ).toBe(noSalt.key);
});

test('[SHARING-12.1] derives the same key when the secret, the salt and the purpose are views into larger buffers', () => {
  const [a1] = HKDF_TESTS;
  expect(
    toHex(
      deriveKey({
        secret: insideLargerBuffer(fromHex(a1.secret)),
        salt: insideLargerBuffer(fromHex(a1.salt)),
        purpose: insideLargerBuffer(fromHex(a1.purpose)),
      }),
    ),
  ).toBe(a1.key);
});

// Keys, nonces and salts come from the caller

test('[SHARING-14.1] gives the same result each time for the same input, and never uses Math.random', () => {
  const weakRandom = jest.spyOn(Math, 'random');
  const run = () => ({
    ciphertext: toHex(
      encrypt({
        key: bytesFrom(1, 32),
        nonce: bytesFrom(2, 24),
        plaintext: bytesFrom(3, 100),
        associatedData: bytesFrom(4, 10),
      }),
    ),
    box: toHex(sealBox({ ...aliceSeals, nonce: bytesFrom(5, 24) })),
    boxWithSalt: toHex(
      sealBox({ ...aliceSeals, nonce: bytesFrom(5, 24), salt }),
    ),
    signature: toHex(
      sign({ secretKey: bytesFrom(6, 32), message: bytesFrom(7, 100) }),
    ),
    signingPublicKey: toHex(signingPublicKey(bytesFrom(6, 32))),
    boxPublicKey: toHex(boxPublicKey(bytesFrom(8, 32))),
    derived: toHex(
      deriveKey({ secret: 'example-link-secret', purpose: 'example/card' }),
    ),
  });
  const runs = [run(), run(), run()];
  const asked = weakRandom.mock.calls.length;
  expect(runs[1]).toEqual(runs[0]);
  expect(runs[2]).toEqual(runs[0]);
  expect(asked).toBe(0);
});

// Wrong lengths

test.each([0, 16, 31, 33])(
  '[SHARING-15.1] refuses to encrypt or decrypt under a key of %i bytes',
  (size) => {
    const wrong = bytesFrom(0x80, size);
    expect(() =>
      encrypt({ key, nonce, plaintext, associatedData }),
    ).not.toThrow();
    expect(() =>
      decrypt({ key, ciphertext: sealed, associatedData }),
    ).not.toThrow();
    expect(() =>
      encrypt({ key: wrong, nonce, plaintext, associatedData }),
    ).toThrow();
    for (const ciphertext of [sealed, EMPTY, withVersion(sealed, 2)]) {
      expect(() =>
        decrypt({ key: wrong, ciphertext, associatedData }),
      ).toThrow();
    }
  },
);

test.each([0, 12, 23, 25])(
  '[SHARING-15.1] refuses to encrypt or to seal a box with a nonce of %i bytes',
  (size) => {
    const wrong = bytesFrom(0x40, size);
    expect(() =>
      encrypt({ key, nonce, plaintext, associatedData }),
    ).not.toThrow();
    expect(() => sealBox(aliceSeals)).not.toThrow();
    expect(() =>
      encrypt({ key, nonce: wrong, plaintext, associatedData }),
    ).toThrow();
    expect(() => sealBox({ ...aliceSeals, nonce: wrong })).toThrow();
  },
);

test.each([0, 31, 33, 64])(
  '[SHARING-15.1] refuses a secret key of %i bytes',
  (size) => {
    const wrong = bytesFrom(0x77, size);
    const message = utf8('content');
    expect(() => signingPublicKey(alice.secretKey)).not.toThrow();
    expect(() => sign({ secretKey: alice.secretKey, message })).not.toThrow();
    expect(() => boxPublicKey(alice.secretKey)).not.toThrow();
    expect(() => sealBox(aliceSeals)).not.toThrow();
    expect(() => openBox({ ...bobOpens, box })).not.toThrow();

    expect(() => signingPublicKey(wrong)).toThrow();
    expect(() => sign({ secretKey: wrong, message })).toThrow();
    expect(() => boxPublicKey(wrong)).toThrow();
    expect(() => sealBox({ ...aliceSeals, senderSecretKey: wrong })).toThrow();
    for (const received of [box, EMPTY, withVersion(box, 2)]) {
      expect(() =>
        openBox({ ...bobOpens, recipientSecretKey: wrong, box: received }),
      ).toThrow();
    }
  },
);

test.each([0, 16, 31, 33])(
  '[SHARING-15.1] refuses to seal or open a box with a salt of %i bytes',
  (size) => {
    const wrong = bytesFrom(0x50, size);
    expect(() => sealBox({ ...aliceSeals, salt })).not.toThrow();
    expect(() =>
      openBox({ ...bobOpens, salt, box: boxWithSalt }),
    ).not.toThrow();
    expect(() => sealBox({ ...aliceSeals, salt: wrong })).toThrow();
    for (const received of [boxWithSalt, EMPTY, withVersion(box, 2)]) {
      expect(() =>
        openBox({ ...bobOpens, salt: wrong, box: received }),
      ).toThrow();
    }
  },
);

test.each([0, 31, 33])(
  '[SHARING-15.1] refuses to seal a box for a public key of %i bytes',
  (size) => {
    const wrong = concat(bob.publicKey, fromHex('00')).subarray(0, size);
    expect(() => sealBox(aliceSeals)).not.toThrow();
    expect(() =>
      sealBox({ ...aliceSeals, recipientPublicKey: wrong }),
    ).toThrow();
  },
);
