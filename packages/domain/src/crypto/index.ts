import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { ed25519, x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { concatBytes, utf8ToBytes } from '@noble/hashes/utils.js';

// Only the mobile app imports this entry point (ADR-0015). Every key, nonce and
// salt comes from the caller; none of these tools needs a runtime random source.
const FORMAT_VERSION = 1;
const KEY_LENGTH = 32;
const NONCE_LENGTH = 24;
const HEADER_LENGTH = 1 + NONCE_LENGTH;
const TAG_LENGTH = 16;
const EMPTY = new Uint8Array(0);
const BOX_LABEL = utf8ToBytes('shared-expense/box/v1');

/** What decrypting a ciphertext or opening a box gives. A failure carries no content. */
export type OpenResult =
  | { ok: true; plaintext: Uint8Array }
  | { ok: false; reason: 'undecryptable' | 'unsupported-version' };

function requireLength(bytes: Uint8Array, length: number, name: string): void {
  if (bytes.length !== length) {
    throw new Error(`${name} must be ${length} bytes`);
  }
}

function requireBoxSalt(salt: Uint8Array | undefined): void {
  if (salt !== undefined) requireLength(salt, KEY_LENGTH, 'Box salt');
}

/** Check the version before the rest of the envelope or the sender's key. */
function envelopeFailure(
  ciphertext: Uint8Array,
): Extract<OpenResult, { ok: false }> | undefined {
  if (ciphertext.length === 0) return { ok: false, reason: 'undecryptable' };
  if (ciphertext[0] !== FORMAT_VERSION) {
    return { ok: false, reason: 'unsupported-version' };
  }
  if (ciphertext.length < HEADER_LENGTH + TAG_LENGTH) {
    return { ok: false, reason: 'undecryptable' };
  }
}

/** The ciphertext of `plaintext` under a 32-byte key and a new 24-byte nonce. */
export function encrypt(input: {
  key: Uint8Array;
  nonce: Uint8Array;
  plaintext: Uint8Array;
  associatedData: Uint8Array;
}): Uint8Array {
  requireLength(input.key, KEY_LENGTH, 'Key');
  requireLength(input.nonce, NONCE_LENGTH, 'Nonce');
  const encrypted = xchacha20poly1305(
    input.key,
    input.nonce,
    input.associatedData,
  ).encrypt(input.plaintext);
  return concatBytes(Uint8Array.of(FORMAT_VERSION), input.nonce, encrypted);
}

export function decrypt(input: {
  key: Uint8Array;
  ciphertext: Uint8Array;
  associatedData: Uint8Array;
}): OpenResult {
  requireLength(input.key, KEY_LENGTH, 'Key');
  const failure = envelopeFailure(input.ciphertext);
  if (failure) return failure;
  try {
    const plaintext = xchacha20poly1305(
      input.key,
      input.ciphertext.subarray(1, HEADER_LENGTH),
      input.associatedData,
    ).decrypt(input.ciphertext.subarray(HEADER_LENGTH));
    return { ok: true, plaintext };
  } catch {
    return { ok: false, reason: 'undecryptable' };
  }
}

/** The Ed25519 public key of a 32-byte signing secret key. */
export function signingPublicKey(secretKey: Uint8Array): Uint8Array {
  requireLength(secretKey, KEY_LENGTH, 'Signing secret key');
  return ed25519.getPublicKey(secretKey);
}

/** The Ed25519 signature of `message`. */
export function sign(input: {
  secretKey: Uint8Array;
  message: Uint8Array;
}): Uint8Array {
  requireLength(input.secretKey, KEY_LENGTH, 'Signing secret key');
  return ed25519.sign(input.message, input.secretKey);
}

/** The X25519 public key of a 32-byte box secret key. */
export function boxPublicKey(secretKey: Uint8Array): Uint8Array {
  requireLength(secretKey, KEY_LENGTH, 'Box secret key');
  return x25519.getPublicKey(secretKey);
}

function boxKey(
  secretKey: Uint8Array,
  peerPublicKey: Uint8Array,
  purpose: Uint8Array,
  salt: Uint8Array | undefined,
): Uint8Array {
  // noble rejects low-order public keys, including their non-canonical encodings.
  const sharedSecret = x25519.getSharedSecret(secretKey, peerPublicKey);
  try {
    return deriveKey({ secret: sharedSecret, purpose, salt });
  } finally {
    sharedSecret.fill(0);
  }
}

/** A box only the recipient can open, and that tells it who the sender is. */
export function sealBox(input: {
  senderSecretKey: Uint8Array;
  recipientPublicKey: Uint8Array;
  context: Uint8Array;
  /** 32 bytes. */
  salt?: Uint8Array;
  nonce: Uint8Array;
  plaintext: Uint8Array;
}): Uint8Array {
  requireLength(input.senderSecretKey, KEY_LENGTH, 'Box secret key');
  requireLength(input.recipientPublicKey, KEY_LENGTH, 'Recipient public key');
  requireLength(input.nonce, NONCE_LENGTH, 'Nonce');
  requireBoxSalt(input.salt);
  const key = boxKey(
    input.senderSecretKey,
    input.recipientPublicKey,
    concatBytes(
      BOX_LABEL,
      boxPublicKey(input.senderSecretKey),
      input.recipientPublicKey,
      input.context,
    ),
    input.salt,
  );
  try {
    return encrypt({
      key,
      nonce: input.nonce,
      plaintext: input.plaintext,
      associatedData: EMPTY,
    });
  } finally {
    key.fill(0);
  }
}

export function openBox(input: {
  recipientSecretKey: Uint8Array;
  senderPublicKey: Uint8Array;
  context: Uint8Array;
  /** 32 bytes. */
  salt?: Uint8Array;
  box: Uint8Array;
}): OpenResult {
  requireLength(input.recipientSecretKey, KEY_LENGTH, 'Box secret key');
  requireBoxSalt(input.salt);
  const failure = envelopeFailure(input.box);
  if (failure) return failure;
  try {
    const key = boxKey(
      input.recipientSecretKey,
      input.senderPublicKey,
      concatBytes(
        BOX_LABEL,
        input.senderPublicKey,
        boxPublicKey(input.recipientSecretKey),
        input.context,
      ),
      input.salt,
    );
    try {
      return decrypt({ key, ciphertext: input.box, associatedData: EMPTY });
    } finally {
      key.fill(0);
    }
  } catch {
    // An invalid sender key is untrusted input, just like a failed ciphertext.
    return { ok: false, reason: 'undecryptable' };
  }
}

/** A 32-byte key for one purpose. Text is taken as its UTF-8 bytes. */
export function deriveKey(input: {
  secret: Uint8Array | string;
  purpose: Uint8Array | string;
  salt?: Uint8Array;
}): Uint8Array {
  return hkdf(
    sha256,
    typeof input.secret === 'string' ? utf8ToBytes(input.secret) : input.secret,
    input.salt,
    typeof input.purpose === 'string'
      ? utf8ToBytes(input.purpose)
      : input.purpose,
    KEY_LENGTH,
  );
}
