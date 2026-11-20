import { randomBytes } from 'node:crypto';
import {
  GROUP_REFUSAL_STATUS,
  REFUSAL_STATUS,
} from '@shared-expense/domain/api';
import {
  CASEY,
  TAYLOR,
  registered,
  type Answer,
  type Phone,
} from './sharing-api';
import {
  BRISBANE,
  addMember,
  call,
  createGroup,
  events,
  expectCreated,
  expectUploaded,
  hexOf,
  upload,
} from './sync-api';

// The invite tests stand in for phones that create, revoke and read a shared ledger's
// invite through the API (ADR-0015, ADR-0025). They run in the world of the sync tests.
// The paths, the bodies and the answers are put together here as
// docs/specs/sharing/spec.md words them, and a card is whatever bytes a test picks: the
// API never reads it.

/** The codes of the scenarios: each is 16 bytes as base64url without padding. */
export const CODE_A = '3q2-7wEjRWeJq83vEjRWeA';
export const CODE_B = 'AAECAwQFBgcICQoLDA0ODw';
export const CODE_C = '__7dzLuqmYh3ZlVEMyIRAA';

/** How long an invite lasts: 7 days. */
export const WEEK = 604_800_000;

/** The fewest and the most bytes a card may have. */
export const SMALLEST_CARD = 41;
export const LARGEST_CARD = 65_536;

export const REQUEST = { error: 'request' } as const;
export const NOT_A_MEMBER = { error: 'not-a-member' } as const;
export const INVITE_EXISTS = { error: 'invite-exists' } as const;
export const NO_INVITE = { error: 'no-invite' } as const;

/** A card of `size` random bytes. */
export const card = (size = 200) => new Uint8Array(randomBytes(size));

export const invitePath = (groupId: string, code: string) =>
  `/groups/${groupId}/invites/${code}`;
export const readPath = (code: string) => `/invites/${code}`;

/** The body of a request that creates an invite or replaces its card. */
export const inviteBody = (content: Uint8Array, cursor = 0) =>
  JSON.stringify({ cursor, card: hexOf(content) });

/** Asks the API to create the invite, or to take a new card for it. */
export const putInvite = (
  phone: Phone,
  groupId: string,
  code: string,
  content: Uint8Array,
  cursor = 0,
) =>
  call(phone, {
    method: 'PUT',
    path: invitePath(groupId, code),
    body: inviteBody(content, cursor),
  });

/** The same with a body as it is given. */
export const putInviteBody = (
  phone: Phone,
  groupId: string,
  code: string,
  body?: Uint8Array | string,
) => call(phone, { method: 'PUT', path: invitePath(groupId, code), body });

export const revokeInvite = (
  phone: Phone,
  groupId: string,
  code: string,
  body?: Uint8Array | string,
) => call(phone, { method: 'DELETE', path: invitePath(groupId, code), body });

export const readInvite = (phone: Phone, code: string) =>
  call(phone, { path: readPath(code) });

// Answers

/** The API created the invite, or already had it: it expires at `expiresAtMs` and holds a card labelled `cursor`. */
export function expectInvite(
  answer: Answer,
  code: string,
  expiresAtMs: number,
  cursor = 0,
) {
  expect(answer).toEqual({ status: 200, body: { code, expiresAtMs, cursor } });
}

export function expectRevoked(answer: Answer, code: string) {
  expect(answer).toEqual({ status: 200, body: { code } });
}

/** Reading the invite gives its expiry and exactly this card. */
export function expectCard(
  answer: Answer,
  expiresAtMs: number,
  content: Uint8Array,
) {
  expect(answer).toEqual({
    status: 200,
    body: { expiresAtMs, card: hexOf(content) },
  });
}

const STATUS = {
  request: REFUSAL_STATUS.request,
  'not-a-member': GROUP_REFUSAL_STATUS['not-a-member'],
  'invite-exists': 409,
  'no-invite': 404,
};

/** The answer is this refusal of the invite API, under its status. */
export function expectInviteRefused(
  answer: Answer,
  refusal: { error: keyof typeof STATUS },
) {
  expect(answer).toEqual({ status: STATUS[refusal.error], body: refusal });
}

// Groups

/** Taylor's phone with Brisbane, which it created, and Casey's phone, registered and no member device. */
export async function taylorWithBrisbaneAndCasey(): Promise<[Phone, Phone]> {
  const taylor = await registered(TAYLOR);
  const casey = await registered(CASEY);
  expectCreated(await createGroup(taylor, BRISBANE), BRISBANE);
  return [taylor, casey];
}

/** The same, with Casey's phone a member device of Brisbane too. */
export async function bothInBrisbane(): Promise<[Phone, Phone]> {
  const phones = await taylorWithBrisbaneAndCasey();
  await addMember(BRISBANE, phones[1]);
  return phones;
}

/** Gives the group `count` events, uploaded by `phone`, so that its latest sequence number is `count`. */
export async function withEvents(phone: Phone, groupId: string, count: number) {
  const stored = events(count);
  expectUploaded(
    await upload(phone, groupId, stored),
    stored,
    stored.map((_, index) => index + 1),
  );
}
