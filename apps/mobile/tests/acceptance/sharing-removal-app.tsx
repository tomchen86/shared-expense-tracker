import { Buffer } from 'node:buffer';
import { act } from '@testing-library/react-native';
import { received, type Received } from './sharing-app';
import { D, DANA_USER, someBoxKey, syncs } from './sharing-decision-app';
import { settle } from './shell-appearance-app';
import { LATER, created, groupId, receive } from './sync-app';
import {
  apiDropsThisPhone,
  apiStores,
  groupNeedsRotation,
  otherStamp,
} from './sync-screens-app';

// The screen tests of removing a member's phone, of leaving and of a read-only copy start
// the whole app on a phone whose Brisbane is a shared ledger that syncs
// (sync-screens-app, sharing-decision-app). In front of those APIs they put the requests
// of docs/specs/sharing/spec.md (SHARING-250.1 to 264.1) for a member's phone, kept in
// memory: the rotation, the leave, the question for keys, and the revocation of an
// invite. The real API is tested elsewhere (apps/api), and the phone against it in
// sharing-removal-api.test.ts.

export const REMOVE = 'Remove';
export const LEAVE = 'Leave';
export const REMOVE_FROM_GROUP = 'Remove from Group';
export const LEAVE_GROUP = 'Leave Group';
export const REMOVING = 'Removing…';
export const LEAVING = 'Leaving…';
export const UNABLE_TO_REMOVE = 'Unable to Remove Member';
export const UNABLE_TO_LEAVE = 'Unable to Leave Group';
export const READ_ONLY_COPY = 'Read-only copy';
export const NO_MEMBER_BANNER =
  "You're no longer a member of this group. This copy is read-only and won't update.";
export const LEFT_BANNER =
  "You left this group. This copy is read-only and won't update.";
export const LAPSED_BANNER =
  "This phone can't sync this group anymore. This copy is read-only and won't update.";
export const KEEPS_A_COPY =
  "This phone keeps a read-only copy. You won't see new expenses or be able to change this group.";
export const NO_OTHER_PHONE =
  'No other phone has joined this group, so nobody else will have its expenses.';
export const neverSent = (count: number) =>
  count === 1
    ? '1 change made on this phone was never sent to the group.'
    : `${count} changes made on this phone were never sent to the group.`;
export const removeTitle = (name: string) => `Remove ${name}?`;
export const removeMessage = (name: string) =>
  `${name}'s phone will lose access to this group right away. Their past payments and shares will be kept.`;

type Kind = 'rotation' | 'leave' | 'keys' | 'revoke';

interface KeyBox {
  epoch: number;
  senderKey: string;
  box: string;
}

interface World {
  /** The boxes the API holds for this phone, by group. */
  boxes: Map<string, KeyBox[]>;
  /** What the API answers next to a request of a kind, in place of its own answer. */
  next: { kind: Kind; status: number; body: unknown }[];
  /** The kinds whose answers are kept back, and what lets them go. */
  held: Set<Kind>;
  gate: Promise<void>;
  release?: () => void;
  inner?: typeof fetch;
}

const holder = globalThis as { removalWorld?: World };

function world(): World {
  if (!holder.removalWorld) throw new Error('startRemovalApi has not run');
  return holder.removalWorld;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status });

const PATH = /^\/groups\/([^/]+)\/(rotation|leave|keys|invites\/[^/]+)$/;
const METHOD: Record<Kind, string> = {
  rotation: 'POST',
  leave: 'POST',
  keys: 'GET',
  revoke: 'DELETE',
};

/** What a rotation the app sent says, as its body reads. */
export interface SentRotation {
  epoch: number;
  remove: string[];
  senderKey: string;
  boxes: { deviceId: string; box: string }[];
  events: { id: string; content: string }[];
}

function answerOf(
  kind: Kind,
  group: string,
  url: URL,
  body: Uint8Array,
  device: string,
): Response {
  const state = world();
  const forced = state.next.findIndex((each) => each.kind === kind);
  if (forced >= 0) {
    const [{ status, body: said }] = state.next.splice(forced, 1);
    return json(status, said);
  }
  if (kind === 'leave') {
    apiDropsThisPhone(group);
    return json(200, { deviceId: device });
  }
  if (kind === 'revoke') {
    return json(200, { code: url.pathname.split('/').at(-1) });
  }
  if (kind === 'keys') {
    const after = Number(url.searchParams.get('after'));
    return json(200, {
      keys: (state.boxes.get(group) ?? []).filter(({ epoch }) => epoch > after),
      more: false,
    });
  }
  const rotation = JSON.parse(
    Buffer.from(body).toString('utf8'),
  ) as SentRotation;
  // The API keeps the box the phone sealed for itself, as it keeps every other.
  const own = rotation.boxes.find(({ deviceId }) => deviceId === device);
  if (own) {
    state.boxes.set(group, [
      ...(state.boxes.get(group) ?? []),
      { epoch: rotation.epoch, senderKey: rotation.senderKey, box: own.box },
    ]);
  }
  groupNeedsRotation(group);
  const sequences = apiStores(group, device, rotation.epoch, rotation.events);
  return json(200, {
    epoch: rotation.epoch,
    events: rotation.events.map(({ id }, at) => ({
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

async function fetchWithRemoval(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const state = world();
  const request = new Request(input, init);
  const url = new URL(request.url);
  const match = PATH.exec(url.pathname);
  if (!match) return state.inner!(request);
  const [, group, route] = match;
  const kind: Kind = route.startsWith('invites/') ? 'revoke' : (route as Kind);
  if (request.method !== METHOD[kind]) return state.inner!(request);
  const body = new Uint8Array(await request.clone().arrayBuffer());
  // sharing-app's API takes the request first: it records it and checks it as the real one does.
  const checked = await state.inner!(request);
  const passed =
    checked.status === 200 && (await checked.clone().text()) === '{}';
  const answer = passed
    ? answerOf(kind, group, url, body, request.headers.get('x-device-id') ?? '')
    : checked;
  if (state.held.has(kind)) {
    await Promise.race([state.gate, givenUp(request.signal)]);
  }
  return answer;
}

/** Call from beforeEach, after startEventApi and startDecisionApi: puts the removal's requests in front of them. */
export function startRemovalApi() {
  holder.removalWorld = {
    boxes: new Map(),
    next: [],
    held: new Set(),
    gate: Promise.resolve(),
    inner: globalThis.fetch,
  };
  globalThis.fetch = fetchWithRemoval as typeof fetch;
}

/** From now on the API keeps its answers to requests of these kinds back; the requests still arrive. */
export function holdRemovals(...kinds: Kind[]) {
  const state = world();
  state.held = new Set(kinds);
  state.gate = new Promise((resolve) => {
    state.release = resolve;
  });
}

/** Lets the answers go that the API kept back, and every later one. */
export async function releaseRemovals() {
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
export function apiAnswersRemoval(kind: Kind, status: number, body: unknown) {
  world().next.push({ kind, status, body });
}

// What the app sent

const pathOf = ({ path }: Received) => path.split('?')[0];
const isRotation = (request: Received) =>
  request.method === 'POST' && /\/rotation$/.test(pathOf(request));
const isLeave = (request: Received) =>
  request.method === 'POST' && /\/leave$/.test(pathOf(request));
const isKeys = (request: Received) =>
  request.method === 'GET' && /\/keys$/.test(pathOf(request));
const isRevocation = (request: Received) =>
  request.method === 'DELETE' && /\/invites\/[^/]+$/.test(pathOf(request));

/** The rotations the app sent since `from`, each as its body reads. */
export const rotations = (from = 0): SentRotation[] =>
  received()
    .slice(from)
    .filter(isRotation)
    .map(
      ({ body }) =>
        JSON.parse(Buffer.from(body).toString('utf8')) as SentRotation,
    );
export const leaves = (from = 0) => received().slice(from).filter(isLeave);
export const keyQuestions = (from = 0) =>
  received()
    .slice(from)
    .filter(isKeys)
    .map(({ path }) => path);
export const revocations = (from = 0) =>
  received()
    .slice(from)
    .filter(isRevocation)
    .map(({ path }) => path);

// Other phones in the ledger

/** The member ID Dana has in the tests. */
export const DANA_MEMBER = '5d2c0e4f-8b1a-4c3d-9e7f-6a5b4c3d2e1f';

/** A roster entry another phone wrote: `device` represents `memberId` for the user `userId`. */
export const represents = (
  device: string,
  memberId: string,
  userId: string,
  ms = LATER + 2_000,
) =>
  created('device' as never, device, otherStamp(ms), {
    member: { memberId, userId, boxKey: someBoxKey() },
  });

/**
 * Dana joined Brisbane from her own phone, as an approval by another member's phone left
 * it: the phone has applied her member, added after Blake, and the roster entry of her
 * device D.
 */
export async function danaJoined() {
  const brisbane = await groupId('Brisbane');
  await receive(
    brisbane,
    created('member', DANA_MEMBER, otherStamp(LATER + 1_000), {
      name: 'Dana',
      removed: false,
    }),
    represents(D, DANA_MEMBER, DANA_USER),
  );
  return brisbane;
}

/**
 * The API stops counting this phone among Brisbane's member devices, the app is left and
 * opened again, and so its sync of Brisbane is refused (SYNC-300.1).
 */
export async function thisPhoneIsRemoved(group = 'Brisbane') {
  apiDropsThisPhone(await groupId(group));
  await syncs();
}
