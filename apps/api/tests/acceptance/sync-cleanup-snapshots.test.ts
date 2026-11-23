import { randomBytes } from 'node:crypto';
import { T, now, registered, setTime } from './sharing-api';
import { bothInBrisbane } from './sharing-invites-api';
import {
  BRISBANE,
  TOKYO,
  addMember,
  createGroup,
  events,
  expectCreated,
  expectUploaded,
  hexOf,
  upload,
  useSyncApi,
} from './sync-api';
import {
  DAY,
  THIRTY_DAYS,
  cleanUpAt,
  expectDeleted,
  expectKept,
  reach,
  store,
} from './sync-cleanup-api';
import {
  LARGEST_CHUNK,
  NO_SNAPSHOT,
  SMALLEST_CHUNK,
  SNAPSHOTS_FULL,
  ask,
  chunksStored,
  downloadChunk,
  expectDelivered,
  expectSnapshotRefused,
  expectStored,
  expectWaiting,
  fillSnapshots,
  snapshotOf,
  uploadAll,
  uploadChunk,
  type Snapshot,
} from './sync-snapshot-api';

// What the cleanup does with the snapshots a group stores (ADR-0033): it deletes one that
// covers less than the group is cleared to, which no phone can go on from, and one that
// began more than 30 days before.

useSyncApi();

/** The database holds no chunk of the snapshot. */
async function expectGone(snapshot: Snapshot) {
  expect(await chunksStored(snapshot)).toBe(0);
}

/** The database still holds each chunk the snapshot has stored, once: all of them unless `stored` says how many. */
async function expectStill(
  snapshot: Snapshot,
  stored = snapshot.chunks.length,
) {
  expect(await chunksStored(snapshot)).toBe(stored);
}

describe('SYNC-147.1', () => {
  test('[SYNC-147.1] deletes a snapshot that covers less than the group is cleared to, and keeps one that covers as much or more', async () => {
    const [taylor, casey] = await bothInBrisbane();
    const sent = await store(taylor, 5);
    const recipients = [
      await registered(),
      await registered(),
      await registered(),
    ];
    const [behind, level, ahead] = [2, 3, 5].map((sequence, index) =>
      snapshotOf(taylor, recipients[index], { sequence }),
    );
    for (const each of [behind, level, ahead]) await uploadAll(BRISBANE, each);
    await reach(taylor, 3);
    await reach(casey, 3);

    await cleanUpAt();

    await expectDeleted(sent[0], sent[1], sent[2]);
    await expectKept(sent[3], sent[4]);
    await expectGone(behind);
    await expectStill(level);
    await expectStill(ahead);
    for (const phone of recipients) await addMember(BRISBANE, phone);
    expectSnapshotRefused(await ask(recipients[0], BRISBANE), NO_SNAPSHOT);
    expectSnapshotRefused(
      await downloadChunk(recipients[0], BRISBANE, behind.id, 0),
      NO_SNAPSHOT,
    );
    await expectDelivered(recipients[1], BRISBANE, level);
    await expectDelivered(recipients[2], BRISBANE, ahead);
  });

  test('[SYNC-147.1] deletes one that is not complete, too', async () => {
    const [taylor, casey] = await bothInBrisbane();
    await store(taylor, 5);
    await reach(taylor, 3);
    await reach(casey, 3);
    const s = snapshotOf(taylor, casey, { sequence: 2 });
    expectStored(await uploadChunk(BRISBANE, s, 0), s, 0);

    await cleanUpAt();

    await expectGone(s);
    expectSnapshotRefused(await uploadChunk(BRISBANE, s, 1), NO_SNAPSHOT);
  });

  test('[SYNC-147.1] deletes a snapshot in the same cleanup whose 30 days clear the events after it', async () => {
    const [taylor, casey] = await bothInBrisbane();
    const sent = await store(taylor, 5);
    setTime(T + 29 * DAY);
    const s = snapshotOf(taylor, casey, { sequence: 3 });
    await uploadAll(BRISBANE, s);

    await cleanUpAt(T + THIRTY_DAYS);
    await expectKept(...sent);
    await expectStill(s);

    await cleanUpAt(T + THIRTY_DAYS + 1);
    await expectDeleted(...sent);
    await expectGone(s);
    expectSnapshotRefused(await ask(casey, BRISBANE), NO_SNAPSHOT);
  });

  test('[SYNC-147.1] deletes at the next cleanup a snapshot uploaded after the events it goes on from were cleared', async () => {
    const [taylor, casey] = await bothInBrisbane();
    const sent = await store(taylor, 5);
    await reach(taylor, 5);
    await reach(casey, 5);
    await cleanUpAt();
    await expectDeleted(...sent);
    const s = snapshotOf(taylor, casey, { sequence: 3 });
    await uploadAll(BRISBANE, s);
    await expectStill(s);

    await cleanUpAt();

    await expectGone(s);
  });

  test('[SYNC-147.1] judges a snapshot by what its own group is cleared to', async () => {
    const [taylor, casey] = await bothInBrisbane();
    expectCreated(await createGroup(taylor, TOKYO), TOKYO);
    await addMember(TOKYO, casey);
    await store(taylor, 2);
    const inTokyo = events(2);
    expectUploaded(await upload(taylor, TOKYO, inTokyo), inTokyo, [1, 2]);
    await reach(taylor, 2);
    await reach(casey, 2);
    const s = snapshotOf(taylor, casey, { sequence: 1 });
    const s2 = snapshotOf(taylor, casey, { sequence: 1 });
    await uploadAll(BRISBANE, s);
    await uploadAll(TOKYO, s2);

    await cleanUpAt();

    await expectGone(s);
    await expectStill(s2);
    expectWaiting(await ask(casey, TOKYO), s2);
  });
});

describe('SYNC-148.1', () => {
  test('[SYNC-148.1] deletes a snapshot that began more than 30 days before, not one that began exactly 30 days before', async () => {
    const [taylor, casey] = await bothInBrisbane();
    const s = snapshotOf(taylor, casey);
    await uploadAll(BRISBANE, s);

    await cleanUpAt(T + THIRTY_DAYS);
    await expectStill(s);
    expectWaiting(await ask(casey, BRISBANE), s);

    await cleanUpAt(T + THIRTY_DAYS + 1);
    await expectGone(s);
    expectSnapshotRefused(await ask(casey, BRISBANE), NO_SNAPSHOT);
  });

  test('[SYNC-148.1] counts from the moment the snapshot began, whatever came later: its other chunks, or chunk 0 again', async () => {
    const [taylor, casey] = await bothInBrisbane();
    const s = snapshotOf(taylor, casey);
    expectStored(await uploadChunk(BRISBANE, s, 0), s, 0);
    setTime(T + 5 * DAY);
    expectStored(await uploadChunk(BRISBANE, s, 1), s, 1);
    expectStored(await uploadChunk(BRISBANE, s, 2), s, 2);
    setTime(T + 6 * DAY);
    expectStored(
      await uploadChunk(BRISBANE, s, 0, { content: hexOf(randomBytes(200)) }),
      s,
      0,
    );

    await cleanUpAt(T + THIRTY_DAYS);
    await expectStill(s);

    await cleanUpAt(T + THIRTY_DAYS + 1);
    await expectGone(s);
  });

  test('[SYNC-148.1] a snapshot that replaced another counts from its own beginning', async () => {
    const [taylor, casey] = await bothInBrisbane();
    await uploadAll(BRISBANE, snapshotOf(taylor, casey));
    setTime(T + 10 * DAY);
    const s2 = snapshotOf(taylor, casey);
    await uploadAll(BRISBANE, s2);

    await cleanUpAt(T + THIRTY_DAYS + 1);
    await expectStill(s2);
    await cleanUpAt(T + 40 * DAY);
    await expectStill(s2);
    expectWaiting(await ask(casey, BRISBANE), s2);

    await cleanUpAt(T + 40 * DAY + 1);
    await expectGone(s2);
  });

  test('[SYNC-148.1] deletes one that is not complete, and one whose device has downloaded its chunks', async () => {
    const [taylor, casey] = await bothInBrisbane();
    const s = snapshotOf(taylor, casey);
    expectStored(await uploadChunk(BRISBANE, s, 0), s, 0);
    const s2 = snapshotOf(taylor, taylor);
    await uploadAll(BRISBANE, s2);
    await expectDelivered(taylor, BRISBANE, s2);

    await cleanUpAt(T + THIRTY_DAYS + 1);

    await expectGone(s);
    await expectGone(s2);
    expectSnapshotRefused(await uploadChunk(BRISBANE, s, 1), NO_SNAPSHOT);
    expectSnapshotRefused(await ask(taylor, BRISBANE), NO_SNAPSHOT);
  });

  test('[SYNC-148.1] judges each snapshot by its own beginning, in every group', async () => {
    const [taylor, casey] = await bothInBrisbane();
    expectCreated(await createGroup(taylor, TOKYO), TOKYO);
    const s = snapshotOf(taylor, casey);
    await uploadAll(BRISBANE, s);
    setTime(T + DAY);
    const s2 = snapshotOf(casey, taylor);
    await uploadAll(BRISBANE, s2);
    const s3 = snapshotOf(taylor, taylor);
    await uploadAll(TOKYO, s3);

    await cleanUpAt(T + THIRTY_DAYS + 1);

    await expectGone(s);
    await expectStill(s2);
    await expectStill(s3);
    await expectDelivered(taylor, BRISBANE, s2);
    await expectDelivered(taylor, TOKYO, s3);
  });

  test('[SYNC-148.1] a snapshot it deleted no longer counts towards the 16 MiB of its group', async () => {
    const [taylor, casey] = await bothInBrisbane();
    const blake = await registered();
    await addMember(BRISBANE, blake);
    // S begins a minute after T, and the helper leaves the API's time two minutes later.
    const [s, s2] = await fillSnapshots(taylor, casey);
    expect(now()).toBe(T + 180_000);
    expectStored(await uploadChunk(BRISBANE, s2, 0), s2, 0);
    const s3 = snapshotOf(taylor, blake, {
      sizes: [SMALLEST_CHUNK, SMALLEST_CHUNK],
    });
    expectSnapshotRefused(await uploadChunk(BRISBANE, s3, 0), SNAPSHOTS_FULL);

    await cleanUpAt(T + 60_000 + THIRTY_DAYS + 1);

    await expectGone(s);
    await expectStill(s2, 1);
    expectStored(
      await uploadChunk(BRISBANE, s3, 0, {
        content: hexOf(randomBytes(LARGEST_CHUNK)),
      }),
      s3,
      0,
    );
  }, 120_000);
});
