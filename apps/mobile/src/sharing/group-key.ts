import { bytesToHex } from '@noble/hashes/utils.js';
import { getRandomValues } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { SEED_OPTIONS } from './device-identity';

const entry = (groupId: string, epoch: number) =>
  `group-key.${groupId}.${epoch}`;
export const GROUP_KEY_HEX = /^[0-9a-f]{64}$/;

/** A failed read throws: it must never cause a replacement key to be generated. */
export function readGroupKeyEntry(groupId: string, epoch: number) {
  return SecureStore.getItemAsync(entry(groupId, epoch), SEED_OPTIONS);
}

export function storeGroupKey(groupId: string, epoch: number, key: Uint8Array) {
  return SecureStore.setItemAsync(
    entry(groupId, epoch),
    bytesToHex(key),
    SEED_OPTIONS,
  );
}

// While a phone that was approved has not joined, the local data does not hold the group
// yet, and the keys its handover gave it are in the secure store already (SHARING-217.2).
// This entry, named after the invite's code, says whose they are, so that they can be
// deleted if the phone is removed before it joins (SHARING-282.1).
const joinEntry = (code: string) => `join-keys.${code}`;

/** Remembers that joining through the invite `code` saved the group's keys up to `epoch`. */
export function rememberJoinKeys(code: string, groupId: string, epoch: number) {
  return SecureStore.setItemAsync(
    joinEntry(code),
    `${groupId}.${epoch}`,
    SEED_OPTIONS,
  );
}

/** The group and the highest key epoch that joining through the invite `code` saved keys of. */
export async function readJoinKeys(code: string) {
  const value = await SecureStore.getItemAsync(joinEntry(code), SEED_OPTIONS);
  const [groupId, epoch] = value?.split('.') ?? [];
  return groupId && Number.isSafeInteger(Number(epoch))
    ? { groupId, epoch: Number(epoch) }
    : undefined;
}

export function forgetJoinKeys(code: string) {
  return SecureStore.deleteItemAsync(joinEntry(code), SEED_OPTIONS);
}

/** Deletes the entry of one key epoch; an entry that is not there is no error. */
export function deleteGroupKey(groupId: string, epoch: number) {
  return SecureStore.deleteItemAsync(entry(groupId, epoch), SEED_OPTIONS);
}

export async function ensureFirstGroupKey(groupId: string) {
  const held = await readGroupKeyEntry(groupId, 1);
  if (held === null || !GROUP_KEY_HEX.test(held))
    await storeGroupKey(groupId, 1, getRandomValues(new Uint8Array(32)));
}
