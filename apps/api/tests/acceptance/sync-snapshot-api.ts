import { randomBytes, randomUUID } from 'node:crypto';
import {
  SNAPSHOT_REFUSAL_STATUS,
  isSnapshotChunkResponse,
  isSnapshotChunkStoredResponse,
  isSnapshotRefusal,
  isSnapshotResponse,
  type SnapshotRefusal,
} from '@shared-expense/domain/api';
import { sql, timesStored, type Answer, type Phone } from './sharing-api';
import { BRISBANE, aMinuteLater, call, hexOf } from './sync-api';

// The snapshot tests stand in for phones that pass a shared ledger's snapshot through the
// API (ADR-0028), in the world of the sync tests. A chunk's content is whatever bytes a test
// picks: the API never reads it.

export const NO_SNAPSHOT = { error: 'no-snapshot' } as const;
export const SNAPSHOTS_FULL = { error: 'snapshots-full' } as const;

/** The fewest and the most bytes a chunk may have, and the most a group's snapshots may add up to. */
export const SMALLEST_CHUNK = 41;
export const LARGEST_CHUNK = 262_144;
export const SNAPSHOT_LIMIT = 16_777_216;

/** A snapshot a test uploads: what every one of its chunks' requests says, and its chunks. */
export interface Snapshot {
  id: string;
  /** The phone that uploads it. */
  by: Phone;
  /** The device ID it is for. */
  recipient: string;
  epoch: number;
  sequence: number;
  /** The number of chunks its requests say it has. */
  count: number;
  chunks: Uint8Array[];
}

/**
 * A snapshot `by` uploads for `recipient`, a phone or a device ID: key epoch 1, covering
 * sequence number 0, in three chunks of 200 random bytes, unless given. `sizes` are the
 * chunks' sizes, or the chunks themselves.
 */
export function snapshotOf(
  by: Phone,
  recipient: Phone | string,
  {
    epoch = 1,
    sequence = 0,
    sizes = [200, 200, 200],
    count = sizes.length,
  }: {
    epoch?: number;
    sequence?: number;
    sizes?: (number | Uint8Array)[];
    count?: number;
  } = {},
): Snapshot {
  return {
    id: randomUUID(),
    by,
    recipient: typeof recipient === 'string' ? recipient : recipient.deviceId,
    epoch,
    sequence,
    count,
    chunks: sizes.map((size) =>
      typeof size === 'number' ? new Uint8Array(randomBytes(size)) : size,
    ),
  };
}

export const snapshotPath = (groupId: string) => `/groups/${groupId}/snapshot`;

/** The path of one chunk; `index` is written into it as it is given. */
export const chunkPath = (
  groupId: string,
  snapshotId: string,
  index: number | string,
) => `/groups/${groupId}/snapshots/${snapshotId}/chunks/${index}`;

/** What the upload of a snapshot's chunk carries, with whatever a test changes. */
export const chunkBody = (
  snapshot: Snapshot,
  index: number,
  changes: Record<string, unknown> = {},
) => ({
  deviceId: snapshot.recipient,
  epoch: snapshot.epoch,
  sequence: snapshot.sequence,
  count: snapshot.count,
  content: hexOf(snapshot.chunks[index] ?? new Uint8Array(randomBytes(200))),
  ...changes,
});

/** Uploads a body as it is given to a chunk's path, signed by `phone`. */
export const putChunk = (
  phone: Phone,
  groupId: string,
  snapshotId: string,
  index: number | string,
  body: Uint8Array | string,
) =>
  call(phone, {
    method: 'PUT',
    path: chunkPath(groupId, snapshotId, index),
    body,
  });

/**
 * Uploads one chunk of a snapshot, signed by the phone that uploads the snapshot unless
 * `as` gives another, with whatever `changes` put in the body in place of the snapshot's own.
 */
export const uploadChunk = (
  groupId: string,
  snapshot: Snapshot,
  index: number,
  changes: Record<string, unknown> = {},
  as: Phone = snapshot.by,
) =>
  putChunk(
    as,
    groupId,
    snapshot.id,
    index,
    JSON.stringify(chunkBody(snapshot, index, changes)),
  );

/** Uploads every chunk of a snapshot in order, and checks that each is answered as stored. */
export async function uploadAll(groupId: string, snapshot: Snapshot) {
  for (let index = 0; index < snapshot.chunks.length; index += 1) {
    expectStored(await uploadChunk(groupId, snapshot, index), snapshot, index);
  }
}

/** Asks whether the group stores a snapshot for `phone`. */
export const ask = (phone: Phone, groupId: string) =>
  call(phone, { path: snapshotPath(groupId) });

/** Downloads one chunk; `index` is written into the path as it is given. */
export const downloadChunk = (
  phone: Phone,
  groupId: string,
  snapshotId: string,
  index: number | string,
) => call(phone, { path: chunkPath(groupId, snapshotId, index) });

// Answers

export function expectStored(
  answer: Answer,
  snapshot: Snapshot,
  index: number,
) {
  expect(answer.status).toBe(200);
  expect(isSnapshotChunkStoredResponse(answer.body)).toBe(true);
  expect(answer.body).toEqual({ snapshotId: snapshot.id, index });
}

/** The answer says the group stores `snapshot`, complete, for the device that asked. */
export function expectWaiting(answer: Answer, snapshot: Snapshot) {
  expect(answer.status).toBe(200);
  expect(isSnapshotResponse(answer.body)).toBe(true);
  expect(answer.body).toEqual({
    snapshotId: snapshot.id,
    deviceId: snapshot.by.deviceId,
    epoch: snapshot.epoch,
    sequence: snapshot.sequence,
    count: snapshot.count,
  });
}

export function expectChunk(answer: Answer, content: Uint8Array) {
  expect(answer.status).toBe(200);
  expect(isSnapshotChunkResponse(answer.body)).toBe(true);
  expect(answer.body).toEqual({ content: hexOf(content) });
}

/** The answer is one of the snapshot API's own refusals. */
export function expectSnapshotRefused(
  answer: Answer,
  refusal: SnapshotRefusal,
) {
  expect(answer).toEqual({
    status: SNAPSHOT_REFUSAL_STATUS[refusal.error],
    body: refusal,
  });
  expect(isSnapshotRefusal(answer.body)).toBe(true);
}

/** `phone` gets `snapshot` from the group: it is told of it, and downloads every chunk as it was uploaded. */
export async function expectDelivered(
  phone: Phone,
  groupId: string,
  snapshot: Snapshot,
) {
  expectWaiting(await ask(phone, groupId), snapshot);
  for (let index = 0; index < snapshot.chunks.length; index += 1) {
    expectChunk(
      await downloadChunk(phone, groupId, snapshot.id, index),
      snapshot.chunks[index],
    );
  }
}

/**
 * Fills Brisbane's snapshots to the byte: a snapshot for Casey's phone in 64 chunks, the
 * last one 41 bytes short of the largest, and chunk 0, 41 bytes, of a snapshot of two
 * chunks for Taylor's own phone. Resolves with the two.
 */
export async function fillSnapshots(
  taylor: Phone,
  casey: Phone,
): Promise<[Snapshot, Snapshot]> {
  const s = snapshotOf(taylor, casey, {
    sizes: [
      ...Array.from({ length: 63 }, () => LARGEST_CHUNK),
      LARGEST_CHUNK - SMALLEST_CHUNK,
    ],
  });
  for (let index = 0; index < 64; index += 1) {
    // A device sends at most 60 requests a minute (SHARING-37.1).
    if (index % 40 === 0) aMinuteLater();
    expectStored(await uploadChunk(BRISBANE, s, index), s, index);
  }
  aMinuteLater();
  const s2 = snapshotOf(taylor, taylor, {
    sizes: [SMALLEST_CHUNK, SMALLEST_CHUNK],
  });
  return [s, s2];
}

// The database

/** How many of the snapshot's chunks the database holds, in any writing of their bytes. */
export async function chunksStored(snapshot: Snapshot): Promise<number> {
  let stored = 0;
  for (const chunk of snapshot.chunks) stored += await timesStored(chunk);
  return stored;
}

/** From now on the group's key epoch is `epoch`, as after a rotation (#143), which no route does yet. */
export async function setEpoch(groupId: string, epoch: number) {
  await sql()`UPDATE groups SET epoch = ${epoch} WHERE id = ${groupId}`;
}
