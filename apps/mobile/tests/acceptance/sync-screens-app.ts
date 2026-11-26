import { Buffer } from 'node:buffer';
import { randomBytes, randomUUID } from 'node:crypto';
import { act } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import type { SyncStamp } from '@shared-expense/domain';
import { decrypt, encrypt } from '@shared-expense/domain/crypto';
import { readDeviceIdentity, sendApiRequest } from '../../src/sharing';
import { shareGroup } from '../../src/sync';
import { startWithGroups } from './ledger-group-expense-app';
import {
  API,
  apiTime,
  received,
  secureStore,
  settled,
  type Received,
} from './sharing-app';
import {
  LATER,
  START,
  appDatabase,
  categoryOf,
  groupId,
  members,
  setClock,
} from './sync-app';

// The screen tests of the sync loop start the whole app, as the other sync tests do
// (sync-app), on a phone that has a device identity and a secure store (sharing-app).
// They stand in for the first Invite, which is not built yet (#138): they register the
// phone, make a group a shared ledger under the phone's own device ID, and put its group
// key in the secure store (SYNC-66.1). Then the app syncs by itself, and the tests watch
// what it sends.
//
// The API is sharing-app's, which checks every request as the real one does, with an
// event API put in front of it here: it keeps each group's events in memory and answers
// the three requests as the sync spec says the real API does, without its limits. The
// phone's sync loop is tested against the real API elsewhere (sync-loop-app).

/** The line a shared ledger's screen shows while it waits for an app update (SYNC-75.1). */
export const UPDATE_NOTICE =
  'This group has changes from a newer version of the app. Update the app to see them.';
/** The line a shared ledger's screen shows while its group is full (SYNC-83.1). */
export const FULL_NOTICE =
  'This group has reached its storage limit. New changes stay on this phone until there is room.';

/** Another phone's device ID: Casey's, as the sharing spec's scenarios have it. */
export const OTHER_DEVICE = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

interface Relayed {
  id: string;
  sequence: number;
  deviceId: string;
  epoch: number;
  receivedAtMs: number;
  content: string;
}

interface FakeGroup {
  events: Relayed[];
  full: boolean;
  /** The member devices the API lists while the group needs a rotation (SHARING-256.1). */
  rotationNeededBy?: string[];
  /** Whether the API answers this phone's downloads that it needs a snapshot (SYNC-136.2). */
  snapshotNeeded?: boolean;
}

interface World {
  groups: Map<string, FakeGroup>;
  /** What the header `x-replaced` says on the refusals of a group this phone was dropped from (SHARING-305.1). */
  replaced: Map<string, string>;
  keys: Map<string, Uint8Array>;
  gate: Promise<void>;
  /** The method whose answers the gate keeps back; every method when undefined. */
  held?: string;
  release?: () => void;
  inFlight: Map<string, number>;
  mostAtOnce: Map<string, number>;
  apiUrl: string | undefined;
  inner?: typeof fetch;
}

const holder = globalThis as { syncScreensWorld?: World };

function world(): World {
  if (!holder.syncScreensWorld) throw new Error('startEventApi has not run');
  return holder.syncScreensWorld;
}

/** Where the build says the API is; the tests put this in place of the app's own answer. */
export const builtApiUrl = () => holder.syncScreensWorld?.apiUrl;

/** From now on the build names this API, or none. */
export function setBuiltApiUrl(url: string | undefined) {
  world().apiUrl = url;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status });

function answerOf(
  method: string,
  groupIdOf: string,
  events: boolean,
  url: URL,
  body: Uint8Array,
  device: string | null,
): Response {
  const state = world();
  if (method === 'PUT' && !events) {
    if (!state.groups.has(groupIdOf)) {
      state.groups.set(groupIdOf, { events: [], full: false });
    }
    return json(200, { groupId: groupIdOf });
  }
  const group = state.groups.get(groupIdOf);
  if (!group || !events) {
    const replaced = state.replaced.get(groupIdOf);
    return new Response(JSON.stringify({ error: 'not-a-member' }), {
      status: 403,
      headers: replaced === undefined ? {} : { 'x-replaced': replaced },
    });
  }
  const rotationNeeded = () =>
    json(409, { error: 'rotation-needed', devices: group.rotationNeededBy });
  if (method === 'GET') {
    if (group.snapshotNeeded) return json(410, { error: 'snapshot-needed' });
    const after = Number(url.searchParams.get('after'));
    const last = group.events.at(-1)?.sequence ?? 0;
    if (group.rotationNeededBy && after === last) return rotationNeeded();
    const rest = group.events.filter((event) => event.sequence > after);
    return json(200, { events: rest.slice(0, 100), more: rest.length > 100 });
  }
  if (method === 'POST') {
    const upload = JSON.parse(Buffer.from(body).toString('utf8')) as {
      epoch: number;
      events: { id: string; content: string }[];
    };
    const fresh = upload.events.filter(
      ({ id }) => !group.events.some((event) => event.id === id),
    );
    if (fresh.length > 0 && group.rotationNeededBy) return rotationNeeded();
    if (fresh.length > 0 && group.full) {
      return json(413, { error: 'group-full' });
    }
    for (const { id, content } of fresh) {
      group.events.push({
        id,
        sequence: (group.events.at(-1)?.sequence ?? 0) + 1,
        deviceId: device ?? '',
        epoch: upload.epoch,
        receivedAtMs: apiTime(),
        content,
      });
    }
    return json(200, {
      events: upload.events.map(({ id }) => ({
        id,
        sequence: group.events.find((event) => event.id === id)!.sequence,
      })),
    });
  }
  return json(404, {});
}

/**
 * Fails when the caller gives the request up through the signal it passed, as `fetch`
 * does; with no signal it never settles.
 */
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

async function fetchWithEvents(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const state = world();
  const request = new Request(input, init);
  const url = new URL(request.url);
  const match = /^\/groups\/([^/]+)(\/events)?$/.exec(url.pathname);
  if (!match) return state.inner!(request);
  const [, group, events] = match;
  const body = new Uint8Array(await request.clone().arrayBuffer());
  const count = (state.inFlight.get(group) ?? 0) + 1;
  state.inFlight.set(group, count);
  state.mostAtOnce.set(
    group,
    Math.max(state.mostAtOnce.get(group) ?? 0, count),
  );
  try {
    // sharing-app's API takes the request first: it records it and checks it as the real one does.
    const checked = await state.inner!(request);
    const passed =
      checked.status === 200 && (await checked.clone().text()) === '{}';
    const answer = passed
      ? answerOf(
          request.method,
          group,
          events !== undefined,
          url,
          body,
          request.headers.get('x-device-id'),
        )
      : checked;
    // The API has handled the request by now; a held answer is one that does not come.
    if (state.held === undefined || state.held === request.method) {
      await Promise.race([state.gate, givenUp(request.signal)]);
    }
    return answer;
  } finally {
    state.inFlight.set(group, (state.inFlight.get(group) ?? 1) - 1);
  }
}

/** Call from beforeEach, after sharing-app's resetWorld: puts the event API in front of its API. */
export function startEventApi() {
  holder.syncScreensWorld = {
    groups: new Map(),
    replaced: new Map(),
    keys: new Map(),
    gate: Promise.resolve(),
    inFlight: new Map(),
    mostAtOnce: new Map(),
    apiUrl: API,
    inner: globalThis.fetch,
  };
  globalThis.fetch = fetchWithEvents as typeof fetch;
}

/**
 * From now on the event API keeps its answers back, or only its answers to requests of
 * `method`; the requests still arrive, and the API handles them.
 */
export function holdAnswers(method?: 'GET' | 'POST') {
  const state = world();
  state.held = method;
  state.gate = new Promise((resolve) => {
    state.release = resolve;
  });
}

/** Lets the answers go that the event API kept back, and every later one. */
export async function releaseAnswers() {
  const state = world();
  state.release?.();
  state.held = undefined;
  state.gate = Promise.resolve();
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });
}

/**
 * The app stops being active and is active again without having gone to the background, as
 * when Control Center is pulled down over it and put away on iOS. The app hears of both
 * through AppState's change event, as leaveAndComeBack has it hear of the background.
 */
export async function pauseAndResume() {
  const listen = jest.mocked(AppState.addEventListener);
  const listeners = () =>
    listen.mock.calls.flatMap(([type, listener], index) => {
      const subscription = listen.mock.results[index]?.value as
        { remove: jest.Mock } | undefined;
      return type === 'change' && subscription?.remove.mock.calls.length === 0
        ? [listener as (state: AppStateStatus) => void]
        : [];
    });
  await act(async () => {
    for (const hear of listeners()) hear('inactive');
  });
  await act(async () => {
    for (const hear of listeners()) hear('active');
  });
}

/** From now on the API refuses new events of the group because it is full, or takes them again. */
export function groupIsFull(group: string, full: boolean) {
  world().groups.get(group)!.full = full;
}

/**
 * From now on the API counts this phone as no member device of the group: it refuses the
 * phone's requests for its events, as it does once the phone was removed or has left
 * (SHARING-257.1). With `replaced`, its refusals carry the header that says another phone
 * took this one's place, with that value (SHARING-305.1).
 */
export function apiDropsThisPhone(group: string, replaced?: string) {
  world().groups.delete(group);
  if (replaced === undefined) world().replaced.delete(group);
  else world().replaced.set(group, replaced);
}

/**
 * From now on the group needs a rotation and has these member devices, so the API refuses
 * uploads of new events and downloads from its last number (SHARING-256.1), listing the
 * devices in ascending order as the API does (SYNC-62.2); with no devices, it needs none
 * any more.
 */
export function groupNeedsRotation(group: string, devices?: string[]) {
  world().groups.get(group)!.rotationNeededBy = devices && [...devices].sort();
}

/**
 * From now on the API answers this phone's downloads of the group that it needs a
 * snapshot, as it does once it cleared events the phone lacks (SYNC-136.2), or answers
 * with pages again. It stores no snapshot for the phone, so the ledger goes on waiting.
 */
export function groupNeedsSnapshot(group: string, needed = true) {
  world().groups.get(group)!.snapshotNeeded = needed;
}

/** The most requests for a group that were ever on their way at one moment. */
export const mostAtOnce = (group: string) => world().mostAtOnce.get(group) ?? 0;

/** The IDs of the events the API has for a group, in sequence order. */
export const apiEventIds = (group: string) =>
  world()
    .groups.get(group)!
    .events.map((event) => event.id);

// What the app sent to the event API

const isEventRequest = (request: Received) =>
  request.path.startsWith('/groups/');

/** How many requests the API has received so far: a mark to read later ones from. */
export const mark = () => received().length;

/** The method and path of each request the event API received since `from`, in order. */
export const eventRequests = (from = 0) =>
  received()
    .slice(from)
    .filter(isEventRequest)
    .map((request) => `${request.method} ${request.path}`);

export const download = (group: string, after = 0) =>
  `GET /groups/${group}/events?after=${after}`;
export const upload = (group: string) => `POST /groups/${group}/events`;

// Events another phone uploaded

const associatedData = (
  group: string,
  eventId: string,
  device: string,
  epoch: number,
) =>
  new Uint8Array(
    Buffer.from(
      ['shared-expense/event/v1', group, eventId, device, String(epoch)].join(
        '\n',
      ),
      'utf8',
    ),
  );

/** A stamp of the other phone. */
export const otherStamp = (ms: number, counter = 0): SyncStamp => ({
  ms,
  counter,
  device: OTHER_DEVICE,
});

/**
 * Puts events in the API as the other phone uploaded them: each is what an event holds,
 * encrypted under the group's key of key epoch 1, received at the API's time now.
 */
export function otherPhoneUploads(group: string, ...contents: unknown[]) {
  const state = world();
  const key = state.keys.get(group);
  if (!key) throw new Error('The group has no key');
  const stored = state.groups.get(group)!;
  for (const content of contents) {
    const id = randomUUID();
    stored.events.push({
      id,
      sequence: (stored.events.at(-1)?.sequence ?? 0) + 1,
      deviceId: OTHER_DEVICE,
      epoch: 1,
      receivedAtMs: apiTime(),
      content: Buffer.from(
        encrypt({
          key,
          nonce: new Uint8Array(randomBytes(24)),
          plaintext: new Uint8Array(
            Buffer.from(JSON.stringify(content), 'utf8'),
          ),
          associatedData: associatedData(group, id, OTHER_DEVICE, 1),
        }),
      ).toString('hex'),
    });
  }
}

/**
 * Puts an event in the API as the other phone uploaded it under key epoch 2, which this
 * phone has no key for. Its ciphertext starts with the format version `version`: `01` is
 * the one this app knows, `02` one it does not.
 */
export function otherPhoneUploadsUnderEpoch2(
  group: string,
  version: '01' | '02',
) {
  const stored = world().groups.get(group)!;
  stored.events.push({
    id: randomUUID(),
    sequence: (stored.events.at(-1)?.sequence ?? 0) + 1,
    deviceId: OTHER_DEVICE,
    epoch: 2,
    receivedAtMs: apiTime(),
    content: `${version}${randomBytes(80).toString('hex')}`,
  });
}

/** The group's last sequence number on the API: 0 while it has no event. */
export const lastSequence = (group: string) =>
  world().groups.get(group)!.events.at(-1)?.sequence ?? 0;

/**
 * Stores events in the API as `device` uploaded them under key epoch `epoch`, as the
 * approval of a join request does (SHARING-173.2), and gives back their sequence numbers.
 */
export function apiStores(
  group: string,
  device: string,
  epoch: number,
  events: readonly { id: string; content: string }[],
): number[] {
  const stored = world().groups.get(group)!;
  return events.map(({ id, content }) => {
    const sequence = (stored.events.at(-1)?.sequence ?? 0) + 1;
    stored.events.push({
      id,
      sequence,
      deviceId: device,
      epoch,
      receivedAtMs: apiTime(),
      content,
    });
    return sequence;
  });
}

/**
 * Makes the API relay the group's event `id` as received at `receivedAtMs`. The real API
 * never changes when it received an event: this stands for one that the phones refuse.
 */
export function apiReceivedAt(group: string, id: string, receivedAtMs: number) {
  const event = world()
    .groups.get(group)
    ?.events.find((stored) => stored.id === id);
  if (!event) throw new Error('The API holds no such event');
  event.receivedAtMs = receivedAtMs;
}

/** The API forgets the group's events, as if they had never been uploaded. */
export function apiForgetsEvents(group: string) {
  world().groups.get(group)!.events = [];
}

/**
 * Lunch as the other phone adds it to Brisbane: 30.00 USD on 2026-10-30, Food & Dining,
 * paid by Casey and split between Taylor and Casey, so it is on your expense list.
 */
export async function lunchCreated(stamp = otherStamp(LATER)) {
  const ids = await members('Brisbane');
  return {
    version: 1,
    stamp,
    type: 'expense',
    id: randomUUID(),
    units: {
      title: { value: 'Lunch' },
      date: { value: '2026-10-30' },
      note: { value: null },
      category: { value: await categoryOf('Brisbane', 'Food & Dining') },
      money: {
        value: {
          amountMinor: 3000,
          currency: 'USD',
          payments: [{ participant: ids.Casey, amountMinor: 3000 }],
          shares: [
            { participant: ids.Taylor, amountMinor: 1500 },
            { participant: ids.Casey, amountMinor: 1500 },
          ],
        },
      },
      trashed: { value: false },
    },
  };
}

/** An event in format version 2, which this app does not know. */
export const newerEvent = (stamp = otherStamp(LATER)) => ({
  version: 2,
  stamp,
  type: 'expense',
  id: randomUUID(),
  shape: 'something a later version of the app writes',
});

// Starting with shared ledgers

/** The device ID of the phone's device identity. */
/**
 * What an event this phone sent holds, opened with the group key its secure store keeps
 * for `epoch`; undefined while the store has no such key, or when the event does not open.
 */
export async function openedByThisPhone(
  group: string,
  epoch: number,
  event: { id: string; content: string },
): Promise<
  | {
      type: string;
      id: string;
      stamp: unknown;
      units: Record<string, { value: unknown; base?: unknown }>;
    }
  | undefined
> {
  const key = await secureStore.getItemAsync(`group-key.${group}.${epoch}`);
  if (!key) return undefined;
  const result = decrypt({
    key: new Uint8Array(Buffer.from(key, 'hex')),
    ciphertext: new Uint8Array(Buffer.from(event.content, 'hex')),
    associatedData: associatedData(group, event.id, await deviceId(), epoch),
  });
  return result.ok
    ? (JSON.parse(Buffer.from(result.plaintext).toString('utf8')) as never)
    : undefined;
}

export async function deviceId(): Promise<string> {
  const identity = await settled(readDeviceIdentity(appDatabase()));
  if (identity.status === 'none') throw new Error('No device identity yet');
  return identity.deviceId;
}

/**
 * Makes the group named `group` a shared ledger as its first Invite will (#138): the
 * phone creates the group on the API, which makes and registers its device identity on
 * first use, the group becomes a shared ledger under that device ID, and its key of key
 * epoch 1 goes in the secure store.
 */
export async function shareAsInvited(group: string) {
  const id = await groupId(group);
  const database = appDatabase();
  await act(async () => {
    const created = await settled(
      sendApiRequest(database, {
        apiUrl: API,
        method: 'PUT',
        path: `/groups/${id}`,
      }),
    );
    if (created.outcome !== 'answered' || created.status !== 200) {
      throw new Error('The group was not created on the API');
    }
    const key = new Uint8Array(randomBytes(32));
    world().keys.set(id, key);
    await secureStore.setItemAsync(
      `group-key.${id}.1`,
      Buffer.from(key).toString('hex'),
      { keychainAccessible: secureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY },
    );
    await settled(
      shareGroup(database, { groupId: id, device: await deviceId() }),
    );
  });
  return id;
}

/**
 * Starts the app with `groups`, each with its members, makes each group named in `shared`
 * a shared ledger at START, and leaves the clock a minute later, as startShared does.
 */
export async function startSynced(
  groups: Record<string, readonly string[]> = { Brisbane: ['Casey', 'Blake'] },
  shared: readonly string[] = ['Brisbane'],
) {
  const app = await startWithGroups(groups);
  setClock(START);
  for (const group of shared) await shareAsInvited(group);
  setClock(LATER);
  return app;
}
