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
  const [group] = await tx.all<{
    name: string;
    archived: number;
    cursor: number | null;
  }>(
    'SELECT g.name, g.archived, s.cursor FROM groups g LEFT JOIN sync_groups s ON s.groupId = g.id WHERE g.id = ?',
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
  const bytes = utf8ToBytes(
    JSON.stringify({
      name: group.name,
      members: members.map(({ id, name, userId }) => ({
        id,
        name,
        hasDevice: userId !== null,
      })),
    }),
  );
  return {
    bytes,
    hash: bytesToHex(sha256(bytes)),
    cursor: group.cursor ?? 0,
    shared: group.cursor !== null,
    archived: !!group.archived,
    members: members.length,
    tooLarge: bytes.length + EVENT_CONTENT_MINIMUM > EVENT_CONTENT_LIMIT,
  };
}

export type InviteCard = Awaited<ReturnType<typeof readCard>>;

export function encryptedCard(
  { code, secret }: InviteCredentials,
  card: InviteCard,
) {
  // base64-js accepts the URL alphabet and expects padding; a 32-byte secret needs one '='.
  const key = deriveKey({
    secret: toByteArray(secret + '='),
    purpose: PURPOSE,
  });
  return bytesToHex(
    encrypt({
      key,
      nonce: getRandomValues(new Uint8Array(24)),
      plaintext: card.bytes,
      associatedData: utf8ToBytes(`${PURPOSE}\n${code}`),
    }),
  );
}
