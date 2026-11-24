import { hexToBytes } from '@noble/hashes/utils.js';
import {
  INVITE_REFUSAL_STATUS,
  isGroupId,
  isInviteCode,
  isInviteRefusal,
  isReadInviteResponse,
} from '@shared-expense/domain/api';
import { decrypt } from '@shared-expense/domain/crypto';
import type { SqlExecutor } from '../storage';
import { GIVE_UP_AFTER_MS, jsonIn } from '../sync/loop';
import { UNSENT_EVENTS } from '../sync/records';
import { apiUrl } from './api-address';
import { fetchAnswer } from './api-request';
import { cardCipher, type InviteCredentials } from './invite-card';

export const cannotUse =
  "This invite link can't be used. Ask the person who sent it to send it again.";
export const wentWrong = 'Something went wrong. Try again later.';
export const offline = 'Connect to the internet to join this group.';

export interface JoinCard {
  name: string;
  members: { id: string; name: string; hasDevice: boolean }[];
}

interface LocalGroup {
  id: string;
  archived: number;
}

/**
 * A copy of an invite's group that this phone holds (SHARING-226.2): a read-only copy,
 * with how many of its events were never sent, or a group of its own that is no shared
 * ledger. An approval replaces it, so the user is asked before the request is sent.
 */
export interface JoinCopy {
  groupId: string;
  own: boolean;
  unsent: number;
}

export type InviteNotice = { kind: 'notice'; message: string; retry?: boolean };

export function parseInviteLink(link: string): InviteCredentials | undefined {
  // Inspect the original path and fragment: URL normalization can erase an extra segment.
  const match =
    /^(?:https:\/\/[^/?#]+\/i\/|shared-expense-tracker:\/\/i\/)([^?#]*)(?:\?[^#]*)?#(.*)$/i.exec(
      link,
    );
  if (
    !match ||
    !isInviteCode(match[1]) ||
    !/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(match[2])
  )
    return;
  return { code: match[1], secret: match[2] };
}

export async function groupForLink(
  db: SqlExecutor,
  link: InviteCredentials,
): Promise<LocalGroup | undefined> {
  // A read-only copy is no membership: its own invite's link is read like any other
  // (SHARING-130.2).
  const [group] = await db.all<LocalGroup>(
    `SELECT g.id, g.archived FROM group_invites i JOIN groups g ON g.id = i.groupId
     JOIN sync_groups s ON s.groupId = i.groupId AND s.readOnly IS NULL
     WHERE i.id = ? AND i.secret = ?`,
    [link.code, link.secret],
  );
  return group;
}

function hasName(value: unknown): value is { name: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    typeof value.name === 'string' &&
    value.name.length > 0
  );
}

function isCard(value: unknown): value is JoinCard {
  return (
    hasName(value) &&
    'members' in value &&
    Array.isArray(value.members) &&
    value.members.length > 0 &&
    value.members.every(
      (member: unknown) =>
        hasName(member) &&
        'id' in member &&
        isGroupId(member.id) &&
        'hasDevice' in member &&
        typeof member.hasDevice === 'boolean',
    )
  );
}

/** The invite's card as the API holds it now, or the notice that says why it cannot be read. */
async function fetchCard(
  link: InviteCredentials,
): Promise<JoinCard | InviteNotice> {
  const url = apiUrl();
  const answer =
    url &&
    (await fetchAnswer(
      `${url}/invites/${link.code}`,
      { method: 'GET', credentials: 'omit' },
      GIVE_UP_AFTER_MS,
    ));
  if (!answer) return { kind: 'notice', message: offline, retry: true };
  const said = jsonIn(answer.body);
  if (answer.status !== 200 || !isReadInviteResponse(said)) {
    if (
      isInviteRefusal(said) &&
      (said.error === 'no-invite' || said.error === 'request') &&
      answer.status === INVITE_REFUSAL_STATUS[said.error]
    )
      return { kind: 'notice', message: cannotUse };
    return { kind: 'notice', message: wentWrong, retry: true };
  }
  const opened = decrypt({
    ...cardCipher(link),
    ciphertext: hexToBytes(said.card),
  });
  if (!opened.ok)
    return {
      kind: 'notice',
      message:
        opened.reason === 'unsupported-version'
          ? 'Update the app to use this invite link.'
          : cannotUse,
    };
  const card = jsonIn(opened.plaintext);
  return isCard(card) ? card : { kind: 'notice', message: cannotUse };
}

/** Why an invite's card was not read: the request got no answer, or one that holds no card. */
export type CardUnread = 'no-answer' | 'unreadable';

/** The invite's card as the API holds it now, or why it was not read. */
export async function readInviteCard(
  link: InviteCredentials,
): Promise<JoinCard | CardUnread> {
  const card = await fetchCard(link);
  if (!('kind' in card)) return card;
  return card.message === offline ? 'no-answer' : 'unreadable';
}

export async function readJoinInvite(
  db: SqlExecutor,
  link: InviteCredentials,
): Promise<
  | InviteNotice
  | { kind: 'form'; card: JoinCard; copy?: JoinCopy }
  | { kind: 'group'; group: LocalGroup }
> {
  const card = await fetchCard(link);
  if ('kind' in card) return card;
  const memberIds = JSON.stringify(card.members.map(({ id }) => id));
  // Former members still identify their shared ledger. A read-only copy is none.
  const [group] = await db.all<LocalGroup>(
    `SELECT g.id, g.archived FROM json_each(?) c
     JOIN group_members m ON m.id = c.value
     JOIN sync_groups s ON s.groupId = m.groupId AND s.readOnly IS NULL
     JOIN groups g ON g.id = s.groupId ORDER BY c.key LIMIT 1`,
    [memberIds],
  );
  if (group) return { kind: 'group', group };
  // A read-only copy, or a group of this phone that is no shared ledger, with one of
  // these members is a copy of the invite's group (SHARING-226.2).
  const [copy] = await db.all<{ groupId: string; own: number; unsent: number }>(
    `SELECT m.groupId, s.groupId IS NULL AS own,
       (SELECT COUNT(*) FROM ${UNSENT_EVENTS} o WHERE o.groupId = m.groupId) AS unsent
     FROM json_each(?) c JOIN group_members m ON m.id = c.value
     LEFT JOIN sync_groups s ON s.groupId = m.groupId
     ORDER BY c.key LIMIT 1`,
    [memberIds],
  );
  return copy
    ? { kind: 'form', card, copy: { ...copy, own: copy.own === 1 } }
    : { kind: 'form', card };
}
