// This import comes first: it takes Web Crypto away before the tools load.
import { restoreWebCrypto } from './sharing-crypto-remove-web-crypto';
import nodeCrypto from 'node:crypto';
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
} from './sharing-crypto-vectors';

afterAll(restoreWebCrypto);

test('[SHARING-14.1] gives the same results where the runtime has no Web Crypto, and asks it for no random numbers', () => {
  expect('crypto' in globalThis).toBe(false);
  const sources = {
    'Math.random': jest.spyOn(Math, 'random'),
    randomBytes: jest.spyOn(nodeCrypto, 'randomBytes'),
    randomFillSync: jest.spyOn(nodeCrypto, 'randomFillSync'),
    randomInt: jest.spyOn(nodeCrypto, 'randomInt'),
    randomUUID: jest.spyOn(nodeCrypto, 'randomUUID'),
    'webcrypto.getRandomValues': jest.spyOn(
      nodeCrypto.webcrypto,
      'getRandomValues',
    ),
  };

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
  const asked = Object.entries(sources)
    .filter(([, source]) => source.mock.calls.length > 0)
    .map(([name]) => name);
  Object.values(sources).forEach((source) => source.mockRestore());

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
  expect(asked).toEqual([]);
});
