import * as SecureStore from 'expo-secure-store';
import type { SqlExecutor } from '../storage';
import { SEED_OPTIONS } from './device-identity';
import { deleteGroupKey, groupKeyEntry } from './group-key';

// While a phone that was approved has not joined, the local data does not hold the group
// yet, and the keys its handover gave it are in the secure store already (SHARING-217.2).
// An entry beside them, named after the invite's code, says whose they are and up to
// which key epoch, so that they can be deleted if the phone is removed before it joins,
// also after a restart (SHARING-282.1). The local data cannot say it: it names no group
// the phone has not joined.

const entry = (code: string) => `join-keys.${code}`;

async function readJoinKeys(code: string) {
  const value = await SecureStore.getItemAsync(entry(code), SEED_OPTIONS);
  if (value === null) return;
  const [groupId, epoch] = value.split('.');
  return { groupId, epoch: Number(epoch), value };
}

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
  const saved = await readJoinKeys(code);
  if (!saved) return;
  const { groupId, epoch } = saved;
  const held = await database.all(
    'SELECT 1 FROM sync_groups WHERE groupId = ? AND readOnly IS NULL',
    [groupId],
  );
  for (let each = 1; held.length === 0 && each <= epoch; each += 1)
    await deleteGroupKey(groupId, each).catch(() => undefined);
  await forgetJoinKeys(code);
}

/**
 * Discard each old request's keys before making the new identity (SHARING-321.1).
 * Keep the deleted values only until the SQLite commit. Restoring in reverse order
 * puts the manifest back before any key that depends on it.
 */
export async function discardJoinKeysForIdentityChange<T>(
  codes: readonly string[],
  changeIdentity: () => Promise<T>,
): Promise<T> {
  const deleted: { key: string; value: string }[] = [];
  async function remove(key: string, value: string | null) {
    if (value === null) return;
    await SecureStore.deleteItemAsync(key, SEED_OPTIONS);
    deleted.push({ key, value });
  }
  try {
    for (const code of codes) {
      const saved = await readJoinKeys(code);
      if (!saved) continue;
      for (let epoch = 1; epoch <= saved.epoch; epoch++) {
        const key = groupKeyEntry(saved.groupId, epoch);
        await remove(key, await SecureStore.getItemAsync(key, SEED_OPTIONS));
      }
      await remove(entry(code), saved.value);
    }
    return await changeIdentity();
  } catch (error) {
    for (const { key, value } of deleted.reverse())
      await SecureStore.setItemAsync(key, value, SEED_OPTIONS);
    throw error;
  }
}
