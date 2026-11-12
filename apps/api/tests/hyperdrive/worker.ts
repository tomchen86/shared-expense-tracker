import { connect, type Sql } from '../../src/database/connect';
import worker from '../../src/workers';
import { HYPERDRIVE_CHECK_PATH } from './path';

class RollBack extends Error {}

/**
 * One statement, or one transaction, per request: each request connects anew, as the
 * API's do, so a step reaches PostgreSQL through whichever connection Hyperdrive's pool
 * hands it. check.ts decides what each answer should be.
 */
const steps = {
  async write(sql: Sql, table: string) {
    await sql`CREATE TABLE ${sql(table)} (id integer PRIMARY KEY, value text NOT NULL)`;
    await sql`INSERT INTO ${sql(table)} VALUES (1, 'written')`;
  },
  // The same text every time: Hyperdrive's cache, when it is on, answers a query it has
  // seen before without asking PostgreSQL.
  async read(sql: Sql, table: string) {
    const rows = await sql<{ value: string }[]>`
      SELECT value FROM ${sql(table)} ORDER BY id`;
    return rows.map((row) => row.value);
  },
  async update(sql: Sql, table: string) {
    await sql`UPDATE ${sql(table)} SET value = 'changed' WHERE id = 1`;
  },
  async commit(sql: Sql, table: string) {
    await sql.begin(async (transaction) => {
      await transaction`UPDATE ${transaction(table)} SET value = 'committed' WHERE id = 1`;
      await transaction`INSERT INTO ${transaction(table)} VALUES (2, 'committed too')`;
    });
  },
  async rollBack(sql: Sql, table: string) {
    try {
      await sql.begin(async (transaction) => {
        await transaction`UPDATE ${transaction(table)} SET value = 'rolled back'`;
        await transaction`DELETE FROM ${transaction(table)} WHERE id = 2`;
        throw new RollBack();
      });
    } catch (error) {
      if (!(error instanceof RollBack)) throw error;
    }
  },
  async serverVersion(sql: Sql) {
    const [{ server_version: version }] = await sql<
      { server_version: string }[]
    >`SHOW server_version`;
    return version;
  },
  async drop(sql: Sql, table: string) {
    await sql`DROP TABLE IF EXISTS ${sql(table)}`;
  },
};

export type HyperdriveCheckStep = keyof typeof steps;

/** What a step answers with: its result, or why it failed. */
export type HyperdriveCheckResponse = { result: unknown } | { failure: string };

/**
 * The Workers entry file, plus the steps of rule 9's check in AGENTS.md, through the
 * binding and the client options the API uses. It runs only while check.ts has
 * `wrangler dev` serve it, and is never deployed.
 */
export default {
  async fetch(...[request, env, context]: Parameters<typeof worker.fetch>) {
    const url = new URL(request.url);
    if (url.pathname !== HYPERDRIVE_CHECK_PATH) {
      return worker.fetch(request, env, context);
    }
    const step = url.searchParams.get('step') ?? '';
    const table = url.searchParams.get('table') ?? '';
    let response: HyperdriveCheckResponse;
    if (!Object.hasOwn(steps, step) || !/^hyperdrive_check_\w+$/.test(table)) {
      response = { failure: `No step "${step}" on table "${table}"` };
    } else {
      const sql = connect(env.HYPERDRIVE.connectionString);
      response = await steps[step as HyperdriveCheckStep](sql, table).then(
        (result) => ({ result }),
        (error: unknown) => ({
          failure: error instanceof Error ? error.message : String(error),
        }),
      );
    }
    return Response.json(response);
  },
};
