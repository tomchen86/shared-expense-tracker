import { Buffer } from 'node:buffer';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { act, waitFor, within } from '@testing-library/react-native';
import {
  boxPublicKey,
  deriveKey,
  encrypt,
} from '@shared-expense/domain/crypto';
import { screenOf } from './group-details-app';
import { nameOf } from './ledger-expense-app';
import { leaveAndComeBack } from './ledger-list-period-app';
import { apiTime, received, type Received } from './sharing-app';
import { settle } from './shell-appearance-app';
import { LATER, created, groupId } from './sync-app';
import {
  apiStores,
  lastSequence,
  otherPhoneUploads,
  otherStamp,
  startSynced,
} from './sync-screens-app';

// The screen tests of approving and rejecting start the whole app on a phone whose
// Brisbane is a shared ledger that syncs (sync-screens-app), and give it an invite as
// another member's phone made it: the invite's event is in the API, and the app gets it
// when it syncs. In front of the event API they put the four requests of
// docs/specs/sharing/spec.md (SHARING-170.1 to 187.1) for a member's phone, kept in
// memory and answered as the spec says the real API answers, without its limits. The
// phone's own approving is tested against the real API elsewhere (sharing-approval-app).

export const WEEK = 604_800_000;
/** The invite's code and secret: 16 and 32 bytes as base64url without padding. */
export const CODE_A = '3q2-7wEjRWeJq83vEjRWeA';
export const S = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
export const CODE_B = 'AAECAwQFBgcICQoLDA0ODw';

/** Dana's phone: its device ID and its user ID. */
export const D = 'c0ffee00-0000-4000-8000-00000000000d';
export const DANA_USER = 'c9bf9e57-1685-4c89-bafb-ff5af830be8a';
/** Another phone that asks. */
export const E = 'c0ffee00-0000-4000-8000-00000000000e';
export const EVAN_USER = '4b1d8a2e-7f3c-4c1a-9e55-0d2a6b7c8e9f';

export const APPROVE = 'Approve';
export const DECLINE = 'Decline';
export const CANCEL = 'Cancel';
export const MAY_SEE =
  "They'll see this group's expenses and can add and change them.";
export const NEW_MEMBER = 'Wants to join as a new member';
export const wantsToBe = (member: string) => `Wants to join as ${member}`;
export const LEFT = 'Wants to join as a member who left';
export const APPROVING = 'Approving…';
export const DECLINING = 'Declining…';
export const UNABLE_TO_APPROVE = 'Unable to Approve';
export const UNABLE_TO_DECLINE = 'Unable to Decline';
export const OFFLINE = 'Connect to the internet and try again.';
export const ANSWERED = 'This request has already been answered.';
export const WENT_WRONG = 'Something went wrong. Try again later.';
export const DEVICES_FULL =
  'This group is full. A shared group can have up to 20 members.';
const CANNOT = "This request can't be approved.";
export const HAS_A_PHONE = (member: string) =>
  `${member} has already joined from another phone. ${CANNOT}`;
export const NO_MEMBER = `The member this request chose is no longer in this group. ${CANNOT}`;
export const GROUP_FULL = `A shared group can have up to 20 members. ${CANNOT}`;
export const SAME_NAME = (member: string) =>
  `This group already has a member named ${member}. ${CANNOT}`;

// The API's requests, snapshots and approvals

interface Asked {
  code: string;
  deviceId: string;
  /** The content, in lowercase hexadecimal. */
  request: string;
}

type Kind = 'list' | 'reject' | 'approve' | 'chunk';

interface World {
  requests: Map<string, Asked[]>;
  /** How many requests a page of a list holds; every one when undefined. */
  pageSize?: number;
  /** What the API answers next to a request of a kind, in place of its own answer. */
  next: { kind: Kind; status: number; body: unknown }[];
  /** The kinds whose answers are kept back, and what lets them go. */
  held: Set<Kind>;
  gate: Promise<void>;
  release?: () => void;
  memberDevices: Map<string, Set<string>>;
  inner?: typeof fetch;
}

const holder = globalThis as { decisionWorld?: World };

function world(): World {
  if (!holder.decisionWorld) throw new Error('startDecisionApi has not run');
  return holder.decisionWorld;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status });

const PATH =
  /^\/groups\/([^/]+)\/(?:requests(?:\/([^/]+)(\/approval)?)?|snapshots\/([^/]+)\/chunks\/(\d+))$/;

const sha256 = (hex: string) =>
  createHash('sha256').update(Buffer.from(hex, 'hex')).digest('hex');

function answerOf(
  kind: Kind,
  group: string,
  applicant: string | undefined,
  url: URL,
  body: Uint8Array,
  device: string,
  chunk?: { snapshotId: string; index: number },
): Response {
  const state = world();
  const forced = state.next.findIndex((each) => each.kind === kind);
  if (forced >= 0) {
    const [{ status, body: said }] = state.next.splice(forced, 1);
    return json(status, said);
  }
  const requests = state.requests.get(group) ?? [];
  if (kind === 'chunk') return json(200, chunk);
  if (kind === 'list') {
    const after = url.searchParams.get('after') ?? '';
    const rest = [...requests]
      .sort((a, b) => (a.deviceId < b.deviceId ? -1 : 1))
      .filter((each) => each.deviceId > after);
    const size = state.pageSize ?? rest.length;
    return json(200, {
      requests: rest.slice(0, size),
      more: rest.length > size,
    });
  }
  const index = requests.findIndex((each) => each.deviceId === applicant);
  if (kind === 'reject') {
    if (index < 0) return json(404, { error: 'no-request' });
    requests.splice(index, 1);
    return json(200, { deviceId: applicant });
  }
  const approval = JSON.parse(Buffer.from(body).toString('utf8')) as {
    request: string;
    cursor: number;
    epoch: number;
    events: { id: string; content: string }[];
  };
  if (index < 0 || sha256(requests[index].request) !== approval.request) {
    return json(404, { error: 'no-request' });
  }
  if (approval.cursor < lastSequence(group)) {
    return json(409, { error: 'behind' });
  }
  const members = state.memberDevices.get(group) ?? new Set<string>();
  if (members.size >= 20) return json(409, { error: 'members-full' });
  members.add(applicant!);
  state.memberDevices.set(group, members);
  requests.splice(index, 1);
  const sequences = apiStores(group, device, approval.epoch, approval.events);
  return json(200, {
    deviceId: applicant,
    events: approval.events.map(({ id }, at) => ({
      id,
      sequence: sequences[at],
    })),
  });
}

const givenUp = (signal: AbortSignal | null | undefined) =>
  new Promise<never>((_resolve, reject) => {
    if (!signal) return;
    const fail = () =>
      reject(
        (signal.reason as unknown) ??
          Object.assign(new Error('Aborted'), { name: 'AbortError' }),
      );
    if (signal.aborted) fail();
    else signal.addEventListener('abort', fail, { once: true });
  });

async function fetchWithDecisions(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const state = world();
  const request = new Request(input, init);
  const url = new URL(request.url);
  const match = PATH.exec(url.pathname);
  if (!match) return state.inner!(request);
  const [, group, applicant, approval, snapshotId, index] = match;
  const kind: Kind =
    snapshotId !== undefined
      ? 'chunk'
      : applicant === undefined
        ? 'list'
        : approval
          ? 'approve'
          : 'reject';
  const methods = {
    list: 'GET',
    reject: 'DELETE',
    approve: 'POST',
    chunk: 'PUT',
  };
  if (request.method !== methods[kind]) return state.inner!(request);
  const body = new Uint8Array(await request.clone().arrayBuffer());
  // sharing-app's API takes the request first: it records it and checks it as the real one does.
  const checked = await state.inner!(request);
  const passed =
    checked.status === 200 && (await checked.clone().text()) === '{}';
  const answer = passed
    ? answerOf(
        kind,
        group,
        applicant,
        url,
        body,
        request.headers.get('x-device-id') ?? '',
        snapshotId === undefined
          ? undefined
          : { snapshotId, index: Number(index) },
      )
    : checked;
  if (state.held.has(kind)) {
    await Promise.race([state.gate, givenUp(request.signal)]);
  }
  return answer;
}

/** Call from beforeEach, after sync-screens-app's startEventApi: puts the members' requests in front of it. */
export function startDecisionApi() {
  holder.decisionWorld = {
    requests: new Map(),
    next: [],
    held: new Set(),
    gate: Promise.resolve(),
    memberDevices: new Map(),
    inner: globalThis.fetch,
  };
  globalThis.fetch = fetchWithDecisions as typeof fetch;
}

/** From now on the API keeps its answers to requests of these kinds back; the requests still arrive. */
export function holdDecisions(...kinds: Kind[]) {
  const state = world();
  state.held = new Set(kinds);
  state.gate = new Promise((resolve) => {
    state.release = resolve;
  });
}

/** Lets the answers go that the API kept back, and every later one. */
export async function releaseDecisions() {
  const state = world();
  state.release?.();
  state.held = new Set();
  state.gate = Promise.resolve();
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });
  await settle();
}

/** The API answers its next request of `kind` with this, in place of its own answer. */
export function apiAnswersDecision(kind: Kind, status: number, body: unknown) {
  world().next.push({ kind, status, body });
}

/** From now on a list holds at most `size` requests a page. */
export function pagesOf(size: number) {
  world().pageSize = size;
}

/** The group has this many member devices on the API. */
export function memberDevicesOn(group: string, count: number) {
  world().memberDevices.set(
    group,
    new Set(Array.from({ length: count }, () => randomUUID())),
  );
}

/** The requests the API holds for a group, by device ID. */
export const requestsOn = (group: string) =>
  (world().requests.get(group) ?? []).map(({ deviceId }) => deviceId);

// Requests other phones sent

const REQUEST = 'shared-expense/invite/request/v1';
const utf8 = (text: string) => new Uint8Array(Buffer.from(text, 'utf8'));

/** A box public key of a phone of its own. */
export const someBoxKey = () =>
  Buffer.from(boxPublicKey(new Uint8Array(randomBytes(32)))).toString('hex');

/** A join request sealed for the invite as SHARING-135.1 says, or with whatever a test changes. */
export function sealedRequest(
  device: string,
  content: unknown,
  { code = CODE_A, secret = S } = {},
): string {
  const text = typeof content === 'string' ? content : JSON.stringify(content);
  const plaintext = new Uint8Array(
    Math.ceil(utf8(text).length / 256) * 256,
  ).fill(0x20);
  plaintext.set(utf8(text));
  return Buffer.from(
    encrypt({
      key: deriveKey({
        secret: new Uint8Array(Buffer.from(secret, 'base64url')),
        purpose: REQUEST,
      }),
      nonce: new Uint8Array(randomBytes(24)),
      plaintext,
      associatedData: utf8(`${REQUEST}\n${code}\n${device}`),
    }),
  ).toString('hex');
}

/** The API holds this request for the group, as if the device had sent it. */
export function apiHolds(
  group: string,
  deviceId: string,
  request: string,
  code = CODE_A,
) {
  const requests = world().requests.get(group) ?? [];
  world().requests.set(group, [
    ...requests.filter((each) => each.deviceId !== deviceId),
    { code, deviceId, request },
  ]);
}

/**
 * A phone asks to join Brisbane: as a new member unless `memberId` names one. Dana's
 * phone, under her name, unless said otherwise.
 */
export async function asks({
  name = 'Dana',
  memberId = null as string | null,
  deviceId = D,
  userId = DANA_USER,
} = {}) {
  apiHolds(
    await groupId('Brisbane'),
    deviceId,
    sealedRequest(deviceId, { name, memberId, userId, boxKey: someBoxKey() }),
  );
}

/** The device withdraws its request. */
export function withdraws(group: string, deviceId = D) {
  world().requests.set(
    group,
    (world().requests.get(group) ?? []).filter(
      (each) => each.deviceId !== deviceId,
    ),
  );
}

// The phone

/** An invite's first event, as another member's phone wrote it. */
export const inviteEvent = (
  code = CODE_A,
  secret = S,
  expiresAtMs = LATER + WEEK,
) =>
  created('invite', code, otherStamp(LATER), { link: { secret, expiresAtMs } });

/** The app is left and opened again, which syncs every shared ledger (SYNC-89.1), and the app comes to rest. */
export async function syncs() {
  await leaveAndComeBack();
  await settle();
}

/**
 * Starts the app with Brisbane a shared ledger that holds the invite of code A, which
 * another member's phone made: the phone has synced, so it has listed the requests the
 * API held at that moment. The clock is at LATER.
 */
export async function startWithInvite(
  groups: Record<string, readonly string[]> = { Brisbane: ['Casey', 'Blake'] },
) {
  const app = await startSynced(groups);
  const brisbane = await groupId('Brisbane');
  otherPhoneUploads(brisbane, inviteEvent());
  await syncs();
  return { app, brisbane };
}

// What the app sent

const isList = ({ method, path }: Received) =>
  method === 'GET' && /^\/groups\/[^/]+\/requests(\?|$)/.test(path);
const isRejection = ({ method, path }: Received) =>
  method === 'DELETE' && /^\/groups\/[^/]+\/requests\/[^/]+$/.test(path);
const isApproval = ({ method, path }: Received) =>
  method === 'POST' && /\/requests\/[^/]+\/approval$/.test(path);
const isChunk = ({ method, path }: Received) =>
  method === 'PUT' && /\/snapshots\/[^/]+\/chunks\/\d+$/.test(path);

export const lists = (from = 0) => received().slice(from).filter(isList);
export const rejections = (from = 0) =>
  received().slice(from).filter(isRejection);
export const approvals = (from = 0) =>
  received().slice(from).filter(isApproval);
export const chunks = (from = 0) => received().slice(from).filter(isChunk);

/** The method and path of every request for the group's requests, snapshots and events since `from`. */
export const groupRequests = (from = 0) =>
  received()
    .slice(from)
    .filter(({ path }) => path.startsWith('/groups/'))
    .map(({ method, path }) => `${method} ${path}`);

// The screens

/** The button on the group's screen that counts the requests to join, if it shows one. */
export const joinButton = (group: string) =>
  within(screenOf(group))
    .queryAllByRole('button')
    .find((button) =>
      /^(1 person wants|\d+ people want) to join$/.test(nameOf(button)),
    );

/** Waits until the group's screen counts `count` requests, or shows no such button for 0. */
export async function expectJoinCount(group: string, count: number) {
  await waitFor(() =>
    expect(joinButton(group) && nameOf(joinButton(group)!)).toBe(
      count === 0
        ? undefined
        : count === 1
          ? '1 person wants to join'
          : `${count} people want to join`,
    ),
  );
}

export { apiTime };
