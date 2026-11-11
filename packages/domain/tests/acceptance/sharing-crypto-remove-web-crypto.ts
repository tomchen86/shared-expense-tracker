// Importing this file takes Web Crypto out of the test file's global scope, as on Hermes,
// which has none (ADR-0015). Import it before the code under test, so that code loads
// without it too.
const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
delete (globalThis as { crypto?: unknown }).crypto;

export function restoreWebCrypto(): void {
  if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor);
}
