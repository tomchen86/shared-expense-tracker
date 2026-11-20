import type { Sql } from '../../src/database/connect';

/**
 * Makes a registered device a member device of a group that exists, with no progress
 * recorded for it, as the routes that let a device into a group will (#141, #144, #145).
 * Until one of them exists a group's only member device is the one that created it, so
 * the sync acceptance tests call this to give a group a second one.
 *
 * Stub: the implementer of #134 writes it against the tables that issue adds. It writes
 * what the API would, and nothing else.
 */
export function addMemberDevice(
  sql: Sql,
  member: { groupId: string; deviceId: string },
): Promise<void> {
  throw new Error(
    `Not implemented: addMemberDevice (${[sql, member].length} inputs)`,
  );
}
