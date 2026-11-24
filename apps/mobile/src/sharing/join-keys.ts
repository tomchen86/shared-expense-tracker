import * as SecureStore from 'expo-secure-store';
import type { SqlExecutor } from '../storage';
import { SEED_OPTIONS } from './device-identity';
import { deleteGroupKey } from './group-key';

// While a phone that was approved has not joined, the local data does not hold the group
// yet, and the keys its handover gave it are in the secure store already (SHARING-217.2).
// An entry beside them, named after the invite's code, says whose they are and up to
// which key epoch, so that they can be deleted if the phone is removed before it joins,
// also after a restart (SHARING-282.1). The local data cannot say it: it names no group
// the phone has not joined.

const entry = (code: string) => `join-keys.${code}`;

/** Remembers that joining through the invite `code` saved the group's keys up to `epoch`. */
export function rememberJoinKeys(code: string, groupId: string, epoch: number) {
  return SecureStore.setItemAsync(
    entry(code),
    `${groupId}.${epoch}`,
    SEED_OPTIONS,
  );
}

/** Forgets what `rememberJoinKeys` kept: the phone has joined, or the request has ended. */
export function forgetJoinKeys(code: string) {
  return SecureStore.deleteItemAsync(entry(code), SEED_OPTIONS);
}

/**
 * Deletes the group keys that joining through the invite `code` saved, for a group this
 * phone has not joined after all. Only the keys of a shared ledger it is in by now stay:
 * a copy of the group that the request was sent over has no key of its own, so every key
 * under its group ID is one that joining saved.
 */
export async function dropJoinKeys(database: SqlExecutor, code: string) {
  const saved = await SecureStore.getItemAsync(entry(code), SEED_OPTIONS);
  const [groupId, epoch] = (saved ?? '').split('.');
  const held = await database.all(
    'SELECT 1 FROM sync_groups WHERE groupId = ? AND readOnly IS NULL',
    [groupId],
  );
  // No entry leaves no epoch to count to.
  for (let each = 1; held.length === 0 && each <= Number(epoch); each += 1)
    await deleteGroupKey(groupId, each).catch(() => undefined);
  await forgetJoinKeys(code);
}
