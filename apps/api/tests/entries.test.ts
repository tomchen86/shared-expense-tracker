import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isHealthResponse } from '@shared-expense/domain/api';
import { runCommand, startServerCommand } from './support/command';
import { useTestDatabase } from './support/database';

const COMMAND_TIMEOUT_MS = 120_000;

const database = useTestDatabase();

async function expectHealthy(url: string) {
  const response = await fetch(`${url}/health`);
  expect(response.status).toBe(200);
  expect(isHealthResponse(await response.json())).toBe(true);
}

test(
  'the Node entry file serves GET /health',
  async () => {
    const node = await startServerCommand('tsx', ['src/node.ts'], {
      DATABASE_URL: database.url,
      PORT: '0',
    });
    try {
      await expectHealthy(node.url);
    } finally {
      await node.stop();
    }
  },
  COMMAND_TIMEOUT_MS,
);

test(
  'the Node entry file runs the migrations',
  async () => {
    const code = await runCommand('tsx', ['src/node.ts', 'migrate'], {
      DATABASE_URL: database.url,
    });
    expect(code).toBe(0);
    await expect(
      database.sql`SELECT count(*)::int AS count FROM _migrations`,
    ).resolves.toEqual([{ count: expect.any(Number) }]);
  },
  COMMAND_TIMEOUT_MS,
);

test(
  'the Workers entry file serves GET /health, on the Workers runtime',
  async () => {
    // Wranglers started together collide on its default ports and state directory.
    const state = mkdtempSync(path.join(tmpdir(), 'api-wrangler-'));
    const args = [
      '--port',
      '0',
      '--inspector-port',
      '0',
      '--persist-to',
      state,
    ];
    try {
      const workers = await startServerCommand(
        'wrangler',
        ['dev', '--ip', '127.0.0.1', ...args],
        {
          CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE:
            database.url,
          WRANGLER_SEND_METRICS: 'false',
        },
      );
      try {
        await expectHealthy(workers.url);
        // Every request connects anew: a client cannot outlive its request on Workers.
        await expectHealthy(workers.url);
      } finally {
        await workers.stop();
      }
    } finally {
      rmSync(state, { recursive: true, force: true });
    }
  },
  COMMAND_TIMEOUT_MS,
);
