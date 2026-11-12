// This import comes first: it takes Web Crypto and Buffer away before the tools load, so
// they load and run as on Hermes.
import { restoreGlobals } from './sharing-crypto-like-hermes';
import {
  boxPublicKey,
  decrypt,
  deriveKey,
  encrypt,
  openBox,
  sealBox,
  sign,
  signingPublicKey,
} from '../../src/crypto';
import {
  ALICE,
  BOB,
  BOX,
  DERIVED_FROM_TEXT,
  DRAFT,
  ED25519_TESTS,
  fromHex,
  toHex,
  utf8,
  webCryptoVerifies,
} from './sharing-crypto-vectors';

// Hermes has no Node modules either: in this file, importing `crypto` or `node:crypto`
// fails, for the tools and for whatever they import.
jest.mock('crypto', () => {
  throw new Error('Hermes has no crypto module, so the tools cannot import it');
});

afterEach(() => {
  jest.restoreAllMocks();
});
afterAll(restoreGlobals);

test('[SHARING-14.1] gives the same results where the runtime has no Web Crypto, no Buffer and no crypto module, and never uses Math.random', () => {
  expect('crypto' in globalThis).toBe(false);
  expect('Buffer' in globalThis).toBe(false);
  const weakRandom = jest.spyOn(Math, 'random');

  const key = fromHex(DRAFT.key);
  const associatedData = fromHex(DRAFT.associatedData);
  const sealed = `01${DRAFT.nonce}${DRAFT.ciphertext}${DRAFT.tag}`;
  const [, test2] = ED25519_TESTS;
  const [[secret, purpose, derived]] = DERIVED_FROM_TEXT;
  const opened = (result: ReturnType<typeof decrypt>) =>
    result.ok ? toHex(result.plaintext) : result.reason;
  const results = {
    ciphertext: toHex(
      encrypt({
        key,
        nonce: fromHex(DRAFT.nonce),
        plaintext: utf8(DRAFT.plaintext),
        associatedData,
      }),
    ),
    plaintext: opened(
      decrypt({ key, ciphertext: fromHex(sealed), associatedData }),
    ),
    signingPublicKey: toHex(signingPublicKey(fromHex(test2.secretKey))),
    signature: toHex(
      sign({
        secretKey: fromHex(test2.secretKey),
        message: fromHex(test2.message),
      }),
    ),
    boxPublicKey: toHex(boxPublicKey(fromHex(ALICE.secretKey))),
    box: toHex(
      sealBox({
        senderSecretKey: fromHex(ALICE.secretKey),
        recipientPublicKey: fromHex(BOB.publicKey),
        context: fromHex(BOX.context),
        nonce: fromHex(BOX.nonce),
        plaintext: fromHex(BOX.plaintext),
      }),
    ),
    boxContent: opened(
      openBox({
        recipientSecretKey: fromHex(BOB.secretKey),
        senderPublicKey: fromHex(ALICE.publicKey),
        context: fromHex(BOX.context),
        salt: fromHex(BOX.salt),
        box: fromHex(BOX.sealedWithSalt),
      }),
    ),
    derived: toHex(deriveKey({ secret, purpose })),
  };
  const asked = weakRandom.mock.calls.length;

  expect(results).toEqual({
    ciphertext: sealed,
    plaintext: toHex(utf8(DRAFT.plaintext)),
    signingPublicKey: test2.publicKey,
    signature: test2.signature,
    boxPublicKey: ALICE.publicKey,
    box: BOX.sealed,
    boxContent: BOX.plaintext,
    derived,
  });
  expect(asked).toBe(0);
});

test.each(ED25519_TESTS)(
  '[SHARING-14.1] RFC 8032 $name where the runtime is like Hermes: its public key, and its signature, which Web Crypto verifies',
  async ({ secretKey, publicKey, message, signature }) => {
    expect('crypto' in globalThis).toBe(false);
    const made = sign({
      secretKey: fromHex(secretKey),
      message: fromHex(message),
    });
    expect(toHex(signingPublicKey(fromHex(secretKey)))).toBe(publicKey);
    expect(toHex(made)).toBe(signature);

    // The test itself may reach past the mock for Web Crypto, as the API has one.
    const { webcrypto } =
      jest.requireActual<typeof import('node:crypto')>('node:crypto');
    expect(
      await webCryptoVerifies(
        webcrypto.subtle,
        fromHex(publicKey),
        made,
        fromHex(message),
      ),
    ).toBe(true);
  },
);
