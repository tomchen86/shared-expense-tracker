import {
  KEYS_PAGE_LIMIT,
  type GroupKeysResponse,
  type LeaveGroupResponse,
  type RotateKeyRequest,
  type RotateKeyResponse,
  type RotationRefusal,
} from '@shared-expense/domain/api';
import type { TransactionSql } from 'postgres';
import type { Sql } from '../database/connect';
import {
  isMemberDevice,
  lockMemberGroup,
  memberDevices,
  storeLockedGroupEvents,
  type EventApiRefusal,
} from '../sync/groups';

// Taking a device out of a group (ADR-0041): a member device rotates the group's key and
// removes others with the same request, leaves, or fetches the boxes of the rotations it
// missed. Each write is one transaction under the group's lock, so a rotation, an
// approval and a leave that arrive together end as if one followed the other
// (SHARING-265.1).

type RemovalRefusal = EventApiRefusal | RotationRefusal;

/**
 * Deletes what the API keeps for these devices in the group: that they are member
 * devices, with their progress and whether they wait for a snapshot, the snapshots made
 * for them, their boxes and their handovers (SHARING-250.1, SHARING-254.1).
 */
async function forgetDevices(
  tx: TransactionSql,
  groupId: string,
  deviceIds: readonly string[],
) {
  // The IDs go as one JSON text, as an upload's event IDs do.
  const gone = tx`
    SELECT jsonb_array_elements_text(${JSON.stringify(deviceIds)}::text::jsonb)::uuid`;
  await tx`
    WITH members AS (
      DELETE FROM group_members
      WHERE group_id = ${groupId} AND device_id = ANY (ARRAY(${gone}))
    ), snapshots AS (
      DELETE FROM group_snapshots
      WHERE group_id = ${groupId} AND recipient = ANY (ARRAY(${gone}))
    ), boxes AS (
      DELETE FROM group_key_boxes
      WHERE group_id = ${groupId} AND device_id = ANY (ARRAY(${gone}))
    )
    DELETE FROM invite_handovers h USING group_invites i
    WHERE h.code = i.code AND i.group_id = ${groupId}
      AND h.device_id = ANY (ARRAY(${gone}))`;
}

/**
 * Rotates the group's key in one transaction under its lock (SHARING-250.1): it stores
 * the rotation's events under the new epoch, takes the devices of `remove` out of the
 * group, moves the group to the new epoch and keeps one box for each device that stays,
 * or does none of it and resolves with the first reason of SHARING-262.1.
 */
export function rotateKey(
  sql: Sql,
  groupId: string,
  deviceId: string,
  rotation: RotateKeyRequest,
  now: () => number,
): Promise<RotateKeyResponse | RemovalRefusal> {
  const { epoch, remove, senderKey, boxes, events } = rotation;
  return sql.begin<RotateKeyResponse | RemovalRefusal>(
    'isolation level read committed',
    async (tx) => {
      const group = await lockMemberGroup(tx, groupId, deviceId);
      if (!group) return { error: 'not-a-member' };

      // The boxes name exactly the member devices that stay, the sender among them
      // (SHARING-251.1). A device that was approved, left or was removed since the phone
      // looked makes them differ.
      const devices = await memberDevices(tx, groupId);
      const staying = devices.filter((device) => !remove.includes(device));
      if (
        remove.includes(deviceId) ||
        staying.length !== devices.length - remove.length ||
        staying.length !== boxes.length ||
        !boxes.every((box) => staying.includes(box.deviceId))
      ) {
        return { error: 'devices', devices };
      }
      if (epoch !== Number(group.epoch) + 1) {
        return { error: 'epoch', epoch: Number(group.epoch) };
      }
      if (remove.length === 0 && !group.rotation_needed) {
        return { error: 'rotation-not-needed' };
      }

      // The events first: a full group refuses them before anything is written. They are
      // stored as an upload under the new epoch, which the group has from this request on.
      const stored = await storeLockedGroupEvents(
        tx,
        { ...group, epoch: String(epoch), rotation_needed: false },
        { groupId, deviceId, epoch, events, now: now() },
      );
      if ('error' in stored) return stored;

      await forgetDevices(tx, groupId, remove);
      await tx`
        WITH rotated AS (
          UPDATE groups SET epoch = ${epoch}, rotation_needed = false
          WHERE id = ${groupId}
        )
        INSERT INTO group_key_boxes (group_id, device_id, epoch, sender_key, box)
        SELECT ${groupId}::uuid, (sent.box->>'deviceId')::uuid, ${epoch}::bigint,
          decode(${senderKey}, 'hex'), decode(sent.box->>'box', 'hex')
        FROM jsonb_array_elements(${JSON.stringify(boxes)}::text::jsonb) AS sent (box)`;
      return { epoch, events: stored.events };
    },
  ) as Promise<RotateKeyResponse | RemovalRefusal>;
}

/**
 * Takes the device out of the group in one transaction under its lock (SHARING-254.1).
 * While other member devices stay, the group needs a rotation from then on; when none
 * does, the group and everything the API stores for it are deleted, except that the
 * codes of its invites stay used (SHARING-255.1).
 */
export function leaveGroup(
  sql: Sql,
  groupId: string,
  deviceId: string,
): Promise<LeaveGroupResponse | RemovalRefusal> {
  return sql.begin<LeaveGroupResponse | RemovalRefusal>(
    'isolation level read committed',
    async (tx) => {
      if (!(await lockMemberGroup(tx, groupId, deviceId))) {
        return { error: 'not-a-member' };
      }
      await forgetDevices(tx, groupId, [deviceId]);
      const [marked] = await tx`
        UPDATE groups SET rotation_needed = true
        WHERE id = ${groupId}
          AND EXISTS (SELECT FROM group_members WHERE group_id = ${groupId})
        RETURNING id`;
      if (!marked) {
        // Revoking an invite deletes its requests (sharing/0003). Deleting a snapshot
        // deletes its chunks.
        await tx`
          WITH handovers AS (
            DELETE FROM invite_handovers h USING group_invites i
            WHERE h.code = i.code AND i.group_id = ${groupId}
          ), requests AS (
            DELETE FROM invite_join_requests r USING group_invites i
            WHERE r.code = i.code AND i.group_id = ${groupId}
          ), invites AS (
            UPDATE group_invites
            SET group_id = NULL, revoked = true, card = NULL, cursor = NULL
            WHERE group_id = ${groupId}
          ), boxes AS (
            DELETE FROM group_key_boxes WHERE group_id = ${groupId}
          ), snapshots AS (
            DELETE FROM group_snapshots WHERE group_id = ${groupId}
          )
          DELETE FROM group_events WHERE group_id = ${groupId}`;
        await tx`DELETE FROM groups WHERE id = ${groupId}`;
      }
      return { deviceId };
    },
  ) as Promise<LeaveGroupResponse | RemovalRefusal>;
}

/**
 * The boxes the group keeps for the device after the epoch it names, the lowest epoch
 * first, and no longer those up to it: the phone has saved their keys (SHARING-259.1).
 */
export function readKeys(
  sql: Sql,
  groupId: string,
  deviceId: string,
  after: number,
): Promise<GroupKeysResponse | RemovalRefusal> {
  return sql.begin<GroupKeysResponse | RemovalRefusal>(
    'isolation level read committed',
    async (tx) => {
      // Like a download, it shares the group's lock: a rotation and a leave wait, so a
      // device that is being taken out gets no box of the rotation that removes it.
      const [member] = await tx`
        SELECT 1 FROM groups g
        JOIN group_members m ON m.group_id = g.id
        WHERE g.id = ${groupId} AND m.device_id = ${deviceId}
        FOR SHARE OF g`;
      if (!member || !(await isMemberDevice(tx, groupId, deviceId))) {
        return { error: 'not-a-member' };
      }
      // Read one box past what a page holds to tell whether more follow.
      const rows = await tx<
        { epoch: string; sender_key: string; box: string }[]
      >`
        WITH saved AS (
          DELETE FROM group_key_boxes
          WHERE group_id = ${groupId} AND device_id = ${deviceId}
            AND epoch <= ${after}
        )
        SELECT epoch, encode(sender_key, 'hex') AS sender_key,
          encode(box, 'hex') AS box
        FROM group_key_boxes
        WHERE group_id = ${groupId} AND device_id = ${deviceId}
          AND epoch > ${after}
        ORDER BY epoch
        LIMIT ${KEYS_PAGE_LIMIT + 1}`;
      return {
        keys: rows.slice(0, KEYS_PAGE_LIMIT).map((row) => ({
          epoch: Number(row.epoch),
          senderKey: row.sender_key,
          box: row.box,
        })),
        more: rows.length > KEYS_PAGE_LIMIT,
      };
    },
  ) as Promise<GroupKeysResponse | RemovalRefusal>;
}
