import { ReadableStream } from 'node:stream/web';
import { serve } from '@hono/node-server';
import { app } from './app';
import { connect } from './database/connect';
import { runMigrations } from './database/migrate';
import { migrations } from './migrations';
import type { AppLinks } from './sharing/app-links';

// The PostgreSQL in compose.yaml.
const LOCAL_DATABASE_URL =
  'postgres://postgres:postgres@127.0.0.1:55432/postgres';

export interface NodeServer {
  url: string;
  close(): Promise<void>;
}

export interface NodeServerOptions {
  databaseUrl: string;
  port?: number;
  /** The API's time, in milliseconds since the Unix epoch: the system clock unless given. */
  now?: () => number;
  /** The address a request came from: the connection's remote address unless given. */
  clientIp?: (request: Request) => string;
  /**
   * The key of the keyed hash that stands for an IP in the database (SHARING-42.1).
   * Without one the API registers no new device (SHARING-44.1).
   */
  ipHashKey?: string;
  /** What this environment's verification files and download page say (ADR-0023). */
  appLinks?: AppLinks;
}

/** Serves the API on Node, with one client and its connections for every request. */
export function startServer(options: NodeServerOptions): Promise<NodeServer> {
  const sql = connect(options.databaseUrl);
  const appLinks = options.appLinks ?? {};
  const hostname = '127.0.0.1';
  return new Promise((resolve, reject) => {
    const server = serve(
      {
        fetch: (request, { incoming }) =>
          app.fetch(request, {
            sql,
            now: options.now ?? Date.now,
            // Never an address the request itself claims in a header (SHARING-41.1).
            clientIp: options.clientIp
              ? options.clientIp(request)
              : incoming.socket.remoteAddress,
            ipHashKey: options.ipHashKey,
            appLinks,
            get incomingBody() {
              if (
                incoming.headers['content-length'] ||
                incoming.headers['transfer-encoding']
              ) {
                // Cancelling an oversized upload must leave the socket open for the 413.
                return ReadableStream.from<Uint8Array>(
                  incoming.iterator({ destroyOnReturn: false }),
                );
              }
            },
          }),
        hostname,
        port: options.port ?? 0,
      },
      ({ port }) => {
        server.off('error', reject);
        resolve({
          url: `http://${hostname}:${port}`,
          close: async () => {
            await new Promise<void>((closed, failed) =>
              server.close((error) => (error ? failed(error) : closed())),
            );
            await sql.end();
          },
        });
      },
    );
    server.once('error', reject);
  });
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL ?? LOCAL_DATABASE_URL;
  if (process.argv[2] === 'migrate') {
    const sql = connect(databaseUrl);
    await runMigrations(sql, migrations);
    await sql.end();
    return;
  }
  const port = Number(process.env.PORT ?? 3000);
  const server = await startServer({
    databaseUrl,
    port,
    ipHashKey: process.env.IP_HASH_KEY,
  });
  console.log(`API listening on ${server.url}`);
}

// Tests import startServer instead, and pick their own database and port.
if (require.main === module) void main();
