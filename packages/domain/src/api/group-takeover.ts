import { MEMBER_DEVICE_LIMIT } from './group-events';
import { hasRotationRecipients, type RotateKeyRequest } from './group-rotation';
import {
  isApproveJoinRequestBody,
  isApproveJoinRequestResponse,
  type ApproveJoinRequestBody,
  type ApproveJoinRequestResponse,
} from './join-decisions';
import { hasExactly, isWhole } from './wire';

/** On an event upload or download refused because a takeover replaced this device. */
export const REPLACED_HEADER = 'x-replaced';
export const REPLACED_BY_TAKEOVER = 'takeover';

/** An approval under the next epoch, with the rotation's removed devices and key boxes. */
export type TakeoverRequestBody = ApproveJoinRequestBody &
  Pick<RotateKeyRequest, 'remove' | 'boxes'>;

/** The admitted device, the new epoch and the sequence number of each submitted event. */
export interface TakeoverResponse extends ApproveJoinRequestResponse {
  epoch: number;
}

function isTakeoverResponse(value: unknown): value is TakeoverResponse {
  return (
    hasExactly(value, ['deviceId', 'epoch', 'events']) &&
    isWhole(value.epoch, 2) &&
    isApproveJoinRequestResponse({
      deviceId: value.deviceId,
      events: value.events,
    })
  );
}

/** A phone may save its proposed key only on confirmation of its applicant, epoch and events. */
export function confirmsTakeover(
  value: unknown,
  applicant: string,
  sent: Pick<TakeoverRequestBody, 'epoch' | 'events'>,
): value is TakeoverResponse {
  return (
    isTakeoverResponse(value) &&
    value.epoch === sent.epoch &&
    value.deviceId === applicant &&
    value.events.length === sent.events.length &&
    value.events.every(({ id }, at) => id === sent.events[at].id)
  );
}

/** Whether the body has exactly the nine fields of a takeover (SHARING-303.1). */
export function isTakeoverRequestBody(
  value: unknown,
): value is TakeoverRequestBody {
  if (
    !hasExactly(value, [
      'request',
      'cursor',
      'snapshotId',
      'senderKey',
      'epoch',
      'box',
      'remove',
      'boxes',
      'events',
    ]) ||
    !hasRotationRecipients(value)
  )
    return false;
  const { remove, boxes, ...approval } = value;
  return (
    remove.length > 0 &&
    boxes.length < MEMBER_DEVICE_LIMIT &&
    isApproveJoinRequestBody(approval) &&
    approval.epoch >= 2
  );
}
