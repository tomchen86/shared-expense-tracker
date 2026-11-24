import {
  hasExactly,
  isContent,
  isUploadEventsRequest,
  isUploadEventsResponse,
  type UploadedEvent,
  type UploadEventsResponse,
} from './group-events';
import { isInviteCode } from './invites';
import { isHexContent, isId, isWhole } from './wire';

// What the requests that answer a join request look like on the wire (ADR-0039,
// docs/specs/sharing/spec.md): a member device lists its group's requests, rejects one or
// approves one, and the device that asked asks what became of its request. The phone and
// the API both use this file (ADR-0007).
//
// Every request here is a signed request, so the API can also refuse it with a `Refusal`,
// with a `GroupRefusal`, with the `SnapshotRefusal` `no-snapshot`, and the question about
// a result with the `JoinRequestRefusal`s `no-invite` and `already-a-member`.

/** The most bytes the contents of a page's requests add up to: 256 KiB. */
export const REQUESTS_PAGE_CONTENT_LIMIT = 262_144;

/** A join request as a member device lists it. */
export interface ListedJoinRequest {
  /** The code of the invite it was sent under. */
  code: string;
  /** The device that asked. */
  deviceId: string;
  /** The content, which the API never reads, in lowercase hexadecimal. */
  request: string;
}

/** What the API answers, with status 200, to a member device that lists its group's requests. */
export interface JoinRequestsPageResponse {
  /** In the order of their device IDs. */
  requests: ListedJoinRequest[];
  /** Whether the group has requests after the last one of this page. */
  more: boolean;
}

/** What the API answers, with status 200, once it has rejected a request. */
export interface RejectJoinRequestResponse {
  /** The device whose request it was. */
  deviceId: string;
}

/** The body of an approval, as JSON. */
export interface ApproveJoinRequestBody {
  /** The SHA-256 of the content the approval answers: 32 bytes in lowercase hexadecimal. */
  request: string;
  /** The approving phone's cursor in the group. */
  cursor: number;
  /** The complete snapshot it uploaded for the device that asked. */
  snapshotId: string;
  /** The approving phone's X25519 public key: 32 bytes in lowercase hexadecimal. */
  senderKey: string;
  /** The key epoch the events are encrypted under, and the newest one the box holds. */
  epoch: number;
  /** The box with the group's keys, which the API never reads: 41 to 65,536 bytes in lowercase hexadecimal. */
  box: string;
  /** The approval's events, as an upload carries them. */
  events: UploadedEvent[];
}

/** What the API answers, with status 200, once it has approved a request. */
export interface ApproveJoinRequestResponse extends UploadEventsResponse {
  /** The device that is now a member device. */
  deviceId: string;
}

/** What the API answers, with status 200, to a device that asks what became of its request. */
export type JoinResultResponse =
  | {
      state: 'approved';
      groupId: string;
      /** The device that approved. */
      deviceId: string;
      senderKey: string;
      epoch: number;
      box: string;
    }
  | { state: 'waiting' }
  /** The device has no request under the invite: it never asked, cancelled, or was rejected. */
  | { state: 'none' };

/** Why the API refused an approval or a rejection, besides the reasons it shares with other routes. */
export const JOIN_DECISION_REFUSAL_STATUS = {
  /** The group holds no request of that device with the content named. */
  'no-request': 404,
  /** The approving phone's cursor is before the group's last sequence number. */
  behind: 409,
  /** The group has its 20 member devices. */
  'members-full': 409,
} as const;

export type JoinDecisionRefusal = {
  error: keyof typeof JOIN_DECISION_REFUSAL_STATUS;
};

const isKey = (value: unknown) => isHexContent(value, 32, 32);

/** Whether `value` names a request's content: its SHA-256, 32 bytes in lowercase hexadecimal. */
export const isRequestHash = (value: unknown): value is string => isKey(value);

/** Whether `value` is exactly a page of a group's requests. */
export function isJoinRequestsPageResponse(
  value: unknown,
): value is JoinRequestsPageResponse {
  return (
    hasExactly(value, ['requests', 'more']) &&
    typeof value.more === 'boolean' &&
    Array.isArray(value.requests) &&
    // `every` skips an empty slot; a copy has `undefined` there, which is no request.
    Array.from(value.requests).every(
      (request) =>
        hasExactly(request, ['code', 'deviceId', 'request']) &&
        isInviteCode(request.code) &&
        isId(request.deviceId) &&
        isContent(request.request),
    )
  );
}

/** Whether `value` is exactly what the API answers once it has rejected a request. */
export function isRejectJoinRequestResponse(
  value: unknown,
): value is RejectJoinRequestResponse {
  return hasExactly(value, ['deviceId']) && isId(value.deviceId);
}

/** Whether `value` is exactly the body of an approval (SHARING-181.1). */
export function isApproveJoinRequestBody(
  value: unknown,
): value is ApproveJoinRequestBody {
  return (
    hasExactly(value, [
      'request',
      'cursor',
      'snapshotId',
      'senderKey',
      'epoch',
      'box',
      'events',
    ]) &&
    isKey(value.request) &&
    isWhole(value.cursor, 0) &&
    isId(value.snapshotId) &&
    isKey(value.senderKey) &&
    isContent(value.box) &&
    isUploadEventsRequest({ epoch: value.epoch, events: value.events })
  );
}

/** Whether `value` is exactly what the API answers once it has approved a request. */
export function isApproveJoinRequestResponse(
  value: unknown,
): value is ApproveJoinRequestResponse {
  return (
    hasExactly(value, ['deviceId', 'events']) &&
    isId(value.deviceId) &&
    isUploadEventsResponse({ events: value.events })
  );
}

/** Whether `value` is exactly an answer to a device that asks what became of its request. */
export function isJoinResultResponse(
  value: unknown,
): value is JoinResultResponse {
  if (hasExactly(value, ['state'])) {
    return value.state === 'waiting' || value.state === 'none';
  }
  return (
    hasExactly(value, [
      'state',
      'groupId',
      'deviceId',
      'senderKey',
      'epoch',
      'box',
    ]) &&
    value.state === 'approved' &&
    isId(value.groupId) &&
    isId(value.deviceId) &&
    isKey(value.senderKey) &&
    isWhole(value.epoch, 1) &&
    isContent(value.box)
  );
}

/** Whether `value` is exactly the body of one of these routes' own refusals. */
export function isJoinDecisionRefusal(
  value: unknown,
): value is JoinDecisionRefusal {
  return (
    hasExactly(value, ['error']) &&
    typeof value.error === 'string' &&
    Object.hasOwn(JOIN_DECISION_REFUSAL_STATUS, value.error)
  );
}
