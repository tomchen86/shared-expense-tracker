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

export async function ensureFirstGroupKey(groupId: string) {
  const held = await readGroupKeyEntry(groupId, 1);
  if (held === null || !GROUP_KEY_HEX.test(held))
    await storeGroupKey(groupId, 1, getRandomValues(new Uint8Array(32)));
}
