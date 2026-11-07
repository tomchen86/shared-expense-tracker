import { serve } from '@hono/node-server';
import { app } from './app';
import { connect } from './database/connect';
import { runMigrations } from './database/migrate';
import { migrations } from './migrations';

// The PostgreSQL in compose.yaml.
const LOCAL_DATABASE_URL =
  'postgres://postgres:postgres@127.0.0.1:55432/postgres';

export interface NodeServer {
  url: string;
  close(): Promise<void>;
}

/** Serves the API on Node, with one client and its connections for every request. */
export function startServer(options: {
  databaseUrl: string;
  port?: number;
}): Promise<NodeServer> {
  const sql = connect(options.databaseUrl);
  const hostname = process.env.HOST ?? '127.0.0.1';
  return new Promise((resolve, reject) => {
    const server = serve(
      {
        fetch: (request) => app.fetch(request, { sql }),
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
  const server = await startServer({ databaseUrl, port });
  console.log(`API listening on ${server.url}`);
}

// Tests import startServer instead, and pick their own database and port.
if (require.main === module) void main();
