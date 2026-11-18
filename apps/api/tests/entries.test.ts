import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isHealthResponse } from '@shared-expense/domain/api';
import { runMigrations } from '../src/database/migrate';
import { migrations } from '../src/migrations';
import { newPhone, registrationBy, signedBy } from './acceptance/sharing-api';
import { runCommand, startServerCommand } from './support/command';
import { useTestDatabase } from './support/database';
import { sendTo } from './support/signed';

const COMMAND_TIMEOUT_MS = 120_000;

const database = useTestDatabase();

async function expectHealthy(url: string) {
  const response = await fetch(`${url}/health`);
  expect(response.status).toBe(200);
  expect(isHealthResponse(await response.json())).toBe(true);
}

/**
 * A phone registers with the server at `url` and sends a signed request, by the server's
 * own clock and from wherever the entry file says this machine's requests come.
 */
async function expectSignedRequestsPass(url: string) {
  const phone = newPhone();
  const at = () => ({ timestampMs: Date.now() });
  const request = signedBy(phone, at());

  expect(await sendTo(url, signedBy(phone, at()))).toEqual({
    status: 401,
    body: { error: 'signature' },
  });
  expect(await sendTo(url, registrationBy(phone, at()))).toEqual({
    status: 200,
    body: { deviceId: phone.deviceId },
  });
  expect((await sendTo(url, request)).status).toBe(404);
  expect(await sendTo(url, request)).toEqual({
    status: 401,
    body: { error: 'replayed' },
  });
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
  'the Node entry file registers a phone with the key in IP_HASH_KEY, and none without it',
  async () => {
    await runMigrations(database.sql, migrations);
    const withKey = await startServerCommand('tsx', ['src/node.ts'], {
      DATABASE_URL: database.url,
      PORT: '0',
      IP_HASH_KEY: 'a key for this test',
    });
    try {
      await expectSignedRequestsPass(withKey.url);
    } finally {
      await withKey.stop();
    }

    const withoutKey = await startServerCommand('tsx', ['src/node.ts'], {
      DATABASE_URL: database.url,
      PORT: '0',
      IP_HASH_KEY: undefined,
    });
    try {
      const answer = await sendTo(
        withoutKey.url,
        registrationBy(newPhone(), { timestampMs: Date.now() }),
      );
      expect(answer.status).toBe(500);
    } finally {
      await withoutKey.stop();
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
    // Wranglers started together collide on their default ports and state directory.
    const state = mkdtempSync(path.join(tmpdir(), 'api-wrangler-'));
    try {
      const workers = await startServerCommand(
        'wrangler',
        [
          'dev',
          '--ip',
          '127.0.0.1',
          '--port',
          '0',
          '--inspector-port',
          '0',
          '--persist-to',
          state,
        ],
        {
          CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE:
            database.url,
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

test(
  'the Workers entry file registers a phone and checks its signed requests, on the Workers runtime',
  async () => {
    await runMigrations(database.sql, migrations);
    const state = mkdtempSync(path.join(tmpdir(), 'api-wrangler-'));
    try {
      const workers = await startServerCommand(
        'wrangler',
        [
          'dev',
          '--ip',
          '127.0.0.1',
          '--port',
          '0',
          '--inspector-port',
          '0',
          '--persist-to',
          state,
        ],
        {
          CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE:
            database.url,
          // The secret wrangler.jsonc requires, which `wrangler dev` reads from here.
          IP_HASH_KEY: 'a key for this test',
        },
      );
      try {
        await expectSignedRequestsPass(workers.url);
      } finally {
        await workers.stop();
      }
    } finally {
      rmSync(state, { recursive: true, force: true });
    }
  },
  COMMAND_TIMEOUT_MS,
);
