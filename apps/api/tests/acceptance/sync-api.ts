import { randomBytes, randomUUID } from 'node:crypto';
import {
  GROUP_REFUSAL_STATUS,
  isCreateGroupResponse,
  isEventsPageResponse,
  isGroupRefusal,
  isUploadEventsResponse,
  type EventsPageResponse,
  type GroupRefusal,
  type RelayedEvent,
  type UploadedEvent,
} from '@shared-expense/domain/api';
import { startServer, type NodeServer } from '../../src/node';
import { addMemberDevice } from '../support/group-members';
import { sendTo } from '../support/signed';
import {
  databaseContents,
  databaseUrl,
  fieldOf,
  now,
  send,
  serverUrl,
  setTime,
  signedBy,
  sql,
  useSharingApi,
  type Answer,
  type Phone,
  type RequestInput,
} from './sharing-api';

// The sync tests stand in for phones that exchange a shared ledger's events through the
// API (ADR-0003, ADR-0016). They run in the world of the sharing tests: a database of
// their own with the real migrations, served through the Node entry file, where a test
// sets the API's time. The paths and the bodies are put together here as the spec words
// them, and an event's content is whatever bytes a test picks: the API never reads it.

/** The groups of the scenarios. A group ID is a lowercase version-4 UUID, as a phone makes its IDs. */
export const BRISBANE = '9b2f6c1e-8d47-4f3a-b1c5-2e7d90a4f6b8';
export const TOKYO = 'c4a1e2d3-5b6f-4a7c-9d8e-0f1a2b3c4d5e';

export const REQUEST = { error: 'request' } as const;
export const NOT_A_MEMBER = { error: 'not-a-member' } as const;
export const GROUP_FULL = { error: 'group-full' } as const;
export const wrongEpoch = (epoch: number) =>
  ({ error: 'epoch', epoch }) as const;

/** The fewest and the most bytes an event's content may have, and the most a group's events may add up to. */
export const SMALLEST = 41;
export const LARGEST = 65_536;
export const GROUP_LIMIT = 10_485_760;

// The nonce of every request sent since the test began, to tell the record the API keeps
// of an accepted request from what the request did.
const sentNonces: string[] = [];

// The servers a test started beside the world's own.
const ownServers: NodeServer[] = [];

/** Before each test in the calling scope: the world of the sharing tests, with nothing sent yet. */
export function useSyncApi() {
  // Declared before the world's hooks, which drop the database: these servers close first.
  afterEach(async () => {
    for (const server of ownServers.splice(0)) await server.close();
  });
  useSharingApi();
  beforeEach(() => {
    sentNonces.length = 0;
  });
}

/** From now on the API's time is a minute later, so that a phone's request limit starts over. */
export function aMinuteLater() {
  setTime(now() + 60_000);
}

// Requests

/**
 * Serves the API a second time on the test's database, with connections of its own to
 * it, as every request has on Workers (ADR-0007): requests sent to different servers
 * never wait for one another's connection. Its time is the world's unless `clock` gives
 * another. It closes when the test ends.
 */
export async function ownServer(
  clock: () => number = now,
): Promise<NodeServer> {
  const server = await startServer({ databaseUrl: databaseUrl(), now: clock });
  ownServers.push(server);
  return server;
}

/** Sends a request `phone` signs to `server`. */
export function callOn(
  server: NodeServer,
  phone: Phone,
  input: RequestInput,
): Promise<Answer> {
  const request = signedBy(phone, input);
  sentNonces.push(fieldOf(request, 'nonce'));
  return sendTo(server.url, request);
}

/** Sends a request `phone` signs, with `headers` beside the four fields. */
export function call(
  phone: Phone,
  input: RequestInput,
  headers: Record<string, string> = {},
): Promise<Answer> {
  const request = signedBy(phone, input);
  sentNonces.push(fieldOf(request, 'nonce'));
  return send({ ...request, headers: { ...headers, ...request.headers } });
}

/** The API's answer to a request `phone` signs, with the headers of that answer. */
export async function callForHeaders(
  phone: Phone,
  input: RequestInput,
): Promise<Answer & { headers: Headers }> {
  const request = signedBy(phone, input);
  sentNonces.push(fieldOf(request, 'nonce'));
  const sent = request.body ?? new Uint8Array(0);
  const response = await fetch(`${serverUrl()}${request.path}`, {
    method: request.method,
    headers: request.headers,
    ...(sent.length > 0 ? { body: sent } : {}),
  });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // Not JSON: the text is the body.
  }
  return { status: response.status, body, headers: response.headers };
}

const groupPath = (groupId: string) => `/groups/${groupId}`;
export const eventsPath = (groupId: string) => `/groups/${groupId}/events`;

/** Asks the API to create the group; `body` is what the request carries, which is nothing unless given. */
export const createGroup = (
  phone: Phone,
  groupId: string,
  body?: Uint8Array | string,
) => call(phone, { method: 'PUT', path: groupPath(groupId), body });

/** Uploads a body as it is given. */
export const uploadBody = (
  phone: Phone,
  groupId: string,
  body: Uint8Array | string,
) => call(phone, { method: 'POST', path: eventsPath(groupId), body });

/** Uploads `events` under a key epoch, which is 1 unless given. */
export const upload = (
  phone: Phone,
  groupId: string,
  events: UploadedEvent[],
  epoch = 1,
) => uploadBody(phone, groupId, JSON.stringify({ epoch, events }));

/** The request that uploads `events` under key epoch 1, for `callOn`. */
export const uploadOf = (
  groupId: string,
  events: UploadedEvent[],
): RequestInput => ({
  method: 'POST',
  path: eventsPath(groupId),
  body: JSON.stringify({ epoch: 1, events }),
});

/** Downloads the page after `cursor`, which is written into the query as it is given. */
export const download = (
  phone: Phone,
  groupId: string,
  cursor: number | string,
) => call(phone, { path: `${eventsPath(groupId)}?after=${cursor}` });

/** Downloads with `query` as the whole of what follows the path. */
export const downloadWith = (phone: Phone, groupId: string, query: string) =>
  call(phone, { path: `${eventsPath(groupId)}${query}` });

/** The headers of the API's answer to a request `phone` signs. */
export async function answerHeaders(
  phone: Phone,
  input: RequestInput,
): Promise<Headers> {
  const request = signedBy(phone, input);
  sentNonces.push(fieldOf(request, 'nonce'));
  const response = await fetch(`${serverUrl()}${request.path}`, {
    method: request.method,
    headers: request.headers,
  });
  await response.arrayBuffer();
  return response.headers;
}

// Events

export const hexOf = (content: Uint8Array) =>
  Buffer.from(content).toString('hex');

/** An event to upload: `content` as it is, or that many random bytes; a new ID unless one is given. */
export function event(
  content: Uint8Array | number = 200,
  id: string = randomUUID(),
): UploadedEvent {
  return {
    id,
    content: hexOf(
      typeof content === 'number' ? randomBytes(content) : content,
    ),
  };
}

/** `count` events, each of `size` random bytes. */
export const events = (count: number, size = 200) =>
  Array.from({ length: count }, () => event(size));

/** `uploaded` as the API relays it once `by` uploaded it at the API's time `at`. */
export const relayed = (
  uploaded: UploadedEvent,
  recorded: { sequence: number; by: Phone; at: number; epoch?: number },
): RelayedEvent => ({
  id: uploaded.id,
  sequence: recorded.sequence,
  deviceId: recorded.by.deviceId,
  epoch: recorded.epoch ?? 1,
  receivedAtMs: recorded.at,
  content: uploaded.content,
});

/** `uploaded`, in order, as the API relays them when `by` uploaded them at `at` and they got the numbers from `first` on. */
export const relayedFrom = (
  first: number,
  uploaded: UploadedEvent[],
  recorded: { by: Phone; at: number },
) =>
  uploaded.map((each, index) =>
    relayed(each, { ...recorded, sequence: first + index }),
  );

// Members

/**
 * Makes `phone`, which has registered, a member device of a group that exists, as the
 * routes that let a device in will (#141). Until then only this gives a group a second
 * member device.
 */
export const addMember = (groupId: string, phone: Phone) =>
  addMemberDevice(sql(), { groupId, deviceId: phone.deviceId });

// Answers

export function expectCreated(answer: Answer, groupId: string) {
  expect(answer.status).toBe(200);
  expect(isCreateGroupResponse(answer.body)).toBe(true);
  expect(answer.body).toEqual({ groupId });
}

/** The API stored or already had every event of `sent`, and answers each, in order, with its number of `sequences`. */
export function expectUploaded(
  answer: Answer,
  sent: UploadedEvent[],
  sequences: number[],
) {
  expect(answer.status).toBe(200);
  expect(isUploadEventsResponse(answer.body)).toBe(true);
  expect(answer.body).toEqual({
    events: sent.map(({ id }, index) => ({ id, sequence: sequences[index] })),
  });
}

export function expectPage(answer: Answer, page: EventsPageResponse) {
  expect(answer.status).toBe(200);
  expect(isEventsPageResponse(answer.body)).toBe(true);
  expect(answer.body).toEqual(page);
}

export const EMPTY_PAGE: EventsPageResponse = { events: [], more: false };

/** The answer is one of the event API's own refusals. */
export function expectGroupRefused(answer: Answer, refusal: GroupRefusal) {
  expect(answer).toEqual({
    status: GROUP_REFUSAL_STATUS[refusal.error],
    body: refusal,
  });
  expect(isGroupRefusal(answer.body)).toBe(true);
}

/**
 * Every event the group has, as `phone` gets them page by page from cursor 0. Each page
 * begins right after the cursor and has no gap.
 */
export async function everyEvent(
  phone: Phone,
  groupId: string,
): Promise<RelayedEvent[]> {
  const all: RelayedEvent[] = [];
  for (;;) {
    const answer = await download(phone, groupId, all.length);
    expect(answer.status).toBe(200);
    expect(isEventsPageResponse(answer.body)).toBe(true);
    const page = answer.body as EventsPageResponse;
    expect(page.events.map(({ sequence }) => sequence)).toEqual(
      page.events.map((_, index) => all.length + index + 1),
    );
    all.push(...page.events);
    if (!page.more || page.events.length === 0) return all;
  }
}

// The database

/**
 * Runs `work` and checks that the database holds what it held before, apart from the
 * record the API keeps of each request it accepted meanwhile (SHARING-36.1, 37.1): a
 * request the event API refuses has passed the checks, so it is counted, and leaves no
 * other trace. That record is the one row that holds the request's nonce.
 */
export async function leavingGroupsAsTheyWere<R>(
  work: () => Promise<R>,
): Promise<R> {
  const before = await databaseContents();
  const sentBefore = sentNonces.length;
  const result = await work();
  const nonces = sentNonces.slice(sentBefore);
  const after = Object.fromEntries(
    Object.entries(await databaseContents()).map(([table, rows]) => [
      table,
      rows.filter(
        (row) => !nonces.some((nonce) => row.includes(`bytes:${nonce}`)),
      ),
    ]),
  );
  expect(after).toEqual(before);
  return result;
}

/**
 * How many rows, of any table, hold every one of `values` in columns of their own: text
 * as it is, and a number as a number, as its decimal writing, or as the time it is in
 * milliseconds since the Unix epoch.
 */
export async function rowsHolding(
  ...values: (string | number)[]
): Promise<number> {
  const holds = (stored: unknown, value: string | number) =>
    stored === value ||
    stored === String(value) ||
    stored === `bigint:${value}` ||
    (typeof value === 'number' &&
      stored === `date:${new Date(value).toISOString()}`);
  return Object.values(await databaseContents())
    .flat()
    .map((row) => Object.values(JSON.parse(row) as Record<string, unknown>))
    .filter((stored) =>
      values.every((value) => stored.some((each) => holds(each, value))),
    ).length;
}
