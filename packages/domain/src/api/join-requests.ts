import { hasExactly, isContent } from './group-events';
import { INVITE_REFUSAL_STATUS } from './invites';

/** The encrypted content sent by PUT. DELETE has no body. */
export interface JoinRequestBody {
  request: string;
}

export function isJoinRequestBody(value: unknown): value is JoinRequestBody {
  return hasExactly(value, ['request']) && isContent(value.request);
}

// Submitting, replacing and cancelling all acknowledge the same invite code.
export {
  isRevokeInviteResponse as isJoinRequestResponse,
  type RevokeInviteResponse as JoinRequestResponse,
} from './invites';

export const JOIN_REQUEST_REFUSAL_STATUS = {
  request: INVITE_REFUSAL_STATUS.request,
  'no-invite': INVITE_REFUSAL_STATUS['no-invite'],
  'already-a-member': 409,
  'requests-full': 409,
} as const;

export type JoinRequestRefusal = {
  error: keyof typeof JOIN_REQUEST_REFUSAL_STATUS;
};

export function isJoinRequestRefusal(
  value: unknown,
): value is JoinRequestRefusal {
  return (
    hasExactly(value, ['error']) &&
    typeof value.error === 'string' &&
    Object.hasOwn(JOIN_REQUEST_REFUSAL_STATUS, value.error)
  );
}
