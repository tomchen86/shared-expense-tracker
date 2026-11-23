import { hasExactly, isHexContent, isId, isWhole } from './wire';

// What the event API's requests and answers look like on the wire (ADR-0016, ADR-0024,
// docs/specs/sync/spec.md): a phone creates a group on the API, uploads the group's
// events and downloads them page by page. The phone and the API both use this file, so
// neither defines a body, a limit or a status of its own (ADR-0007).
//
// Every request here is a signed request, so the API can also refuse it with a `Refusal`.

/**
 * The fewest bytes an event's content may have: what encryption adds to any plaintext, the
 * format version byte, the nonce and the tag (SHARING-1.1), so nothing shorter is an
 * encrypted event.
 */
export const EVENT_CONTENT_MINIMUM = 41;
/** The most bytes an event's content may have (ADR-0021). */
export const EVENT_CONTENT_LIMIT = 65_536;
/** The most events one upload may carry. */
export const UPLOAD_EVENT_LIMIT = 100;
/** The most events a page holds. */
export const PAGE_EVENT_LIMIT = 100;
/** The most bytes the contents of a page's events add up to: 256 KiB. */
export const PAGE_CONTENT_LIMIT = 262_144;
/** The most bytes the contents of the events a group has stored add up to: 10 MiB. */
export const GROUP_CONTENT_LIMIT = 10_485_760;

/** What the API answers, with status 200, once a group exists and the device is a member device of it. */
export interface CreateGroupResponse {
  groupId: string;
}

/** An event as a phone uploads it. */
export interface UploadedEvent {
  /** The event's own ID, the same every time it is uploaded: a lowercase version-4 UUID. */
  id: string;
  /** The content, which the API never reads: 41 to 65,536 bytes, in lowercase hexadecimal. */
  content: string;
}

/** The body of an upload, as JSON. */
export interface UploadEventsRequest {
  /** The key epoch the contents are encrypted under (ADR-0015): a whole number from 1. */
  epoch: number;
  /** 1 to 100 events, each with an ID of its own, in the order the phone wrote them. */
  events: UploadedEvent[];
}

/** What the API answers to an upload, with status 200. */
export interface UploadEventsResponse {
  /** One for each event of the request, in its order: the event's sequence number in the group. */
  events: { id: string; sequence: number }[];
}

/** An event as the API relays it: what was uploaded, and what the API recorded with it. */
export interface RelayedEvent {
  id: string;
  /** Its place in the group's order: a whole number from 1. */
  sequence: number;
  /** The device that uploaded it. */
  deviceId: string;
  /** The key epoch its upload named. */
  epoch: number;
  /** The API's time when it was uploaded, in milliseconds since the Unix epoch. */
  receivedAtMs: number;
  /** The content as it was uploaded, in lowercase hexadecimal. */
  content: string;
}

/** What the API answers to a download, with status 200. */
export interface EventsPageResponse {
  /** The events after the cursor, in the order of their sequence numbers. */
  events: RelayedEvent[];
  /** Whether the group has events after the last one of this page. */
  more: boolean;
}

/**
 * What the API answers to a download whose cursor is before events the group no longer
 * stores (SYNC-136.1, ADR-0033): the phone cannot go on from its cursor and needs a
 * snapshot. It is no refusal: the API records the cursor as the device's progress.
 */
export interface SnapshotNeededResponse {
  error: 'snapshot-needed';
}

/** The HTTP status of that answer. */
export const SNAPSHOT_NEEDED_STATUS = 410;

/**
 * Why the API refused a request of the event API, besides the reasons of `Refusal`. The
 * body of such a refusal is one of these, as JSON.
 */
export type GroupRefusal =
  /** The device is no member device of the group, or no such group exists. */
  | { error: 'not-a-member' }
  /** The upload names another key epoch than the group's, which is `epoch`. */
  | { error: 'epoch'; epoch: number }
  /** The group cannot store the upload's new events within its limit. */
  | { error: 'group-full' };

export type GroupRefusalReason = GroupRefusal['error'];

/** The HTTP status of each of these refusals. */
export const GROUP_REFUSAL_STATUS: Record<GroupRefusalReason, number> = {
  'not-a-member': 403,
  epoch: 409,
  'group-full': 413,
};

const isContent = (value: unknown) =>
  isHexContent(value, EVENT_CONTENT_MINIMUM, EVENT_CONTENT_LIMIT);

/**
 * Whether every item of `items` passes `isItem`, an empty slot included, which is an
 * item that is `undefined`: `every` would skip it.
 */
function everyItem(
  items: readonly unknown[],
  isItem: (item: unknown, index: number) => boolean,
): boolean {
  for (let index = 0; index < items.length; index += 1) {
    if (!isItem(items[index], index)) return false;
  }
  return true;
}

/** Whether `value` is exactly the body of an upload (SYNC-53.1). */
export function isUploadEventsRequest(
  value: unknown,
): value is UploadEventsRequest {
  if (!hasExactly(value, ['epoch', 'events'])) return false;
  const { epoch, events } = value;
  return (
    isWhole(epoch, 1) &&
    Array.isArray(events) &&
    events.length >= 1 &&
    events.length <= UPLOAD_EVENT_LIMIT &&
    everyItem(
      events,
      (event) =>
        hasExactly(event, ['id', 'content']) &&
        isId(event.id) &&
        isContent(event.content),
    ) &&
    new Set(events.map((event: UploadedEvent) => event.id)).size ===
      events.length
  );
}

/** Whether `value` is exactly what the API answers once a group is created (SYNC-62.1). */
export function isCreateGroupResponse(
  value: unknown,
): value is CreateGroupResponse {
  return hasExactly(value, ['groupId']) && isId(value.groupId);
}

/** Whether `value` is exactly what the API answers to an upload (SYNC-62.1). */
export function isUploadEventsResponse(
  value: unknown,
): value is UploadEventsResponse {
  return (
    hasExactly(value, ['events']) &&
    Array.isArray(value.events) &&
    everyItem(
      value.events,
      (event) =>
        hasExactly(event, ['id', 'sequence']) &&
        isId(event.id) &&
        isWhole(event.sequence, 1),
    )
  );
}

/** Whether `value` is exactly a page of events (SYNC-62.1). */
export function isEventsPageResponse(
  value: unknown,
): value is EventsPageResponse {
  if (!hasExactly(value, ['events', 'more'])) return false;
  const { events, more } = value;
  return (
    typeof more === 'boolean' &&
    Array.isArray(events) &&
    everyItem(
      events,
      (event, index) =>
        hasExactly(event, [
          'id',
          'sequence',
          'deviceId',
          'epoch',
          'receivedAtMs',
          'content',
        ]) &&
        isId(event.id) &&
        isWhole(event.sequence, 1) &&
        isId(event.deviceId) &&
        isWhole(event.epoch, 1) &&
        isWhole(event.receivedAtMs, 0) &&
        isContent(event.content) &&
        // Each event before this one has passed, so it has a sequence number.
        (index === 0 ||
          event.sequence === (events[index - 1] as RelayedEvent).sequence + 1),
    )
  );
}

/** Whether `value` is exactly the body of one of the event API's own refusals (SYNC-62.1). */
export function isGroupRefusal(value: unknown): value is GroupRefusal {
  if (hasExactly(value, ['error', 'epoch'])) {
    return value.error === 'epoch' && isWhole(value.epoch, 1);
  }
  return (
    hasExactly(value, ['error']) &&
    (value.error === 'not-a-member' || value.error === 'group-full')
  );
}

/** Whether `value` is exactly the body of the answer that a phone needs a snapshot (SYNC-137.1). */
export function isSnapshotNeededResponse(
  value: unknown,
): value is SnapshotNeededResponse {
  return hasExactly(value, ['error']) && value.error === 'snapshot-needed';
}

/**
 * The header of a page's answer that lists the member devices a snapshot is needed by
 * (SYNC-162.1): their device IDs on one line, joined by commas.
 */
export const SNAPSHOT_NEEDED_BY_HEADER = 'x-snapshot-needed-by';

/** Writes that header's value for these device IDs, in their order (SYNC-163.1). Not built yet: #156. */
export const writeSnapshotNeededBy: (
  deviceIds: readonly string[],
) => string = () => {
  throw new Error('Not built yet (#156)');
};

/** The device IDs that header's value lists, none when it is absent or written any other way (SYNC-163.1). Not built yet: #156. */
export const readSnapshotNeededBy: (value: unknown) => string[] = () => {
  throw new Error('Not built yet (#156)');
};

// The invite API uses the same group IDs, integer cursors and encrypted content limits.
export { hasExactly, isContent, isId as isGroupId, isWhole };
