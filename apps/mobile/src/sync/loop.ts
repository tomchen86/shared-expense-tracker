import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { checkSyncEvent, type SyncStamp } from '@shared-expense/domain';
import {
  CONTINUE_STATUS,
  EVENT_CONTENT_MINIMUM,
  GROUP_REFUSAL_STATUS,
  SNAPSHOT_NEEDED_STATUS,
  UPLOAD_EVENT_LIMIT,
  isContinueResponse,
  isEventsPageResponse,
  isGroupRefusal,
  isSnapshotNeededResponse,
  isUploadEventsResponse,
  readSnapshotNeededBy,
  type EventsPageResponse,
  type GroupRefusal,
  type UploadedEvent,
  type UploadEventsRequest,
} from '@shared-expense/domain/api';
import { decrypt, encrypt } from '@shared-expense/domain/crypto';
import { getRandomValues } from 'expo-crypto';
import { sendApiRequest, type ApiResult } from '../sharing/api-request';
import { readDeviceIdentity } from '../sharing/device-identity';
import { storeGroupKey } from '../sharing/group-key';
import type { Database, SqlExecutor } from '../storage';
import {
  applyReceivedEvents,
  notifyApplied,
  type ReceivedSyncEvent,
} from './apply';
import {
  CONFIRMED_EVENT_IDS,
  UNSENT_EVENTS,
  requeueConfirmedEvents,
} from './records';
import { sendSnapshot, takeSnapshot } from './snapshots';
import { checkUnsentStamps, recheckStamps, takeUploadedStamps } from './stamps';
<<<<<<< HEAD
import { utf8Text } from './utf8';
import { countGroupUnapplied } from './unapplied';
=======
import { GIVE_UP_AFTER_MS, jsonIn, readGroupKey } from './transport';
>>>>>>> ede771979593bf3eed8a78b64844c619097f5e05

export { GIVE_UP_AFTER_MS, jsonIn, readGroupKey } from './transport';

// A phone syncs one shared ledger with the API (ADR-0027, ADR-0034). It downloads
// from its cursor, uploads its unsent events under the group key, and downloads once
// more if the API confirmed any upload.

/** The most bytes a request's body may have (SHARING-48.2). */
const BODY_LIMIT = 1_048_576;
const NONCE_LENGTH = 24;
const KEY_LENGTH = 32;
/** Stands in for a key the phone lacks, where only a ciphertext's format version is asked. */
const NO_KEY = new Uint8Array(KEY_LENGTH);
/** The lines a shared ledger's screen shows under its title (SYNC-75.1, SYNC-83.1). */
const UPDATE_NOTICE =
  'This group has changes from a newer version of the app. Update the app to see them.';
const FULL_NOTICE =
  'This group has reached its storage limit. New changes stay on this phone until there is room.';

const eventsPath = (groupId: string) => `/groups/${groupId}/events`;

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
  waitsForSnapshot: number;
}

interface SyncTarget {
  apiUrl: string;
  groupId: string;
}

async function readLedger(
  database: SqlExecutor,
  groupId: string,
): Promise<Ledger | undefined> {
  const [ledger] = await database.all<Ledger>(
    'SELECT device, cursor, waitsForUpdate, waitsForSnapshot FROM sync_groups WHERE groupId = ?',
    [groupId],
  );
  return ledger;
}

/** How a sync ended, for what follows one: listing join requests, and approving one. */
export interface SyncEnd {
  /** The download ran to its end, so the sync went on to upload (SYNC-68.1). */
  downloaded: boolean;
  /** The API confirmed an upload of this sync. */
  uploaded: boolean;
  /** The last request of this sync got no answer. */
  noAnswer: boolean;
}

type SyncEndListener = (groupId: string, end: SyncEnd) => void;
// ponytail: one listener a database, which is all the app has. Keep a set of them, as
// `subscribeToAppliedEvents` does, when a second one wants to hear.
const endListeners = new WeakMap<Database, SyncEndListener>();

/** Calls `listener` each time a sync of a shared ledger has ended. Returns the function that ends it. */
export function subscribeToSyncEnds(
  database: Database,
  listener: SyncEndListener,
) {
  endListeners.set(database, listener);
  return () => {
    endListeners.delete(database);
  };
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
 * and the cursor. A page that does not start right after the cursor ends the sync (SYNC-71.2).
 */
async function storePage(
  database: Database,
  groupId: string,
  page: EventsPageResponse,
  { events, stamps, stopped }: OpenedPage,
): Promise<'next page' | 'downloaded' | 'end'> {
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
    // A refused event also advances the cursor. Forget our uploads in the stored prefix (SYNC-161.1).
    const ownIds = events
      .filter(({ device }) => device === ledger.device)
      .map(({ id }) => id);
    if (ownIds.length > 0)
      await tx.run(
        `DELETE FROM sync_outbox WHERE groupId = ? AND id IN (${CONFIRMED_EVENT_IDS})
         AND id IN (${ownIds.map(() => '?').join(', ')})`,
        [groupId, ...ownIds],
      );
    const cursor = ledger.cursor + events.length;
    // The notice goes once a sync has downloaded to the end without stopping (SYNC-75.1).
    const waitsForUpdate =
      stopped === 'version' ? 1 : stopped || !ended ? ledger.waitsForUpdate : 0;
    const waitChanged =
      waitsForUpdate !== ledger.waitsForUpdate || ledger.waitsForSnapshot === 1;
    if (cursor !== ledger.cursor || waitChanged)
      await tx.run(
        `UPDATE sync_groups SET cursor = ?, waitsForUpdate = ?,
         waitsForSnapshot = 0, snapshotNeedingUpdate = NULL WHERE groupId = ?`,
        [cursor, waitsForUpdate, groupId],
      );
    // This ledger's screens are told once, with the expenses that left the trash.
    const reordered = moved.delete(groupId);
    return {
      moved,
      leftTrash,
      changed: changed || reordered || waitChanged,
    };
  });
  if (!stored) return 'end';
  notify(database, stored.moved);
  if (stored.changed) notifyApplied(database, groupId, stored.leftTrash);
  return stopped || ended ? 'downloaded' : 'next page';
}

<<<<<<< HEAD
/** Downloads from the cursor until no events follow (SYNC-69.2). Resolves with whether the sync goes on to upload. */
async function download(
  database: Database,
  apiUrl: string,
  groupId: string,
  end: SyncEnd,
): Promise<boolean> {
=======
/** Move only from a smaller cursor in the live ledger, including after a backup restore (SYNC-173.1). */
async function continueFrom(
  database: Database,
  groupId: string,
  after: number,
) {
  await database.transaction(async (tx) => {
    const { changes } = await tx.run(
      'UPDATE sync_groups SET cursor = ? WHERE groupId = ? AND cursor < ?',
      [after, groupId, after],
    );
    if (changes) await requeueConfirmedEvents(tx, groupId);
  });
}

/** Downloads to the last page and returns its snapshot recipients, or nothing on an early end. */
async function download(
  database: Database,
  target: SyncTarget,
  phase: 'before upload' | 'after upload',
): Promise<string[] | undefined> {
  const { apiUrl, groupId } = target;
>>>>>>> ede771979593bf3eed8a78b64844c619097f5e05
  const keys = new Map<number, Uint8Array | undefined>();
  let tookSnapshot = false;
  let continued = false;
  for (;;) {
    const ledger = await readLedger(database, groupId);
    if (!ledger) return;
    const answer = await sendApiRequest(database, {
      apiUrl,
      method: 'GET',
      path: `${eventsPath(groupId)}?after=${ledger.cursor}`,
      giveUpAfterMs: GIVE_UP_AFTER_MS,
    });
<<<<<<< HEAD
    end.noAnswer = answer.outcome === 'no-answer';
    if (answer.outcome !== 'answered' || answer.status !== 200) return false;
    const page = jsonIn(answer.body);
    if (!isEventsPageResponse(page)) return false;
=======
    if (answer.outcome !== 'answered') return;
    const body = jsonIn(answer.body);
    if (phase === 'before upload') {
      if (
        answer.status === SNAPSHOT_NEEDED_STATUS &&
        isSnapshotNeededResponse(body)
      ) {
        await database.run(
          'UPDATE sync_groups SET waitsForSnapshot = 1 WHERE groupId = ? AND waitsForSnapshot = 0',
          [groupId],
        );
        if (tookSnapshot) return;
        const snapshot = await takeSnapshot(database, {
          ...target,
          catchUp: true,
        });
        if (snapshot.outcome !== 'imported') return;
        tookSnapshot = true;
        continue;
      }
      if (answer.status === CONTINUE_STATUS && isContinueResponse(body)) {
        if (continued) return;
        await continueFrom(database, groupId, body.after);
        continued = true;
        continue;
      }
    }
    if (answer.status !== 200 || !isEventsPageResponse(body)) return;
>>>>>>> ede771979593bf3eed8a78b64844c619097f5e05
    const next = await storePage(
      database,
      groupId,
      body,
      await openPage(groupId, body, keys),
    );
    if (next === 'end') return;
    if (next === 'downloaded')
      return readSnapshotNeededBy(answer.snapshotNeededBy);
  }
}

// Uploading

interface UnsentRow {
  id: string;
  content: string;
}

/** `events` as an upload carries them, each encrypted under `key` with a nonce of its own (SYNC-67.1). */
export function encryptEvents(
  groupId: string,
  deviceId: string,
  epoch: number,
  key: Uint8Array,
  events: readonly UnsentRow[],
): UploadedEvent[] {
  return events.map(({ id, content }) => ({
    id,
    content: bytesToHex(
      encrypt({
        key,
        nonce: getRandomValues(new Uint8Array(NONCE_LENGTH)),
        plaintext: utf8ToBytes(content),
        associatedData: associatedData(groupId, id, deviceId, epoch),
      }),
    ),
  }));
}

/** The body of an upload of `events`. */
function uploadBody(
  groupId: string,
  deviceId: string,
  epoch: number,
  key: Uint8Array,
  events: readonly UnsentRow[],
): string {
  const request: UploadEventsRequest = {
    epoch,
    events: encryptEvents(groupId, deviceId, epoch, key, events),
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

/** Pair the sent content with its sequence only when the whole upload was confirmed (SYNC-77.1). */
function confirmedEvents(answer: ApiResult, events: readonly UnsentRow[]) {
  if (answer.outcome !== 'answered' || answer.status !== 200) return;
  const said = jsonIn(answer.body);
  if (
    isUploadEventsResponse(said) &&
    said.events.length > 0 &&
    said.events.length === events.length &&
    said.events.every(({ id }, index) => id === events[index].id)
  )
    return said.events.map(({ sequence }, index) => ({
      ...events[index],
      sequence,
    }));
}

/** Keep each confirmed event whose sequence is ahead of the cursor (SYNC-161.1). */
async function storeConfirmation(
  tx: SqlExecutor,
  groupId: string,
<<<<<<< HEAD
  end: SyncEnd,
): Promise<void> {
=======
  events: readonly (UnsentRow & { sequence: number })[],
) {
  // Match the sent content too. A backup restored in flight can hold an earlier stamp.
  const retained = await tx.run(
    `WITH sent(id, content, sequence) AS (VALUES ${events.map(() => '(?, ?, ?)').join(', ')})
     INSERT INTO sync_uploaded_events (eventId)
     SELECT o.id FROM sent JOIN ${UNSENT_EVENTS} o ON o.id = sent.id AND o.content = sent.content
     JOIN sync_groups g ON g.groupId = o.groupId
     WHERE o.groupId = ? AND sent.sequence > g.cursor
     ON CONFLICT (eventId) DO UPDATE SET resendPosition = NULL`,
    [
      ...events.flatMap(({ id, content, sequence }) => [id, content, sequence]),
      groupId,
    ],
  );
  const covered = await tx.run(
    `DELETE FROM sync_outbox WHERE groupId = ? AND id NOT IN (${CONFIRMED_EVENT_IDS})
     AND (id, content) IN (VALUES ${events.map(() => '(?, ?)').join(', ')})`,
    [groupId, ...events.flatMap(({ id, content }) => [id, content])],
  );
  return retained.changes + covered.changes;
}

/** Even a partial upload can require a second download, but only a completed one can send snapshots. */
async function upload(database: Database, { apiUrl, groupId }: SyncTarget) {
  let anyConfirmed = false;
>>>>>>> ede771979593bf3eed8a78b64844c619097f5e05
  for (;;) {
    // An event saved since the last page was stored has not been checked (SYNC-84.1).
    const unsent = await database.transaction(async (tx) => ({
      moved: await checkUnsentStamps(tx),
      rows: await tx.all<UnsentRow & { epoch: number }>(
        `SELECT o.id, o.content, g.epoch FROM ${UNSENT_EVENTS} o
         JOIN sync_groups g ON g.groupId = o.groupId
         WHERE o.groupId = ? ORDER BY o.sendPosition, o.position LIMIT ?`,
        [groupId, UPLOAD_EVENT_LIMIT],
      ),
    }));
    notify(database, unsent.moved);
    if (unsent.rows.length === 0) return { anyConfirmed, complete: true };
    const [{ epoch }] = unsent.rows;
    let events = firstUploadOf(unsent.rows, epoch);

    const identity = await readDeviceIdentity(database);
    const key = await readGroupKey(groupId, epoch);
    if (identity.status !== 'ready' || !key) break;
    const { deviceId } = identity;
    const ids = events.map(({ id }) => id);
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
              `SELECT o.id, o.content FROM json_each(?) sent
               JOIN ${UNSENT_EVENTS} o ON o.id = sent.value ORDER BY sent.key`,
              [JSON.stringify(ids)],
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
      if (!named) break;
      answer = await send(refusal.epoch, named);
      refusal = groupRefusalIn(answer);
    }
    end.noAnswer = answer.outcome === 'no-answer';
    const full = refusal?.error === 'group-full';
    const confirmed = confirmedEvents(answer, events);
    if (!confirmed && !full) break;
    anyConfirmed ||= confirmed !== undefined;

    const after = await database.transaction(async (tx) => {
      const uploaded = confirmed
        ? await storeConfirmation(tx, groupId, confirmed)
        : 0;
      // The notice stays until an upload of the ledger is confirmed (SYNC-83.1).
      const notice = await tx.run(
        'UPDATE sync_groups SET groupFull = ? WHERE groupId = ? AND groupFull <> ?',
        [Number(full), groupId, Number(full)],
      );
      return { uploaded, noticeChanged: notice.changes > 0 };
    });
    if (after.noticeChanged) notify(database, [groupId]);
    // With nothing gone from the unsent events, the next request would be this one again.
<<<<<<< HEAD
    if (after.uploaded === 0) return;
    end.uploaded = true;
=======
    if (after.uploaded === 0) break;
>>>>>>> ede771979593bf3eed8a78b64844c619097f5e05
  }
  return { anyConfirmed, complete: false };
}

// One sync at a time

interface Turn {
  running: Promise<SyncEnd>;
  next?: Promise<SyncEnd>;
}

const turns = new WeakMap<Database, Map<string, Turn>>();

/**
<<<<<<< HEAD
 * Syncs one shared ledger once with the API at `apiUrl`: downloads until no events
 * follow, then uploads the ledger's unsent events (SYNC-68.1). Resolves once the sync has
 * ended, whether it finished or stopped on the way, with how it ended; what it did shows
 * in the local data. Rejects when the local data cannot be read or written.
=======
 * Syncs one shared ledger with the API at `apiUrl`. It downloads, uploads the ledger's
 * unsent events and downloads again after a confirmed upload (SYNC-68.2, SYNC-160.1).
 * Resolves when the sync ends and rejects when the local data cannot be read or written.
>>>>>>> ede771979593bf3eed8a78b64844c619097f5e05
 *
 * A ledger has one sync at a time (SYNC-90.1): asked while one runs, however often, this
 * starts one more when that one has ended, and resolves once that one has ended too.
 */
export function syncGroup(
  database: Database,
<<<<<<< HEAD
  ledger: { apiUrl: string; groupId: string },
): Promise<SyncEnd> {
  const { apiUrl, groupId } = ledger;
=======
  ledger: SyncTarget,
): Promise<void> {
  const { groupId } = ledger;
>>>>>>> ede771979593bf3eed8a78b64844c619097f5e05
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
<<<<<<< HEAD
      const end = { downloaded: false, uploaded: false, noAnswer: false };
      end.downloaded = await download(database, apiUrl, groupId, end);
      if (end.downloaded) await upload(database, apiUrl, groupId, end);
      return end;
    })()
      .finally(() => byGroup.delete(groupId))
      .then((end) => {
        try {
          endListeners.get(database)?.(groupId, end);
        } catch {
          // The sync has ended whatever its listener does about it.
        }
        return end;
      }),
=======
      let recipients = await download(database, ledger, 'before upload');
      if (!recipients) return;
      const { anyConfirmed, complete } = await upload(database, ledger);
      if (anyConfirmed) {
        recipients = await download(database, ledger, 'after upload');
        if (!recipients) return;
      }
      if (!complete) return;
      for (const deviceId of recipients) {
        const snapshot = await sendSnapshot(database, { ...ledger, deviceId });
        if (snapshot.outcome !== 'uploaded') break;
      }
    })().finally(() => byGroup.delete(groupId)),
>>>>>>> ede771979593bf3eed8a78b64844c619097f5e05
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
  await storeGroupKey(groupId, epoch, key);
  await database.run(
    'UPDATE sync_groups SET epoch = ? WHERE groupId = ? AND epoch < ?',
    [epoch, groupId, epoch],
  );
}

/** The lines the screen of the group shows under its title about its sync, top to bottom. */
<<<<<<< HEAD
export async function readSyncNotices(database: SqlExecutor, groupId: string) {
  const [ledgers, unapplied] = await Promise.all([
    database.all<{ waitsForUpdate: number; groupFull: number }>(
      'SELECT waitsForUpdate, groupFull FROM sync_groups WHERE groupId = ?',
      [groupId],
    ),
    countGroupUnapplied(database, groupId),
=======
export async function readSyncNotices(
  database: SqlExecutor,
  groupId: string,
): Promise<string[]> {
  const ledgers = await database.all<{
    waitsForUpdate: number;
    groupFull: number;
  }>(
    `SELECT waitsForUpdate OR (waitsForSnapshot AND snapshotNeedingUpdate IS NOT NULL) AS waitsForUpdate,
            groupFull FROM sync_groups WHERE groupId = ?`,
    [groupId],
  );
  return ledgers.flatMap(({ waitsForUpdate, groupFull }) => [
    ...(waitsForUpdate ? [UPDATE_NOTICE] : []),
    ...(groupFull ? [FULL_NOTICE] : []),
>>>>>>> ede771979593bf3eed8a78b64844c619097f5e05
  ]);
  return {
    lines: ledgers.flatMap(({ waitsForUpdate, groupFull }) => [
      ...(waitsForUpdate ? [UPDATE_NOTICE] : []),
      ...(groupFull ? [FULL_NOTICE] : []),
    ]),
    unapplied,
  };
}
