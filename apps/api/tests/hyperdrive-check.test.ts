import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { runCommand, startCommand } from './support/command';
import { useTestDatabase } from './support/database';

// The check itself needs the owner's Cloudflare login (rule 9 in AGENTS.md). These run
// the same steps on Wrangler's local runtime, so that a failure there means Hyperdrive.
const COMMAND_TIMEOUT_MS = 120_000;

const database = useTestDatabase();

const check = (databaseUrl: string) =>
  runCommand('tsx', ['tests/hyperdrive/check.ts', 'local'], {
    DATABASE_URL: databaseUrl,
  });

test(
  'the Hyperdrive check passes on a PostgreSQL that works',
  async () => {
    await expect(check(database.url)).resolves.toBe(0);
    await expect(
      database.sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
    ).resolves.toEqual([]);
  },
  COMMAND_TIMEOUT_MS,
);

test(
  'the Hyperdrive check fails when the Worker cannot use its database',
  async () => {
    const missing = new URL(database.url);
    missing.pathname += '_missing';
    await expect(check(missing.href)).resolves.toBe(1);
  },
  COMMAND_TIMEOUT_MS,
);

test('the Hyperdrive check runs only where it is told to', async () => {
  await expect(
    runCommand('tsx', ['tests/hyperdrive/check.ts', 'somewhere'], {}),
  ).resolves.toBe(2);
});

describe('interrupted', () => {
  // The check keeps Wrangler's state in the temporary directory, so one of its own shows
  // what this check left there. Under /tmp, because tsx listens on a socket in it, and a
  // socket's path is short.
  let temporary: string;
  beforeEach(() => {
    temporary = mkdtempSync('/tmp/api-check-');
  });
  afterEach(() => {
    rmSync(temporary, { recursive: true, force: true });
  });

  function startCheck() {
    const child = startCommand('tsx', ['tests/hyperdrive/check.ts', 'local'], {
      DATABASE_URL: database.url,
      TMPDIR: temporary,
    });
    let output = '';
    let read = () => {};
    for (const stream of [child.stdout, child.stderr]) {
      stream.on('data', (chunk: Buffer) => {
        output += chunk.toString();
        read();
      });
    }
    const code = new Promise<number | null>((resolve) =>
      child.once('exit', resolve),
    );
    return {
      code,
      output: () => output,
      /** Resolves once the check has printed `text`. */
      printed: (text: string) =>
        new Promise<void>((resolve, reject) => {
          read = () => output.includes(text) && resolve();
          read();
          void code.then(() =>
            reject(new Error(`The check ended first:\n${output}`)),
          );
        }),
      // As the terminal's Ctrl-C does: to the check's process group, which Wrangler's is not.
      interrupt: () => process.kill(-child.pid!, 'SIGINT'),
    };
  }

  const leftBehind = () =>
    readdirSync(temporary).filter((name) =>
      name.startsWith('api-hyperdrive-check-'),
    );

  test(
    'a Hyperdrive check interrupted between its write and its end drops its table and stops Wrangler',
    async () => {
      const check = startCheck();
      await database.sql.begin(async (transaction) => {
        // Nothing creates a table while this is held, so the check waits in its write.
        await transaction`LOCK TABLE pg_class IN SHARE ROW EXCLUSIVE MODE`;
        const waiting = () => transaction`
          SELECT 1 FROM pg_locks
          WHERE relation = 'pg_class'::regclass AND NOT granted
            AND database = (
              SELECT oid FROM pg_database WHERE datname = current_database()
            )`;
        while ((await waiting()).length === 0) {
          await Promise.race([
            new Promise((resolve) => setTimeout(resolve, 50)),
            check.code.then(() => {
              throw new Error(`The check ended first:\n${check.output()}`);
            }),
          ]);
        }
        check.interrupt();
        await check.printed('SIGINT: stopping after the request in flight');
      });

      await expect(check.code).resolves.toBe(130);
      expect(check.output()).toContain('ok    write\n');
      expect(check.output()).toContain(
        'FAIL  read back: The check was interrupted\n',
      );
      expect(check.output()).toContain('ok    drop the table the check made\n');
      await expect(
        database.sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
      ).resolves.toEqual([]);
      expect(leftBehind()).toEqual([]);
    },
    COMMAND_TIMEOUT_MS,
  );

  test(
    'a Hyperdrive check interrupted while Wrangler starts stops it',
    async () => {
      const check = startCheck();
      await check.printed('Hyperdrive check on local');
      check.interrupt();

      await expect(check.code).resolves.toBe(130);
      expect(check.output()).toContain('wrangler was interrupted');
      expect(check.output()).not.toContain('ok    ');
      expect(leftBehind()).toEqual([]);
    },
    COMMAND_TIMEOUT_MS,
  );
});
