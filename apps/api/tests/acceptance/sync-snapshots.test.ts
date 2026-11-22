import { randomBytes, randomUUID } from 'node:crypto';
import {
  CASEY,
  T,
  TAYLOR,
  expectPassed,
  expectRefused,
  newPhone,
  registered,
  send,
  setTime,
  signedBy,
  timesStored,
  type Phone,
} from './sharing-api';
import {
  BRISBANE,
  EMPTY_PAGE,
  NOT_A_MEMBER,
  REQUEST,
  TOKYO,
  aMinuteLater,
  addMember,
  answerHeaders,
  call,
  callOn,
  createGroup,
  download,
  downloadWith,
  event,
  events,
  expectCreated,
  expectGroupRefused,
  expectPage,
  expectUploaded,
  hexOf,
  leavingGroupsAsTheyWere,
  ownServer,
  relayedFrom,
  rowsHolding,
  upload,
  useSyncApi,
  wrongEpoch,
} from './sync-api';
import {
  LARGEST_CHUNK,
  NO_SNAPSHOT,
  SMALLEST_CHUNK,
  SNAPSHOTS_FULL,
  SNAPSHOT_LIMIT,
  ask,
  chunkBody,
  chunkPath,
  chunksStored,
  downloadChunk,
  expectChunk,
  expectDelivered,
  expectSnapshotRefused,
  expectStored,
  expectWaiting,
  putChunk,
  setEpoch,
  snapshotOf,
  snapshotPath,
  uploadAll,
  uploadChunk,
  type Snapshot,
} from './sync-snapshot-api';

// The snapshot API (ADR-0028): a member device uploads a snapshot of a shared ledger chunk
// by chunk for one device, which asks for it and downloads it once it is a member device
// too. The API deletes the snapshot when that device's cursor has reached what it covers.

useSyncApi();

const SIGNATURE = { error: 'signature' } as const;
const REPLAYED = { error: 'replayed' } as const;

/** Taylor's phone, which created Brisbane, and Casey's, registered: a member device of Brisbane unless `caseyIsMember` is false. */
async function brisbane(caseyIsMember = true): Promise<[Phone, Phone]> {
  const taylor = await registered(TAYLOR);
  const casey = await registered(CASEY);
  expectCreated(await createGroup(taylor, BRISBANE), BRISBANE);
  if (caseyIsMember) await addMember(BRISBANE, casey);
  return [taylor, casey];
}

/** A third phone, registered and a member device of Brisbane. */
async function anotherMember(): Promise<Phone> {
  const phone = await registered();
  await addMember(BRISBANE, phone);
  return phone;
}

/** Uploads `count` events to Brisbane as Taylor's phone, so that its last sequence number is `count`. */
async function withEvents(taylor: Phone, count: number) {
  const sent = events(count);
  expectUploaded(
    await upload(taylor, BRISBANE, sent),
    sent,
    sent.map((_, index) => index + 1),
  );
  return sent;
}

/** Tokyo, created by Taylor's phone, with Casey's phone as a member device. */
async function tokyoWithBoth(taylor: Phone, casey: Phone) {
  expectCreated(await createGroup(taylor, TOKYO), TOKYO);
  await addMember(TOKYO, casey);
}

describe('SYNC-101.1', () => {
  test('[SYNC-101.1] chunk 0 begins a snapshot, which is not handed out while it is incomplete', async () => {
    const [taylor, casey] = await brisbane();
    const s = snapshotOf(taylor, casey);

    expectStored(await uploadChunk(BRISBANE, s, 0), s, 0);

    expectSnapshotRefused(await ask(casey, BRISBANE), NO_SNAPSHOT);
    expect(await chunksStored(s)).toBe(1);
  });

  test('[SYNC-101.1] a snapshot of one chunk is complete at once', async () => {
    const [taylor, casey] = await brisbane();
    const s2 = snapshotOf(taylor, casey, { sizes: [200] });

    expectStored(await uploadChunk(BRISBANE, s2, 0), s2, 0);

    await expectDelivered(casey, BRISBANE, s2);
  });

  test('[SYNC-101.1] takes a snapshot for a device that is no member device yet, or that never registered', async () => {
    const [taylor, casey] = await brisbane(false);
    const s = snapshotOf(taylor, casey);
    const forNobody = snapshotOf(
      taylor,
      '4b1d7a52-6f0e-4c83-9a2b-5d3e8f7c1a90',
    );

    await uploadAll(BRISBANE, s);
    expectStored(await uploadChunk(BRISBANE, forNobody, 0), forNobody, 0);

    await addMember(BRISBANE, casey);
    await expectDelivered(casey, BRISBANE, s);
  });

  test('[SYNC-101.1] replaces the snapshot the group stored for that device, whoever uploaded it', async () => {
    const [taylor, casey] = await brisbane();
    const blake = await anotherMember();
    const s = snapshotOf(taylor, casey);
    await uploadAll(BRISBANE, s);
    const s2 = snapshotOf(blake, casey);

    expectStored(await uploadChunk(BRISBANE, s2, 0), s2, 0);

    expectSnapshotRefused(await ask(casey, BRISBANE), NO_SNAPSHOT);
    expectSnapshotRefused(
      await downloadChunk(casey, BRISBANE, s.id, 0),
      NO_SNAPSHOT,
    );
    expect(await chunksStored(s)).toBe(0);
    expect(await chunksStored(s2)).toBe(1);
  });

  test('[SYNC-101.1] keeps one of two snapshots for one device that begin together, ten times', async () => {
    const [taylor, casey] = await brisbane();
    const blake = await anotherMember();
    const servers = [await ownServer(), await ownServer()];

    for (let round = 0; round < 10; round += 1) {
      const pair = [
        snapshotOf(taylor, casey, { sizes: [200] }),
        snapshotOf(blake, casey, { sizes: [200] }),
      ];

      const answers = await Promise.all(
        pair.map((each, index) =>
          callOn(servers[index], each.by, {
            method: 'PUT',
            path: chunkPath(BRISBANE, each.id, 0),
            body: JSON.stringify(chunkBody(each, 0)),
          }),
        ),
      );

      pair.forEach((each, index) => expectStored(answers[index], each, 0));
      const stored = await Promise.all(pair.map(chunksStored));
      expect([...stored].sort()).toEqual([0, 1]);
      await expectDelivered(casey, BRISBANE, pair[stored.indexOf(1)]);
    }
  });

  test('[SYNC-101.1] keeps one snapshot for each device of each group', async () => {
    const [taylor, casey] = await brisbane();
    const s = snapshotOf(taylor, casey);
    const s2 = snapshotOf(casey, taylor);
    const s3 = snapshotOf(taylor, casey);

    await uploadAll(BRISBANE, s);
    await uploadAll(BRISBANE, s2);
    await tokyoWithBoth(taylor, casey);
    await uploadAll(TOKYO, s3);

    await expectDelivered(casey, BRISBANE, s);
    await expectDelivered(casey, TOKYO, s3);
    await expectDelivered(taylor, BRISBANE, s2);
  });

  test("[SYNC-101.1] leaves the group's events and each device's progress as they were", async () => {
    const [taylor, casey] = await brisbane();
    const [a, b] = await withEvents(taylor, 2);
    setTime(T + 1_000);
    expectPage(await download(taylor, BRISBANE, 2), EMPTY_PAGE);
    expect(await rowsHolding(taylor.deviceId, 2, T + 1_000)).toBe(1);

    setTime(T + 2_000);
    await uploadAll(BRISBANE, snapshotOf(taylor, casey, { sequence: 2 }));

    expect(await rowsHolding(taylor.deviceId, 2, T + 1_000)).toBe(1);
    expectPage(await download(taylor, BRISBANE, 0), {
      events: relayedFrom(1, [a, b], { by: taylor, at: T }),
      more: false,
    });
  });
});

describe('SYNC-102.1', () => {
  test('[SYNC-102.1] stores each chunk, and hands the complete snapshot to the device it is for', async () => {
    const [taylor, casey] = await brisbane();
    const s = snapshotOf(taylor, casey);

    for (const index of [0, 1, 2]) {
      expectStored(await uploadChunk(BRISBANE, s, index), s, index);
    }

    await expectDelivered(casey, BRISBANE, s);
  });

  test('[SYNC-102.1] stores a chunk as it is', async () => {
    const [taylor, casey] = await brisbane();
    const s = snapshotOf(taylor, casey, {
      sizes: [
        new Uint8Array(SMALLEST_CHUNK),
        Uint8Array.from({ length: 256 }, (_, byte) => byte),
        LARGEST_CHUNK,
      ],
    });

    await uploadAll(BRISBANE, s);

    await expectDelivered(casey, BRISBANE, s);
  });

  test('[SYNC-102.1] a chunk it has is answered as stored and not stored again, chunk 0 too', async () => {
    const [taylor, casey] = await brisbane();
    const s = snapshotOf(taylor, casey);
    await uploadAll(BRISBANE, s);
    const other = [randomBytes(200), randomBytes(200)];

    expectStored(
      await uploadChunk(BRISBANE, s, 1, { content: hexOf(other[0]) }),
      s,
      1,
    );
    expectStored(
      await uploadChunk(BRISBANE, s, 0, { content: hexOf(other[1]) }),
      s,
      0,
    );

    await expectDelivered(casey, BRISBANE, s);
    expect(await timesStored(other[0])).toBe(0);
    expect(await timesStored(other[1])).toBe(0);
  });

  test('[SYNC-102.1] takes the chunks in any order, and is complete only with the last one', async () => {
    const [taylor, casey] = await brisbane();
    const s = snapshotOf(taylor, casey);

    expectStored(await uploadChunk(BRISBANE, s, 0), s, 0);
    expectStored(await uploadChunk(BRISBANE, s, 2), s, 2);
    expectSnapshotRefused(await ask(casey, BRISBANE), NO_SNAPSHOT);
    expectStored(await uploadChunk(BRISBANE, s, 1), s, 1);

    await expectDelivered(casey, BRISBANE, s);
  });

  test('[SYNC-102.1] stores a chunk once when it arrives five times together', async () => {
    const [taylor, casey] = await brisbane();
    const s = snapshotOf(taylor, casey);
    expectStored(await uploadChunk(BRISBANE, s, 0), s, 0);
    const contents = Array.from({ length: 5 }, () => randomBytes(200));

    const answers = await Promise.all(
      contents.map((content) =>
        uploadChunk(BRISBANE, s, 1, { content: hexOf(content) }),
      ),
    );

    for (const answer of answers) expectStored(answer, s, 1);
    const stored = await Promise.all(contents.map((each) => timesStored(each)));
    expect([...stored].sort()).toEqual([0, 0, 0, 0, 1]);
    expectStored(await uploadChunk(BRISBANE, s, 2), s, 2);
    expectChunk(
      await downloadChunk(casey, BRISBANE, s.id, 1),
      contents[stored.indexOf(1)],
    );
  });

  test('[SYNC-102.1] finishes a snapshot that began before the group changed its key epoch', async () => {
    const [taylor, casey] = await brisbane();
    const s = snapshotOf(taylor, casey);
    expectStored(await uploadChunk(BRISBANE, s, 0), s, 0);

    await setEpoch(BRISBANE, 2);
    expectStored(await uploadChunk(BRISBANE, s, 1), s, 1);
    expectStored(await uploadChunk(BRISBANE, s, 2), s, 2);

    await expectDelivered(casey, BRISBANE, s);
  });
});

describe('SYNC-103.2', () => {
  const WRONG_GROUP_IDS = [
    BRISBANE.toUpperCase(),
    '9b2f6c1e-8d47-1f3a-b1c5-2e7d90a4f6b8',
    'brisbane',
  ];

  test.each(WRONG_GROUP_IDS)(
    '[SYNC-103.2] refuses the group ID %s in each of the three requests',
    async (groupId) => {
      const [taylor, casey] = await brisbane();
      const s = snapshotOf(taylor, casey);

      await leavingGroupsAsTheyWere(async () => {
        expectRefused(await uploadChunk(groupId, s, 0), REQUEST);
        expectRefused(await ask(casey, groupId), REQUEST);
        expectRefused(await downloadChunk(casey, groupId, s.id, 0), REQUEST);
      });
    },
  );

  test.each([
    ['in capitals', (id: string) => id.toUpperCase()],
    ['of version 1', (id: string) => `${id.slice(0, 14)}1${id.slice(15)}`],
    ['with no hyphens', (id: string) => id.replaceAll('-', '')],
    ['that is a word', () => 'snapshot-1'],
  ])(
    '[SYNC-103.2] refuses a snapshot ID %s in an upload and in a download',
    async (_case, wrong) => {
      const [taylor, casey] = await brisbane();
      const s = snapshotOf(taylor, casey);
      await uploadAll(BRISBANE, s);
      const snapshotId = wrong(s.id);

      await leavingGroupsAsTheyWere(async () => {
        expectRefused(
          await putChunk(
            taylor,
            BRISBANE,
            snapshotId,
            0,
            JSON.stringify(chunkBody(s, 0)),
          ),
          REQUEST,
        );
        expectRefused(
          await downloadChunk(casey, BRISBANE, snapshotId, 0),
          REQUEST,
        );
      });
    },
  );

  test('[SYNC-103.2] refuses an index that is not written as a whole number from 0 to 63', async () => {
    const [taylor, casey] = await brisbane();
    const s = snapshotOf(taylor, casey);
    await uploadAll(BRISBANE, s);
    const body = JSON.stringify(chunkBody(s, 1));

    await leavingGroupsAsTheyWere(async () => {
      for (const index of [
        '-1',
        '01',
        '1.0',
        '1e0',
        '0x1',
        '64',
        'one',
        '9007199254740992',
      ]) {
        expectRefused(
          await putChunk(taylor, BRISBANE, s.id, index, body),
          REQUEST,
        );
        expectRefused(
          await downloadChunk(casey, BRISBANE, s.id, index),
          REQUEST,
        );
      }
    });

    expectStored(await putChunk(taylor, BRISBANE, s.id, '1', body), s, 1);
    expectChunk(await downloadChunk(casey, BRISBANE, s.id, '1'), s.chunks[1]);
  });

  test('[SYNC-103.2] an index written with an escape is refused for its signature, before the route sees it', async () => {
    const [taylor, casey] = await brisbane();
    const s = snapshotOf(taylor, casey);
    await uploadAll(BRISBANE, s);
    const body = JSON.stringify(chunkBody(s, 1));

    await leavingGroupsAsTheyWere(async () => {
      expectRefused(
        await putChunk(taylor, BRISBANE, s.id, '%31', body),
        SIGNATURE,
      );
      expectRefused(
        await downloadChunk(casey, BRISBANE, s.id, '%31'),
        SIGNATURE,
      );
    });
  });

  test('[SYNC-103.2] refuses each of the three requests when its URL carries a query', async () => {
    const [taylor, casey] = await brisbane();
    const s = snapshotOf(taylor, casey);
    await uploadAll(BRISBANE, s);
    const body = JSON.stringify(chunkBody(s, 1));

    await leavingGroupsAsTheyWere(async () => {
      for (const query of ['?x', '?index=1']) {
        expectRefused(
          await putChunk(taylor, BRISBANE, s.id, `1${query}`, body),
          REQUEST,
        );
      }
      for (const query of ['?x', `?device=${casey.deviceId}`]) {
        expectRefused(
          await call(casey, { path: `${snapshotPath(BRISBANE)}${query}` }),
          REQUEST,
        );
      }
      expectRefused(await downloadChunk(casey, BRISBANE, s.id, '1?x'), REQUEST);
    });

    await expectDelivered(casey, BRISBANE, s);
  });

  test('[SYNC-103.2] refuses an upload whose body is no JSON, or no upload of a chunk', async () => {
    const [taylor, casey] = await brisbane();
    const s = snapshotOf(taylor, casey);
    const right = chunkBody(s, 0);
    const lacking = (key: string) =>
      JSON.stringify(
        Object.fromEntries(Object.entries(right).filter(([k]) => k !== key)),
      );
    const bodies: (Uint8Array | string)[] = [
      '',
      'hello',
      Uint8Array.from([0xff, 0xfe, 0x7b, 0x7d]),
      JSON.stringify([right]),
      'null',
      lacking('deviceId'),
      lacking('epoch'),
      lacking('sequence'),
      lacking('count'),
      lacking('content'),
      JSON.stringify({ ...right, name: 'Brisbane' }),
      JSON.stringify({ ...right, deviceId: casey.deviceId.toUpperCase() }),
      JSON.stringify({ ...right, epoch: 0 }),
      JSON.stringify({ ...right, sequence: -1 }),
      JSON.stringify({ ...right, count: 0 }),
      JSON.stringify({ ...right, count: 65 }),
      JSON.stringify({ ...right, content: hexOf(randomBytes(40)) }),
      JSON.stringify({ ...right, content: hexOf(randomBytes(262_145)) }),
      JSON.stringify({ ...right, content: right.content.toUpperCase() }),
      JSON.stringify({
        ...right,
        content: Buffer.from(s.chunks[0]).toString('base64'),
      }),
    ];

    await leavingGroupsAsTheyWere(async () => {
      for (const body of bodies) {
        expectRefused(await putChunk(taylor, BRISBANE, s.id, 0, body), REQUEST);
      }
    });

    expect(await chunksStored(s)).toBe(0);
    expectStored(await uploadChunk(BRISBANE, s, 0), s, 0);
  });

  test('[SYNC-103.2] refuses an index that is not below the count the request names', async () => {
    const [taylor, casey] = await brisbane();
    const s = snapshotOf(taylor, casey);
    expectStored(await uploadChunk(BRISBANE, s, 0), s, 0);
    const single = snapshotOf(taylor, taylor, { sizes: [200] });

    await leavingGroupsAsTheyWere(async () => {
      expectRefused(await uploadChunk(BRISBANE, s, 3), REQUEST);
      expectRefused(await uploadChunk(BRISBANE, single, 1), REQUEST);
    });
  });

  test('[SYNC-103.2] says so to a device that is no member device, too', async () => {
    const [taylor, casey] = await brisbane(false);
    const s = snapshotOf(taylor, casey);

    expectRefused(await putChunk(casey, BRISBANE, s.id, 0, '{}'), REQUEST);
    expectRefused(
      await call(casey, { path: `${snapshotPath(BRISBANE)}?x` }),
      REQUEST,
    );
  });
});

describe('SYNC-104.1', () => {
  test('[SYNC-104.1] refuses a later chunk of a snapshot that never began', async () => {
    const [taylor, casey] = await brisbane();
    const s = snapshotOf(taylor, casey);

    const answer = await leavingGroupsAsTheyWere(() =>
      uploadChunk(BRISBANE, s, 1),
    );

    expectSnapshotRefused(answer, NO_SNAPSHOT);
    expect(await chunksStored(s)).toBe(0);
  });

  test('[SYNC-104.1] refuses a later chunk of a snapshot that another one replaced', async () => {
    const [taylor, casey] = await brisbane();
    const blake = await anotherMember();
    const s = snapshotOf(taylor, casey);
    const s2 = snapshotOf(blake, casey, { sizes: [200] });
    expectStored(await uploadChunk(BRISBANE, s, 0), s, 0);
    await uploadAll(BRISBANE, s2);

    expectSnapshotRefused(await uploadChunk(BRISBANE, s, 1), NO_SNAPSHOT);

    await expectDelivered(casey, BRISBANE, s2);
  });

  test('[SYNC-104.1] refuses a later chunk of a snapshot that was deleted', async () => {
    const [taylor, casey] = await brisbane();
    const s = snapshotOf(taylor, casey);
    expectStored(await uploadChunk(BRISBANE, s, 0), s, 0);
    expectStored(await uploadChunk(BRISBANE, s, 1), s, 1);

    expectPage(await download(casey, BRISBANE, 0), EMPTY_PAGE);

    expectSnapshotRefused(await uploadChunk(BRISBANE, s, 2), NO_SNAPSHOT);
  });

  test('[SYNC-104.1] a snapshot ID belongs to its group', async () => {
    const [taylor, casey] = await brisbane();
    const s = snapshotOf(taylor, casey);
    expectStored(await uploadChunk(BRISBANE, s, 0), s, 0);
    expectCreated(await createGroup(taylor, TOKYO), TOKYO);

    expectSnapshotRefused(await uploadChunk(TOKYO, s, 1), NO_SNAPSHOT);
    expectStored(await uploadChunk(TOKYO, s, 0), s, 0);

    // Brisbane's is as it was: it takes its next chunk.
    expectStored(await uploadChunk(BRISBANE, s, 1), s, 1);
    expect(await chunksStored(s)).toBe(3);
  });
});

describe('SYNC-105.1', () => {
  test('[SYNC-105.1] refuses a chunk that names the snapshot otherwise than its first chunk did', async () => {
    const [taylor, casey] = await brisbane();
    await withEvents(taylor, 1);
    const s = snapshotOf(taylor, casey);
    expectStored(await uploadChunk(BRISBANE, s, 0), s, 0);
    const otherwise = [
      { deviceId: taylor.deviceId },
      { epoch: 2 },
      { count: 4 },
      { sequence: 1 },
    ];

    await leavingGroupsAsTheyWere(async () => {
      for (const index of [1, 0]) {
        for (const changes of otherwise) {
          expectRefused(
            await uploadChunk(BRISBANE, s, index, changes),
            REQUEST,
          );
        }
      }
    });

    expect(await chunksStored(s)).toBe(1);
  });

  test('[SYNC-105.1] refuses a chunk of a snapshot another device began', async () => {
    const [taylor, casey] = await brisbane();
    const s = snapshotOf(taylor, casey);
    expectStored(await uploadChunk(BRISBANE, s, 0), s, 0);

    const answer = await leavingGroupsAsTheyWere(() =>
      uploadChunk(BRISBANE, s, 1, {}, casey),
    );

    expectRefused(answer, REQUEST);
  });

  test('[SYNC-105.1] refuses to begin a snapshot that covers more than the group has numbered', async () => {
    const [taylor, casey] = await brisbane();
    await withEvents(taylor, 3);
    const tooFar = [4, Number.MAX_SAFE_INTEGER].map((sequence) =>
      snapshotOf(taylor, casey, { sequence }),
    );
    const upToDate = snapshotOf(taylor, casey, { sequence: 3 });

    await leavingGroupsAsTheyWere(async () => {
      for (const each of tooFar) {
        expectRefused(await uploadChunk(BRISBANE, each, 0), REQUEST);
      }
    });

    expectStored(await uploadChunk(BRISBANE, upToDate, 0), upToDate, 0);
  });

  test('[SYNC-105.1] begins it once the group has numbered that far', async () => {
    const [taylor, casey] = await brisbane();
    const s = snapshotOf(taylor, casey, { sequence: 1 });

    expectRefused(await uploadChunk(BRISBANE, s, 0), REQUEST);
    await withEvents(taylor, 1);

    expectStored(await uploadChunk(BRISBANE, s, 0), s, 0);
  });
});

describe('SYNC-106.1', () => {
  test.each([2, Number.MAX_SAFE_INTEGER])(
    '[SYNC-106.1] refuses to begin a snapshot under key epoch %d while the group is at 1, and keeps the one it stores',
    async (epoch) => {
      const [taylor, casey] = await brisbane();
      const s = snapshotOf(taylor, casey);
      await uploadAll(BRISBANE, s);
      const s2 = snapshotOf(taylor, casey, { epoch });

      const answer = await leavingGroupsAsTheyWere(() =>
        uploadChunk(BRISBANE, s2, 0),
      );

      expectGroupRefused(answer, wrongEpoch(1));
      await expectDelivered(casey, BRISBANE, s);
    },
  );

  test('[SYNC-106.1] names the key epoch the group has changed to, and begins a snapshot under it', async () => {
    const [taylor, casey] = await brisbane();
    await setEpoch(BRISBANE, 2);
    const s = snapshotOf(taylor, casey);
    const s2 = snapshotOf(taylor, casey, { epoch: 2 });

    expectGroupRefused(await uploadChunk(BRISBANE, s, 0), wrongEpoch(2));

    expectStored(await uploadChunk(BRISBANE, s2, 0), s2, 0);
  });
});

/**
 * Fills Brisbane's snapshots to the byte: a snapshot for Casey's phone in 64 chunks, the
 * last one 41 bytes short of the largest, and chunk 0, 41 bytes, of a snapshot of two
 * chunks for Taylor's own phone. Resolves with the two.
 */
async function fillSnapshots(
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

describe('SYNC-107.1', () => {
  test('[SYNC-107.1] stores chunks up to 16 MiB for a group, and refuses the one that goes past', async () => {
    const [taylor, casey] = await brisbane();
    const blake = await anotherMember();
    const [s, s2] = await fillSnapshots(taylor, casey);
    expect(
      s.chunks.reduce((sum, chunk) => sum + chunk.length, 0) + SMALLEST_CHUNK,
    ).toBe(SNAPSHOT_LIMIT);

    // A byte too many.
    expectSnapshotRefused(
      await uploadChunk(BRISBANE, s2, 0, {
        content: hexOf(randomBytes(SMALLEST_CHUNK + 1)),
      }),
      SNAPSHOTS_FULL,
    );
    expectSnapshotRefused(await ask(taylor, BRISBANE), NO_SNAPSHOT);

    // Room for one chunk of 41 bytes, and two arrive together: one fills the group to the byte.
    const forBlake = snapshotOf(taylor, blake, {
      sizes: [SMALLEST_CHUNK, SMALLEST_CHUNK],
    });
    const together = await Promise.all([
      uploadChunk(BRISBANE, s2, 0),
      uploadChunk(BRISBANE, forBlake, 0),
    ]);
    expect(together.map((answer) => answer.status).sort()).toEqual([200, 413]);
    const won = together[0].status === 200 ? 0 : 1;
    const [kept, refused] = won === 0 ? [s2, forBlake] : [forBlake, s2];
    const recipient = won === 0 ? taylor : blake;
    expectStored(together[won], kept, 0);
    expectSnapshotRefused(together[1 - won], SNAPSHOTS_FULL);
    expectSnapshotRefused(
      await uploadChunk(BRISBANE, refused, 0),
      SNAPSHOTS_FULL,
    );
    expectSnapshotRefused(await uploadChunk(BRISBANE, kept, 1), SNAPSHOTS_FULL);

    // Full: a chunk it has, the group's events, and another group go on as before.
    expectStored(
      await uploadChunk(BRISBANE, s, 5, { content: hexOf(randomBytes(200)) }),
      s,
      5,
    );
    const one = [event()];
    expectUploaded(await upload(taylor, BRISBANE, one), one, [1]);
    expectCreated(await createGroup(taylor, TOKYO), TOKYO);
    const inTokyo = snapshotOf(taylor, casey, { sizes: [LARGEST_CHUNK] });
    expectStored(await uploadChunk(TOKYO, inTokyo, 0), inTokyo, 0);

    // The snapshot a new one replaces does not count.
    const s3 = snapshotOf(taylor, recipient, {
      sizes: [SMALLEST_CHUNK, SMALLEST_CHUNK],
    });
    expectStored(await uploadChunk(BRISBANE, s3, 0), s3, 0);
    const s4 = snapshotOf(taylor, recipient, { sizes: [SMALLEST_CHUNK + 1] });
    expectSnapshotRefused(await uploadChunk(BRISBANE, s4, 0), SNAPSHOTS_FULL);
    expectSnapshotRefused(await uploadChunk(BRISBANE, s3, 1), SNAPSHOTS_FULL);

    // Deleting a snapshot makes room.
    expect((await download(casey, BRISBANE, 0)).status).toBe(200);
    expectStored(await uploadChunk(BRISBANE, s3, 1), s3, 1);
    await expectDelivered(recipient, BRISBANE, s3);
  }, 120_000);
});

describe('SYNC-108.1', () => {
  test('[SYNC-108.1] tells the device a complete snapshot is for what it is, as often as it asks', async () => {
    const [taylor, casey] = await brisbane();
    await withEvents(taylor, 2);
    const s = snapshotOf(taylor, casey, { sequence: 2 });
    await uploadAll(BRISBANE, s);

    const [first, second] = await leavingGroupsAsTheyWere(async () => [
      await ask(casey, BRISBANE),
      await ask(casey, BRISBANE),
    ]);

    expectWaiting(first, s);
    expectWaiting(second, s);
    expect(first.body).toEqual({
      snapshotId: s.id,
      deviceId: taylor.deviceId,
      epoch: 1,
      sequence: 2,
      count: 3,
    });
    const headers = await answerHeaders(casey, {
      path: snapshotPath(BRISBANE),
    });
    expect(headers.get('cache-control')).toBe('no-store');
  });

  test('[SYNC-108.1] says there is none while a chunk is missing', async () => {
    const [taylor, casey] = await brisbane();
    const s = snapshotOf(taylor, casey);
    expectStored(await uploadChunk(BRISBANE, s, 0), s, 0);
    expectStored(await uploadChunk(BRISBANE, s, 2), s, 2);

    expectSnapshotRefused(await ask(casey, BRISBANE), NO_SNAPSHOT);
  });

  test('[SYNC-108.1] says there is none to a member device the snapshot is not for', async () => {
    const [taylor, casey] = await brisbane();
    const blake = await anotherMember();
    await uploadAll(BRISBANE, snapshotOf(taylor, casey));

    expectSnapshotRefused(await ask(taylor, BRISBANE), NO_SNAPSHOT);
    expectSnapshotRefused(await ask(blake, BRISBANE), NO_SNAPSHOT);
  });

  test('[SYNC-108.1] says there is none in a group with no snapshot', async () => {
    const [, casey] = await brisbane();

    expectSnapshotRefused(await ask(casey, BRISBANE), NO_SNAPSHOT);
  });
});

describe('SYNC-109.1', () => {
  test('[SYNC-109.1] hands out each chunk as it was uploaded, in any order and again, and keeps the snapshot', async () => {
    const [taylor, casey] = await brisbane();
    const s = snapshotOf(taylor, casey);
    await uploadAll(BRISBANE, s);

    await leavingGroupsAsTheyWere(async () => {
      for (const index of [2, 0, 1, 0]) {
        expectChunk(
          await downloadChunk(casey, BRISBANE, s.id, index),
          s.chunks[index],
        );
      }
    });

    const headers = await answerHeaders(casey, {
      path: chunkPath(BRISBANE, s.id, 0),
    });
    expect(headers.get('cache-control')).toBe('no-store');
    expectWaiting(await ask(casey, BRISBANE), s);
  });

  test('[SYNC-109.1] refuses an index that is not below the number of chunks', async () => {
    const [taylor, casey] = await brisbane();
    const s = snapshotOf(taylor, casey);
    await uploadAll(BRISBANE, s);

    expectRefused(await downloadChunk(casey, BRISBANE, s.id, 3), REQUEST);
    expectRefused(await downloadChunk(casey, BRISBANE, s.id, 63), REQUEST);
  });

  test('[SYNC-109.1] says there is no snapshot when it is not that device’s', async () => {
    const [taylor, casey] = await brisbane();
    const blake = await anotherMember();
    const s = snapshotOf(taylor, casey);
    await uploadAll(BRISBANE, s);

    expectSnapshotRefused(
      await downloadChunk(taylor, BRISBANE, s.id, 0),
      NO_SNAPSHOT,
    );
    expectSnapshotRefused(
      await downloadChunk(blake, BRISBANE, s.id, 0),
      NO_SNAPSHOT,
    );
    expectSnapshotRefused(
      await downloadChunk(casey, BRISBANE, randomUUID(), 0),
      NO_SNAPSHOT,
    );
  });

  test('[SYNC-109.1] hands out no chunk of a snapshot that is not complete', async () => {
    const [taylor, casey] = await brisbane();
    const s = snapshotOf(taylor, casey);
    expectStored(await uploadChunk(BRISBANE, s, 0), s, 0);
    expectStored(await uploadChunk(BRISBANE, s, 1), s, 1);

    expectSnapshotRefused(
      await downloadChunk(casey, BRISBANE, s.id, 0),
      NO_SNAPSHOT,
    );
  });

  test('[SYNC-109.1] hands out no chunk under the snapshot ID in another group', async () => {
    const [taylor, casey] = await brisbane();
    const s = snapshotOf(taylor, casey);
    await uploadAll(BRISBANE, s);
    await tokyoWithBoth(taylor, casey);

    expectSnapshotRefused(
      await downloadChunk(casey, TOKYO, s.id, 0),
      NO_SNAPSHOT,
    );
  });
});

describe('SYNC-110.1', () => {
  test('[SYNC-110.1] refuses each request of a device that is no member device', async () => {
    const [taylor, casey] = await brisbane(false);
    const s = snapshotOf(taylor, casey);
    await uploadAll(BRISBANE, s);
    const own = snapshotOf(casey, casey);

    await leavingGroupsAsTheyWere(async () => {
      expectGroupRefused(await ask(casey, BRISBANE), NOT_A_MEMBER);
      expectGroupRefused(
        await downloadChunk(casey, BRISBANE, s.id, 0),
        NOT_A_MEMBER,
      );
      expectGroupRefused(await uploadChunk(BRISBANE, own, 0), NOT_A_MEMBER);
      expectGroupRefused(
        await uploadChunk(BRISBANE, s, 1, {}, casey),
        NOT_A_MEMBER,
      );
    });
  });

  test('[SYNC-110.1] answers a group that exists and one that does not in the same way, and then hands the snapshot to a device that became a member device', async () => {
    const [taylor, casey] = await brisbane(false);
    const s = snapshotOf(taylor, casey);
    await uploadAll(BRISBANE, s);
    const own = snapshotOf(casey, casey);
    const underNextEpoch = snapshotOf(casey, casey, { epoch: 2 });
    const asked = (groupId: string) => [
      () => ask(casey, groupId),
      () => downloadChunk(casey, groupId, s.id, 0),
      () => downloadChunk(casey, groupId, own.id, 0),
      () => uploadChunk(groupId, own, 0),
      () => uploadChunk(groupId, s, 1, {}, casey),
      () => uploadChunk(groupId, underNextEpoch, 0),
    ];

    const inBrisbane = [];
    const inTokyo = [];
    for (const request of asked(BRISBANE)) inBrisbane.push(await request());
    for (const request of asked(TOKYO)) inTokyo.push(await request());

    for (const answer of [...inBrisbane, ...inTokyo]) {
      expectGroupRefused(answer, NOT_A_MEMBER);
    }
    expect(inBrisbane).toEqual(inTokyo);

    await addMember(BRISBANE, casey);
    await expectDelivered(casey, BRISBANE, s);
  });
});

describe('SYNC-111.1', () => {
  test('[SYNC-111.1] deletes the snapshot when its device downloads events from the number it covers', async () => {
    const [taylor, casey] = await brisbane();
    const sent = await withEvents(taylor, 5);
    const all = relayedFrom(1, sent, { by: taylor, at: T });
    const s = snapshotOf(taylor, casey, { sequence: 3 });
    await uploadAll(BRISBANE, s);

    expectPage(await download(casey, BRISBANE, 2), {
      events: all.slice(2),
      more: false,
    });
    expectWaiting(await ask(casey, BRISBANE), s);
    expectPage(await download(casey, BRISBANE, 3), {
      events: all.slice(3),
      more: false,
    });

    expectSnapshotRefused(await ask(casey, BRISBANE), NO_SNAPSHOT);
    expectSnapshotRefused(
      await downloadChunk(casey, BRISBANE, s.id, 0),
      NO_SNAPSHOT,
    );
    expect(await chunksStored(s)).toBe(0);
  });

  test('[SYNC-111.1] deletes it when the cursor is past the number it covers', async () => {
    const [taylor, casey] = await brisbane();
    await withEvents(taylor, 5);
    const s = snapshotOf(taylor, casey, { sequence: 3 });
    await uploadAll(BRISBANE, s);

    expectPage(await download(casey, BRISBANE, 5), EMPTY_PAGE);

    expectSnapshotRefused(await ask(casey, BRISBANE), NO_SNAPSHOT);
    expect(await chunksStored(s)).toBe(0);
  });

  test('[SYNC-111.1] deletes a snapshot that covers nothing at the first download', async () => {
    const [taylor, casey] = await brisbane();
    const s = snapshotOf(taylor, casey);
    await uploadAll(BRISBANE, s);

    expectPage(await download(casey, BRISBANE, 0), EMPTY_PAGE);

    expectSnapshotRefused(await ask(casey, BRISBANE), NO_SNAPSHOT);
  });

  test('[SYNC-111.1] deletes a snapshot that is not complete, too', async () => {
    const [taylor, casey] = await brisbane();
    const s = snapshotOf(taylor, casey);
    expectStored(await uploadChunk(BRISBANE, s, 0), s, 0);

    expectPage(await download(casey, BRISBANE, 0), EMPTY_PAGE);

    expectSnapshotRefused(await uploadChunk(BRISBANE, s, 1), NO_SNAPSHOT);
    expect(await chunksStored(s)).toBe(0);
  });

  test('[SYNC-111.1] keeps it through a lower cursor, a refused download, another device’s download, an upload, and a download in another group', async () => {
    const [taylor, casey] = await brisbane();
    await withEvents(taylor, 5);
    await tokyoWithBoth(taylor, casey);
    const s = snapshotOf(taylor, casey, { sequence: 3 });
    await uploadAll(BRISBANE, s);

    expectPage(await download(taylor, BRISBANE, 5), EMPTY_PAGE);
    expectRefused(await download(casey, BRISBANE, 6), REQUEST);
    expectRefused(await downloadWith(casey, BRISBANE, ''), REQUEST);
    const one = [event()];
    expectUploaded(await upload(casey, BRISBANE, one), one, [6]);
    expectPage(await download(casey, TOKYO, 0), EMPTY_PAGE);
    expect((await download(casey, BRISBANE, 2)).status).toBe(200);

    await expectDelivered(casey, BRISBANE, s);
  });

  test('[SYNC-111.1] keeps the snapshots the group stores for other devices', async () => {
    const [taylor, casey] = await brisbane();
    const s = snapshotOf(taylor, casey);
    const s2 = snapshotOf(casey, taylor);
    await uploadAll(BRISBANE, s);
    await uploadAll(BRISBANE, s2);

    expectPage(await download(casey, BRISBANE, 0), EMPTY_PAGE);

    expectSnapshotRefused(await ask(casey, BRISBANE), NO_SNAPSHOT);
    await expectDelivered(taylor, BRISBANE, s2);
  });
});

describe('SYNC-112.1', () => {
  test('[SYNC-112.1] takes none of the three requests without a signature, or from a device that has not registered', async () => {
    const [taylor, casey] = await brisbane();
    const s = snapshotOf(taylor, casey);
    await uploadAll(BRISBANE, s);
    const stranger = newPhone();
    const requests = [
      {
        method: 'PUT',
        path: chunkPath(BRISBANE, s.id, 0),
        body: JSON.stringify(chunkBody(s, 0)),
      },
      { path: snapshotPath(BRISBANE) },
      { path: chunkPath(BRISBANE, s.id, 0) },
    ];

    await leavingGroupsAsTheyWere(async () => {
      for (const request of requests) {
        const unsigned = signedBy(casey, request);
        expectRefused(await send({ ...unsigned, headers: {} }), SIGNATURE);
        expectRefused(await send(signedBy(stranger, request)), SIGNATURE);
      }
    });
  });

  test('[SYNC-112.1] says a request is written wrongly before it says the device is no member device', async () => {
    const [taylor, casey] = await brisbane(false);
    const s = snapshotOf(taylor, casey);
    const noCount = Object.fromEntries(
      Object.entries(chunkBody(s, 0)).filter(([name]) => name !== 'count'),
    );

    expectRefused(
      await putChunk(casey, BRISBANE, s.id, 0, JSON.stringify(noCount)),
      REQUEST,
    );
    expectRefused(await downloadChunk(casey, BRISBANE, s.id, '64'), REQUEST);
  });

  test('[SYNC-112.1] says the device is no member device before anything about the group', async () => {
    const [taylor, casey] = await brisbane(false);
    await setEpoch(BRISBANE, 2);
    const asCasey = snapshotOf(casey, casey, { sequence: 5 });
    const asTaylor = snapshotOf(taylor, casey, { sequence: 5 });

    expectGroupRefused(await uploadChunk(BRISBANE, asCasey, 0), NOT_A_MEMBER);
    expectRefused(await uploadChunk(BRISBANE, asTaylor, 0), REQUEST);
  });

  test('[SYNC-112.1] says there is no snapshot before it says an index is past the end', async () => {
    const [taylor, casey] = await brisbane();
    const s = snapshotOf(taylor, casey);
    await uploadAll(BRISBANE, s);

    expectSnapshotRefused(
      await downloadChunk(taylor, BRISBANE, s.id, 5),
      NO_SNAPSHOT,
    );
    expectRefused(await downloadChunk(casey, BRISBANE, s.id, 5), REQUEST);
  });

  test('[SYNC-112.1] says a chunk does not match, or covers too much, or names the wrong key epoch, before it says there is no room', async () => {
    const [taylor, casey] = await brisbane();
    const blake = await anotherMember();
    const [, s2] = await fillSnapshots(taylor, casey);
    expectStored(await uploadChunk(BRISBANE, s2, 0), s2, 0);
    const tooFar = snapshotOf(taylor, blake, { epoch: 2, sequence: 1 });
    const wrongKey = snapshotOf(taylor, blake, { epoch: 2 });
    const noRoom = snapshotOf(taylor, blake);

    expectRefused(await uploadChunk(BRISBANE, s2, 1, { count: 3 }), REQUEST);
    expectRefused(await uploadChunk(BRISBANE, tooFar, 0), REQUEST);
    expectGroupRefused(await uploadChunk(BRISBANE, wrongKey, 0), wrongEpoch(1));
    expectSnapshotRefused(
      await uploadChunk(BRISBANE, noRoom, 0),
      SNAPSHOTS_FULL,
    );
    // The chunk that matches has no room either.
    expectSnapshotRefused(await uploadChunk(BRISBANE, s2, 1), SNAPSHOTS_FULL);
  }, 120_000);

  test('[SYNC-112.1] a request it refused has used its nonce', async () => {
    const [, casey] = await brisbane();
    const request = signedBy(casey, { path: snapshotPath(BRISBANE) });

    expectSnapshotRefused(await send(request), NO_SNAPSHOT);

    expectRefused(await send(request), REPLAYED);
  });

  test("[SYNC-112.1] counts a request it refuses towards the device's 60 a minute", async () => {
    const [, casey] = await brisbane();
    // With its registration, 59 more make 60 in this minute.
    for (let sent = 0; sent < 59; sent += 1) {
      expectSnapshotRefused(await ask(casey, BRISBANE), NO_SNAPSHOT);
    }

    const next = await ask(casey, BRISBANE);

    expectRefused(next, { error: 'too-many-requests', retryAfterMs: 60_000 });
  });
});

describe('SYNC-113.1', () => {
  test('[SYNC-113.1] the same paths with another method have no route, HEAD too', async () => {
    const [taylor, casey] = await brisbane();
    const s = snapshotOf(taylor, casey);
    await uploadAll(BRISBANE, s);
    const body = JSON.stringify(chunkBody(s, 0));

    await leavingGroupsAsTheyWere(async () => {
      for (const method of ['HEAD', 'DELETE']) {
        expectPassed(
          await call(casey, { method, path: snapshotPath(BRISBANE) }),
        );
        expectPassed(
          await call(casey, { method, path: chunkPath(BRISBANE, s.id, 0) }),
        );
      }
      for (const method of ['PUT', 'POST']) {
        expectPassed(
          await call(casey, { method, path: snapshotPath(BRISBANE), body }),
        );
      }
      for (const method of ['POST', 'PATCH']) {
        expectPassed(
          await call(casey, {
            method,
            path: chunkPath(BRISBANE, s.id, 0),
            body,
          }),
        );
      }
      expectPassed(
        await call(taylor, {
          method: 'DELETE',
          path: `/groups/${BRISBANE}/snapshots/${s.id}`,
        }),
      );
    });

    await expectDelivered(casey, BRISBANE, s);
  });
});

describe('SYNC-61.2', () => {
  test("[SYNC-61.2] keeps each chunk's content once, and nothing else a request carries or a refused or repeated chunk brings", async () => {
    const [taylor, casey] = await brisbane(false);
    const s = snapshotOf(taylor, casey);
    const headers = { 'X-Group-Name': 'Brisbane-Trip' };
    for (const index of [0, 1, 2]) {
      const answer = await call(
        taylor,
        {
          method: 'PUT',
          path: chunkPath(BRISBANE, s.id, index),
          body: JSON.stringify(chunkBody(s, index)),
        },
        headers,
      );
      expectStored(answer, s, index);
    }
    const again = randomBytes(200);
    const fromCasey = snapshotOf(casey, casey);
    const underNextEpoch = snapshotOf(taylor, taylor, { epoch: 2 });

    expectStored(
      await uploadChunk(BRISBANE, s, 1, { content: hexOf(again) }),
      s,
      1,
    );
    expectGroupRefused(await uploadChunk(BRISBANE, fromCasey, 0), NOT_A_MEMBER);
    expectGroupRefused(
      await uploadChunk(BRISBANE, underNextEpoch, 0),
      wrongEpoch(1),
    );

    for (const chunk of s.chunks) expect(await timesStored(chunk)).toBe(1);
    expect(await timesStored('Brisbane-Trip')).toBe(0);
    expect(await timesStored(again)).toBe(0);
    expect(await chunksStored(fromCasey)).toBe(0);
    expect(await chunksStored(underNextEpoch)).toBe(0);

    // A deleted snapshot leaves no content behind.
    await addMember(BRISBANE, casey);
    expectPage(await download(casey, BRISBANE, 0), EMPTY_PAGE);
    expect(await chunksStored(s)).toBe(0);
  });
});
