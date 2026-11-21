import {
  GROUP_REFUSAL_STATUS,
  hasExactly,
  isContent,
  isWhole,
} from './group-events';
import { REFUSAL_STATUS } from './signed-request';

/** PUT creates the invite or replaces the encrypted card at this cursor. */
export interface PutInviteRequest {
  cursor: number;
  card: string;
}

export interface PutInviteResponse {
  code: string;
  expiresAtMs: number;
  cursor: number;
}

export interface RevokeInviteResponse {
  code: string;
}

export interface ReadInviteResponse {
  expiresAtMs: number;
  card: string;
}

/** Refusals after the signed request has passed the device checks. */
export const INVITE_REFUSAL_STATUS = {
  request: REFUSAL_STATUS.request,
  'not-a-member': GROUP_REFUSAL_STATUS['not-a-member'],
  'invite-exists': 409,
  'no-invite': 404,
} as const;

export type InviteRefusal = { error: keyof typeof INVITE_REFUSAL_STATUS };

/** Exactly 16 bytes in unpadded base64url, including zero padding bits in the last digit. */
export function isInviteCode(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{21}[AQgw]$/.test(value);
}

export function isPutInviteRequest(value: unknown): value is PutInviteRequest {
  return (
    hasExactly(value, ['cursor', 'card']) &&
    isWhole(value.cursor, 0) &&
    isContent(value.card)
  );
}

export function isPutInviteResponse(
  value: unknown,
): value is PutInviteResponse {
  return (
    hasExactly(value, ['code', 'expiresAtMs', 'cursor']) &&
    isInviteCode(value.code) &&
    isWhole(value.expiresAtMs, 0) &&
    isWhole(value.cursor, 0)
  );
}

export function isRevokeInviteResponse(
  value: unknown,
): value is RevokeInviteResponse {
  return hasExactly(value, ['code']) && isInviteCode(value.code);
}

export function isReadInviteResponse(
  value: unknown,
): value is ReadInviteResponse {
  return (
    hasExactly(value, ['expiresAtMs', 'card']) &&
    isWhole(value.expiresAtMs, 0) &&
    isContent(value.card)
  );
}

export function isInviteRefusal(value: unknown): value is InviteRefusal {
  return (
    hasExactly(value, ['error']) &&
    typeof value.error === 'string' &&
    Object.hasOwn(INVITE_REFUSAL_STATUS, value.error)
  );
}
