import type { Database } from '../storage';
import { subscribeToAppliedEvents } from '../sync/apply';
import { activeInvite } from '../sync/invites';
import { subscribeToUnsentEvents } from '../sync/records';
import { apiUrl } from './api-address';
import { storedDeviceId } from './device-identity';
import { putInvite } from './invite-api';
import { readCard } from './invite-card';

const updates = new WeakMap<Database, Map<string, Promise<void>>>();

/** Serialize card replacements for a ledger: two requests at the same cursor otherwise race. */
export function refreshInviteCard(
  database: Database,
  groupId: string,
  retry = false,
) {
  if (!apiUrl()) return;
  let ledgers = updates.get(database);
  if (!ledgers) updates.set(database, (ledgers = new Map()));
  // Capture each committed change, even when a previous card is still on the wire.
  const snapshot = database
    .transaction(async (tx) => {
      const invite = await activeInvite(tx, groupId);
      if (invite) return { invite, card: await readCard(tx, groupId) };
    })
    .catch(() => undefined);
  const previous = ledgers.get(groupId) ?? Promise.resolve();
  const next = previous
    .then(async () => {
      const update = await snapshot;
      if (!update) return;
      const { invite, card } = update;
      // The card is sent for the identity the invite was read with (SHARING-321.1).
      let signer: string | null = null;
      const send = await database.transaction(async (tx) => {
        signer = await storedDeviceId(tx);
        const current = await activeInvite(tx, groupId);
        if (current?.code !== invite.code || current.secret !== invite.secret)
          return false;
        if (
          card.hash === current.cardHash &&
          !(retry && current.cardPending && !card.tooLarge)
        )
          return false;
        // Persist the attempt before sending. Later unrelated saves must not retry it;
        // changing the card or opening Invite can, including after a restart.
        await tx.run(
          'UPDATE group_invites SET cardHash = ?, cardPending = 1 WHERE id = ?',
          [card.hash, invite.code],
        );
        return !card.tooLarge;
      });
      if (!send) return;
      await putInvite(database, groupId, invite, card, signer);
      await database.run(
        'UPDATE group_invites SET cardPending = 0 WHERE groupId = ? AND id = ? AND secret = ? AND cardHash = ?',
        [groupId, invite.code, invite.secret, card.hash],
      );
    })
    .catch(() => undefined)
    .finally(() => {
      if (ledgers.get(groupId) === next) ledgers.delete(groupId);
    });
  ledgers.set(groupId, next);
}

/** Both notifications queue a read after the transaction that changed the ledger. */
export function watchInviteCards(database: Database) {
  const changed = (groupId: string) => refreshInviteCard(database, groupId);
  const local = subscribeToUnsentEvents((groupId, _position, type) => {
    if (
      type === 'group' ||
      type === 'member' ||
      type === 'invite' ||
      type === 'device'
    )
      changed(groupId);
  });
  const remote = subscribeToAppliedEvents(database, changed);
  return () => {
    local();
    remote();
  };
}
