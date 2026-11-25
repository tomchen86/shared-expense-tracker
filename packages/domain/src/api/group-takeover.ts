import { MEMBER_DEVICE_LIMIT } from './group-events';
import { hasRotationRecipients, type RotateKeyRequest } from './group-rotation';
import {
  isApproveJoinRequestBody,
  type ApproveJoinRequestBody,
  type ApproveJoinRequestResponse,
} from './join-decisions';
import { hasExactly } from './wire';

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
