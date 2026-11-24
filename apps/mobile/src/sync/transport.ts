import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import type { UploadedEvent } from '@shared-expense/domain/api';
import { encrypt } from '@shared-expense/domain/crypto';
import { getRandomValues } from 'expo-crypto';
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

/** What an event is encrypted with besides its key: five lines of ASCII (SYNC-67.1). */
export const associatedData = (
  groupId: string,
  eventId: string,
  deviceId: string,
  epoch: number,
) =>
  utf8ToBytes(
    ['shared-expense/event/v1', groupId, eventId, deviceId, String(epoch)].join(
      '\n',
    ),
  );

/** `events` as an upload carries them, each encrypted under `key` with a nonce of its own (SYNC-67.1). */
export function encryptEvents(
  groupId: string,
  deviceId: string,
  epoch: number,
  key: Uint8Array,
  events: readonly { id: string; content: string }[],
): UploadedEvent[] {
  return events.map(({ id, content }) => ({
    id,
    content: bytesToHex(
      encrypt({
        key,
        nonce: getRandomValues(new Uint8Array(24)),
        plaintext: utf8ToBytes(content),
        associatedData: associatedData(groupId, id, deviceId, epoch),
      }),
    ),
  }));
}
