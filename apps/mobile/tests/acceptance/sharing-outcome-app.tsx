import { Buffer } from 'node:buffer';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  boxPublicKey,
  deriveKey,
  encrypt,
  sealBox,
} from '@shared-expense/domain/crypto';
import { expectClosed, pressOnBar } from './group-details-app';
import { leaveAndComeBack } from './ledger-list-period-app';
import { T, fromHex, requestsReceived, toHex, utf8 } from './sharing-app';
import {
  approvedOnApi,
  cardOnApi,
  rejectedOnApi,
  type Handover,
  type StoredSnapshot,
} from './sharing-invite-app';
import {
  BLAKE_ID,
  BRISBANE_CARD,
  BRISBANE_ID,
  CASEY_ID,
  CODE_A,
  S,
  TAYLORS_PHONE,
  TAYLOR_ID,
  TITLE,
  joinSettles,
  lastRequest,
  sealedCard,
  sendings,
} from './sharing-join-app';
import { settle } from './shell-appearance-app';

// The screen tests of learning the answer start the whole app on Dana's phone, as the
// join tests do (sharing-join-app), with a request it has sent. They stand in for the
// member's phone that answers it: the request is taken off the API, or the API is given
// the handover and the snapshot an approving phone uploads (SHARING-195.1 to 198.1), put
// together here as docs/specs/sharing/spec.md words them.

export const WAITING_CARD = 'Waiting for approval';
export const NOT_SENT_CARD = 'Not sent';
export const CHOOSE_CARD = 'Choose again';
export const APPROVED_CARD = 'Approved';
export const DECLINED_CARD = 'Request declined';
export const INVALID_CARD = 'Invite no longer valid';

export const CHOOSE_AGAIN =
  'Choose again. Your earlier choice is no longer available.';
export const DECLINED = [
  'Request Declined',
  'Brisbane',
  'A member of this group declined your request.',
  'OK',
];
export const INVALID = [
  'Invite No Longer Valid',
  'Brisbane',
  'This invite has expired or was turned off. Ask a member for a new link.',
  'OK',
];
export const APPROVED = 'Approved';
export const FINISHING = 'Finishing up…';
export const FINISH_OFFLINE = 'Connect to the internet to finish joining.';
export const FINISH_UPDATE = 'Update the app to finish joining this group.';
export const ALREADY_IN = 'This phone is already in this group.';

const HANDOVER = 'shared-expense/invite/handover/v1';
const SNAPSHOT = 'shared-expense/snapshot/v1';

/** The member's phone that approves: its X25519 secret key, and the user it belongs to. */
const TAYLOR_BOX = new Uint8Array(32).fill(7);
export const TAYLOR_USER = '8f14e45f-ceea-467f-a0e6-1f2b3c4d5e6f';
/** Brisbane's group key of key epoch 1. */
export const GROUP_KEY = new Uint8Array(32).fill(9);
/** The member that is added for a phone that asked to be a new member. */
export const NEW_MEMBER_ID = '2a7d5c1b-9e3f-4b6a-8c0d-1e2f3a4b5c6d';
const UNCATEGORIZED = '0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e';

/** The requests that ask what became of a join request. */
export const asked = () =>
  requestsReceived().filter(
    ({ method, path }) =>
      method === 'GET' && /^\/invites\/[^/?]+\/request$/.test(path),
  );

/** The app is left and opened again, which asks about every request it holds (SHARING-210.1). */
export async function comesBack() {
  await leaveAndComeBack();
  await joinSettles();
  await settle();
}

/** Closes Join Group with Close. */
export async function closeJoin() {
  await pressOnBar(TITLE, 'Close');
  await expectClosed(TITLE);
}

/** The device ID of the phone, as its last join request carried it. */
export const phoneDevice = () => sendings().at(-1)!.deviceId!;

/** A member rejects the phone's request. */
export const memberRejects = (code = CODE_A) =>
  rejectedOnApi(code, phoneDevice());

/** A member's phone uploads a new card for Brisbane's invite: the card of the scenarios with these changes. */
export function cardBecomes(members: typeof BRISBANE_CARD.members) {
  cardOnApi(CODE_A, sealedCard(CODE_A, S, { ...BRISBANE_CARD, members }));
}

const stamp = (counter: number) => ({ ms: T, counter, device: TAYLORS_PHONE });

const whole = (
  type: string,
  id: string,
  values: Record<string, unknown>,
  counter: number,
  seeded = true,
) => ({
  type,
  id,
  units: Object.fromEntries(
    Object.entries(values).map(([unit, value]) => [
      unit,
      { value, stamp: stamp(counter) },
    ]),
  ),
  created: stamp(counter),
  seeded,
});

export interface ApprovalChanges {
  /** The key the snapshot is sealed with, when it is not the one in the box. */
  snapshotKey?: Uint8Array;
  /** The secret the box's salt is derived from, when it is not the invite's. */
  boxSecret?: string;
  /** What the box holds, when it is not the group key of key epoch 1. */
  boxContent?: unknown;
  /** Changes to the handover the API hands out. */
  handover?: Partial<Handover>;
  /** The first byte of the box, or of the snapshot's chunk, when it is not `01`. */
  boxVersion?: string;
  snapshotVersion?: string;
  /** Records to leave out of the snapshot, by their type and ID. */
  without?: string[];
  /** Changes to the roster entry of the phone itself. */
  ownEntry?: Record<string, unknown>;
  /** Whether the API stores a snapshot at all. */
  snapshot?: boolean;
}

/**
 * A member's phone approves the phone's last request, as SHARING-195.1 to 198.1 have it:
 * the API holds a box for the phone and a snapshot of Brisbane whose roster names the
 * approving phone and this one. `changes` make it an approval a working app never sends.
 */
export function memberApproves(changes: ApprovalChanges = {}) {
  const device = phoneDevice();
  const request = lastRequest();
  const mine = request.memberId ?? NEW_MEMBER_ID;
  const senderKey = toHex(boxPublicKey(TAYLOR_BOX));
  const records = [
    whole('group', BRISBANE_ID, { name: 'Brisbane' }, 0),
    whole(
      'category',
      UNCATEGORIZED,
      { name: 'Uncategorized', color: '#757575', archived: false },
      1,
    ),
    whole('member', TAYLOR_ID, { name: 'Taylor', removed: false }, 2),
    whole('member', CASEY_ID, { name: 'Casey', removed: false }, 3),
    whole('member', BLAKE_ID, { name: 'Blake', removed: false }, 4),
    ...(request.memberId === null
      ? [
          whole(
            'member',
            NEW_MEMBER_ID,
            { name: request.name, removed: false },
            6,
            false,
          ),
        ]
      : []),
    whole(
      'device',
      TAYLORS_PHONE,
      {
        member: { memberId: TAYLOR_ID, userId: TAYLOR_USER, boxKey: senderKey },
      },
      5,
      false,
    ),
    whole(
      'device',
      device,
      {
        member: {
          memberId: mine,
          userId: request.userId,
          boxKey: request.boxKey,
          ...changes.ownEntry,
        },
      },
      7,
      false,
    ),
  ].filter(({ type, id }) => !changes.without?.includes(`${type} ${id}`));
  const snapshotId = randomUUID();
  const chunk = toHex(
    encrypt({
      key: changes.snapshotKey ?? GROUP_KEY,
      nonce: new Uint8Array(randomBytes(24)),
      plaintext: utf8(
        JSON.stringify({
          version: 1,
          eventVersion: 1,
          groupId: BRISBANE_ID,
          sequence: 0,
          uncategorized: UNCATEGORIZED,
          records,
        }),
      ),
      associatedData: utf8(
        [SNAPSHOT, BRISBANE_ID, snapshotId, TAYLORS_PHONE, '1', '0', '1'].join(
          '\n',
        ),
      ),
    }),
  );
  const box = toHex(
    sealBox({
      senderSecretKey: TAYLOR_BOX,
      recipientPublicKey: fromHex(request.boxKey),
      context: utf8([HANDOVER, CODE_A, BRISBANE_ID, '1'].join('\n')),
      salt: deriveKey({
        secret: new Uint8Array(
          Buffer.from(changes.boxSecret ?? S, 'base64url'),
        ),
        purpose: HANDOVER,
      }),
      nonce: new Uint8Array(randomBytes(24)),
      plaintext: utf8(
        JSON.stringify(
          changes.boxContent ?? {
            keys: [{ epoch: 1, key: toHex(GROUP_KEY) }],
          },
        ),
      ),
    }),
  );
  const snapshot: StoredSnapshot = {
    snapshotId,
    deviceId: TAYLORS_PHONE,
    epoch: 1,
    sequence: 0,
    chunks: [(changes.snapshotVersion ?? chunk.slice(0, 2)) + chunk.slice(2)],
  };
  approvedOnApi(
    CODE_A,
    device,
    {
      groupId: BRISBANE_ID,
      deviceId: TAYLORS_PHONE,
      senderKey,
      epoch: 1,
      box: (changes.boxVersion ?? box.slice(0, 2)) + box.slice(2),
      ...changes.handover,
    },
    changes.snapshot === false ? undefined : snapshot,
  );
}
