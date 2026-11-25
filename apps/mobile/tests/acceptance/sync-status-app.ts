import { act, waitFor } from '@testing-library/react-native';
import type { SyncEvent } from '@shared-expense/domain';
import { isWaitingForSnapshot, lastSyncedAt } from '../../src/sync';
import { leaveAndComeBack } from './ledger-list-period-app';
import { screenOf, textsOn } from './group-details-app';
import {
  apiAnswers,
  apiAnswersNext,
  received,
  type Received,
} from './sharing-app';
import { iconNames } from './shell-actions-app';
import { appDatabase, at, created, receive } from './sync-app';
import { OTHER_DEVICE } from './sync-screens-app';

// What the app shows of a shared ledger's sync (sync spec, SYNC-313.1 to SYNC-320.1; ledger
// spec, LEDGER-240.1): nothing while all is well. The tests run in the world of the sync
// screen tests (sync-screens-app): the whole app, a phone with a device identity, and an
// event API a test can take offline, hold back, or make answer otherwise. This file adds
// the answers that world lacks, and reads what the screens show of the sync.

type HostView = ReturnType<typeof screenOf>;

export const DAY = 86_400_000;

/** The line of a shared ledger whose last sync got no answer (SYNC-316.2). */
export const OFFLINE_NOTICE =
  'Connect to the internet to sync this group. New changes stay on this phone until then.';
/** The line of a shared ledger that waits for a snapshot (SYNC-314.1). */
export const WAITING_NOTICE =
  'This group is out of date. It will catch up after another member opens the app.';
/** The line of a shared ledger that has not synced for three days, last on `date` (SYNC-315.1). */
export const lastSyncedNotice = (date: string) =>
  `Last synced ${date}. Pull down to sync.`;
/** What a screen reader reads on the card of an expense that is not uploaded yet (LEDGER-240.1). */
export const NOT_SENT = 'Not sent yet';
/** The name of that card's clock on each platform (LEDGER-240.1). */
export const CLOCK_ICON = { ios: 'clock', android: 'schedule' } as const;

const isStatusLine = (text: string) =>
  text === OFFLINE_NOTICE ||
  text === WAITING_NOTICE ||
  text.startsWith('Last synced ');

/** The lines about the state of its sync that the group's screen shows, top to bottom (SYNC-317.1). */
export const statusLines = (group: string) =>
  textsOn(group).filter(isStatusLine);

// What the API answers

/** Whether a request is a download of the group's events. */
export const isDownloadOf = (group: string) => (request: Received) =>
  request.method === 'GET' &&
  request.path.startsWith(`/groups/${group}/events?`);

/** Whether a request is an upload of the group's events. */
export const isUploadOf = (group: string) => (request: Received) =>
  request.method === 'POST' && request.path === `/groups/${group}/events`;

/** The API answers the group's next download with "snapshot needed": it has cleared events the phone lacks (SYNC-136.2). */
export function apiNeedsASnapshotOnce(group: string) {
  apiAnswersNext(
    isDownloadOf(group),
    410,
    JSON.stringify({ error: 'snapshot-needed' }),
  );
}

/**
 * The phone syncs the group and is told it needs a snapshot, which the group does not
 * store: from then on the ledger waits for one (SYNC-165.1).
 */
export async function startsWaiting(group: string) {
  apiNeedsASnapshotOnce(group);
  await leaveAndComeBack();
  await waitFor(async () =>
    expect(await isWaitingForSnapshot(appDatabase(), group)).toBe(true),
  );
}

/** When the group last synced on this phone, as the app's other capabilities read it (SYNC-313.1). */
export const lastSynced = (group: string) => lastSyncedAt(appDatabase(), group);

// Requests the event API of sync-screens-app does not hold back

/** A request about a group that the event API of sync-screens-app passes on: for a snapshot, or for its member devices. */
type HeldKind = 'snapshot' | 'devices';

interface Held {
  kinds: HeldKind[];
  gate: Promise<void>;
  release?: () => void;
  inner?: typeof fetch;
}

const holder = globalThis as { syncStatusHeld?: Held };

/**
 * Call from beforeEach, after startEventApi: lets a test keep back the answers to the
 * requests that ask for a group's snapshot or for its member devices.
 */
export function startHolding() {
  const held: Held = {
    kinds: [],
    gate: Promise.resolve(),
    inner: globalThis.fetch,
  };
  holder.syncStatusHeld = held;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const { pathname } = new URL(request.url);
    const answer = await held.inner!(request);
    const kind = /^\/groups\/[^/]+\/(snapshot|devices)$/.exec(pathname)?.[1];
    if (held.kinds.some((each) => each === kind)) {
      // The API has handled the request; its answer does not come until released, and
      // the wait fails when the app gives the request up, as `fetch` does.
      await Promise.race([
        held.gate,
        new Promise<never>((_resolve, reject) => {
          const fail = () =>
            reject(
              (request.signal.reason as unknown) ??
                Object.assign(new Error('Aborted'), { name: 'AbortError' }),
            );
          if (request.signal.aborted) fail();
          else request.signal.addEventListener('abort', fail, { once: true });
        }),
      ]);
    }
    return answer;
  }) as typeof fetch;
}

/** From now on the API keeps back its answers to the requests of this kind. */
export function holdAnswersTo(kind: HeldKind) {
  const held = holder.syncStatusHeld!;
  if (held.kinds.length === 0) {
    held.gate = new Promise((resolve) => {
      held.release = resolve;
    });
  }
  held.kinds.push(kind);
}

/** Lets those answers go, and every later one. */
export async function releaseHeldAnswers() {
  const held = holder.syncStatusHeld!;
  held.release?.();
  held.kinds = [];
  held.gate = Promise.resolve();
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });
}

// Pull to sync (SYNC-318.1)

interface RefreshControl {
  onRefresh?: () => void;
  refreshing?: boolean;
}

/** The refresh controls of the scrolling lists on the group's screen: the system's pull to refresh. */
const refreshControls = (group: string): RefreshControl[] =>
  screenOf(group)
    .queryAll(
      (view) =>
        (view.props as { refreshControl?: unknown }).refreshControl != null,
      { includeSelf: true },
    )
    .map(
      (view) =>
        (view.props as { refreshControl: { props: RefreshControl } })
          .refreshControl.props,
    )
    .filter(({ onRefresh }) => typeof onRefresh === 'function');

/** Whether the list on the group's screen can be pulled down to refresh. */
export const canPull = (group: string) => refreshControls(group).length > 0;

/** Whether the group's screen shows the system's refresh indicator. */
export const isRefreshing = (group: string) =>
  refreshControls(group).some(({ refreshing }) => refreshing === true);

/** The user pulls the list on the group's screen down and lets go. */
export async function pullDown(group: string) {
  const [control] = refreshControls(group);
  if (!control) throw new Error(`${group}'s list cannot be pulled to refresh`);
  await act(async () => {
    control.onRefresh!();
    await jest.advanceTimersByTimeAsync(0);
  });
}

// The clock on a card (LEDGER-240.1)

/** Whether the card draws the clock of an expense that is not uploaded yet, once. */
export const hasClock = (
  shown: HostView,
  platform: 'ios' | 'android' = 'ios',
) =>
  iconNames(shown, platform).filter((name) => name === CLOCK_ICON[platform])
    .length === 1;

// Members and when each phone last synced (SYNC-320.1)

/** A third and a fourth phone, by their device IDs. */
export const THIRD_DEVICE = 'c9bf9e57-1685-4c89-bafb-ff5af830be8a';
export const FOURTH_DEVICE = 'e7f3a6c2-4b1d-4f8a-9c3e-5d6b7a8c9d0e';
export const FIFTH_DEVICE = 'f1a2b3c4-d5e6-4f70-8a9b-0c1d2e3f4a5b';

const BOX_KEY =
  'bc908a559c76aef30842db38b5e1844f63847c087cf94b793fe477da10d44e75';

/**
 * Hands the app a roster entry another phone wrote, as its sync will: `device`
 * represents the member `memberId` for the user `userId` (SYNC-250.2).
 */
export const phoneRepresents = (
  group: string,
  device: string,
  memberId: string,
  userId: string,
  ms: number,
) =>
  receive(
    group,
    created('device' as SyncEvent['type'], device, at(ms, 0, device), {
      member: { memberId, userId, boxKey: BOX_KEY },
    }),
  );

export const devicesPath = (group: string) => `/groups/${group}/devices`;

/** From now on the API answers the group's member devices with these times of their last sync (SYNC-310.1). */
export function apiSaysDevicesSynced(
  group: string,
  devices: [deviceId: string, syncedAtMs: number | null][],
) {
  apiAnswers(
    'GET',
    devicesPath(group),
    200,
    JSON.stringify({
      devices: [...devices]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([deviceId, syncedAtMs]) => ({ deviceId, syncedAtMs })),
    }),
  );
}

/** The requests for a group's member devices the API has received since `from`, in order. */
export const devicesRequests = (from = 0) =>
  received()
    .slice(from)
    .filter((request) => /^\/groups\/[^/]+\/devices$/.test(request.path))
    .map((request) => `${request.method} ${request.path}`);

export { OTHER_DEVICE };
