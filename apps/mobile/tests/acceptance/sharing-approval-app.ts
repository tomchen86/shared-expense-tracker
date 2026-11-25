import { Buffer } from 'node:buffer';
import { createHash, randomBytes } from 'node:crypto';
import {
  boxPublicKey,
  deriveKey,
  encrypt,
  openBox,
  sealBox,
} from '@shared-expense/domain/crypto';
import {
  NOW,
  addExpense,
  apiSql,
  apiUrl,
  deviceId,
  endWorld,
  fromHex,
  keyOf,
  newPhone,
  opened,
  send,
  sentBy,
  setApiTime,
  setClock,
  startWorld,
  toHex,
  utf8,
  type Phone,
} from './sync-loop-app';

// The tests of approving a join and of joining run the phones' code in Node against the
// real API (sync-loop-app, ADR-0027): a member's phone that made its group a shared ledger
// with a first invite, and phones that ask to join through that invite. Each goes through
// what the `sharing` capability exports, as its screens do. What a test makes itself, a
// request nobody can read or an approval another build would send, is put together here as
// docs/specs/sharing/spec.md words it.

export const HANDOVER = 'shared-expense/invite/handover/v1';
const BOX = 'shared-expense/device/box/v1';
const REQUEST = 'shared-expense/invite/request/v1';

/** Call from beforeEach: the world of the sync loop's tests, with the build naming its API. */
export async function startApprovalWorld() {
  await startWorld();
  process.env.EXPO_PUBLIC_API_URL = apiUrl();
}

export async function endApprovalWorld() {
  delete process.env.EXPO_PUBLIC_API_URL;
  await endWorld();
}

/** Runs the phone's code with the phone's clock as the clock that runs. */
export function on<R>(phone: Phone, work: () => Promise<R>): Promise<R> {
  setClock(phone, phone.state.clockMs);
  return work();
}

async function named(phoneName: string, name: string): Promise<Phone> {
  const started = await newPhone(phoneName);
  const { saveLocalName } = jest.requireActual<
    typeof import('../../src/shell/identity')
  >('../../src/shell/identity');
  await saveLocalName(started.database, name);
  setClock(started, NOW);
  return { ...started, identity: { ...started.identity, name } };
}

/** Taylor's phone with Brisbane, its invite, and what the tests need to read what it sends. */
export interface Inviting {
  taylor: Phone;
  /** Taylor's device ID. */
  A: string;
  brisbane: string;
  code: string;
  secret: string;
  /** Brisbane's group key of key epoch 1. */
  key: Uint8Array;
}

/**
 * Taylor's phone: Brisbane with Casey and Blake and an expense for each title, which the
 * first Invite made a shared ledger at NOW. The API's time and the phone's clock are NOW.
 */
export async function taylorInvites(
  expenses: string[] = ['Dinner'],
): Promise<Inviting> {
  const started = await named('taylor', 'Taylor');
  await started.groups.createGroup(
    started.database,
    'Brisbane',
    started.identity,
  );
  const [{ id: brisbane }] = await started.groups.listGroups(started.database);
  await started.groups.addGroupMember(started.database, brisbane, 'Casey');
  await started.groups.addGroupMember(started.database, brisbane, 'Blake');
  const taylor: Phone = { ...started, brisbane };
  for (const title of expenses) await addExpense(taylor, { title });
  setApiTime(NOW);
  const invite = await on(taylor, () =>
    taylor.sharing.prepareInvite(taylor.database, brisbane),
  );
  if (typeof invite === 'string') throw new Error(`No invite: ${invite}`);
  return {
    taylor,
    A: await deviceId(taylor),
    brisbane,
    code: invite.code,
    secret: invite.secret,
    key: keyOf(taylor, brisbane),
  };
}

/** Another phone with the app and a name, and no group: one that will ask to join. */
export async function phoneOf(name: string, invite: Inviting): Promise<Phone> {
  const phone = await named(name.toLowerCase(), name);
  return { ...phone, brisbane: invite.brisbane };
}

/**
 * The phone sends its request through the app, as Send Request does, and resolves with its
 * device ID. `memberId` is the member it picks; a new member unless given. `copyGroupId`
 * is the phone's copy of the invite's group, which Join Group finds from the card and hands
 * over with the request (SHARING-226.2); none unless given.
 */
export async function asks(
  phone: Phone,
  invite: Inviting,
  {
    name = phone.identity.name,
    memberId = null as string | null,
    copyGroupId = null as string | null,
  } = {},
): Promise<string> {
  const result = await on(phone, () =>
    phone.sharing.sendJoinRequest(
      phone.database,
      {
        code: invite.code,
        secret: invite.secret,
        groupName: 'Brisbane',
        name,
        memberId,
        sent: 0,
        copyGroupId,
      },
      phone.identity.userId,
      true,
      () => undefined,
    ),
  );
  if (result.kind !== 'request' || !result.request.sent) {
    throw new Error(`The request was not sent: ${JSON.stringify(result)}`);
  }
  return deviceId(phone);
}

// Keys, as the spec derives them

/** The phone's seed, which its secure store keeps under an entry that names its device ID. */
export async function seedOf(phone: Phone): Promise<Uint8Array> {
  const id = await deviceId(phone);
  const entry = [...phone.state.store].find(([name]) => name.includes(id));
  if (!entry) throw new Error('The phone has no seed');
  return fromHex(entry[1].value);
}

/** The phone's X25519 secret key (SHARING-136.1), and its public key in hexadecimal. */
export const boxSecretOf = async (phone: Phone) =>
  deriveKey({ secret: await seedOf(phone), purpose: BOX });
export const boxKeyOf = async (phone: Phone) =>
  toHex(boxPublicKey(await boxSecretOf(phone)));

const secretBytes = (secret: string) =>
  new Uint8Array(Buffer.from(secret, 'base64url'));

/** The handover salt of an invite's secret (SHARING-198.1). */
export const handoverSalt = (secret: string) =>
  deriveKey({ secret: secretBytes(secret), purpose: HANDOVER });

/** The context a handover's box is sealed with (SHARING-198.1): four lines. */
export const handoverContext = (code: string, groupId: string, epoch: number) =>
  utf8([HANDOVER, code, groupId, String(epoch)].join('\n'));

/** What a handover's box holds once `recipient` opens it; undefined when it does not open. */
export async function openedBox(
  recipient: Phone,
  invite: Pick<Inviting, 'code' | 'secret'>,
  handover: { groupId: string; epoch: number; senderKey: string; box: string },
  changes: { salt?: Uint8Array | null; context?: Uint8Array } = {},
): Promise<unknown> {
  const salt =
    changes.salt === null
      ? undefined
      : (changes.salt ?? handoverSalt(invite.secret));
  const result = openBox({
    recipientSecretKey: await boxSecretOf(recipient),
    senderPublicKey: fromHex(handover.senderKey),
    context:
      changes.context ??
      handoverContext(invite.code, handover.groupId, handover.epoch),
    ...(salt ? { salt } : {}),
    box: fromHex(handover.box),
  });
  return result.ok
    ? (JSON.parse(Buffer.from(result.plaintext).toString('utf8')) as unknown)
    : undefined;
}

/** A box as `sender` would seal it for `recipient`, holding `content`, with whatever a test changes. */
export async function boxFor(
  sender: Phone,
  recipient: Phone,
  invite: Inviting,
  content: unknown,
  changes: { secret?: string; epoch?: number; groupId?: string } = {},
): Promise<string> {
  return toHex(
    sealBox({
      senderSecretKey: await boxSecretOf(sender),
      recipientPublicKey: fromHex(await boxKeyOf(recipient)),
      context: handoverContext(
        invite.code,
        changes.groupId ?? invite.brisbane,
        changes.epoch ?? 1,
      ),
      salt: handoverSalt(changes.secret ?? invite.secret),
      nonce: new Uint8Array(randomBytes(24)),
      plaintext: utf8(JSON.stringify(content)),
    }),
  );
}

/** A join request as a phone running other code would seal it for the invite (SHARING-135.2). */
export function sealedRequest(
  invite: Pick<Inviting, 'code' | 'secret'>,
  device: string,
  content: unknown,
): string {
  const json = utf8(
    typeof content === 'string' ? content : JSON.stringify(content),
  );
  const plaintext = new Uint8Array(Math.ceil(json.length / 256) * 256).fill(
    0x20,
  );
  plaintext.set(json);
  return toHex(
    encrypt({
      key: deriveKey({ secret: secretBytes(invite.secret), purpose: REQUEST }),
      nonce: new Uint8Array(randomBytes(24)),
      plaintext,
      associatedData: utf8(`${REQUEST}\n${invite.code}\n${device}`),
    }),
  );
}

// What the API holds

/** The content of the request the API holds for a device under an invite, if any. */
export async function requestOnApi(
  code: string,
  device: string,
): Promise<Uint8Array | undefined> {
  const [row] = await apiSql()<{ content: Buffer }[]>`
    SELECT content FROM invite_join_requests
    WHERE code = ${code} AND device_id = ${device}`;
  return row ? new Uint8Array(row.content) : undefined;
}

export const sha256Of = (content: Uint8Array) =>
  createHash('sha256').update(content).digest('hex');

/** Whether the API counts the device among the group's member devices. */
export async function isMemberDevice(groupId: string, device: string) {
  const rows = await apiSql()`
    SELECT 1 FROM group_members
    WHERE group_id = ${groupId} AND device_id = ${device}`;
  return rows.length === 1;
}

// What a member's phone sent

export interface SentApproval {
  path: string;
  request: string;
  cursor: number;
  snapshotId: string;
  senderKey: string;
  epoch: number;
  box: string;
  events: { id: string; content: string }[];
}

const APPROVAL = /^\/groups\/[^/]+\/requests\/[^/]+\/approval$/;

/** The approvals the phone has sent since `from`, in order, as their bodies say. */
export async function approvalsBy(
  phone: Phone,
  from = 0,
): Promise<SentApproval[]> {
  return (await sentBy(phone, from))
    .filter(({ method, path }) => method === 'POST' && APPROVAL.test(path))
    .map(({ path, body }) => ({
      path,
      ...(JSON.parse(Buffer.from(body).toString('utf8')) as Omit<
        SentApproval,
        'path'
      >),
    }));
}

/** What the events of an approval hold, opened with the group's key as the approving device's upload. */
export function eventsOf(
  approval: SentApproval,
  invite: Inviting,
  by = invite.A,
) {
  return approval.events.map(({ id, content }) => {
    const plaintext = opened(
      invite.key,
      {
        groupId: invite.brisbane,
        eventId: id,
        deviceId: by,
        epoch: approval.epoch,
      },
      fromHex(content),
    );
    if (!plaintext) throw new Error('An event of the approval does not open');
    return JSON.parse(Buffer.from(plaintext).toString('utf8')) as {
      version: number;
      stamp: { ms: number; counter: number; device: string };
      type: string;
      id: string;
      units: Record<string, { value: unknown; base?: unknown }>;
    };
  });
}

/** Every request the phone sent since `from`, each as its method and its path without the query. */
export async function linesBy(phone: Phone, from = 0): Promise<string[]> {
  return (await sentBy(phone, from)).map(
    ({ method, path }) => `${method} ${path.split('?')[0]}`,
  );
}

/** The members of the group on the phone, each with the user ID the phone has for it. */
export async function membersOn(phone: Phone, groupId = phone.brisbane) {
  const group = (await phone.groups.listGroups(phone.database)).find(
    (each) => each.id === groupId,
  );
  if (!group) throw new Error('The phone does not have the group');
  return group.members.map(({ id, name, userId }) => ({ id, name, userId }));
}

/** Whether the phone has the group at all. */
export const hasGroup = async (phone: Phone, groupId = phone.brisbane) =>
  (await phone.groups.listGroups(phone.database)).some(
    (each) => each.id === groupId,
  );

/**
 * Sends a signed request of the phone's device, as `send` does, and resolves with whatever
 * the API answers: the status, and the body as JSON when it is JSON.
 */
export async function sendAs(
  phone: Phone,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const result = await on(phone, () =>
    phone.sharing.sendApiRequest(phone.database, {
      apiUrl: apiUrl(),
      method,
      path,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
  if (result.outcome !== 'answered') {
    throw new Error(`The request was not answered: ${result.outcome}`);
  }
  const text = Buffer.from(result.body).toString('utf8');
  try {
    return { status: result.status, body: JSON.parse(text) as unknown };
  } catch {
    return { status: result.status, body: text };
  }
}

/** Makes and registers the phone's device identity, as its first request does, and resolves with its device ID. */
export async function registered(phone: Phone): Promise<string> {
  await send(phone, 'GET', `/groups/${phone.brisbane}/events?after=0`);
  return deviceId(phone);
}
