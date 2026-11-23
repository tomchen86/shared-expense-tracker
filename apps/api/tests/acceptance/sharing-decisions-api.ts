import { createHash, randomBytes } from 'node:crypto';
import type { UploadedEvent } from '@shared-expense/domain/api';
import { type Answer, type Phone } from './sharing-api';
import {
  CODE_A,
  brisbaneInvitesCasey,
  expectRequestAnswered,
  joinRequest,
  requestPath,
  sendRequest,
  withEvents,
} from './sharing-invites-api';
import { BRISBANE, call, event, hexOf } from './sync-api';
import { ask, snapshotOf, uploadAll, type Snapshot } from './sync-snapshot-api';

// The tests of approving and rejecting stand in for the phones of a shared ledger's
// members and for a phone that asked to join (ADR-0015, ADR-0039), in the world of the
// invite tests. The paths, the bodies and the answers are put together here as
// docs/specs/sharing/spec.md words them. A request, a box and an event are whatever
// bytes a test picks: the API never reads them.

export const NO_REQUEST = { error: 'no-request' } as const;
export const BEHIND = { error: 'behind' } as const;
export const MEMBERS_FULL = { error: 'members-full' } as const;

/** The most member devices a group has. */
export const MOST_MEMBER_DEVICES = 20;
/** The most bytes of content a page of requests holds. */
export const PAGE_LIMIT = 262_144;

const deviceIdOf = (applicant: Phone | string) =>
  typeof applicant === 'string' ? applicant : applicant.deviceId;

export const requestsPath = (groupId: string, query = '') =>
  `/groups/${groupId}/requests${query}`;
export const decisionPath = (groupId: string, applicant: Phone | string) =>
  `/groups/${groupId}/requests/${deviceIdOf(applicant)}`;
export const approvalPath = (groupId: string, applicant: Phone | string) =>
  `${decisionPath(groupId, applicant)}/approval`;

/** Lists the group's requests; `query` is what follows the path, as it is given. */
export const listRequests = (phone: Phone, groupId: string, query = '') =>
  call(phone, { path: requestsPath(groupId, query) });

/** Lists the requests after the one of `applicant`. */
export const listAfter = (
  phone: Phone,
  groupId: string,
  applicant: Phone | string,
) => listRequests(phone, groupId, `?after=${deviceIdOf(applicant)}`);

export const reject = (
  phone: Phone,
  groupId: string,
  applicant: Phone | string,
  body?: Uint8Array | string,
) =>
  call(phone, {
    method: 'DELETE',
    path: decisionPath(groupId, applicant),
    body,
  });

export const sha256Of = (content: Uint8Array) =>
  createHash('sha256').update(content).digest('hex');

/** What an approval carries: random bytes for the key, the box and one event, unless given. */
export interface Approval {
  request: string;
  cursor: number;
  snapshotId: string;
  senderKey: string;
  epoch: number;
  box: string;
  events: UploadedEvent[];
}

/** An approval of the request whose content is `content`, naming `snapshot`. */
export const approvalOf = (
  content: Uint8Array,
  snapshot: Pick<Snapshot, 'id'>,
  changes: Partial<Approval> = {},
): Approval => ({
  request: sha256Of(content),
  cursor: 0,
  snapshotId: snapshot.id,
  senderKey: randomBytes(32).toString('hex'),
  epoch: 1,
  box: randomBytes(200).toString('hex'),
  events: [event()],
  ...changes,
});

/** The request that approves `applicant`, for `call` and `callOn`. */
export const approvalRequest = (
  groupId: string,
  applicant: Phone | string,
  body: unknown,
) => ({
  method: 'POST',
  path: approvalPath(groupId, applicant),
  body:
    typeof body === 'string' || body instanceof Uint8Array
      ? body
      : JSON.stringify(body),
});

/** Approves `applicant` with `body`: an approval, or bytes or text as they are given. */
export const approve = (
  phone: Phone,
  groupId: string,
  applicant: Phone | string,
  body: unknown,
) => call(phone, approvalRequest(groupId, applicant, body));

/** Asks what became of `phone`'s request for the invite; `query` follows the path as given. */
export const askResult = (phone: Phone, code: string, query = '') =>
  call(phone, { path: `${requestPath(code)}${query}` });

// Answers

export const WAITING = { status: 200, body: { state: 'waiting' } };
export const NONE = { status: 200, body: { state: 'none' } };

/** A page of the group's requests: each with its code, its device and its content. */
export function expectRequests(
  answer: Answer,
  requests: [code: string, applicant: Phone | string, content: Uint8Array][],
  more = false,
) {
  expect(answer).toEqual({
    status: 200,
    body: {
      requests: requests.map(([code, applicant, content]) => ({
        code,
        deviceId: deviceIdOf(applicant),
        request: hexOf(content),
      })),
      more,
    },
  });
}

export function expectRejected(answer: Answer, applicant: Phone | string) {
  expect(answer).toEqual({
    status: 200,
    body: { deviceId: deviceIdOf(applicant) },
  });
}

/** The API approved `applicant`, and gave the approval's events these sequence numbers. */
export function expectApproved(
  answer: Answer,
  applicant: Phone | string,
  approval: Pick<Approval, 'events'>,
  sequences: number[],
) {
  expect(answer).toEqual({
    status: 200,
    body: {
      deviceId: deviceIdOf(applicant),
      events: approval.events.map(({ id }, index) => ({
        id,
        sequence: sequences[index],
      })),
    },
  });
}

/** The API tells the applicant it was approved by `by`, with the handover of `approval`. */
export function expectHandover(
  answer: Answer,
  groupId: string,
  by: Phone,
  approval: Pick<Approval, 'senderKey' | 'epoch' | 'box'>,
) {
  expect(answer).toEqual({
    status: 200,
    body: {
      state: 'approved',
      groupId,
      deviceId: by.deviceId,
      senderKey: approval.senderKey,
      epoch: approval.epoch,
      box: approval.box,
    },
  });
}

const STATUS = {
  request: 400,
  'not-a-member': 403,
  'no-request': 404,
  'no-invite': 404,
  'no-snapshot': 404,
  behind: 409,
  'members-full': 409,
  'already-a-member': 409,
  'group-full': 413,
} as const;

/** The answer is this refusal, under its status. */
export function expectDecisionRefused(
  answer: Answer,
  refusal: { error: keyof typeof STATUS },
) {
  expect(answer).toEqual({ status: STATUS[refusal.error], body: refusal });
}

// Groups

/** Whether the group counts `phone` among its member devices: only those may ask it for a snapshot. */
export const isMemberDevice = async (groupId: string, phone: Phone) =>
  (await ask(phone, groupId)).status !== 403;

export const bytesOf = (hex: string) => new Uint8Array(Buffer.from(hex, 'hex'));

export interface Asked {
  taylor: Phone;
  casey: Phone;
  /** The content of Casey's request. */
  P: Uint8Array;
  /** Taylor's complete snapshot for Casey's phone. */
  S: Snapshot;
}

/**
 * The scenarios' start: Brisbane with its invite under code A and `events` events that
 * Taylor's phone uploaded, Casey's phone with its request P for the invite, and Taylor's
 * complete snapshot S for Casey's phone, which covers `sequence`: every event unless
 * given. With `sequence` false, S is not uploaded.
 */
export async function caseyAsked({
  events: count = 0,
  sequence = count as number | false,
} = {}): Promise<Asked> {
  const [taylor, casey] = await brisbaneInvitesCasey();
  if (count > 0) await withEvents(taylor, BRISBANE, count);
  const P = joinRequest();
  expectRequestAnswered(await sendRequest(casey, CODE_A, P), CODE_A);
  const S = snapshotOf(taylor, casey, {
    sequence: sequence === false ? 0 : sequence,
  });
  if (sequence !== false) await uploadAll(BRISBANE, S);
  return { taylor, casey, P, S };
}
