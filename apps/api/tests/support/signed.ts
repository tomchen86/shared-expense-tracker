import { request as httpRequest } from 'node:http';
import type { SentRequest } from '../acceptance/sharing-api';

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
 * first: `target` goes on the request line as it is, and a header given several values is
 * sent once for each.
 */
export function sendRaw(
  url: string,
  request: {
    method: string;
    target: string;
    headers: Record<string, string | string[]>;
  },
): Promise<SignedAnswer> {
  const { hostname, port } = new URL(url);
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest(
      {
        hostname,
        port,
        method: request.method,
        path: request.target,
        headers: request.headers,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () =>
          resolve(
            parsed(response.statusCode ?? 0, Buffer.concat(chunks).toString()),
          ),
        );
        response.on('error', reject);
      },
    );
    outgoing.on('error', reject);
    outgoing.end();
  });
}
