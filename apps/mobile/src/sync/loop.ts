import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { checkSyncEvent, type SyncStamp } from '@shared-expense/domain';
import {
  EVENT_CONTENT_MINIMUM,
  GROUP_REFUSAL_STATUS,
  UPLOAD_EVENT_LIMIT,
  isEventsPageResponse,
  isGroupRefusal,
  isUploadEventsResponse,
  type EventsPageResponse,
  type GroupRefusal,
  type UploadEventsRequest,
} from '@shared-expense/domain/api';
import { decrypt, encrypt } from '@shared-expense/domain/crypto';
import { getRandomValues } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { sendApiRequest, type ApiResult } from '../sharing/api-request';
import { readDeviceIdentity, SEED_OPTIONS } from '../sharing/device-identity';
import type { Database, SqlExecutor } from '../storage';
import {
  applyReceivedEvents,
  notifyApplied,
  type ReceivedSyncEvent,
} from './apply';
import { checkUnsentStamps, recheckStamps, takeUploadedStamps } from './stamps';
import { utf8Text } from './utf8';

// A phone's sync of one shared ledger with the API (ADR-0027): it downloads page by page
// from its cursor, judging and merging what it can decrypt, then uploads its unsent
// events, encrypted under the group key. Nothing here repeats a sync or starts one: a sync
// that cannot go on ends, and the next one carries on from the local data.

/** The most bytes a request's body may have (SHARING-48.2). */
const BODY_LIMIT = 1_048_576;
/** How long a request of a sync may take to be answered in full (SYNC-97.1). */
const GIVE_UP_AFTER_MS = 60_000;
const NONCE_LENGTH = 24;
const KEY_LENGTH = 32;
/** Stands in for a key the phone lacks, where only a ciphertext's format version is asked. */
const NO_KEY = new Uint8Array(KEY_LENGTH);
const KEY = /^[0-9a-f]{64}$/;
/** The lines a shared ledger's screen shows under its title (SYNC-75.1, SYNC-83.1). */
const UPDATE_NOTICE =
  'This group has changes from a newer version of the app. Update the app to see them.';
const FULL_NOTICE =
  'This group has reached its storage limit. New changes stay on this phone until there is room.';

const keyEntry = (groupId: string, epoch: number) =>
  `group-key.${groupId}.${epoch}`;

const eventsPath = (groupId: string) => `/groups/${groupId}/events`;

/**
 * The group key of one key epoch (SYNC-66.1): undefined when this phone has none, and
 * when it cannot read its secure store now, which leaves it without one too (SYNC-95.1).
 */
async function readGroupKey(
  groupId: string,
  epoch: number,
): Promise<Uint8Array | undefined> {
  const value = await SecureStore.getItemAsync(
    keyEntry(groupId, epoch),
    SEED_OPTIONS,
  ).catch(() => null);
  return value !== null && KEY.test(value) ? hexToBytes(value) : undefined;
}

/** What an event is encrypted with besides its key: five lines of ASCII (SYNC-67.1). */
const associatedData = (
  groupId: string,
  eventId: string,
  deviceId: string,
  epoch: number,
) =>
  utf8ToBytes(
    ['shared-expense/event/v1', groupId, eventId, deviceId, String(epoch)].join(
      '\n',
    ),
  );

/** What the bytes say as JSON in UTF-8; null when they are not that. */
function jsonIn(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(utf8Text(bytes));
  } catch {
    return null;
  }
}

/** The event API's own refusal that an answer is, when its status and its body both say so. */
function groupRefusalIn(answer: ApiResult): GroupRefusal | undefined {
  if (answer.outcome !== 'answered') return undefined;
  const said = jsonIn(answer.body);
  return isGroupRefusal(said) &&
    GROUP_REFUSAL_STATUS[said.error] === answer.status
    ? said
    : undefined;
}

interface Ledger {
  device: string;
  cursor: number;
  waitsForUpdate: number;
}

async function readLedger(
  database: SqlExecutor,
  groupId: string,
): Promise<Ledger | undefined> {
  const [ledger] = await database.all<Ledger>(
    'SELECT device, cursor, waitsForUpdate FROM sync_groups WHERE groupId = ?',
    [groupId],
  );
  return ledger;
}

/** Tells the screens of each of these shared ledgers that what they read has changed. */
function notify(database: Database, groupIds: Iterable<string>) {
  for (const groupId of groupIds) notifyApplied(database, groupId);
}

// Downloading

interface OpenedPage {
  /** The events to apply, in order: those before the one the phone stops at. */
  events: ReceivedSyncEvent[];
  /** The stamp of each of them that can be applied, by event ID. */
  stamps: Map<string, SyncStamp>;
  /** Why the phone stops before the page's end: it lacks a key, or does not know a format version. */
  stopped?: 'key' | 'version';
}

/** Decrypts a page's events up to the first one this phone has to stop at (SYNC-72.1 to SYNC-74.1). */
async function openPage(
  groupId: string,
  page: EventsPageResponse,
  keys: Map<number, Uint8Array | undefined>,
): Promise<OpenedPage> {
  const events: ReceivedSyncEvent[] = [];
  const stamps = new Map<string, SyncStamp>();
  for (const relayed of page.events) {
    const { id, deviceId, epoch, receivedAtMs } = relayed;
    if (!keys.has(epoch)) keys.set(epoch, await readGroupKey(groupId, epoch));
    const key = keys.get(epoch);
    // The tool tells a format version it does not know before it uses the key, so a
    // ciphertext shows it to a phone without the key too (SYNC-74.1).
    const opened = decrypt({
      key: key ?? NO_KEY,
      ciphertext: hexToBytes(relayed.content),
      associatedData: associatedData(groupId, id, deviceId, epoch),
    });
    if (!opened.ok && opened.reason === 'unsupported-version')
      return { events, stamps, stopped: 'version' };
    if (!key) return { events, stamps, stopped: 'key' };
    // An event that does not open, or holds no JSON, is judged as empty content.
    const event: ReceivedSyncEvent = {
      id,
      device: deviceId,
      receivedAtMs,
      content: opened.ok ? jsonIn(opened.plaintext) : null,
    };
    const verdict = checkSyncEvent(event.content, event);
    if (verdict.status === 'unsupported')
      return { events, stamps, stopped: 'version' };
    if (verdict.status === 'valid') stamps.set(id, verdict.event.stamp);
    events.push(event);
  }
  return { events, stamps };
}

/**
 * Stores a page in one transaction (SYNC-70.1, SYNC-84.1): the stamps the API holds for
 * unsent events of this phone, the check of the unsent events' stamps, the page's events
 * and the cursor. Resolves with whether the sync goes on: to the next page, to the upload,
 * or nowhere, when the page does not start right after the cursor (SYNC-71.1).
 */
async function storePage(
  database: Database,
  groupId: string,
  page: EventsPageResponse,
  { events, stamps, stopped }: OpenedPage,
): Promise<'next page' | 'upload' | 'end'> {
  // An empty page ends the download whatever it says: the cursor would not move.
  const ended = !page.more || page.events.length === 0;
  const stored = await database.transaction(async (tx) => {
    const ledger = await readLedger(tx, groupId);
    // Against the cursor the database holds now: an import can have taken it back while
    // the page was on its way.
    if (
      !ledger ||
      (page.events.length > 0 && page.events[0].sequence !== ledger.cursor + 1)
    )
      return undefined;
    const moved = await takeUploadedStamps(
      tx,
      groupId,
      new Map(
        [...stamps].filter(([, stamp]) => stamp.device === ledger.device),
      ),
    );
    for (const other of await checkUnsentStamps(tx)) moved.add(other);
    const leftTrash = new Set<string>();
    const changed = await applyReceivedEvents(tx, groupId, events, leftTrash);
    const cursor = ledger.cursor + events.length;
    // The notice goes once a sync has downloaded to the end without stopping (SYNC-75.1).
    const waitsForUpdate =
      stopped === 'version' ? 1 : stopped || !ended ? ledger.waitsForUpdate : 0;
    if (cursor !== ledger.cursor || waitsForUpdate !== ledger.waitsForUpdate)
      await tx.run(
        'UPDATE sync_groups SET cursor = ?, waitsForUpdate = ? WHERE groupId = ?',
        [cursor, waitsForUpdate, groupId],
      );
    // This ledger's screens are told once, with the expenses that left the trash.
    moved.delete(groupId);
    return {
      moved,
      leftTrash,
      changed: changed || waitsForUpdate !== ledger.waitsForUpdate,
    };
  });
  if (!stored) return 'end';
  notify(database, stored.moved);
  if (stored.changed) notifyApplied(database, groupId, stored.leftTrash);
  return stopped || ended ? 'upload' : 'next page';
}

/** Downloads from the cursor until no events follow (SYNC-69.1). Resolves with whether the sync goes on to upload. */
async function download(
  database: Database,
  apiUrl: string,
  groupId: string,
): Promise<boolean> {
  const keys = new Map<number, Uint8Array | undefined>();
  for (;;) {
    const ledger = await readLedger(database, groupId);
    if (!ledger) return false;
    const answer = await sendApiRequest(database, {
      apiUrl,
      method: 'GET',
      path: `${eventsPath(groupId)}?after=${ledger.cursor}`,
      giveUpAfterMs: GIVE_UP_AFTER_MS,
    });
    if (answer.outcome !== 'answered' || answer.status !== 200) return false;
    const page = jsonIn(answer.body);
    if (!isEventsPageResponse(page)) return false;
    const next = await storePage(
      database,
      groupId,
      page,
      await openPage(groupId, page, keys),
    );
    if (next !== 'next page') return next === 'upload';
  }
}

// Uploading

interface UnsentRow {
  id: string;
  content: string;
}

/** The body of an upload of `events`, each encrypted under `key` with a nonce of its own (SYNC-67.1). */
function uploadBody(
  groupId: string,
  deviceId: string,
  epoch: number,
  key: Uint8Array,
  events: readonly UnsentRow[],
): string {
  const request: UploadEventsRequest = {
    epoch,
    events: events.map(({ id, content }) => ({
      id,
      content: bytesToHex(
        encrypt({
          key,
          nonce: getRandomValues(new Uint8Array(NONCE_LENGTH)),
          plaintext: utf8ToBytes(content),
          associatedData: associatedData(groupId, id, deviceId, epoch),
        }),
      ),
    })),
  };
  return JSON.stringify(request);
}

/**
 * The first of `rows` that one upload takes (SYNC-76.1): as many as fit a body of
 * 1,048,576 bytes. The body is ASCII, and a ciphertext is 41 bytes longer than its
 * plaintext, written in hexadecimal.
 */
function firstUploadOf(rows: readonly UnsentRow[], epoch: number): UnsentRow[] {
  let bytes = JSON.stringify({ epoch, events: [] }).length;
  let count = 0;
  for (const { id, content } of rows) {
    const more =
      JSON.stringify({ id, content: '' }).length +
      2 * (utf8ToBytes(content).length + EVENT_CONTENT_MINIMUM) +
      // A comma before every event but the first.
      Math.min(count, 1);
    // Never none: an event that fits no request alone is the API's to refuse.
    if (count > 0 && bytes + more > BODY_LIMIT) break;
    bytes += more;
    count += 1;
  }
  return rows.slice(0, count);
}

/** Whether the API confirmed the upload of `events`: each of them, in order, and no other (SYNC-77.1). */
function confirms(answer: ApiResult, events: readonly UnsentRow[]): boolean {
  if (answer.outcome !== 'answered' || answer.status !== 200) return false;
  const said = jsonIn(answer.body);
  return (
    isUploadEventsResponse(said) &&
    said.events.length === events.length &&
    said.events.every(({ id }, index) => id === events[index].id)
  );
}

/** Uploads the ledger's unsent events in the order the phone wrote them, a request at a time (SYNC-76.1). */
async function upload(
  database: Database,
  apiUrl: string,
  groupId: string,
): Promise<void> {
  for (;;) {
    // An event saved since the last page was stored has not been checked (SYNC-84.1).
    const unsent = await database.transaction(async (tx) => ({
      moved: await checkUnsentStamps(tx),
      rows: await tx.all<UnsentRow & { epoch: number }>(
        `SELECT o.id, o.content, g.epoch FROM sync_outbox o
         JOIN sync_groups g ON g.groupId = o.groupId
         WHERE o.groupId = ? ORDER BY o.position LIMIT ?`,
        [groupId, UPLOAD_EVENT_LIMIT],
      ),
    }));
    notify(database, unsent.moved);
    if (unsent.rows.length === 0) return;
    const [{ epoch }] = unsent.rows;
    let events = firstUploadOf(unsent.rows, epoch);

    const identity = await readDeviceIdentity(database);
    const key = await readGroupKey(groupId, epoch);
    if (identity.status !== 'ready' || !key) return;
    const { deviceId } = identity;
    const ids = events.map(({ id }) => id);
    const marks = ids.map(() => '?').join(', ');
    const send = (underEpoch: number, underKey: Uint8Array) =>
      sendApiRequest(database, {
        apiUrl,
        method: 'POST',
        path: eventsPath(groupId),
        body: uploadBody(groupId, deviceId, underEpoch, underKey, events),
        giveUpAfterMs: GIVE_UP_AFTER_MS,
        // The stamps were checked against a clock the API has just corrected (SYNC-87.1).
        bodyAfterClockCorrection: async () => {
          const checked = await database.transaction(async (tx) => ({
            moved: await recheckStamps(tx, ids),
            rows: await tx.all<UnsentRow>(
              `SELECT id, content FROM sync_outbox WHERE id IN (${marks}) ORDER BY position`,
              ids,
            ),
          }));
          notify(database, checked.moved);
          events = checked.rows;
          return uploadBody(groupId, deviceId, underEpoch, underKey, events);
        },
      });

    let answer = await send(epoch, key);
    let refusal = groupRefusalIn(answer);
    if (refusal?.error === 'epoch') {
      // Once for a request, and only with the key of the epoch the API names (SYNC-79.1).
      const named = await readGroupKey(groupId, refusal.epoch);
      if (!named) return;
      answer = await send(refusal.epoch, named);
      refusal = groupRefusalIn(answer);
    }
    const full = refusal?.error === 'group-full';
    const confirmed = confirms(answer, events);
    if (!confirmed && !full) return;

    // Only what the API has confirmed leaves the unsent events, and only as it was sent:
    // an import meanwhile can have brought an event back with another stamp (SYNC-96.1).
    const after = await database.transaction(async (tx) => {
      const left = confirmed
        ? await tx.run(
            `DELETE FROM sync_outbox WHERE groupId = ? AND (id, content) IN (VALUES ${events
              .map(() => '(?, ?)')
              .join(', ')})`,
            [groupId, ...events.flatMap(({ id, content }) => [id, content])],
          )
        : { changes: 0 };
      // The notice stays until an upload of the ledger is confirmed (SYNC-83.1).
      const notice = await tx.run(
        'UPDATE sync_groups SET groupFull = ? WHERE groupId = ? AND groupFull <> ?',
        [Number(full), groupId, Number(full)],
      );
      return { uploaded: left.changes, noticeChanged: notice.changes > 0 };
    });
    if (after.noticeChanged) notify(database, [groupId]);
    // With nothing gone from the unsent events, the next request would be this one again.
    if (after.uploaded === 0) return;
  }
}

// One sync at a time

interface Turn {
  running: Promise<void>;
  next?: Promise<void>;
}

const turns = new WeakMap<Database, Map<string, Turn>>();

/**
 * Syncs one shared ledger once with the API at `apiUrl`: downloads until no events
 * follow, then uploads the ledger's unsent events (SYNC-68.1). Resolves once the sync has
 * ended, whether it finished or stopped on the way; what it did shows in the local data.
 * Rejects when the local data cannot be read or written.
 *
 * A ledger has one sync at a time (SYNC-90.1): asked while one runs, however often, this
 * starts one more when that one has ended, and resolves once that one has ended too.
 */
export function syncGroup(
  database: Database,
  ledger: { apiUrl: string; groupId: string },
): Promise<void> {
  const { apiUrl, groupId } = ledger;
  const byGroup = turns.get(database) ?? new Map<string, Turn>();
  turns.set(database, byGroup);
  const current = byGroup.get(groupId);
  if (current) {
    const again = () => syncGroup(database, ledger);
    current.next ??= current.running.then(again, again);
    return current.next;
  }
  const turn: Turn = {
    running: (async () => {
      if (await download(database, apiUrl, groupId))
        await upload(database, apiUrl, groupId);
    })().finally(() => byGroup.delete(groupId)),
  };
  byGroup.set(groupId, turn);
  return turn.running;
}

/**
 * Saves a shared ledger's group key of one key epoch on this phone, as the secure-store
 * entry a sync reads (SYNC-66.1), and remembers the key epoch: the phone uploads under
 * the highest one saved this way (SYNC-94.1).
 */
export async function saveGroupKey(
  database: Database,
  groupKey: { groupId: string; epoch: number; key: Uint8Array },
): Promise<void> {
  const { groupId, epoch, key } = groupKey;
  if (
    key.length !== KEY_LENGTH ||
    !Number.isSafeInteger(epoch) ||
    epoch < 1 ||
    !(await readLedger(database, groupId))
  )
    throw new Error('Not a group key of a shared ledger');
  // The entry first: a phone stopped here has the key, and learns the epoch from the
  // API's refusal of its next upload (SYNC-79.1).
  await SecureStore.setItemAsync(
    keyEntry(groupId, epoch),
    bytesToHex(key),
    SEED_OPTIONS,
  );
  await database.run(
    'UPDATE sync_groups SET epoch = ? WHERE groupId = ? AND epoch < ?',
    [epoch, groupId, epoch],
  );
}

/** The lines the screen of the group shows under its title about its sync, top to bottom. */
export async function readSyncNotices(
  database: SqlExecutor,
  groupId: string,
): Promise<string[]> {
  const ledgers = await database.all<{
    waitsForUpdate: number;
    groupFull: number;
  }>('SELECT waitsForUpdate, groupFull FROM sync_groups WHERE groupId = ?', [
    groupId,
  ]);
  return ledgers.flatMap(({ waitsForUpdate, groupFull }) => [
    ...(waitsForUpdate ? [UPDATE_NOTICE] : []),
    ...(groupFull ? [FULL_NOTICE] : []),
  ]);
}
