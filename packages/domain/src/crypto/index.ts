// The encryption tools of docs/specs/sharing/spec.md, behind their own entry point
// (ADR-0015). Stubs: the signatures are the boundary the acceptance tests use, and the
// implementer replaces the bodies. Every key, nonce and salt comes from the caller.

/** What decrypting a ciphertext or opening a box gives. A failure carries no content. */
export type OpenResult =
  | { ok: true; plaintext: Uint8Array }
  | { ok: false; reason: 'undecryptable' | 'unsupported-version' };

/** The ciphertext of `plaintext` under a 32-byte key and a new 24-byte nonce. */
export function encrypt(input: {
  key: Uint8Array;
  nonce: Uint8Array;
  plaintext: Uint8Array;
  associatedData: Uint8Array;
}): Uint8Array {
  throw new Error(`Not implemented: encrypt(${input.plaintext.length} bytes)`);
}

export function decrypt(input: {
  key: Uint8Array;
  ciphertext: Uint8Array;
  associatedData: Uint8Array;
}): OpenResult {
  throw new Error(`Not implemented: decrypt(${input.ciphertext.length} bytes)`);
}

/** The Ed25519 public key of a 32-byte signing secret key. */
export function signingPublicKey(secretKey: Uint8Array): Uint8Array {
  throw new Error(
    `Not implemented: signingPublicKey(${secretKey.length} bytes)`,
  );
}

/** The Ed25519 signature of `message`. */
export function sign(input: {
  secretKey: Uint8Array;
  message: Uint8Array;
}): Uint8Array {
  throw new Error(`Not implemented: sign(${input.message.length} bytes)`);
}

/** The X25519 public key of a 32-byte box secret key. */
export function boxPublicKey(secretKey: Uint8Array): Uint8Array {
  throw new Error(`Not implemented: boxPublicKey(${secretKey.length} bytes)`);
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
  throw new Error(`Not implemented: sealBox(${input.plaintext.length} bytes)`);
}

export function openBox(input: {
  recipientSecretKey: Uint8Array;
  senderPublicKey: Uint8Array;
  context: Uint8Array;
  /** 32 bytes. */
  salt?: Uint8Array;
  box: Uint8Array;
}): OpenResult {
  throw new Error(`Not implemented: openBox(${input.box.length} bytes)`);
}

/** A 32-byte key for one purpose. Text is taken as its UTF-8 bytes. */
export function deriveKey(input: {
  secret: Uint8Array | string;
  purpose: Uint8Array | string;
  salt?: Uint8Array;
}): Uint8Array {
  throw new Error(`Not implemented: deriveKey(${input.secret.length})`);
}
