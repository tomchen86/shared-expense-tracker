import { request as httpRequest } from 'node:http';
import type { Sending, SentRequest } from '../acceptance/sharing-api';

export interface SignedAnswer {
  status: number;
  /** The body, parsed when it is JSON and as text when it is not. */
  body: unknown;
}

const parsed = (status: number, text: string): SignedAnswer => {
  try {
    return { status, body: JSON.parse(text) };
  } catch {
    return { status, body: text };
  }
};

/** Sends a request a phone signed to the server at `url`. */
export async function sendTo(
  url: string,
  request: SentRequest,
): Promise<SignedAnswer> {
  const response = await fetch(`${url}${request.path}`, {
    method: request.method,
    headers: request.headers,
    ...(request.body.length > 0 ? { body: request.body } : {}),
  });
  return parsed(response.status, await response.text());
}

/**
 * Sends a request with its target and headers exactly as given, which `fetch` would tidy
 * first: `path` goes on the request line as it is, and a header given several values is
 * sent once for each. An unfinished request gets five seconds to receive its response.
 */
export function sendRaw(
  url: string,
  request: {
    method: string;
    path: string;
    headers: Record<string, string | string[]>;
  },
  sending?: Sending,
): Promise<SignedAnswer> {
  const { hostname, port } = new URL(url);
  const { declaredLength, sent, ended } = sending ?? { ended: true };
  const headers = { ...request.headers };
  if (declaredLength !== undefined) {
    headers['Content-Length'] = String(declaredLength);
  } else if (sending) {
    headers['Transfer-Encoding'] = 'chunked';
  }
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest(
      {
        hostname,
        port,
        method: request.method,
        path: request.path,
        headers,
        agent: false,
        signal: ended ? undefined : AbortSignal.timeout(5_000),
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          resolve(
            parsed(response.statusCode ?? 0, Buffer.concat(chunks).toString()),
          );
          outgoing.destroy();
        });
        response.on('error', reject);
      },
    );
    outgoing.on('error', reject);
    if (sent) {
      const piece = 65_536;
      for (let start = 0; start < sent.length; start += piece) {
        outgoing.write(sent.subarray(start, start + piece));
      }
    }
    if (ended) outgoing.end();
    else outgoing.flushHeaders();
  });
}
