import type { Sql } from '../../src/database/connect';

/**
 * Makes a registered device a member device of a group that exists, with no progress
 * recorded for it, as the routes that let a device into a group will (#141, #144, #145).
 * Until one of them exists a group's only member device is the one that created it, so
 * the sync acceptance tests call this to give a group a second one.
 *
 * It writes the row the API writes for the device that creates a group, and nothing else.
 */
export async function addMemberDevice(
  sql: Sql,
  member: { groupId: string; deviceId: string },
): Promise<void> {
  await sql`
    INSERT INTO group_members (group_id, device_id)
    VALUES (${member.groupId}, ${member.deviceId})`;
}
