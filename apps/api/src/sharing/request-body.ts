import type { Context } from 'hono';
import type { AppEnv } from '../app';

const MAX_BODY_BYTES = 1_048_576;

async function readStream(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array<ArrayBuffer> | undefined> {
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

  return buffer.slice(0, size);
}

/** The bytes to verify, or undefined as soon as the content exceeds 1 MiB (SHARING-48.2). */
export async function readRequestBody(
  c: Context<AppEnv>,
): Promise<Uint8Array<ArrayBuffer> | undefined> {
  // GET and HEAD are signed for zero bytes even when the runtime exposes a body.
  let stream: ReadableStream<Uint8Array> | null = null;
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    if (Number(c.req.header('content-length')) > MAX_BODY_BYTES)
      return undefined;
    stream = c.env.incomingBody ?? c.req.raw.body;
  }

  const body = stream ? await readStream(stream) : new Uint8Array(0);
  if (body !== undefined) {
    // A route that reads the content through Hono gets the same bytes used to verify it.
    Object.assign(c.req.bodyCache, {
      arrayBuffer: Promise.resolve(body.buffer),
    });
  }
  return body;
}
