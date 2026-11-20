import type { Context } from 'hono';
import type { AppEnv } from '../app';

const MAX_BODY_BYTES = 1_048_576;

/** The exact bytes to verify, or undefined as soon as the body exceeds 1 MiB. */
export async function readRequestBody(
  c: Context<AppEnv>,
): Promise<Uint8Array<ArrayBuffer> | undefined> {
  if (Number(c.req.header('content-length')) > MAX_BODY_BYTES) return undefined;
  const stream = c.env.incomingBody ?? c.req.raw.body;
  if (!stream) return new Uint8Array(0);

  const reader = stream.getReader();
  let buffer = new Uint8Array(0);
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const end = size + value.byteLength;
      if (end > MAX_BODY_BYTES) {
        // Cancellation releases the source. Its cleanup must not hold up the response.
        void reader.cancel().catch(() => {});
        return undefined;
      }
      // Grow with the upload. Even one-byte chunks occupy a single bounded buffer.
      if (end > buffer.length) {
        const capacity = Math.min(
          MAX_BODY_BYTES,
          Math.max(end, buffer.length * 2),
        );
        const grown = new Uint8Array(capacity);
        grown.set(buffer);
        buffer = grown;
      }
      buffer.set(value, size);
      size = end;
    }
  } finally {
    reader.releaseLock();
  }

  const body = buffer.slice(0, size);
  // Hono caches the arrayBuffer() promise so the route can read the verified bytes again.
  Object.assign(c.req.bodyCache, { arrayBuffer: Promise.resolve(body.buffer) });
  return body;
}
