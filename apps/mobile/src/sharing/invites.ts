import { MAX_SHARED_GROUP_MEMBERS } from '@shared-expense/domain';
import type { Database, SqlExecutor } from '../storage';
import { shareGroup } from '../sync';
import { notifyApplied } from '../sync/apply';
import {
  activeInvite,
  discardPendingInvite,
  recordCreatedInvite,
  recordRevokedInvite,
  type Invite,
} from '../sync/invites';
import { sharedGroup } from '../sync/records';
import { apiUrl } from './api-address';
import { readDeviceIdentity, storedDeviceId } from './device-identity';
import { ensureFirstGroupKey } from './group-key';
import {
  createSharedGroup,
  InviteRefused,
  InviteRequestError,
  putInvite,
  revokeInviteOnApi,
} from './invite-api';
import {
  newInviteCredentials,
  readCard,
  type InviteCredentials,
} from './invite-card';
import { refreshInviteCard } from './refresh-invite-card';

export type InviteResult =
  Invite | 'offline' | 'unavailable' | 'exists' | 'error' | 'members' | 'size';
const preparing = new WeakMap<Database, Map<string, Promise<InviteResult>>>();

class InviteLimit extends Error {
  constructor(readonly reason: 'unavailable' | 'members' | 'size') {
    super(reason);
  }
}

async function cardForNewInvite(tx: SqlExecutor, groupId: string) {
  const card = await readCard(tx, groupId);
  if (card.unavailable) throw new InviteLimit('unavailable');
  if (!card.shared && card.members > MAX_SHARED_GROUP_MEMBERS)
    throw new InviteLimit('members');
  if (card.tooLarge) throw new InviteLimit('size');
  return card;
}

async function pendingCredentials(tx: SqlExecutor, groupId: string) {
  const [pending] = await tx.all<InviteCredentials>(
    'SELECT code, secret FROM pending_invites WHERE groupId = ?',
    [groupId],
  );
  if (pending) return pending;
  const credentials = newInviteCredentials();
  await tx.run(
    'INSERT INTO pending_invites (groupId, code, secret) VALUES (?, ?, ?)',
    [groupId, credentials.code, credentials.secret],
  );
  return credentials;
}

async function prepare(
  database: Database,
  groupId: string,
): Promise<InviteResult> {
  if (!apiUrl()) return 'offline';
  const existing = await activeInvite(database, groupId);
  if (existing) {
    refreshInviteCard(database, groupId, true);
    return existing;
  }
  // Each request is for the identity the ledger was read with (SHARING-321.1).
  const initial = await database.transaction(async (tx) => ({
    ...(await cardForNewInvite(tx, groupId)),
    signer: await storedDeviceId(tx),
  }));
  if (!initial.shared) {
    await createSharedGroup(database, groupId, initial.signer);
    const identity = await readDeviceIdentity(database);
    if (identity.status !== 'ready') return 'unavailable';
    await shareGroup(
      database,
      { groupId, device: identity.deviceId },
      async (tx) => {
        // Members can keep editing while the API is creating the group.
        await cardForNewInvite(tx, groupId);
        await ensureFirstGroupKey(groupId);
      },
    );
    notifyApplied(database, groupId);
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    const { card, credentials, signer } = await database.transaction(
      async (tx) => ({
        card: await cardForNewInvite(tx, groupId),
        credentials: await pendingCredentials(tx, groupId),
        signer: await storedDeviceId(tx),
      }),
    );
    let expiresAtMs: number;
    try {
      ({ expiresAtMs } = await putInvite(
        database,
        groupId,
        credentials,
        card,
        signer,
      ));
    } catch (error) {
      if (error instanceof InviteRefused) {
        await discardPendingInvite(database, groupId, credentials);
        if (error.reason === 'no-invite') continue;
      }
      throw error;
    }
    const invite = { ...credentials, expiresAtMs };
    await database.transaction(async (tx) => {
      const group = (await sharedGroup(tx, groupId))!;
      await recordCreatedInvite(tx, group, invite, card.hash);
    });
    return invite;
  }
  return 'error';
}

/** Closing the screen detaches a reader; every opener shares the group's outstanding preparation. */
export function prepareInvite(
  database: Database,
  groupId: string,
): Promise<InviteResult> {
  let groups = preparing.get(database);
  if (!groups) preparing.set(database, (groups = new Map()));
  const running = groups.get(groupId);
  if (running) return running;
  const next = prepare(database, groupId)
    .catch((error: unknown): InviteResult => {
      if (error instanceof InviteLimit) return error.reason;
      if (error instanceof InviteRequestError) {
        if (error.reason === 'no-answer') return 'offline';
        if (
          error.reason === 'not-a-member' ||
          error.reason === 'authorization-lost'
        )
          return 'unavailable';
        if (error.reason === 'invite-exists') return 'exists';
      }
      return 'error';
    })
    .finally(() => groups.delete(groupId));
  groups.set(groupId, next);
  return next;
}

export async function revokeInvite(
  database: Database,
  groupId: string,
  code: string,
) {
  await revokeInviteOnApi(database, groupId, code);
  await database.transaction(async (tx) => {
    const group = (await sharedGroup(tx, groupId))!;
    await recordRevokedInvite(tx, group, code);
  });
  notifyApplied(database, groupId);
}
