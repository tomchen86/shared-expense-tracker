import { runCommand } from './support/command';
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
