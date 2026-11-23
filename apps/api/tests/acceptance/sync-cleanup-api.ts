import {
  SNAPSHOT_NEEDED_STATUS,
  isSnapshotNeededResponse,
  type UploadedEvent,
} from '@shared-expense/domain/api';
import { cleanUp } from '../../src/cleanup';
import {
  T,
  databaseContents,
  sql,
  timesStored,
  type Answer,
  type Contents,
  type Phone,
} from './sharing-api';
import { BRISBANE, download, events, expectUploaded, upload } from './sync-api';

// The cleanup tests run in the world of the sync tests (ADR-0033). The cleanup is a
// function of the API that takes a database and a time: the tests call it on their own
// database, as the Workers entry file does when Cron fires, with whatever time a scenario
// names. It does not move the time the API handles requests at.

/** A day, and the 30 days an event may stay, in milliseconds. */
export const DAY = 86_400_000;
export const THIRTY_DAYS = 2_592_000_000;

/** Runs the cleanup once with `at` as the API's time: a second after T unless given. */
export const cleanUpAt = (at: number = T + 1_000) => cleanUp(sql(), at);

/** Uploads `count` new events of `phone` to Brisbane, which get the numbers from `first` on, and resolves with them. */
export async function store(
  phone: Phone,
  count: number,
  first = 1,
): Promise<UploadedEvent[]> {
  const sent = events(count);
  expectUploaded(
    await upload(phone, BRISBANE, sent),
    sent,
    sent.map((_, index) => first + index),
  );
  return sent;
}

/** `phone` downloads Brisbane's events with `cursor` and gets a page, so that its progress is that cursor. */
export async function reach(phone: Phone, cursor: number) {
  expect((await download(phone, BRISBANE, cursor)).status).toBe(200);
}

const contentOf = (sent: UploadedEvent) => Buffer.from(sent.content, 'hex');

/** The database holds the content of none of these events. */
export async function expectDeleted(...sent: UploadedEvent[]) {
  for (const each of sent) {
    expect(await timesStored(contentOf(each))).toBe(0);
  }
}

/** The database still holds the content of each of these events, once. */
export async function expectKept(...sent: UploadedEvent[]) {
  for (const each of sent) {
    expect(await timesStored(contentOf(each))).toBe(1);
  }
}

/** The API's answer that the phone needs a snapshot, as SYNC-136.1 words it. */
export function expectSnapshotNeeded(answer: Answer) {
  expect(answer).toEqual({ status: 410, body: { error: 'snapshot-needed' } });
  expect(SNAPSHOT_NEEDED_STATUS).toBe(410);
  expect(isSnapshotNeededResponse(answer.body)).toBe(true);
}

const valuesOf = (contents: Contents) =>
  Object.values(contents)
    .flat()
    .flatMap((row) => Object.values(JSON.parse(row) as Record<string, unknown>))
    .filter((value) => value !== null);

/**
 * The values the database holds now that it did not hold when `before` was read,
 * whatever table and column they are in: text as it is, bytes as `bytes:` and their
 * hexadecimal.
 */
export async function valuesAddedSince(
  before: Contents,
): Promise<Set<unknown>> {
  const had = new Set(valuesOf(before));
  return new Set(
    valuesOf(await databaseContents()).filter((value) => !had.has(value)),
  );
}
