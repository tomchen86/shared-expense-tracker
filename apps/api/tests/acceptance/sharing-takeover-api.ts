import { randomBytes } from 'node:crypto';
import type { UploadedEvent } from '@shared-expense/domain/api';
import { registered, type Answer, type Phone } from './sharing-api';
import { caseyAsked, sha256Of, type Asked } from './sharing-decisions-api';
import { DANA, box } from './sharing-removal-api';
import {
  BRISBANE,
  GROUP_LIMIT,
  LARGEST,
  aMinuteLater,
  addMember,
  call,
  callForHeaders,
  event,
  events,
  expectUploaded,
  upload,
} from './sync-api';
import type { RequestInput } from './sharing-api';
import type { Snapshot } from './sync-snapshot-api';

// The tests of a takeover stand in for the phone of a member who approves a new phone in
// place of another member device (ADR-0015, ADR-0047), in the world of the approval tests
// with one more member device. The path, the body and the answers are put together here
// as docs/specs/sharing/spec.md words them. A request, a box and an event are whatever
// bytes a test picks: the API never reads them.

/** The header on a refusal that tells a device another one took its place, and its value. */
export const REPLACED = 'x-replaced';
export const TAKEOVER = 'takeover';

const idOf = (device: Phone | string) =>
  typeof device === 'string' ? device : device.deviceId;

export const takeoverPath = (groupId: string, applicant: Phone | string) =>
  `/groups/${groupId}/requests/${idOf(applicant)}/takeover`;

/** What a takeover carries. */
export interface Takeover {
  request: string;
  cursor: number;
  snapshotId: string;
  senderKey: string;
  epoch: number;
  box: string;
  remove: string[];
  boxes: { deviceId: string; box: string }[];
  events: UploadedEvent[];
}

/**
 * A takeover that approves the request whose content is `content`, naming `snapshot`:
 * it removes `remove` and carries a new box for each of `staying`. Cursor 0, the next
 * epoch after 1, random bytes for the key and the handover's box, and one event, unless
 * given.
 */
export const takeoverOf = (
  content: Uint8Array,
  snapshot: Pick<Snapshot, 'id'>,
  devices: { remove: (Phone | string)[]; staying: (Phone | string)[] },
  changes: Partial<Takeover> = {},
): Takeover => ({
  request: sha256Of(content),
  cursor: 0,
  snapshotId: snapshot.id,
  senderKey: randomBytes(32).toString('hex'),
  epoch: 2,
  box: randomBytes(200).toString('hex'),
  remove: devices.remove.map(idOf),
  boxes: devices.staying.map((device) => ({
    deviceId: idOf(device),
    box: box(),
  })),
  events: [event()],
  ...changes,
});

/** The request that takes over for `applicant`, for `call` and `callOn`. */
export const takeoverRequest = (
  groupId: string,
  applicant: Phone | string,
  body: unknown,
): RequestInput => ({
  method: 'POST',
  path: takeoverPath(groupId, applicant),
  body:
    typeof body === 'string' || body instanceof Uint8Array
      ? body
      : JSON.stringify(body),
});

/** Sends a takeover with `body`: a takeover, or bytes or text as they are given. */
export const takeOver = (
  phone: Phone,
  groupId: string,
  applicant: Phone | string,
  body: unknown,
) => call(phone, takeoverRequest(groupId, applicant, body));

/** The API took over: `applicant` is in, under the takeover's epoch, and its events got these numbers. */
export function expectTakenOver(
  answer: Answer,
  applicant: Phone | string,
  takeover: Pick<Takeover, 'epoch' | 'events'>,
  sequences: number[],
) {
  expect(answer).toEqual({
    status: 200,
    body: {
      deviceId: idOf(applicant),
      epoch: takeover.epoch,
      events: takeover.events.map(({ id }, index) => ({
        id,
        sequence: sequences[index],
      })),
    },
  });
}

const STATUS = {
  request: 400,
  'not-a-member': 403,
  'no-request': 404,
  'no-snapshot': 404,
  behind: 409,
  'rotation-needed': 409,
  devices: 409,
  epoch: 409,
  'group-full': 413,
} as const;

/** The answer is this refusal, under its status. */
export function expectTakeoverRefused(
  answer: Answer,
  refusal: { error: keyof typeof STATUS },
) {
  expect(answer).toEqual({ status: STATUS[refusal.error], body: refusal });
}

/** What the header says on the API's answer to a request `phone` signs; null when it has none. */
export const replacedOn = async (phone: Phone, input: RequestInput) =>
  (await callForHeaders(phone, input)).headers.get(REPLACED);

export interface TakeoverWorld extends Asked {
  dana: Phone;
}

/**
 * The scenarios' start: Brisbane with its invite under code A, Taylor's phone and Dana's
 * phone as its member devices, Casey's phone with its request P, and Taylor's complete
 * snapshot S for Casey's phone. `events` and `sequence` are those of `caseyAsked`.
 */
export async function caseyAsksWithDanaIn(
  options: Parameters<typeof caseyAsked>[0] = {},
): Promise<TakeoverWorld> {
  const asked = await caseyAsked(options);
  const dana = await registered(DANA);
  await addMember(BRISBANE, dana);
  return { ...asked, dana };
}

/** The takeover by which Taylor's phone lets Casey's phone take the place of Dana's. */
export const caseyForDana = (
  { taylor, P, S }: Pick<TakeoverWorld, 'taylor' | 'P' | 'S'>,
  changes: Partial<Takeover> = {},
) => takeoverOf(P, S, { remove: [DANA], staying: [taylor] }, changes);

/** The box a takeover carries for `device`. */
export const takeoverBoxFor = (takeover: Takeover, device: Phone | string) =>
  takeover.boxes.find(({ deviceId }) => deviceId === idOf(device))!.box;

/**
 * Fills Brisbane's events to `room` bytes short of its limit with events of `phone`: 159
 * of 65,536 bytes and one more. Resolves with the group's last sequence number.
 */
export async function fillBrisbane(phone: Phone, room = 0): Promise<number> {
  let stored = 0;
  for (const count of [...Array.from({ length: 22 }, () => 7), 5]) {
    const sent = events(count, LARGEST);
    expectUploaded(
      await upload(phone, BRISBANE, sent),
      sent,
      sent.map((_, index) => stored + index + 1),
    );
    stored += count;
  }
  aMinuteLater();
  const last = [event(GROUP_LIMIT - stored * LARGEST - room)];
  expectUploaded(await upload(phone, BRISBANE, last), last, [stored + 1]);
  aMinuteLater();
  return stored + 1;
}
