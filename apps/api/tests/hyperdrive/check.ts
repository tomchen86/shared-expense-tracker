// The check of rule 9 in AGENTS.md, run by `pnpm --filter api check:hyperdrive`.
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { constants, tmpdir } from 'node:os';
import path from 'node:path';
import { isHealthResponse } from '@shared-expense/domain/api';
import { startServerCommand } from '../support/command';
import { HYPERDRIVE_CHECK_PATH } from './path';
import type { HyperdriveCheckResponse, HyperdriveCheckStep } from './worker';

const API_ROOT = path.resolve(__dirname, '../..');
const REQUEST_TIMEOUT_MS = 60_000;
const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;
const USAGE = `Usage: pnpm --filter api check:hyperdrive <staging|production|local> [wrangler options]

  staging, production  Runs this checkout's Worker on Cloudflare with that environment's
                       Hyperdrive configuration (wrangler dev --remote). It needs a
                       Cloudflare login: pass --profile <name> for a named one.
  local                Runs it on this machine against DATABASE_URL's PostgreSQL, or the
                       one in compose.yaml: it checks this script, not Hyperdrive.`;

/** Where the Worker runs for each target, and what the report calls it. */
function mode(target: string): { args: string[]; where: string } | undefined {
  if (target === 'local') {
    return {
      args: [],
      where: 'wrangler dev, straight to PostgreSQL: Hyperdrive is not checked',
    };
  }
  if (target === 'staging' || target === 'production') {
    return {
      args: ['--remote', '--env', target],
      where: `wrangler dev --remote, through ${target}'s Hyperdrive`,
    };
  }
  return undefined;
}

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: API_ROOT, encoding: 'utf8' }).trim();
}

function composeMajor(): number {
  const compose = readFileSync(path.join(API_ROOT, 'compose.yaml'), 'utf8');
  return Number(/image: postgres:(\d+)/.exec(compose)?.[1]);
}

/**
 * Runs every step against the Worker at `base` and prints one report line per step. After
 * `interrupted`, it runs no further step but the last, which drops the table.
 */
async function check(base: string, interrupted: AbortSignal): Promise<boolean> {
  const table = `hyperdrive_check_${randomUUID().replaceAll('-', '')}`;
  const request = (pathname: string, init?: RequestInit) =>
    fetch(new URL(pathname, base), {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  const run = async (step: HyperdriveCheckStep): Promise<unknown> => {
    const query = new URLSearchParams({ step, table });
    const response = await request(`${HYPERDRIVE_CHECK_PATH}?${query}`, {
      method: 'POST',
    });
    const text = await response.text();
    let body: HyperdriveCheckResponse;
    try {
      body = JSON.parse(text) as HyperdriveCheckResponse;
    } catch {
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
    }
    if ('failure' in body) throw new Error(body.failure);
    return body.result;
  };
  const expectRows = async (expected: string[], otherwise: string) => {
    const rows = await run('read');
    if (JSON.stringify(rows) !== JSON.stringify(expected)) {
      throw new Error(
        `${otherwise}: read ${JSON.stringify(rows)}, not ${JSON.stringify(expected)}`,
      );
    }
  };

  let ok = true;
  const fail = (name: string, reason: string) => {
    ok = false;
    console.log(`FAIL  ${name}: ${reason}`);
  };
  const step = async (name: string, action: () => Promise<string | void>) => {
    try {
      console.log(`ok    ${(await action()) ?? name}`);
    } catch (error) {
      fail(name, error instanceof Error ? error.message : String(error));
    }
  };
  /** After a failure, the steps that build on it would only repeat it. */
  const steps = async (all: [string, () => Promise<string | void>][]) => {
    for (const [name, action] of all) {
      if (!ok) return;
      if (interrupted.aborted) return fail(name, 'The check was interrupted');
      await step(name, action);
    }
  };

  await steps([
    [
      'GET /health through src/workers.ts, twice',
      async () => {
        for (let count = 0; count < 2; count += 1) {
          const response = await request('/health');
          if (response.status !== 200) {
            throw new Error(`HTTP ${response.status}`);
          }
          if (!isHealthResponse(await response.json())) {
            throw new Error('Not the response of GET /health');
          }
        }
      },
    ],
    ['write', async () => void (await run('write'))],
    [
      'read back',
      () => expectRows(['written'], 'Another request does not see the write'),
    ],
    [
      'a read after a write is not a cached one',
      async () => {
        await run('update');
        await expectRows(
          ['changed'],
          "The read repeats the answer from before the update, so Hyperdrive's query caching is on",
        );
      },
    ],
    [
      'a transaction commits as a whole',
      async () => {
        await run('commit');
        await expectRows(
          ['committed', 'committed too'],
          'The transaction did not commit both statements',
        );
      },
    ],
    [
      'a failed transaction changes nothing',
      async () => {
        await run('rollBack');
        await expectRows(
          ['committed', 'committed too'],
          'The transaction did not roll back',
        );
      },
    ],
    [
      'server_version',
      async () => {
        const version = String(await run('serverVersion'));
        const major = composeMajor();
        if (Number.parseInt(version, 10) !== major) {
          throw new Error(
            `The server runs ${version}, and compose.yaml runs postgres:${major}`,
          );
        }
        return `server_version ${version} is the major version in compose.yaml, ${major}`;
      },
    ],
  ]);
  // Even after a failure: the table is the only thing the check leaves behind.
  await step('drop the table the check made', async () => {
    await run('drop');
  });
  return ok;
}

async function main(): Promise<void> {
  const [target, ...wranglerOptions] = process.argv.slice(2);
  const where = mode(target ?? '');
  if (!where) {
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }
  // Wrangler runs in a process group of its own, which the terminal's Ctrl-C does not
  // reach, and a check that stopped there would leave it running and the table in place.
  // So a signal lets the request in flight finish, and the check then ends as it always
  // does: it drops the table and stops Wrangler.
  const interrupted = new AbortController();
  for (const signal of SIGNALS) {
    process.on(signal, () => {
      if (interrupted.signal.aborted) return;
      console.error(`${signal}: stopping after the request in flight`);
      interrupted.abort(signal);
    });
  }
  const changed = git('status', '--porcelain') ? ', with changes' : '';
  console.log(
    [
      `Hyperdrive check on ${target} (${where.where})`,
      `at ${git('rev-parse', '--short', 'HEAD')}${changed}`,
    ].join('\n'),
  );
  // Wranglers started together collide on their default ports and state directory.
  const state = mkdtempSync(path.join(tmpdir(), 'api-hyperdrive-check-'));
  try {
    const worker = await startServerCommand(
      'wrangler',
      [
        'dev',
        'tests/hyperdrive/worker.ts',
        ...where.args,
        ...['--ip', '127.0.0.1', '--port', '0', '--inspector-port', '0'],
        ...['--persist-to', state],
        ...wranglerOptions,
      ],
      process.env.DATABASE_URL && target === 'local'
        ? {
            CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE:
              process.env.DATABASE_URL,
          }
        : {},
      interrupted.signal,
    );
    try {
      if (!(await check(worker.url, interrupted.signal))) process.exitCode = 1;
    } finally {
      await worker.stop();
    }
  } finally {
    rmSync(state, { recursive: true, force: true });
    if (interrupted.signal.aborted) {
      // What a shell reports for a command that a signal ended.
      const signal = interrupted.signal.reason as (typeof SIGNALS)[number];
      process.exitCode = 128 + constants.signals[signal];
    }
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode ||= 1;
});
