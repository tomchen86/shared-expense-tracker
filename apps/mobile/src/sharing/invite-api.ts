import {
  INVITE_REFUSAL_STATUS,
  isCreateGroupResponse,
  isInviteRefusal,
  isPutInviteResponse,
  isRevokeInviteResponse,
  type InviteRefusal,
} from '@shared-expense/domain/api';
import type { Database } from '../storage';
import { GIVE_UP_AFTER_MS, jsonIn } from '../sync/loop';
import { apiUrl } from './api-address';
import { sendApiRequest } from './api-request';
import {
  encryptedCard,
  type InviteCard,
  type InviteCredentials,
} from './invite-card';

export type InviteFailure =
  | InviteRefusal['error']
  | 'no-answer'
  | 'authorization-lost'
  | 'identity-changed'
  | 'unexpected';

export class InviteRequestError extends Error {
  constructor(readonly reason: InviteFailure) {
    super(reason);
  }
}

/** This refusal resolves the pending credentials for the PUT that sent them. */
export class InviteRefused extends InviteRequestError {}

async function request(
  database: Database,
  method: string,
  path: string,
  body?: string,
  deviceId?: string | null,
) {
  const url = apiUrl();
  if (!url) throw new InviteRequestError('no-answer');
  const result = await sendApiRequest(database, {
    apiUrl: url,
    method,
    path,
    body,
    deviceId,
    giveUpAfterMs: GIVE_UP_AFTER_MS,
  });
  if (result.outcome !== 'answered')
    throw new InviteRequestError(
      result.outcome === 'not-registered' ? 'unexpected' : result.outcome,
    );
  const said = jsonIn(result.body);
  if (result.status === 200) return said;
  if (
    isInviteRefusal(said) &&
    INVITE_REFUSAL_STATUS[said.error] === result.status
  )
    throw new InviteRefused(said.error);
  throw new InviteRequestError('unexpected');
}

const pathFor = (groupId: string, code: string) =>
  `/groups/${groupId}/invites/${code}`;

/** `deviceId` is the identity the group was read with (SHARING-321.1), as for an invite. */
export async function createSharedGroup(
  database: Database,
  groupId: string,
  deviceId?: string | null,
) {
  const said = await request(
    database,
    'PUT',
    `/groups/${groupId}`,
    undefined,
    deviceId,
  ).catch((error: unknown) => {
    if (error instanceof InviteRefused && error.reason !== 'not-a-member')
      throw new InviteRequestError('unexpected');
    throw error;
  });
  if (!isCreateGroupResponse(said) || said.groupId !== groupId)
    throw new InviteRequestError('unexpected');
}

export async function putInvite(
  database: Database,
  groupId: string,
  credentials: InviteCredentials,
  card: InviteCard,
  deviceId?: string | null,
) {
  const said = await request(
    database,
    'PUT',
    pathFor(groupId, credentials.code),
    JSON.stringify({
      cursor: card.cursor,
      card: encryptedCard(credentials, card),
    }),
    deviceId,
  );
  if (
    !isPutInviteResponse(said) ||
    said.code !== credentials.code ||
    said.cursor < card.cursor
  )
    throw new InviteRequestError('unexpected');
  return said;
}

export async function revokeInviteOnApi(
  database: Database,
  groupId: string,
  code: string,
) {
  const said = await request(database, 'DELETE', pathFor(groupId, code));
  if (!isRevokeInviteResponse(said) || said.code !== code)
    throw new InviteRequestError('unexpected');
}
