// The check of rule 9 in AGENTS.md, run by `pnpm --filter api check:hyperdrive`.
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { constants, tmpdir } from 'node:os';
import path from 'node:path';
import {
  isCreateGroupResponse,
  isEventsPageResponse,
  isHealthResponse,
  isUploadEventsResponse,
  type UploadedEvent,
} from '@shared-expense/domain/api';
import {
  newPhone,
  signedBy,
  type Phone,
  type RequestInput,
} from '../acceptance/sharing-api';
import { startServerCommand } from '../support/command';
import { HYPERDRIVE_CHECK_PATH } from './path';
import type {
  EventApiGuests,
  HyperdriveCheckResponse,
  HyperdriveCheckStep,
} from './worker';

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
 * `interrupted`, it runs no further step but those that remove what the check made: the
 * phones and the group of its requests to the event API, and its table.
 */
async function check(base: string, interrupted: AbortSignal): Promise<boolean> {
  const table = `hyperdrive_check_${randomUUID().replaceAll('-', '')}`;
  const request = (pathname: string, init?: RequestInit) =>
    fetch(new URL(pathname, base), {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  const run = async (
    step: HyperdriveCheckStep,
    guests?: EventApiGuests,
  ): Promise<unknown> => {
    const query = new URLSearchParams({ step, table });
    if (guests) {
      query.set('group', guests.groupId);
      for (const { deviceId, publicKey } of guests.phones) {
        query.append('phone', `${deviceId}.${publicKey}`);
      }
    }
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

  /**
   * The event API's requests through its own routes (ADR-0016, ADR-0024), which no other
   * step reaches: an upload is one transaction that holds a lock on the group's row over
   * several statements and hands PostgreSQL the events as one parameter of up to 1 MiB.
   * Two phones of the check's own send them, and whatever they stored is removed at the
   * end. A database that has not run the API's migrations yet has no tables for this, as
   * production has before its first deploy: the check says so and goes on.
   */
  async function eventApi(): Promise<void> {
    if (!ok || interrupted.aborted) return;
    try {
      if ((await run('eventApiTables')) !== true) {
        console.log(
          "skip  the event API: this database has not run the API's migrations",
        );
        return;
      }
    } catch (error) {
      fail(
        'the event API',
        error instanceof Error ? error.message : String(error),
      );
      return;
    }

    const phones: Phone[] = [newPhone(), newPhone()];
    const groupId = randomUUID();
    const guests: EventApiGuests = { groupId, phones };
    const eventsPath = `/groups/${groupId}/events`;
    /** Sends a request the phone signs now, and resolves with the status and the body. */
    const send = async (phone: Phone, input: RequestInput) => {
      const signed = signedBy(phone, { ...input, timestampMs: Date.now() });
      const response = await request(signed.path, {
        method: signed.method,
        headers: signed.headers,
        ...(signed.body.length > 0 ? { body: signed.body } : {}),
      });
      const text = await response.text();
      try {
        return { status: response.status, body: JSON.parse(text) as unknown };
      } catch {
        return { status: response.status, body: text as unknown };
      }
    };
    /** Uploads the events, which the API has to store, and resolves with their numbers. */
    const upload = async (phone: Phone, events: UploadedEvent[]) => {
      const body = JSON.stringify({ epoch: 1, events });
      const answer = await send(phone, {
        method: 'POST',
        path: eventsPath,
        body,
      });
      if (answer.status !== 200 || !isUploadEventsResponse(answer.body)) {
        throw new Error(
          `An upload of ${body.length} bytes: HTTP ${answer.status}: ${JSON.stringify(answer.body).slice(0, 300)}`,
        );
      }
      return answer.body.events.map(({ sequence }) => sequence);
    };
    /** Downloads the page after the cursor, which the API has to return. */
    const download = async (phone: Phone, after: number) => {
      const answer = await send(phone, {
        path: `${eventsPath}?after=${after}`,
      });
      if (answer.status !== 200 || !isEventsPageResponse(answer.body)) {
        throw new Error(
          `A download after ${after}: HTTP ${answer.status}: ${JSON.stringify(answer.body).slice(0, 300)}`,
        );
      }
      return answer.body;
    };
    const expectNumbers = (got: number[], first: number, what: string) => {
      const expected = got.map((_, index) => first + index);
      if (JSON.stringify(got) !== JSON.stringify(expected)) {
        throw new Error(
          `${what} got the numbers ${JSON.stringify(got)}, not ${first} to ${first + got.length - 1}`,
        );
      }
    };

    // The largest upload the acceptance tests send: seven events of the largest size.
    const large = Array.from({ length: 7 }, () => event(65_536));
    const largeBytes = JSON.stringify({ epoch: 1, events: large }).length;
    await steps([
      [
        'two phones of the check, and the group one of them creates',
        async () => {
          await run('admit', guests);
          const created = await send(phones[0], {
            method: 'PUT',
            path: `/groups/${groupId}`,
          });
          if (created.status !== 200 || !isCreateGroupResponse(created.body)) {
            throw new Error(
              `Creating the group: HTTP ${created.status}: ${JSON.stringify(created.body).slice(0, 300)}`,
            );
          }
          await run('join', guests);
        },
      ],
      [
        'an upload of seven of the largest events is stored',
        async () => {
          expectNumbers(await upload(phones[0], large), 1, 'The upload');
          return `an upload of ${largeBytes.toLocaleString('en-US')} bytes, seven events of 65,536 bytes, is stored`;
        },
      ],
      [
        'the other phone downloads the first page as it was uploaded',
        async () => {
          const page = await download(phones[1], 0);
          const sent = large.slice(0, 4);
          if (
            !page.more ||
            JSON.stringify(
              page.events.map(({ id, content }) => ({ id, content })),
            ) !== JSON.stringify(sent)
          ) {
            throw new Error(
              `The page has ${page.events.length} events and more=${page.more}, not the first 4 as they were uploaded and more to follow`,
            );
          }
        },
      ],
      [
        'uploads of both phones that arrive together are numbered one after another',
        async () => {
          // Ten uploads at once, each a transaction that waits for the group's row.
          const numbers = await Promise.all(
            Array.from({ length: 10 }, (_, index) =>
              upload(phones[index % 2], [event(200), event(200), event(200)]),
            ),
          );
          for (const each of numbers)
            expectNumbers(each, each[0], 'One upload');
          expectNumbers(
            numbers.flat().sort((a, b) => a - b),
            8,
            'The ten uploads together',
          );
        },
      ],
      [
        'one event that both phones upload together is stored once',
        async () => {
          // After the seven events and the thirty, the next number is 38.
          const id = randomUUID();
          const [first, second] = await Promise.all(
            phones.map((phone) => upload(phone, [event(200, id)])),
          );
          if (first[0] !== 38 || second[0] !== 38) {
            throw new Error(
              `The two uploads were answered with ${first[0]} and ${second[0]}, not both with 38`,
            );
          }
          const page = await download(phones[1], 7);
          expectNumbers(
            page.events.map(({ sequence }) => sequence),
            8,
            'The page after the large upload',
          );
          if (page.events.length !== 31 || page.more) {
            throw new Error(
              `The group has ${page.events.length} events after the large upload and more=${page.more}, not 31 and no more`,
            );
          }
        },
      ],
    ]);
    // Even after a failure or an interruption: nothing of the two phones stays behind.
    await step('remove the phones and the group the check made', async () => {
      await run('forget', guests);
    });
  }

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
      'a transaction that takes an advisory lock commits as a whole',
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
  await eventApi();
  // Even after a failure: the table is the only thing the check leaves behind.
  await step('drop the table the check made', async () => {
    await run('drop');
  });
  return ok;
}

/** An event to upload: that many random bytes under an ID of its own, or under `id`. */
const event = (bytes: number, id: string = randomUUID()): UploadedEvent => ({
  id,
  content: randomBytes(bytes).toString('hex'),
});

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
  // The same when its output closes, with the terminal or with a `| tee` that the Ctrl-C
  // ended first: an error from printing would otherwise end the check where it stands.
  for (const output of [process.stdout, process.stderr]) {
    output.on('error', () => {});
  }
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
