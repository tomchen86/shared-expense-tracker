import { hexToBytes } from '@noble/hashes/utils.js';
import { GROUP_KEY_HEX, readGroupKeyEntry } from '../sharing/group-key';
import { utf8Text } from './utf8';

/** How long a request of a sync may take to be answered in full (SYNC-97.1). */
export const GIVE_UP_AFTER_MS = 60_000;

/**
 * The group key of one key epoch (SYNC-66.1), including for a snapshot. A caller
 * that distinguishes a failed secure-store read from an absent key can throw from
 * `onReadError` (SYNC-95.1).
 */
export async function readGroupKey(
  groupId: string,
  epoch: number,
  onReadError: (cause: unknown) => null = () => null,
): Promise<Uint8Array | undefined> {
  const value = await readGroupKeyEntry(groupId, epoch).catch(onReadError);
  return value !== null && GROUP_KEY_HEX.test(value)
    ? hexToBytes(value)
    : undefined;
}

/** The JSON value in a UTF-8 body, or null if it cannot be decoded. */
export function jsonIn(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(utf8Text(bytes));
  } catch {
    return null;
  }
}
