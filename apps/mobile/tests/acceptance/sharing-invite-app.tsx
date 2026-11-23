import { Buffer } from 'node:buffer';
import { Share } from 'react-native';
import { act, fireEvent } from '@testing-library/react-native';
import { DEVICES_PATH } from '@shared-expense/domain/api';
import { decrypt, deriveKey } from '@shared-expense/domain/crypto';
import { QrCode } from '../../src/ui/qr-code';
import { linesIn } from './ledger-expense-list-app';
import { startWithGroups } from './ledger-group-expense-app';
import {
  expectClosed,
  expectOpen,
  isOpen,
  membersButton,
  pressOnBar,
  screenOf,
} from './group-details-app';
import {
  API,
  T,
  apiPublicRoutes,
  apiRoutes,
  apiTime,
  fromHex,
  mistakes,
  received,
  removeWorld,
  requestsReceived,
  resetWorld,
  secureStoreEntries,
  toHex,
  utf8,
  type Received,
} from './sharing-app';
import { settle } from './shell-appearance-app';
import { componentsIn } from './shell-tabs-app';
import {
  eachTestGetsAPhone,
  everything,
  setClock,
  showMembers,
} from './sync-app';

// The invite tests start the whole app as the sync tests do (sync-app) and press Invite
// with Link as a person would. Around the app they stand in for the phone and the API as
// the sharing tests do (sharing-app): the secure store, the random source, and an API
// behind `fetch` that here also creates groups (SYNC-45.1 to 48.1), keeps invites
// (SHARING-77.1 to 87.2) and takes join requests (SHARING-112.1 to 122.1) as docs/specs
// say the real one does. The app is built with
// `EXPO_PUBLIC_API_URL` set to that API's address, and reads it when it prepares an
// invite. The phone's clock is Jest's faked one, at T once the app has started, and
// stands still unless a test moves it.

export const WEEK = 604_800_000;

export const OFFLINE =
  'Connect to the internet to invite people to this group.';
export const CANNOT_SHARE = "This group can't be shared from this phone.";
export const INVITE_EXISTS =
  'Another member has already created an invite link. It appears here after this phone syncs.';
export const WENT_WRONG = 'Something went wrong. Try again later.';
export const TOO_MANY_MEMBERS =
  'A shared group can have up to 20 members. Remove members to invite people.';
export const NAMES_TOO_LONG =
  'The group and member names are too long to invite people. Shorten them and try again.';
export const EXPLANATION =
  'Anyone with this link can ask to join. A member has to approve each request.';
export const CREATING = 'Creating link…';

const CARD_PURPOSE = 'shared-expense/invite/card/v1';
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CODE = /^[A-Za-z0-9_-]{21}[AQgw]$/;
const CARD = /^([0-9a-f]{2}){41,65536}$/;
export const LINK =
  /^https:\/\/api\.example\.test\/i\/([A-Za-z0-9_-]{22})#([A-Za-z0-9_-]{43})$/;

// The API's groups and invites

interface Invite {
  groupId: string;
  expiresAtMs: number;
  revoked: boolean;
  card: string;
  cursor: number;
}

/** What the API hands a device that was approved (SHARING-183.1). */
export interface Handover {
  groupId: string;
  /** The device that approved. */
  deviceId: string;
  senderKey: string;
  epoch: number;
  box: string;
}

/** A snapshot the API stores for whoever asks a group for one. */
export interface StoredSnapshot {
  snapshotId: string;
  /** The device that uploaded it. */
  deviceId: string;
  epoch: number;
  sequence: number;
  /** Its chunks, in lowercase hexadecimal. */
  chunks: string[];
}

interface Api {
  /** The member devices of each group. */
  groups: Map<string, Set<string>>;
  invites: Map<string, Invite>;
  /** The join requests of each invite, by its code: each device's content, in hexadecimal. */
  requests: Map<string, Map<string, string>>;
  /** The handover of each approved device, by the invite's code and the device ID. */
  handovers: Map<string, Handover>;
  /** The snapshot each group stores, for the device that joins it. */
  snapshots: Map<string, StoredSnapshot>;
}

const holder = globalThis as { inviteTestApi?: Api };
const api = (): Api =>
  (holder.inviteTestApi ??= {
    groups: new Map(),
    invites: new Map(),
    requests: new Map(),
    handovers: new Map(),
    snapshots: new Map(),
  });

const json = (status: number, body: unknown) => ({
  status,
  body: JSON.stringify(body),
});

const apiNow = () => apiTime();

const isActive = (invite: Invite | undefined) =>
  invite !== undefined && !invite.revoked && apiNow() < invite.expiresAtMs;

function createGroup(request: Received, groupId: string) {
  if (!UUID.test(groupId) || request.body.length > 0) {
    return json(400, { error: 'request' });
  }
  const members = api().groups.get(groupId);
  if (members === undefined) {
    api().groups.set(groupId, new Set([request.deviceId!]));
  } else if (!members.has(request.deviceId!)) {
    return json(403, { error: 'not-a-member' });
  }
  return json(200, { groupId });
}

function cardIn(
  request: Received,
): { cursor: number; card: string } | undefined {
  try {
    const body: unknown = JSON.parse(
      Buffer.from(request.body).toString('utf8'),
    );
    if (
      typeof body === 'object' &&
      body !== null &&
      !Array.isArray(body) &&
      Object.keys(body).length === 2 &&
      'cursor' in body &&
      'card' in body &&
      typeof body.cursor === 'number' &&
      Number.isSafeInteger(body.cursor) &&
      body.cursor >= 0 &&
      typeof body.card === 'string' &&
      CARD.test(body.card)
    ) {
      return { cursor: body.cursor, card: body.card };
    }
  } catch {
    // Not JSON.
  }
  return undefined;
}

function putInvite(request: Received, groupId: string, code: string) {
  const sent = cardIn(request);
  if (!UUID.test(groupId) || !CODE.test(code) || sent === undefined) {
    return json(400, { error: 'request' });
  }
  if (!api().groups.get(groupId)?.has(request.deviceId!)) {
    return json(403, { error: 'not-a-member' });
  }
  // No group here has events, so its latest sequence number is 0.
  if (sent.cursor > 0) return json(400, { error: 'request' });
  const known = api().invites.get(code);
  if (known !== undefined) {
    if (known.groupId !== groupId || !isActive(known)) {
      return json(404, { error: 'no-invite' });
    }
    if (sent.cursor >= known.cursor) Object.assign(known, sent);
    return json(200, {
      code,
      expiresAtMs: known.expiresAtMs,
      cursor: known.cursor,
    });
  }
  if (
    [...api().invites.values()].some(
      (invite) => invite.groupId === groupId && isActive(invite),
    )
  ) {
    return json(409, { error: 'invite-exists' });
  }
  const expiresAtMs = apiNow() + WEEK;
  api().invites.set(code, { groupId, expiresAtMs, revoked: false, ...sent });
  return json(200, { code, expiresAtMs, cursor: sent.cursor });
}

function deleteInvite(request: Received, groupId: string, code: string) {
  if (!UUID.test(groupId) || !CODE.test(code) || request.body.length > 0) {
    return json(400, { error: 'request' });
  }
  if (!api().groups.get(groupId)?.has(request.deviceId!)) {
    return json(403, { error: 'not-a-member' });
  }
  const invite = api().invites.get(code);
  if (invite?.groupId === groupId && isActive(invite)) {
    invite.revoked = true;
    invite.card = '';
    api().requests.delete(code);
  }
  return json(200, { code });
}

/** `GET /invites/<code>`, which takes no signature (SHARING-83.2 to 86.1). */
function readInvite(request: Received) {
  const read = READ_PATH.exec(request.path.split('?')[0]);
  if (!read || request.method !== 'GET') return undefined;
  if (!CODE.test(read[1]) || request.path.includes('?')) {
    return json(400, { error: 'request' });
  }
  const invite = api().invites.get(read[1]);
  if (!isActive(invite)) return json(404, { error: 'no-invite' });
  return json(200, { expiresAtMs: invite!.expiresAtMs, card: invite!.card });
}

function requestIn(request: Received): string | undefined {
  try {
    const body: unknown = JSON.parse(
      Buffer.from(request.body).toString('utf8'),
    );
    if (
      typeof body === 'object' &&
      body !== null &&
      !Array.isArray(body) &&
      Object.keys(body).length === 1 &&
      'request' in body &&
      typeof body.request === 'string' &&
      CARD.test(body.request)
    ) {
      return body.request;
    }
  } catch {
    // Not JSON.
  }
  return undefined;
}

/** `PUT /invites/<code>/request` (SHARING-112.1 to 116.1, 118.1, 119.1). */
function putRequest(request: Received, code: string) {
  const sent = requestIn(request);
  if (!CODE.test(code) || request.path.includes('?') || sent === undefined) {
    return json(400, { error: 'request' });
  }
  const invite = api().invites.get(code);
  if (!isActive(invite)) return json(404, { error: 'no-invite' });
  if (api().groups.get(invite!.groupId)?.has(request.deviceId!)) {
    return json(409, { error: 'already-a-member' });
  }
  const requests = api().requests.get(code) ?? new Map<string, string>();
  if (!requests.has(request.deviceId!) && requests.size >= 20) {
    return json(409, { error: 'requests-full' });
  }
  requests.set(request.deviceId!, sent);
  api().requests.set(code, requests);
  return json(200, { code });
}

/** `DELETE /invites/<code>/request` (SHARING-117.1, 118.1). */
function deleteRequest(request: Received, code: string) {
  if (
    !CODE.test(code) ||
    request.path.includes('?') ||
    request.body.length > 0
  ) {
    return json(400, { error: 'request' });
  }
  if (isActive(api().invites.get(code))) {
    api().requests.get(code)?.delete(request.deviceId!);
  }
  return json(200, { code });
}

/** `GET /invites/<code>/request` (SHARING-183.1): what became of the device's request. */
function askResult(request: Received, code: string) {
  if (!CODE.test(code) || request.path.includes('?')) {
    return json(400, { error: 'request' });
  }
  const handover = api().handovers.get(`${code} ${request.deviceId}`);
  if (handover) return json(200, { state: 'approved', ...handover });
  const invite = api().invites.get(code);
  if (!isActive(invite)) return json(404, { error: 'no-invite' });
  if (api().groups.get(invite!.groupId)?.has(request.deviceId!)) {
    return json(409, { error: 'already-a-member' });
  }
  return json(200, {
    state: api().requests.get(code)?.has(request.deviceId!)
      ? 'waiting'
      : 'none',
  });
}

/** What a group's member device gets of its snapshot and its events (sync), as far as joining needs them. */
function joinedGroup(request: Received) {
  const [, groupId, rest] =
    /^\/groups\/([^/?]+)\/(snapshot|snapshots\/[^/]+\/chunks\/\d+|events)(\?|$)/.exec(
      request.path,
    ) ?? [];
  if (!groupId || request.method !== 'GET') return undefined;
  const snapshot = api().snapshots.get(groupId);
  if (!api().groups.get(groupId)?.has(request.deviceId!)) {
    return snapshot ? json(403, { error: 'not-a-member' }) : undefined;
  }
  if (rest === 'events') return json(200, { events: [], more: false });
  if (!snapshot) return json(404, { error: 'no-snapshot' });
  if (rest === 'snapshot') {
    const { chunks, ...said } = snapshot;
    return json(200, { ...said, count: chunks.length });
  }
  const content = snapshot.chunks[Number(rest.split('/').at(-1))];
  return content === undefined
    ? json(400, { error: 'request' })
    : json(200, { content });
}

const GROUP_PATH = /^\/groups\/([^/?]+)$/;
const INVITE_PATH = /^\/groups\/([^/?]+)\/invites\/([^/?]+)$/;
const READ_PATH = /^\/invites\/([^/?]+)$/;
const REQUEST_PATH = /^\/invites\/([^/?]+)\/request$/;

function route(request: Received) {
  const group = GROUP_PATH.exec(request.path);
  if (group && request.method === 'PUT') return createGroup(request, group[1]);
  const invite = INVITE_PATH.exec(request.path);
  if (invite && request.method === 'PUT') {
    return putInvite(request, invite[1], invite[2]);
  }
  if (invite && request.method === 'DELETE') {
    return deleteInvite(request, invite[1], invite[2]);
  }
  const joining = REQUEST_PATH.exec(request.path.split('?')[0]);
  if (joining && request.method === 'PUT') {
    return putRequest(request, joining[1]);
  }
  if (joining && request.method === 'DELETE') {
    return deleteRequest(request, joining[1]);
  }
  if (joining && request.method === 'GET') {
    return askResult(request, joining[1]);
  }
  const joined = joinedGroup(request);
  if (joined) return joined;
  // Nothing else has a route here, the event API (SYNC-45.1 to 64.1) included, on purpose:
  // a sync that the app starts after a save in a shared ledger gets "not found" for its
  // download, keeps its unsent events, and changes nothing these tests look at. The tests
  // leave such requests out of what they count (`apiRequests`).
  return { status: 404, body: '404 Not Found' };
}

/** The invite the API holds under `code`, if any. */
export const inviteOnApi = (code: string) => api().invites.get(code);

/** Whether the API has the group. */
export const groupOnApi = (groupId: string) => api().groups.has(groupId);

/** Makes another phone's device a member device of the group, which exists on the API. */
export function addMemberDevice(groupId: string, deviceId: string) {
  api().groups.get(groupId)!.add(deviceId);
}

/** Another phone creates the group's invite on the API, as a member device would. */
export function inviteByAnotherPhone(groupId: string, code: string) {
  api().invites.set(code, {
    groupId,
    expiresAtMs: apiNow() + WEEK,
    revoked: false,
    card: '00'.repeat(41),
    cursor: 0,
  });
}

/** Another phone revokes the invite on the API. */
export function revokedByAnotherPhone(code: string) {
  const invite = api().invites.get(code)!;
  invite.revoked = true;
  invite.card = '';
  api().requests.delete(code);
}

/**
 * Another phone's group and its invite on the API, with the card that phone uploaded:
 * `deviceId` is its only member device.
 */
export function inviteWithCard(
  groupId: string,
  deviceId: string,
  code: string,
  card: Uint8Array,
) {
  const members = api().groups.get(groupId) ?? new Set<string>();
  members.add(deviceId);
  api().groups.set(groupId, members);
  api().invites.set(code, {
    groupId,
    expiresAtMs: apiNow() + WEEK,
    revoked: false,
    card: toHex(card),
    cursor: 0,
  });
}

/** A member rejects the device's request: the API holds it no more (SHARING-172.1). */
export function rejectedOnApi(code: string, deviceId: string) {
  api().requests.get(code)?.delete(deviceId);
}

/**
 * A member approves the device's request (SHARING-173.1): the device is a member device,
 * its request is gone, and the API holds this handover for it and this snapshot of the
 * group.
 */
export function approvedOnApi(
  code: string,
  deviceId: string,
  handover: Handover,
  snapshot?: StoredSnapshot,
) {
  const members = api().groups.get(handover.groupId) ?? new Set<string>();
  members.add(deviceId);
  api().groups.set(handover.groupId, members);
  api().requests.get(code)?.delete(deviceId);
  api().handovers.set(`${code} ${deviceId}`, handover);
  if (snapshot) api().snapshots.set(handover.groupId, snapshot);
}

/** The API holds no handover for the device any more, as once it has downloaded events (SHARING-185.1). */
export function handoverGoneOnApi(code: string, deviceId: string) {
  api().handovers.delete(`${code} ${deviceId}`);
}

/** A new card for the invite, as a member's phone uploads one when the group changes. */
export function cardOnApi(code: string, card: Uint8Array) {
  api().invites.get(code)!.card = toHex(card);
}

/** The join requests the API holds for an invite: each device's content. */
export const requestsOnApi = (code: string) =>
  [...(api().requests.get(code) ?? [])].map(([deviceId, content]) => ({
    deviceId,
    content: fromHex(content),
  }));

/** Other devices fill the invite's requests up to `count`. */
export function requestsFromOthers(code: string, count: number) {
  const requests = api().requests.get(code) ?? new Map<string, string>();
  for (let each = requests.size; each < count; each += 1) {
    requests.set(`other-device-${each}`, '00'.repeat(41));
  }
  api().requests.set(code, requests);
}

// What the API received

type Sent = Pick<Received, 'method' | 'path'>;

export const isCreateGroup = (request: Sent) =>
  request.method === 'PUT' && GROUP_PATH.test(request.path);
export const isPutInvite = (request: Sent) =>
  request.method === 'PUT' && INVITE_PATH.test(request.path);
export const isRevoke = (request: Sent) =>
  request.method === 'DELETE' && INVITE_PATH.test(request.path);
export const isRegistering = (request: Sent) =>
  request.method === 'POST' && request.path === DEVICES_PATH;

/** A download or an upload of a group's events, which the phone's sync sends by itself. */
const isEventApi = (request: Sent) =>
  /^\/groups\/[^/?]+\/events(\?|$)/.test(request.path);

/** A member's phone listing its group's join requests, which it does after a sync (SHARING-190.1). */
const isRequestList = (request: Sent) =>
  request.method === 'GET' &&
  /^\/groups\/[^/?]+\/requests(\?|$)/.test(request.path);

/**
 * Every request the API received, registrations included, except the downloads and
 * uploads of events and the lists of join requests: whether and when the phone syncs,
 * and lists after it, is not these tests' to say.
 */
export const apiRequests = () =>
  received().filter(
    (request) => !isEventApi(request) && !isRequestList(request),
  );

/** How many such requests the API has received. */
export const asked = () => apiRequests().length;

/** The requests the API received, each as its method and path. */
export const requestLines = () =>
  apiRequests().map((request) => `${request.method} ${request.path}`);

export const inviteRequests = () => requestsReceived().filter(isPutInvite);

/** The code in the path of a request that creates or revokes an invite. */
export const codeIn = (request: Received) => INVITE_PATH.exec(request.path)![2];

/** The card a request carries, and the cursor it is labelled with. */
export function sentCard(request: Received) {
  const sent = cardIn(request);
  if (sent === undefined) throw new Error('The request carries no card');
  return { cursor: sent.cursor, card: fromHex(sent.card) };
}

const fromBase64Url = (text: string) =>
  new Uint8Array(Buffer.from(text, 'base64url'));

/** A link's code and secret, as written and as bytes. */
export function partsOf(link: string) {
  const match = LINK.exec(link);
  if (!match) throw new Error(`Not an invite link: ${link}`);
  return {
    code: match[1],
    secret: match[2],
    codeBytes: fromBase64Url(match[1]),
    secretBytes: fromBase64Url(match[2]),
  };
}

/** The key a card is encrypted with, derived from the secret after `#` (SHARING-95.1). */
export const cardKeyOf = (secret: string) =>
  deriveKey({ secret: fromBase64Url(secret), purpose: CARD_PURPOSE });

/** What a request's card says, opened with the key and the associated data of SHARING-95.1. */
export function openedCard(request: Received, secret: string): string {
  const opened = decrypt({
    key: cardKeyOf(secret),
    ciphertext: sentCard(request).card,
    associatedData: utf8(`${CARD_PURPOSE}\n${codeIn(request)}`),
  });
  if (!opened.ok) throw new Error(`The card does not open: ${opened.reason}`);
  return Buffer.from(opened.plaintext).toString('utf8');
}

/** Every writing of `bytes` someone could put in a request or a file. */
const writingsOf = (bytes: Uint8Array) => {
  const buffer = Buffer.from(bytes);
  return [
    buffer.toString('latin1'),
    buffer.toString('hex'),
    buffer.toString('hex').toUpperCase(),
    buffer.toString('base64'),
    buffer.toString('base64url'),
  ];
};

/** Whether any request the API received, registrations included, holds `bytes` in its URL, its four fields or its body. */
export function requestsHold(bytes: Uint8Array | string): boolean {
  const writings =
    typeof bytes === 'string' ? [bytes, toHex(utf8(bytes))] : writingsOf(bytes);
  return requestsReceived().some((request) => {
    const text = [
      request.url,
      request.deviceId,
      request.timestamp,
      request.nonce,
      request.signature,
      Buffer.from(request.body).toString('latin1'),
    ].join('\n');
    return writings.some((writing) => text.includes(writing));
  });
}

/**
 * Whether a value in the phone's local data holds `bytes`: in a text column in any of
 * those writings, or in a BLOB column, which the reader gives as its bytes by index, as
 * they are or in any of those writings.
 */
export function localDataHolds(bytes: Uint8Array): boolean {
  const writings = writingsOf(bytes);
  const holds = (text: string) =>
    writings.some((writing) => text.includes(writing));
  return Object.values(everything())
    .flat()
    .flatMap((row) => Object.values(JSON.parse(row) as Record<string, unknown>))
    .some((stored) => {
      if (typeof stored === 'string') return holds(stored);
      if (typeof stored !== 'object' || stored === null) return false;
      const blob = Buffer.from(Object.values(stored) as number[]);
      return holds(blob.toString('latin1')) || holds(blob.toString('hex'));
    });
}

/** The secure store's entries that hold a group key, by name. */
export const groupKeys = () =>
  secureStoreEntries().filter(({ key }) => key.startsWith('group-key.'));

// The app

/**
 * Gives each test a phone (sync-app) with the secure store, the random source and the API
 * of the sharing tests, an API that knows no group, and the system's share sheet recorded
 * instead of shown. The test file itself puts the doubles in place of `expo-secure-store`
 * and `expo-crypto`, as Jest needs.
 */
export function eachTestGetsAnInvitingPhone(prefix: string) {
  const apiUrlBefore = process.env.EXPO_PUBLIC_API_URL;
  eachTestGetsAPhone(prefix);
  beforeEach(() => {
    resetWorld();
    holder.inviteTestApi = undefined;
    apiPublicRoutes(readInvite);
    apiRoutes(route);
    process.env.EXPO_PUBLIC_API_URL = API;
    jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: 'sharedAction', activityType: undefined });
  });
  afterEach(async () => {
    const wrong = mistakes();
    if (apiUrlBefore === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = apiUrlBefore;
    await removeWorld();
    expect(wrong).toEqual([]);
  });
}

/** Starts the app with `groups` (startWithGroups) and leaves the phone's clock at T. */
export async function startAt(groups: Record<string, readonly string[]>) {
  const app = await startWithGroups(groups);
  setClock(T);
  return app;
}

/** Lets the app work, without moving the phone's clock, until `done` holds. */
export async function until(done: () => boolean, what: string) {
  for (let turn = 0; turn < 200 && !done(); turn += 1) await settle();
  if (!done()) throw new Error(`Still waiting for ${what}`);
}

/**
 * Holds every request before it reaches the API, until the function this returns is
 * called. Until the test ends, the app's `fetch` is this one.
 */
export function holdTheApi(): () => void {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const theApi = globalThis.fetch;
  globalThis.fetch = (async (...request: Parameters<typeof fetch>) => {
    await held;
    return theApi(...request);
  }) as typeof fetch;
  return release;
}

/**
 * Does `then` once, right after the API has answered the next request `which` picks and
 * before the app has the answer.
 */
export function afterTheAnswerTo(
  which: (request: Sent) => boolean,
  then: () => void,
) {
  const theApi = globalThis.fetch;
  let done = false;
  globalThis.fetch = (async (...request: Parameters<typeof fetch>) => {
    const sent = new Request(...request);
    const url = new URL(sent.url);
    const response = await theApi(...request);
    if (
      !done &&
      which({ method: sent.method, path: url.pathname + url.search })
    ) {
      done = true;
      then();
    }
    return response;
  }) as typeof fetch;
}

/**
 * From now on the API handles the requests `which` picks and keeps their answers back,
 * until the function this returns is called. A request the app gives up through the signal
 * it passed fails then, as `fetch` does; with no signal it stays unanswered.
 */
export function keepAnswersBack(
  which: (request: Sent) => boolean,
): () => Promise<void> {
  let release!: () => void;
  const kept = new Promise<void>((resolve) => {
    release = resolve;
  });
  let keeping = true;
  const theApi = globalThis.fetch;
  globalThis.fetch = (async (...request: Parameters<typeof fetch>) => {
    const sent = new Request(...request);
    const url = new URL(sent.url);
    const { signal } = sent;
    const response = await theApi(...request);
    if (
      keeping &&
      which({ method: sent.method, path: url.pathname + url.search })
    ) {
      await Promise.race([
        kept,
        new Promise<never>((_resolve, reject) => {
          const fail = () =>
            reject(
              (signal.reason as unknown) ??
                Object.assign(new Error('Aborted'), { name: 'AbortError' }),
            );
          if (signal.aborted) fail();
          else signal.addEventListener('abort', fail, { once: true });
        }),
      ]);
    }
    return response;
  }) as typeof fetch;
  return async () => {
    keeping = false;
    await act(async () => {
      release();
      await jest.advanceTimersByTimeAsync(0);
    });
  };
}

/**
 * Lets `seconds` pass on the phone, running the timers that come due. Only what the app
 * times with `setTimeout` comes due: Jest's clock does not move Node's
 * `AbortSignal.timeout`, which on the phone is made of `setTimeout`.
 */
export const secondsPass = (seconds: number) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(seconds * 1000);
  });

/** The lines Invite shows, top to bottom. */
export const inviteLines = () => linesIn(screenOf('Invite'));

/** The invite link Invite shows; undefined when it shows none. */
export const shownLink = () =>
  isOpen('Invite')
    ? inviteLines().find((line) => line.startsWith('https://'))
    : undefined;

/** Whether Invite has the result of preparing the invite: a link, or a sentence that says why not. */
const hasResult = () =>
  isOpen('Invite') &&
  !inviteLines().includes(CREATING) &&
  inviteLines().length > 0;

/** Presses Invite with Link in the Members that is open, and waits for Invite to show a result. */
export async function pressInvite() {
  await fireEvent.press(membersButton('Invite with Link'));
  await expectOpen('Invite');
  await until(hasResult, 'Invite to show a link or a reason');
}

/** Opens the Members of the group named `group` from the Groups root, and presses Invite with Link. */
export async function invite(group: string) {
  await showMembers(group);
  await pressInvite();
}

/** The same, and the link Invite then shows, which the test expects. */
export async function invited(group: string): Promise<string> {
  await invite(group);
  const link = shownLink();
  if (link === undefined) {
    throw new Error(`Invite shows no link: ${inviteLines().join(' / ')}`);
  }
  return link;
}

/** Presses Try Again in Invite and waits for the next result. */
export async function tryAgain() {
  await pressInInvite('Try Again');
  await until(hasResult, 'Invite to show a link or a reason');
}

/** A button in Invite's content, by its accessible name; undefined when it has none. */
export const inviteButton = (name: string) =>
  screenOf('Invite')
    .queryAll(
      (view) =>
        (view.props.accessibilityRole === 'button' ||
          view.props.role === 'button') &&
        (view.props.accessibilityLabel ?? linesIn(view).join(' ')) === name,
      { includeSelf: false },
    )
    .at(0);

/** Presses a button in Invite's content and lets the app take it in. */
export async function pressInInvite(name: string) {
  const button = inviteButton(name);
  if (button === undefined) throw new Error(`No ${name} in Invite`);
  await fireEvent.press(button);
  await settle();
}

export async function closeInvite() {
  await pressOnBar('Invite', 'Close');
  await expectClosed('Invite');
}

/** The QR codes Invite shows: what each holds and how a screen reader names it. */
export const qrCodes = () =>
  componentsIn(screenOf('Invite'), (type) => type === QrCode).map(
    ({ props }) => props as { value: string; accessibilityLabel: string },
  );

/** What the system's share sheet was opened with, each time. */
export const shared = () =>
  jest.mocked(Share.share).mock.calls.map(([content]) => content);
