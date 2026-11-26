import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import {
  EVENT_CONTENT_LIMIT,
  EVENT_CONTENT_MINIMUM,
} from '@shared-expense/domain/api';
import { deriveKey, encrypt } from '@shared-expense/domain/crypto';
import { fromByteArray, toByteArray } from 'base64-js';
import { getRandomValues } from 'expo-crypto';
import type { SqlExecutor } from '../storage';
import { membersWithPhones } from '../sync/roster';

const PURPOSE = 'shared-expense/invite/card/v1';

export interface InviteCredentials {
  code: string;
  secret: string;
}

function randomBase64Url(size: number) {
  return fromByteArray(getRandomValues(new Uint8Array(size)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

export function newInviteCredentials(): InviteCredentials {
  return { code: randomBase64Url(16), secret: randomBase64Url(32) };
}

/** Read in one transaction so the names, member order and cursor describe one ledger state. */
export async function readCard(tx: SqlExecutor, groupId: string) {
  // A read-only copy invites nobody: nothing is sent for it (SYNC-302.1, SHARING-321.1).
  const [group] = await tx.all<{
    name: string;
    unavailable: number;
    cursor: number | null;
  }>(
    `SELECT g.name, g.archived OR s.readOnly IS NOT NULL AS unavailable, s.cursor
     FROM groups g LEFT JOIN sync_groups s ON s.groupId = g.id WHERE g.id = ?`,
    [groupId],
  );
  const members = await tx.all<{
    id: string;
    name: string;
    userId: string | null;
  }>(
    'SELECT id, name, userId FROM group_members WHERE groupId = ? AND removed = 0 ORDER BY position',
    [groupId],
  );
  const represented = new Set(await membersWithPhones(tx, groupId));
  const bytes = utf8ToBytes(
    JSON.stringify({
      name: group.name,
      members: members.map(({ id, name, userId }) => ({
        id,
        name,
        hasDevice: userId !== null || represented.has(id),
      })),
    }),
  );
  return {
    bytes,
    hash: bytesToHex(sha256(bytes)),
    cursor: group.cursor ?? 0,
    shared: group.cursor !== null,
    unavailable: !!group.unavailable,
    members: members.length,
    tooLarge: bytes.length + EVENT_CONTENT_MINIMUM > EVENT_CONTENT_LIMIT,
  };
}

export type InviteCard = Awaited<ReturnType<typeof readCard>>;

export function cardCipher({ code, secret }: InviteCredentials) {
  // base64-js accepts the URL alphabet and expects padding; a 32-byte secret needs one '='.
  const key = deriveKey({
    secret: toByteArray(secret + '='),
    purpose: PURPOSE,
  });
  return { key, associatedData: utf8ToBytes(`${PURPOSE}\n${code}`) };
}

export function encryptedCard(
  credentials: InviteCredentials,
  card: InviteCard,
) {
  return bytesToHex(
    encrypt({
      ...cardCipher(credentials),
      nonce: getRandomValues(new Uint8Array(24)),
      plaintext: card.bytes,
    }),
  );
}
