import { Buffer } from 'node:buffer';
import { randomBytes, randomUUID } from 'node:crypto';
import type { SyncSnapshot, SyncSnapshotRecord } from '@shared-expense/domain';
import { decrypt, encrypt } from '@shared-expense/domain/crypto';
import { addMemberDevice } from '../../../api/tests/support/group-members';
import type {
  SendSnapshotResult,
  TakeSnapshotResult,
} from '../../src/sync/snapshots';
import {
  NOW,
  apiSql,
  apiUrl,
  deviceId,
  endWorld,
  fromHex,
  giveKey,
  newPhone,
  send,
  sent,
  setClock,
  startWorld,
  toHex,
  utf8,
  type Phone,
  type Sent,
  type Setup,
} from './sync-loop-app';

// The snapshot tests run in the world of the sync loop's tests (sync-loop-app): phones in
// Node against the real API. One phone makes a snapshot of a shared ledger and uploads it;
// another fetches it and takes it in (ADR-0028). No feature starts either yet (#141, #156),
// so the tests call what the sync capability exports for them.
//
// The new phone is a third one: the app with its own personal data and nothing of Brisbane.
// Until a phone can join a group (#141), the tests register it, make it a member device
// through the API's test support, and put the group key in its secure store.

/** The most bytes of a snapshot's plaintext one chunk holds: 262,144 less what encryption adds. */
export const PIECE = 262_144 - 41;

// The network: a request of the snapshot API a test wants to go wrong

type Fault =
  | { kind: 'no-answer' }
  | { kind: 'lose-answer' }
  | { kind: 'never' }
  | { kind: 'answer'; make: (path: string) => { status: number; body: string } }
  | { kind: 'then'; hook: () => Promise<void> };

interface Rule {
  method: string;
  path: RegExp;
  fault: Fault;
}

const holder = globalThis as {
  snapshotRules?: Rule[];
  snapshotsWaiting?: number;
};

const SNAPSHOT_PATH = /^\/groups\/[^/]+\/snapshot$/;
const CHUNK_PATH = /^\/groups\/[^/]+\/snapshots\/[^/]+\/chunks\/(\d+)$/;

/** The path of the request that asks whether a group stores a snapshot for the phone. */
export const snapshotPath = (groupId: string) => `/groups/${groupId}/snapshot`;

export const chunkPath = (groupId: string, snapshotId: string, index: number) =>
  `/groups/${groupId}/snapshots/${snapshotId}/chunks/${index}`;

/** Which request a fault is for: the one that asks for a snapshot, or the one for chunk `index`. */
export type Which = 'ask' | number;

const pathOf = (which: Which) =>
  which === 'ask'
    ? SNAPSHOT_PATH
    : new RegExp(`^/groups/[^/]+/snapshots/[^/]+/chunks/${which}$`);

function rule(method: string, which: Which, fault: Fault) {
  holder.snapshotRules!.push({ method, path: pathOf(which), fault });
}

/** The next such request gets no answer and does not reach the API. */
export const noAnswerTo = (method: 'PUT' | 'GET', which: Which) =>
  rule(method, which, { kind: 'no-answer' });

/** The next such request reaches the API, and its answer is lost on the way back. */
export const loseAnswerTo = (method: 'PUT' | 'GET', which: Which) =>
  rule(method, which, { kind: 'lose-answer' });

/** The next such request is never answered, and does not reach the API. */
export const neverAnswer = (method: 'PUT' | 'GET', which: Which) =>
  rule(method, which, { kind: 'never' });

const written = (body: unknown) =>
  typeof body === 'string' ? body : JSON.stringify(body);

/** The test answers the next such request in the API's place. */
export const answerNext = (
  method: 'PUT' | 'GET',
  which: Which,
  status: number,
  body: unknown,
) =>
  rule(method, which, {
    kind: 'answer',
    make: () => ({ status, body: written(body) }),
  });

/**
 * The test answers the next upload of chunk `index` with status 200 and what `body` makes
 * of the snapshot ID in the request's path.
 */
export const answerUpload = (
  index: number,
  body: (snapshotId: string) => unknown,
) =>
  rule('PUT', index, {
    kind: 'answer',
    make: (path) => ({ status: 200, body: written(body(path.split('/')[4])) }),
  });

/** How many of the faults a test set have not met their request yet. */
export const faultsLeft = () => holder.snapshotRules!.length;

/** Runs `hook` when the API has answered the next such request, before the phone gets the answer. */
export const whenAnswered = (
  method: 'PUT' | 'GET',
  which: Which,
  hook: () => Promise<void>,
) => rule(method, which, { kind: 'then', hook });

const noNetwork = () => new TypeError('Network request failed');

function faulty(inner: typeof fetch): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, { method: init?.method });
    const url = new URL(request.url);
    const index = holder.snapshotRules!.findIndex(
      (each) => each.method === request.method && each.path.test(url.pathname),
    );
    if (index < 0) return inner(input, init);
    const { fault } = holder.snapshotRules!.splice(index, 1)[0];
    switch (fault.kind) {
      case 'no-answer':
        throw noNetwork();
      case 'never':
        holder.snapshotsWaiting = (holder.snapshotsWaiting ?? 0) + 1;
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        });
      case 'answer': {
        const { status, body } = fault.make(url.pathname);
        return new Response(body, { status });
      }
      case 'lose-answer':
        await inner(input, init);
        throw noNetwork();
      case 'then': {
        const answer = await inner(input, init);
        await fault.hook();
        return answer;
      }
    }
  };
}

/** Call from beforeEach: the world of the sync loop's tests, where a snapshot's requests can be made to go wrong. */
export async function startSnapshotWorld() {
  await startWorld();
  holder.snapshotRules = [];
  holder.snapshotsWaiting = 0;
  globalThis.fetch = faulty(globalThis.fetch);
}

export const endSnapshotWorld = endWorld;

// Everything Jest can fake but `Date`, as the world leaves it, and the same without the
// timeouts.
const NOT_FAKED = [
  'hrtime',
  'nextTick',
  'performance',
  'queueMicrotask',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'requestIdleCallback',
  'cancelIdleCallback',
  'setImmediate',
  'clearImmediate',
  'setInterval',
  'clearInterval',
] as const;

const aTurn = () => new Promise<void>((resolve) => setImmediate(resolve));

/**
 * Runs `work`, whose next request is one a test has said is never answered, and resolves
 * with what it resolves with once 60 seconds have passed on the phone since that request
 * was sent, having checked that it had not resolved a millisecond before.
 */
export async function afterSixtySeconds<T>(
  phone: Phone,
  work: () => Promise<T>,
): Promise<T> {
  const waiting = holder.snapshotsWaiting ?? 0;
  jest.useFakeTimers({ now: phone.state.clockMs, doNotFake: [...NOT_FAKED] });
  try {
    let settled = false;
    const running = work().finally(() => {
      settled = true;
    });
    for (let turn = 0; turn < 10_000; turn += 1) {
      if ((holder.snapshotsWaiting ?? 0) > waiting || settled) break;
      await aTurn();
    }
    if (settled) throw new Error('It ended before the request was sent');
    jest.advanceTimersByTime(59_999);
    for (let turn = 0; turn < 50; turn += 1) await aTurn();
    expect(settled).toBe(false);
    jest.advanceTimersByTime(1);
    return await running;
  } finally {
    jest.useFakeTimers({
      now: phone.state.clockMs,
      doNotFake: [...NOT_FAKED, 'setTimeout', 'clearTimeout'],
    });
  }
}

// Phones

/**
 * The new phone: the app with its own personal data, no group, registered, at NOW. Unless
 * said otherwise it is a member device of Brisbane on the API and has Brisbane's key of
 * key epoch 1. The requests this took are before the mark it resolves with.
 */
export async function newcomer(
  setup: Setup,
  {
    member = true,
    key = true,
    name = 'newcomer',
  }: { member?: boolean; key?: boolean; name?: string } = {},
): Promise<Phone> {
  const started = await newPhone(name);
  const { saveLocalName } = jest.requireActual<
    typeof import('../../src/shell/identity')
  >('../../src/shell/identity');
  await saveLocalName(started.database, 'Riley');
  const phone: Phone = {
    ...started,
    identity: { ...started.identity, name: 'Riley' },
    brisbane: setup.brisbane,
    tokyo: setup.tokyo,
  };
  setClock(phone, NOW);
  // Its first request makes and registers its device identity; it is no member device yet.
  await send(phone, 'GET', `/groups/${setup.brisbane}/events?after=0`);
  if (member) await join(phone, setup.brisbane);
  if (key) giveKey(phone, setup.brisbane, 1, setup.key);
  return phone;
}

/** Makes the phone a member device of the group on the API, as approving it will (#141). */
export async function join(phone: Phone, groupId: string) {
  await addMemberDevice(apiSql(), { groupId, deviceId: await deviceId(phone) });
}

/** Uploads a snapshot of the phone's shared ledger for a phone or a device ID, as the app does. */
export async function sendSnapshot(
  phone: Phone,
  recipient: Phone | string,
  groupId = phone.brisbane,
): Promise<SendSnapshotResult> {
  const to =
    typeof recipient === 'string' ? recipient : await deviceId(recipient);
  setClock(phone, phone.state.clockMs);
  return phone.sync.sendSnapshot(phone.database, {
    apiUrl: apiUrl(),
    groupId,
    deviceId: to,
  });
}

/** Fetches the snapshot the group stores for the phone and takes it in, as the app does. */
export async function takeSnapshot(
  phone: Phone,
  groupId = phone.brisbane,
): Promise<TakeSnapshotResult> {
  setClock(phone, phone.state.clockMs);
  return phone.sync.takeSnapshot(phone.database, {
    apiUrl: apiUrl(),
    groupId,
  });
}

/** Uploads a snapshot that must upload, and resolves with its ID and the sequence number it covers. */
export async function sentSnapshot(
  phone: Phone,
  recipient: Phone | string,
  groupId = phone.brisbane,
) {
  const result = await sendSnapshot(phone, recipient, groupId);
  if (result.outcome !== 'uploaded') {
    throw new Error(`The snapshot was not uploaded: ${result.outcome}`);
  }
  return result;
}

// What the phones sent

/** A chunk as a phone uploaded it. */
export interface UploadedChunk {
  groupId: string;
  snapshotId: string;
  index: number;
  /** The device ID the request is signed as. */
  by: string | null;
  /** What the body says the snapshot is. */
  deviceId: string;
  epoch: number;
  sequence: number;
  count: number;
  content: Uint8Array;
  reached: boolean;
  status?: number;
}

const snapshotRequest = (request: Sent) =>
  SNAPSHOT_PATH.test(request.path) || CHUNK_PATH.test(request.path);

/** The snapshot API's requests that were handed to the network since `from`, in order: method and path. */
export const snapshotRequests = (from = 0) =>
  sent()
    .slice(from)
    .filter(snapshotRequest)
    .map((request) => `${request.method} ${request.path}`);

/** The chunks uploaded since `from`, in the order their requests were sent. */
export function uploadedChunks(from = 0): UploadedChunk[] {
  return sent()
    .slice(from)
    .filter(
      (request) => request.method === 'PUT' && CHUNK_PATH.test(request.path),
    )
    .map((request) => {
      const [, , groupId, , snapshotId, , index] = request.path.split('/');
      const body = JSON.parse(Buffer.from(request.body).toString('utf8')) as {
        deviceId: string;
        epoch: number;
        sequence: number;
        count: number;
        content: string;
      };
      return {
        groupId,
        snapshotId,
        index: Number(index),
        by: request.deviceId,
        ...body,
        content: fromHex(body.content),
        reached: request.reached,
        status: request.status,
      };
    });
}

/** The chunk indexes the phone asked the API for since `from`, in order, after `ask` for the request that asks. */
export const downloadsOf = (from = 0) =>
  sent()
    .slice(from)
    .filter((request) => request.method === 'GET' && snapshotRequest(request))
    .map((request) => CHUNK_PATH.exec(request.path)?.[1] ?? 'ask');

// Chunks, as a phone running other code would make and read them

export interface Envelope {
  groupId: string;
  snapshotId: string;
  /** The device that uploads the snapshot. */
  deviceId: string;
  epoch: number;
  count: number;
}

/** The associated data of a chunk (SYNC-116.1): seven lines of ASCII joined by line feeds. */
export const associatedData = (envelope: Envelope, index: number | string) =>
  utf8(
    [
      'shared-expense/snapshot/v1',
      envelope.groupId,
      envelope.snapshotId,
      envelope.deviceId,
      String(envelope.epoch),
      String(index),
      String(envelope.count),
    ].join('\n'),
  );

/** A chunk's plaintext under `key` and these associated data; undefined when it does not open. */
export function opensWith(
  key: Uint8Array,
  data: Uint8Array,
  content: Uint8Array,
): Uint8Array | undefined {
  const result = decrypt({ key, ciphertext: content, associatedData: data });
  return result.ok ? result.plaintext : undefined;
}

/** The plaintext of the chunks, each opened with its own index, joined in order; undefined when one does not open. */
export function joined(
  key: Uint8Array,
  envelope: Envelope,
  chunks: readonly Uint8Array[],
): Uint8Array | undefined {
  const pieces: Uint8Array[] = [];
  for (const [index, chunk] of chunks.entries()) {
    const piece = opensWith(key, associatedData(envelope, index), chunk);
    if (!piece) return undefined;
    pieces.push(piece);
  }
  return new Uint8Array(Buffer.concat(pieces));
}

/** A snapshot the API stores for a phone, as that phone gets it: what the API says of it, and its chunks. */
export interface Fetched extends Envelope {
  sequence: number;
  chunks: Uint8Array[];
}

/** What the API stores for `recipient` in the group, fetched as that phone; undefined when it says there is none. */
export async function fetched(
  recipient: Phone,
  groupId = recipient.brisbane,
): Promise<Fetched | undefined> {
  const asked = await send(recipient, 'GET', snapshotPath(groupId));
  if (asked.status === 404) return undefined;
  if (asked.status !== 200) {
    throw new Error(`Asking for the snapshot got ${asked.status}`);
  }
  const said = asked.body as {
    snapshotId: string;
    deviceId: string;
    epoch: number;
    sequence: number;
    count: number;
  };
  const chunks: Uint8Array[] = [];
  for (let index = 0; index < said.count; index += 1) {
    const answer = await send(
      recipient,
      'GET',
      chunkPath(groupId, said.snapshotId, index),
    );
    if (answer.status !== 200) {
      throw new Error(`Downloading chunk ${index} got ${answer.status}`);
    }
    chunks.push(fromHex((answer.body as { content: string }).content));
  }
  return { groupId, ...said, chunks };
}

/** The content of the snapshot the API stores for `recipient`, opened with `key`. */
export async function contentFor(
  recipient: Phone,
  key: Uint8Array,
  groupId = recipient.brisbane,
): Promise<SyncSnapshot> {
  const snapshot = await fetched(recipient, groupId);
  if (!snapshot) throw new Error('The API stores no snapshot for the phone');
  const plaintext = joined(key, snapshot, snapshot.chunks);
  if (!plaintext) throw new Error('The snapshot does not open');
  return JSON.parse(Buffer.from(plaintext).toString('utf8')) as SyncSnapshot;
}

/** The snapshot's records in one order, whatever order the snapshot holds them in. */
export const sorted = (records: readonly SyncSnapshotRecord[]) =>
  [...records].sort((a, b) => {
    const [left, right] = [`${a.type}/${a.id}`, `${b.type}/${b.id}`];
    return Number(left > right) - Number(left < right);
  });

/** The record of a snapshot with this type whose unit `unit` holds `value`. */
export const recordWith = (
  snapshot: SyncSnapshot,
  type: SyncSnapshotRecord['type'],
  unit: string,
  value: unknown,
) =>
  snapshot.records.find(
    (record) =>
      record.type === type &&
      JSON.stringify(
        (record.units as Record<string, { value: unknown } | undefined>)[unit]
          ?.value,
      ) === JSON.stringify(value),
  );

export interface Planted {
  snapshotId: string;
  chunks: Uint8Array[];
}

/**
 * Uploads a snapshot a test wrote itself, signed by `by` for `recipient`: `content` as
 * JSON, or the bytes themselves, cut into pieces of `piece` bytes and sealed with `key`.
 * `spoil` may change the sealed chunks, and `seal` what a chunk is sealed with.
 */
export async function plant(
  by: Phone,
  recipient: Phone,
  key: Uint8Array,
  content: unknown,
  {
    groupId = by.brisbane,
    epoch = 1,
    sequence = 0,
    piece = PIECE,
    seal = (envelope: Envelope, index: number) =>
      associatedData(envelope, index),
    spoil = (chunks: Uint8Array[]) => chunks,
  }: {
    groupId?: string;
    epoch?: number;
    sequence?: number;
    piece?: number;
    seal?: (envelope: Envelope, index: number) => Uint8Array;
    spoil?: (chunks: Uint8Array[]) => Uint8Array[];
  } = {},
): Promise<Planted> {
  const plaintext =
    content instanceof Uint8Array ? content : utf8(JSON.stringify(content));
  const pieces: Uint8Array[] = [];
  for (let start = 0; start < plaintext.length; start += piece) {
    pieces.push(plaintext.subarray(start, start + piece));
  }
  const envelope: Envelope = {
    groupId,
    snapshotId: randomUUID(),
    deviceId: await deviceId(by),
    epoch,
    count: pieces.length,
  };
  const chunks = spoil(
    pieces.map((each, index) =>
      encrypt({
        key,
        nonce: new Uint8Array(randomBytes(24)),
        plaintext: each,
        associatedData: seal(envelope, index),
      }),
    ),
  );
  for (const [index, chunk] of chunks.entries()) {
    const answer = await send(
      by,
      'PUT',
      chunkPath(groupId, envelope.snapshotId, index),
      {
        deviceId: await deviceId(recipient),
        epoch,
        sequence,
        count: chunks.length,
        content: toHex(chunk),
      },
    );
    if (answer.status !== 200) {
      throw new Error(
        `The chunk was refused: ${answer.status} ${JSON.stringify(answer.body)}`,
      );
    }
  }
  return { snapshotId: envelope.snapshotId, chunks };
}

// Invites (ADR-0026)

export const WEEK = 604_800_000;

/** An invite as a phone holds it: its code, the string after the link's `#`, and its expiry. */
export interface HeldInvite {
  code: string;
  secret: string;
  expiresAtMs: number;
}

/** An invite with a code and a string of its own. */
export const newInvite = (expiresAtMs: number): HeldInvite => ({
  code: randomBytes(16).toString('base64url'),
  secret: randomBytes(32).toString('base64url'),
  expiresAtMs,
});

/** The first event of an invite, as another phone's code would write it (SYNC-80.2). */
export const inviteEvent = (
  { code, secret, expiresAtMs }: HeldInvite,
  stamp: { ms: number; counter: number; device: string },
) => ({
  version: 1,
  stamp,
  type: 'invite',
  id: code,
  units: { link: { value: { secret, expiresAtMs } } },
});

/** The invite records of a snapshot. */
export const invitesIn = (snapshot: SyncSnapshot) =>
  snapshot.records.filter((record) => record.type === 'invite');

/**
 * The invite the phone shows for the group without asking the API: the one it stores that
 * has not expired (sharing), or undefined when it stores none.
 */
export async function inviteHeld(
  phone: Phone,
  groupId = phone.brisbane,
): Promise<HeldInvite | undefined> {
  setClock(phone, phone.state.clockMs);
  const { activeInvite } = jest.requireActual<
    typeof import('../../src/sync/invites')
  >('../../src/sync/invites');
  const invite = await activeInvite(phone.database, groupId);
  return (
    invite && {
      code: invite.code,
      secret: invite.secret,
      expiresAtMs: invite.expiresAtMs,
    }
  );
}
