import { hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
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
  type RelayedEvent,
  type UploadEventsRequest,
} from '@shared-expense/domain/api';
import { decrypt } from '@shared-expense/domain/crypto';
import { notifyExpensesChanged } from '../ledger/expenses';
import { sendApiRequest, type ApiResult } from '../sharing/api-request';
import { readDeviceIdentity } from '../sharing/device-identity';
import type { Database, SqlExecutor } from '../storage';
import {
  applyReceivedEvents,
  notifyApplied,
  type ReceivedSyncEvent,
} from './apply';
import {
  fetchGroupKeys,
  revokeInvitesOfThoseWhoLeft,
  rotateForGroup,
} from './key-rotation';
import { recordSyncEnd } from './notices';
import { becomeReadOnlyCopy, type ReadOnlyCopyReason } from './read-only-copy';
import {
  CONFIRMED_EVENT_IDS,
  UNSENT_EVENTS,
  requeueConfirmedEvents,
} from './records';
import { fetchSnapshot, sendSnapshot } from './snapshots';
import { checkUnsentStamps, recheckStamps, takeUploadedStamps } from './stamps';
import {
  GIVE_UP_AFTER_MS,
  associatedData,
  encryptEvents,
  jsonIn,
  readGroupKey,
} from './transport';

export { readSyncNotices } from './notices';
export {
  GIVE_UP_AFTER_MS,
  encryptEvents,
  jsonIn,
  readGroupKey,
} from './transport';

// A phone syncs one shared ledger with the API (ADR-0027, ADR-0034). It downloads
// from its cursor, uploads its unsent events under the group key, and downloads once
// more if the API confirmed any upload. What the API's answers ask of the phone it does
// before the sync has ended (ADR-0041): it makes the ledger a read-only copy, fetches a
// group key it lacks, rotates the key for a group that needs it, and revokes the invites
// a device that left knows.

/** The most bytes a request's body may have (SHARING-48.2). */
const BODY_LIMIT = 1_048_576;
const KEY_LENGTH = 32;
/** Stands in for a key the phone lacks, where only a ciphertext's format version is asked. */
const NO_KEY = new Uint8Array(KEY_LENGTH);

const eventsPath = (groupId: string) => `/groups/${groupId}/events`;

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
  /** The highest key epoch among the events of the pages stored so far (SYNC-304.1). */
  maxEpoch: number;
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
  // A read-only copy is no shared ledger: nothing is sent or stored for it (SYNC-302.1).
  const [ledger] = await database.all<Ledger>(
    `SELECT device, cursor, maxEpoch, waitsForUpdate, waitsForSnapshot FROM sync_groups
     WHERE groupId = ? AND readOnly IS NULL`,
    [groupId],
  );
  return ledger;
}

/**
 * What a sync found that the phone acts on once its requests are done, each from an
 * answer of the API or from the lack of a key.
 */
interface Follow {
  /** Why the ledger becomes a read-only copy (SYNC-300.1, SYNC-301.1). */
  copy?: ReadOnlyCopyReason;
  /** The member devices the API listed when it said the group needs a rotation (SHARING-275.1). */
  rotationFor?: string[];
  /**
   * The phone lacks a group key (SHARING-278.1), with the event its download stopped at
   * when that is how it found out.
   */
  keyMissing?: { stoppedAt?: RelayedEvent };
}

/** How a sync ended, for what follows one: listing join requests, and approving one. */
export interface SyncEnd {
  /** The download that begins the sync ran to its end, so the sync went on to upload (SYNC-68.2). */
  downloaded: boolean;
  /** The API confirmed an upload of this sync. */
  uploaded: boolean;
  /**
   * The last request of this sync got no answer, a fetch of the snapshot to catch up from
   * included. The snapshots it uploads for other devices once it is done do not count.
   */
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
  /** The event it stopped at for the lack of a key. */
  stoppedAt?: RelayedEvent;
  /** The highest key epoch among `events` and the pages stored before (SYNC-304.1). */
  maxEpoch: number;
  /** The highest key epoch among the events of `events` that decrypted; 0 when none did (SYNC-305.1). */
  openedEpoch: number;
}

/**
 * Decrypts a page's events up to the first one this phone has to stop at (SYNC-72.1 to
 * SYNC-74.1). An event in a lower key epoch than one the phone has stored, in pages
 * before or earlier in this one, is not opened (SYNC-304.1); `received` is the highest
 * epoch of the pages before.
 */
async function openPage(
  groupId: string,
  page: EventsPageResponse,
  keys: Map<number, Uint8Array | undefined>,
  received: number,
): Promise<OpenedPage> {
  const events: ReceivedSyncEvent[] = [];
  const stamps = new Map<string, SyncStamp>();
  let maxEpoch = received;
  let openedEpoch = 0;
  for (const relayed of page.events) {
    const { id, deviceId, epoch, receivedAtMs } = relayed;
    if (epoch < maxEpoch) {
      events.push({
        id,
        device: deviceId,
        receivedAtMs,
        content: null,
        refused: 'epoch',
      });
      continue;
    }
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
      return { events, stamps, stopped: 'version', maxEpoch, openedEpoch };
    if (!key)
      return {
        events,
        stamps,
        stopped: 'key',
        stoppedAt: relayed,
        maxEpoch,
        openedEpoch,
      };
    // An event that does not open, or holds no JSON, is judged as empty content.
    const event: ReceivedSyncEvent = {
      id,
      device: deviceId,
      receivedAtMs,
      content: opened.ok ? jsonIn(opened.plaintext) : null,
    };
    const verdict = checkSyncEvent(event.content, event);
    if (verdict.status === 'unsupported')
      return { events, stamps, stopped: 'version', maxEpoch, openedEpoch };
    if (verdict.status === 'valid') stamps.set(id, verdict.event.stamp);
    events.push(event);
    maxEpoch = epoch;
    if (opened.ok) openedEpoch = epoch;
  }
  return { events, stamps, maxEpoch, openedEpoch };
}

/**
 * Stores a page in one transaction (SYNC-70.1, SYNC-84.1): the stamps the API holds for
 * unsent events of this phone, the check of the unsent events' stamps, the page's events
 * and the cursor, together with the phone's time of receipt. A page that does not start
 * right after the cursor, or an empty one that answers a cursor the phone no longer holds,
 * ends the sync (SYNC-71.4).
 * The phone's key epoch follows the events it could open (SYNC-305.1).
 */
async function storePage(
  database: Database,
  groupId: string,
  page: EventsPageResponse,
  { events, stamps, stopped, maxEpoch, openedEpoch }: OpenedPage,
  receipt: { after: number; receivedAt: number },
): Promise<'next page' | 'downloaded' | 'end'> {
  // An empty page ends the download whatever it says: the cursor would not move.
  const ended = !page.more || page.events.length === 0;
  // An empty page has no sequence of its own. It answers the cursor sent in its request.
  const after = page.events.length
    ? page.events[0].sequence - 1
    : receipt.after;
  const stored = await database.transaction(async (tx) => {
    const ledger = await readLedger(tx, groupId);
    // Against the cursor the database holds now: an import can have taken it back while
    // the page was on its way.
    if (!ledger || ledger.cursor !== after) return undefined;
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
    await tx.run(
      `UPDATE sync_groups SET lastSyncedAt = ?, cursor = ?, waitsForUpdate = ?,
       waitsForSnapshot = 0, snapshotNeedingUpdate = NULL WHERE groupId = ?`,
      [receipt.receivedAt, cursor, waitsForUpdate, groupId],
    );
    await tx.run(
      `UPDATE sync_groups SET maxEpoch = MAX(maxEpoch, ?), epoch = MAX(epoch, ?)
       WHERE groupId = ? AND (maxEpoch < ? OR epoch < ?)`,
      [maxEpoch, openedEpoch, groupId, maxEpoch, openedEpoch],
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

/** Move only from a smaller cursor in the live ledger, including after a backup restore (SYNC-173.1). */
async function continueFrom(
  database: Database,
  groupId: string,
  after: number,
) {
  const requeued = await database.transaction(async (tx) => {
    const { changes } = await tx.run(
      'UPDATE sync_groups SET cursor = ? WHERE groupId = ? AND cursor < ?',
      [after, groupId, after],
    );
    if (changes) return (await requeueConfirmedEvents(tx, groupId)).changes;
  });
  if (requeued) notifyExpensesChanged(database);
}

/** Downloads to the last page (SYNC-69.2) and returns its snapshot recipients, or nothing on an early end. */
async function download(
  database: Database,
  target: SyncTarget,
  phase: 'before upload' | 'after upload',
  end: SyncEnd,
  follow: Follow,
): Promise<string[] | undefined> {
  const { apiUrl, groupId } = target;
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
    const receivedAt = Date.now();
    end.noAnswer = answer.outcome === 'no-answer';
    // Nothing was sent: the phone holds a device ID whose seed is gone (SYNC-301.1).
    if (answer.outcome === 'authorization-lost') follow.copy = 'lapsed';
    if (answer.outcome !== 'answered') return;
    const refusal = groupRefusalIn(answer);
    if (refusal?.error === 'not-a-member') follow.copy = 'not-a-member';
    if (refusal?.error === 'rotation-needed')
      follow.rotationFor = refusal.devices;
    const body = jsonIn(answer.body);
    if (phase === 'before upload') {
      if (
        answer.status === SNAPSHOT_NEEDED_STATUS &&
        isSnapshotNeededResponse(body)
      ) {
        const { changes } = await database.run(
          'UPDATE sync_groups SET waitsForSnapshot = 1 WHERE groupId = ? AND readOnly IS NULL AND waitsForSnapshot = 0',
          [groupId],
        );
        if (changes) notifyApplied(database, groupId);
        if (tookSnapshot) return;
        const snapshot = await fetchSnapshot(database, {
          ...target,
          catchUp: true,
        });
        end.noAnswer = snapshot.outcome === 'no-answer';
        // The snapshot it waits for is under a key epoch it has no key for (SYNC-170.1).
        if (snapshot.outcome === 'no-key') follow.keyMissing = {};
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
    const opened = await openPage(groupId, body, keys, ledger.maxEpoch);
    const next = await storePage(database, groupId, body, opened, {
      after: ledger.cursor,
      receivedAt,
    });
    if (next === 'end') return;
    if (opened.stopped === 'key')
      follow.keyMissing = { stoppedAt: opened.stoppedAt };
    if (next === 'downloaded')
      return readSnapshotNeededBy(answer.snapshotNeededBy);
  }
}

// Uploading

interface UnsentRow {
  id: string;
  content: string;
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

/**
 * Resolves with whether every unsent event went up. Even a partial upload can require a
 * second download, but only a completed one can send snapshots.
 */
async function upload(
  database: Database,
  { apiUrl, groupId }: SyncTarget,
  end: SyncEnd,
  follow: Follow,
): Promise<boolean> {
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
    if (unsent.rows.length === 0) return true;
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
      if (!named) {
        follow.keyMissing ??= {};
        break;
      }
      answer = await send(refusal.epoch, named);
      refusal = groupRefusalIn(answer);
    }
    end.noAnswer = answer.outcome === 'no-answer';
    // The unsent events stay, and what follows the sync is not another try (SYNC-78.2).
    if (refusal?.error === 'not-a-member') follow.copy = 'not-a-member';
    if (refusal?.error === 'rotation-needed')
      follow.rotationFor = refusal.devices;
    const full = refusal?.error === 'group-full';
    const confirmed = confirmedEvents(answer, events);
    if (!confirmed && !full) break;
    if (confirmed) end.uploaded = true;

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
    else if (after.uploaded > 0) notifyExpensesChanged(database);
    // With nothing gone from the unsent events, the next request would be this one again.
    if (after.uploaded === 0) break;
  }
  return false;
}

// One sync, and what follows it

/** One sync of the ledger: a download, the uploads, and a download after a confirmed upload. */
async function syncOnce(
  database: Database,
  ledger: SyncTarget,
  follow: Follow,
): Promise<SyncEnd> {
  const end = { downloaded: false, uploaded: false, noAnswer: false };
  let recipients = await download(
    database,
    ledger,
    'before upload',
    end,
    follow,
  );
  end.downloaded = recipients !== undefined;
  if (!recipients) return end;
  const complete = await upload(database, ledger, end, follow);
  // An upload refused as no member ends the sync: the ledger is a copy (SYNC-160.2).
  if (follow.copy) return end;
  if (end.uploaded) {
    recipients = await download(database, ledger, 'after upload', end, follow);
    if (!recipients) return end;
  }
  if (!complete) return end;
  for (const deviceId of recipients) {
    const snapshot = await sendSnapshot(database, { ...ledger, deviceId });
    if (snapshot.outcome !== 'uploaded') break;
  }
  return end;
}

/**
 * Syncs the ledger, does what the sync asked for, and syncs again when that got the phone
 * further: once after it fetched a key, and once after it rotated the group's key or
 * found that another phone had (SHARING-275.1, SHARING-278.1). Resolves with how the
 * first sync ended.
 */
async function syncAndFollow(
  database: Database,
  ledger: SyncTarget,
): Promise<SyncEnd> {
  const { groupId } = ledger;
  let first: SyncEnd | undefined;
  let fetched = false;
  let rotated = false;
  for (;;) {
    const follow: Follow = {};
    const end = await syncOnce(database, ledger, follow);
    first ??= end;
    if (follow.copy) await becomeReadOnlyCopy(database, groupId, follow.copy);
    await recordSyncEnd(database, groupId, end.noAnswer);
    if (follow.copy) break;
    if (follow.keyMissing && !fetched) {
      fetched = true;
      const saved = await fetchGroupKeys(
        database,
        ledger,
        follow.keyMissing.stoppedAt,
      ).catch(() => 0);
      if (saved > 0) continue;
    }
    if (follow.rotationFor && !rotated) {
      rotated = true;
      const again = await rotateForGroup(
        database,
        ledger,
        follow.rotationFor,
      ).catch(() => false);
      if (again) continue;
    }
    // A device that left knows the invites made before it did (SHARING-284.1).
    if (end.downloaded)
      await revokeInvitesOfThoseWhoLeft(database, ledger).catch(
        () => undefined,
      );
    break;
  }
  return first;
}

// One sync at a time

interface Turn {
  running: Promise<SyncEnd>;
  next?: Promise<SyncEnd>;
}

const turns = new WeakMap<Database, Map<string, Turn>>();

/**
 * Syncs one shared ledger with the API at `apiUrl`. It downloads, uploads the ledger's
 * unsent events and downloads again after a confirmed upload (SYNC-68.2, SYNC-160.2).
 * Resolves when the sync ends, with how it ended; what it did shows in the local data.
 * Rejects when the local data cannot be read or written.
 *
 * Before it resolves, the phone has also done what that sync asked of it, and synced once
 * more where that could help: it resolves with how the first of those syncs ended.
 *
 * A ledger has one sync at a time (SYNC-90.1): asked while one runs, however often, this
 * starts one more when that one has ended, and resolves once that one has ended too.
 */
export function syncGroup(
  database: Database,
  ledger: SyncTarget,
): Promise<SyncEnd> {
  const { groupId } = ledger;
  const byGroup = turns.get(database) ?? new Map<string, Turn>();
  turns.set(database, byGroup);
  const current = byGroup.get(groupId);
  if (current) {
    const again = () => syncGroup(database, ledger);
    current.next ??= current.running.then(again, again);
    return current.next;
  }
  const turn: Turn = {
    running: syncAndFollow(database, ledger)
      .finally(() => byGroup.delete(groupId))
      .then((end) => {
        try {
          endListeners.get(database)?.(groupId, end);
        } catch {
          // The sync has ended whatever its listener does about it.
        }
        return end;
      }),
  };
  byGroup.set(groupId, turn);
  return turn.running;
}
