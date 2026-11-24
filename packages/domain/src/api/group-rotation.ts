import {
  MEMBER_DEVICE_LIMIT,
  isMemberDeviceList,
  isUploadEventsRequest,
  isUploadEventsResponse,
  type UploadedEvent,
  type UploadEventsResponse,
} from './group-events';
import { hasExactly, isHexContent, isId, isWhole } from './wire';

// What the requests that take a device out of a group look like on the wire (ADR-0041,
// docs/specs/sharing/spec.md): a member device rotates the group's key, which is also how
// it removes other member devices, leaves the group, or fetches the boxes that hold the
// keys of the rotations it missed. The phone and the API both use this file (ADR-0007).
//
// Every request here is a signed request, so the API can also refuse it with a `Refusal`
// and with the `GroupRefusal`s `not-a-member`, `epoch` and `group-full`.

/** The fewest bytes a rotation's box has: what encryption adds to any plaintext. */
export const KEY_BOX_MINIMUM = 41;
/** The most bytes a rotation's box has. */
export const KEY_BOX_LIMIT = 1_024;
/** The most boxes one answer to a question for keys holds. */
export const KEYS_PAGE_LIMIT = 100;

/** A rotation's box for one device that stays. */
export interface RotationBox {
  /** The device that can open it. */
  deviceId: string;
  /** The box, which the API never reads: 41 to 1,024 bytes in lowercase hexadecimal. */
  box: string;
}

/** The body of a rotation, as JSON. */
export interface RotateKeyRequest {
  /** The new key epoch, which is the group's next one: a whole number from 2. */
  epoch: number;
  /** The member devices to take out of the group: 0 to 19 device IDs, each once. */
  remove: string[];
  /** The sending phone's X25519 public key: 32 bytes in lowercase hexadecimal. */
  senderKey: string;
  /** One box for each member device that stays, the sender's own included: 1 to 20. */
  boxes: RotationBox[];
  /** The rotation's events, as an upload carries them, or none. */
  events: UploadedEvent[];
}

/** What the API answers, with status 200, once it has rotated a group's key. */
export interface RotateKeyResponse extends UploadEventsResponse {
  /** The group's key epoch now. */
  epoch: number;
}

/** What the API answers, with status 200, once a device has left a group. */
export interface LeaveGroupResponse {
  /** The device that left. */
  deviceId: string;
}

/** A box the API keeps for a member device. */
export interface StoredKeyBox {
  /** The key epoch whose key it holds. */
  epoch: number;
  /** The X25519 public key of the phone that made it. */
  senderKey: string;
  box: string;
}

/** What the API answers, with status 200, to a member device that asks for its keys. */
export interface GroupKeysResponse {
  /** In the order of their epochs, the lowest first. */
  keys: StoredKeyBox[];
  /** Whether the API keeps boxes for the device after the last one of this page. */
  more: boolean;
}

/** Why the API refused a rotation, besides the reasons it shares with other routes. */
export type RotationRefusal =
  /**
   * The rotation does not name the group's member devices, which are `devices`: 1 to 20
   * device IDs, each once, the smallest first.
   */
  | { error: 'devices'; devices: string[] }
  /** The rotation removes no device, and the group needs no new key. */
  | { error: 'rotation-not-needed' };

/** The HTTP status of each of these refusals. */
export const ROTATION_REFUSAL_STATUS = {
  devices: 409,
  'rotation-not-needed': 409,
} as const;

const isKey = (value: unknown) => isHexContent(value, 32, 32);
const isBox = (value: unknown) =>
  isHexContent(value, KEY_BOX_MINIMUM, KEY_BOX_LIMIT);

/** Whether `value` is exactly the body of a rotation (SHARING-261.1). */
export function isRotateKeyRequest(value: unknown): value is RotateKeyRequest {
  if (!hasExactly(value, ['epoch', 'remove', 'senderKey', 'boxes', 'events'])) {
    return false;
  }
  const { epoch, remove, senderKey, boxes, events } = value;
  if (
    !isWhole(epoch, 2) ||
    !isKey(senderKey) ||
    !Array.isArray(remove) ||
    remove.length >= MEMBER_DEVICE_LIMIT ||
    // `every` skips an empty slot; a copy has `undefined` there, which is no device ID.
    !Array.from(remove).every(isId) ||
    new Set(remove).size !== remove.length ||
    !Array.isArray(boxes) ||
    boxes.length < 1 ||
    boxes.length > MEMBER_DEVICE_LIMIT ||
    !Array.isArray(events)
  ) {
    return false;
  }
  const receivers = new Set<string>();
  for (const item of Array.from(boxes) as unknown[]) {
    if (
      !hasExactly(item, ['deviceId', 'box']) ||
      !isId(item.deviceId) ||
      !isBox(item.box) ||
      receivers.has(item.deviceId) ||
      remove.includes(item.deviceId)
    ) {
      return false;
    }
    receivers.add(item.deviceId);
  }
  // As an upload's events (SYNC-53.1), except that there may be none.
  return events.length === 0 || isUploadEventsRequest({ epoch, events });
}

/** Whether `value` is exactly what the API answers once it has rotated a key. */
export function isRotateKeyResponse(
  value: unknown,
): value is RotateKeyResponse {
  return (
    hasExactly(value, ['epoch', 'events']) &&
    isWhole(value.epoch, 2) &&
    isUploadEventsResponse({ events: value.events })
  );
}

/** Whether `value` is exactly what the API answers once a device has left. */
export function isLeaveGroupResponse(
  value: unknown,
): value is LeaveGroupResponse {
  return hasExactly(value, ['deviceId']) && isId(value.deviceId);
}

/** Whether `value` is exactly a page of the boxes kept for a device. */
export function isGroupKeysResponse(
  value: unknown,
): value is GroupKeysResponse {
  if (!hasExactly(value, ['keys', 'more'])) return false;
  const { keys, more } = value;
  return (
    typeof more === 'boolean' &&
    Array.isArray(keys) &&
    keys.length <= KEYS_PAGE_LIMIT &&
    Array.from(keys as unknown[]).every(
      (key, index) =>
        hasExactly(key, ['epoch', 'senderKey', 'box']) &&
        isWhole(key.epoch, 2) &&
        isKey(key.senderKey) &&
        isBox(key.box) &&
        // Each box before this one has passed, so it has an epoch.
        (index === 0 || (keys[index - 1] as StoredKeyBox).epoch < key.epoch),
    )
  );
}

/** Whether `value` is exactly the body of one of a rotation's own refusals. */
export function isRotationRefusal(value: unknown): value is RotationRefusal {
  if (hasExactly(value, ['error', 'devices'])) {
    return value.error === 'devices' && isMemberDeviceList(value.devices);
  }
  return hasExactly(value, ['error']) && value.error === 'rotation-not-needed';
}
