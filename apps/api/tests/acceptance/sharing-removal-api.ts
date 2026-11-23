import { randomBytes } from 'node:crypto';
import type { UploadedEvent } from '@shared-expense/domain/api';
import { registered, type Answer, type Phone } from './sharing-api';
import { taylorWithBrisbaneAndCasey } from './sharing-invites-api';
import { BRISBANE, addMember, call, event } from './sync-api';

// The tests of removing a device, leaving and rotating the group key stand in for the
// phones of a shared ledger's members (ADR-0015, ADR-0041), in the world of the sync
// tests. The paths, the bodies and the answers are put together here as
// docs/specs/sharing/spec.md words them. A box, a public key and an event are whatever
// bytes a test picks: the API never reads them.

/** The device ID of Dana's phone in the scenarios. */
export const DANA = '2d6f0a7e-3c1b-4e8a-9f52-6b7c8d9e0f1a';

/** The fewest and the most bytes a box of a rotation has. */
export const SMALLEST_BOX = 41;
export const LARGEST_BOX = 1_024;
/** The most boxes one answer holds. */
export const MOST_KEYS = 100;

export const ROTATION_NOT_NEEDED = { error: 'rotation-not-needed' } as const;

const idOf = (device: Phone | string) =>
  typeof device === 'string' ? device : device.deviceId;

/** The device IDs as the API lists them: from the smallest, character by character. */
export const listed = (...devices: (Phone | string)[]) =>
  devices.map(idOf).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

/** The refusal of a rotation whose boxes do not name the group's member devices, which are `devices`. */
export const otherDevices = (...devices: (Phone | string)[]) =>
  ({ error: 'devices', devices: listed(...devices) }) as const;

/** The refusal of a request to a group that needs a rotation, whose member devices are `devices`. */
export const rotationNeeded = (...devices: (Phone | string)[]) =>
  ({ error: 'rotation-needed', devices: listed(...devices) }) as const;

export const rotationPath = (groupId: string, query = '') =>
  `/groups/${groupId}/rotation${query}`;
export const leavePath = (groupId: string, query = '') =>
  `/groups/${groupId}/leave${query}`;
export const keysPath = (groupId: string, query = '') =>
  `/groups/${groupId}/keys${query}`;

/** A box of `size` random bytes, in hexadecimal. */
export const box = (size = 120) => randomBytes(size).toString('hex');

export interface Rotation {
  epoch: number;
  remove: string[];
  senderKey: string;
  boxes: { deviceId: string; box: string }[];
  events: UploadedEvent[];
}

/**
 * What a rotation carries: the next epoch after 1, nobody to remove, a random public key,
 * a new box for each of `staying`, and one event, unless given.
 */
export const rotationOf = (
  staying: (Phone | string)[],
  changes: Partial<Rotation> = {},
): Rotation => ({
  epoch: 2,
  remove: [],
  senderKey: randomBytes(32).toString('hex'),
  boxes: staying.map((device) => ({ deviceId: idOf(device), box: box() })),
  events: [event()],
  ...changes,
});

/** The request that rotates the group's key, for `call` and `callOn`. */
export const rotationRequest = (groupId: string, body: unknown) => ({
  method: 'POST',
  path: rotationPath(groupId),
  body:
    typeof body === 'string' || body instanceof Uint8Array
      ? body
      : JSON.stringify(body),
});

/** Rotates the group's key with `body`: a rotation, or bytes or text as they are given. */
export const rotate = (phone: Phone, groupId: string, body: unknown) =>
  call(phone, rotationRequest(groupId, body));

/** The request by which a phone leaves the group, for `call` and `callOn`. */
export const leaveRequest = (groupId: string, body?: Uint8Array | string) => ({
  method: 'POST',
  path: leavePath(groupId),
  body,
});

/** `phone` leaves the group; `body` is what the request carries, which is nothing unless given. */
export const leave = (
  phone: Phone,
  groupId: string,
  body?: Uint8Array | string,
) => call(phone, leaveRequest(groupId, body));

/** Asks for the boxes after `after`, which is written into the query as it is given. */
export const keysAfter = (
  phone: Phone,
  groupId: string,
  after: number | string,
) => call(phone, { path: keysPath(groupId, `?after=${after}`) });

// Answers

/** The API rotated the key, and gave the rotation's events these sequence numbers. */
export function expectRotated(
  answer: Answer,
  rotation: Pick<Rotation, 'epoch' | 'events'>,
  sequences: number[],
) {
  expect(answer).toEqual({
    status: 200,
    body: {
      epoch: rotation.epoch,
      events: rotation.events.map(({ id }, index) => ({
        id,
        sequence: sequences[index],
      })),
    },
  });
}

export function expectLeft(answer: Answer, phone: Phone) {
  expect(answer).toEqual({ status: 200, body: { deviceId: phone.deviceId } });
}

/** A page of the boxes kept for a phone: each with its epoch, the sender's key and the box. */
export function expectKeys(
  answer: Answer,
  keys: [epoch: number, rotation: Pick<Rotation, 'senderKey'>, box: string][],
  more = false,
) {
  expect(answer).toEqual({
    status: 200,
    body: {
      keys: keys.map(([epoch, { senderKey }, sealed]) => ({
        epoch,
        senderKey,
        box: sealed,
      })),
      more,
    },
  });
}

const STATUS = {
  request: 400,
  'not-a-member': 403,
  devices: 409,
  epoch: 409,
  'rotation-needed': 409,
  'rotation-not-needed': 409,
  'group-full': 413,
} as const;

/** The answer is this refusal, under its status. */
export function expectRemovalRefused(
  answer: Answer,
  refusal: { error: keyof typeof STATUS },
) {
  expect(answer).toEqual({ status: STATUS[refusal.error], body: refusal });
}

/** The box a rotation carries for `device`. */
export const boxFor = (rotation: Rotation, device: Phone | string) =>
  rotation.boxes.find(({ deviceId }) => deviceId === idOf(device))!.box;

export const bytesOf = (hex: string) => new Uint8Array(Buffer.from(hex, 'hex'));

// Groups

/**
 * The scenarios' start: Brisbane, which Taylor's phone created, with Casey's phone and
 * Dana's phone as member devices too. No invite, no event, key epoch 1.
 */
export async function threeInBrisbane(): Promise<[Phone, Phone, Phone]> {
  const [taylor, casey] = await taylorWithBrisbaneAndCasey();
  const dana = await registered(DANA);
  await addMember(BRISBANE, casey);
  await addMember(BRISBANE, dana);
  return [taylor, casey, dana];
}

/** The rotation by which Taylor's phone removes Dana's: boxes for Taylor's and Casey's phones. */
export const removingDana = (
  taylor: Phone,
  casey: Phone,
  changes: Partial<Rotation> = {},
) => rotationOf([taylor, casey], { remove: [DANA], ...changes });
