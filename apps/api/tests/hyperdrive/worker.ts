import { connect, type Sql } from '../../src/database/connect';
import worker from '../../src/workers';
import { addMemberDevice } from '../support/group-members';
import { HYPERDRIVE_CHECK_PATH } from './path';

class RollBack extends Error {}

// A lowercase version-4 UUID, and an Ed25519 public key in hexadecimal.
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PUBLIC_KEY = /^[0-9a-f]{64}$/;

/**
 * The phones and the group of the check's requests to the event API, each under an ID
 * the check made up, so that the steps here touch no row of anyone else.
 */
export interface EventApiGuests {
  groupId: string;
  phones: { deviceId: string; publicKey: string }[];
}

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
    // As each signed request's transaction begins and locks its device
    // (src/sharing/devices.ts), under keys no request uses: Hyperdrive has to let both
    // through to PostgreSQL.
    await sql.begin('isolation level read committed', async (transaction) => {
      await transaction`SELECT pg_advisory_xact_lock(${0}, ${0})`;
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
  // The event API's requests go through its own routes (check.ts). These are the parts
  // no route does for a check: telling whether the database has the API's tables, which
  // a deploy's migrations make, and putting in and taking out the check's own phones.
  async eventApiTables(sql: Sql) {
    const [{ ready }] = await sql<{ ready: boolean }[]>`
      SELECT to_regclass('devices') IS NOT NULL
        AND to_regclass('group_events') IS NOT NULL AS ready`;
    return ready;
  },
  // What registering stores, without counting towards an IP's new devices.
  async admit(sql: Sql, _table: string, { phones }: EventApiGuests) {
    for (const { deviceId, publicKey } of phones) {
      await sql`
        INSERT INTO devices (id, public_key)
        VALUES (${deviceId}, decode(${publicKey}, 'hex'))`;
    }
  },
  // No route lets a second device into a group yet (#141).
  async join(sql: Sql, _table: string, { groupId, phones }: EventApiGuests) {
    await addMemberDevice(sql, { groupId, deviceId: phones[1].deviceId });
  },
  // Every row the check's phones and its group left, the record of their requests too.
  async forget(sql: Sql, _table: string, { groupId, phones }: EventApiGuests) {
    await sql.begin(async (transaction) => {
      await transaction`DELETE FROM group_events WHERE group_id = ${groupId}`;
      await transaction`DELETE FROM group_members WHERE group_id = ${groupId}`;
      await transaction`DELETE FROM groups WHERE id = ${groupId}`;
      for (const { deviceId } of phones) {
        await transaction`DELETE FROM device_requests WHERE device_id = ${deviceId}`;
        await transaction`DELETE FROM devices WHERE id = ${deviceId}`;
      }
    });
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
    // Written as check.ts writes them: `group=<ID>` and `phone=<device ID>.<public key>`.
    const guests: EventApiGuests = {
      groupId: url.searchParams.get('group') ?? '',
      phones: url.searchParams.getAll('phone').map((phone) => {
        const [deviceId, publicKey = ''] = phone.split('.');
        return { deviceId, publicKey };
      }),
    };
    let response: HyperdriveCheckResponse;
    if (!Object.hasOwn(steps, step) || !/^hyperdrive_check_\w+$/.test(table)) {
      response = { failure: `No step "${step}" on table "${table}"` };
    } else if (
      (guests.groupId !== '' && !UUID.test(guests.groupId)) ||
      !guests.phones.every(
        ({ deviceId, publicKey }) =>
          UUID.test(deviceId) && PUBLIC_KEY.test(publicKey),
      )
    ) {
      response = {
        failure: `Step "${step}" names no group or phone of a check`,
      };
    } else {
      const sql = connect(env.HYPERDRIVE.connectionString);
      response = await steps[step as HyperdriveCheckStep](
        sql,
        table,
        guests,
      ).then(
        (result) => ({ result }),
        (error: unknown) => ({
          failure: error instanceof Error ? error.message : String(error),
        }),
      );
    }
    return Response.json(response);
  },
};
