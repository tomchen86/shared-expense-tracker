import type { Database } from '../storage';

// Approving and rejecting join requests on a member's phone, and learning the answer on
// the phone that asked (docs/specs/sharing/spec.md, SHARING-190.1 to 229.1; ADR-0039).
// Not built yet: issue 141's implementation replaces these bodies.

/** A join request a member's phone listed and could read (SHARING-191.1). It is kept in memory only. */
export interface ReceivedJoinRequest {
  /** The code of the invite it was sent under. */
  code: string;
  /** The device that asked. */
  deviceId: string;
  /** The name the applicant entered, trimmed. */
  name: string;
  /** The member the applicant picked, or null for a new member. */
  memberId: string | null;
}

/** Why a request cannot be approved as it is (SHARING-194.1). */
export type CannotApprove =
  'not-a-member' | 'has-a-phone' | 'group-full' | 'same-name';

/** How approving a request ended (SHARING-195.1 to 200.1). */
export type ApproveResult =
  | { outcome: 'approved' }
  /** A request of the sync, the snapshot or the approval got no answer. */
  | { outcome: 'no-answer' }
  /** The API holds no such request any more: someone answered it. */
  | { outcome: 'answered' }
  /** The group has its 20 member devices. */
  | { outcome: 'members-full' }
  | { outcome: 'cannot-approve'; reason: CannotApprove }
  | { outcome: 'failed' };

/** How rejecting a request ended (SHARING-201.1). */
export interface RejectResult {
  outcome: 'rejected' | 'no-answer' | 'answered' | 'failed';
}

/** What asking about this phone's own request found, and did (SHARING-210.1 to 222.1). */
export type JoinResult =
  /** The phone took the snapshot in: the group is a shared ledger on it. */
  | { outcome: 'joined'; groupId: string }
  /** Approved, and joining did not finish. */
  | { outcome: 'approved'; reason: 'no-answer' | 'update-needed' | 'failed' }
  | {
      outcome:
        | 'not-sent'
        | 'waiting'
        | 'choose-again'
        | 'declined'
        | 'invalid'
        | 'already-a-member'
        | 'no-answer';
    };

const notBuilt = (): never => {
  throw new Error('Not implemented: issue 141');
};

/**
 * Lists the group's requests from the API, rejects the ones this phone cannot read, and
 * resolves with the ones it can, in the API's order (SHARING-190.1 to 192.1).
 */
export const listReceivedJoinRequests: (
  database: Database,
  groupId: string,
) => Promise<ReceivedJoinRequest[]> = notBuilt;

/** Approves the request of `deviceId`, as pressing Approve does (SHARING-195.1). */
export const approveJoinRequest: (
  database: Database,
  groupId: string,
  deviceId: string,
) => Promise<ApproveResult> = notBuilt;

/** Rejects the request of `deviceId`, as pressing Decline does (SHARING-201.1). */
export const rejectJoinRequest: (
  database: Database,
  groupId: string,
  deviceId: string,
) => Promise<RejectResult> = notBuilt;

/**
 * Asks the API what became of this phone's request for the invite `code`, and acts on
 * the answer: joins when it was approved (SHARING-210.1 to 222.1).
 */
export const askJoinResult: (
  database: Database,
  code: string,
) => Promise<JoinResult> = notBuilt;
