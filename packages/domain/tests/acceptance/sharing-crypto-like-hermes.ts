// Importing this file makes the test file's global scope more like Hermes, where the
// phone runs the tools (ADR-0015): no Web Crypto and no Buffer. Import it before the code
// under test, so that code loads without them too.
const removed = (['crypto', 'Buffer'] as const).map(
  (name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const,
);
delete (globalThis as { crypto?: unknown }).crypto;
delete (globalThis as { Buffer?: unknown }).Buffer;

export function restoreGlobals(): void {
  for (const [name, descriptor] of removed) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
  }
}
