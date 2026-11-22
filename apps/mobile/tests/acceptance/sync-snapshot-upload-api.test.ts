import { checkSyncSnapshot, type SyncSnapshot } from '@shared-expense/domain';
import {
  NOW,
  T,
  addExpense,
  addPersonalExpense,
  apiDatabaseHolds,
  archiveCategory,
  categoryOf,
  created,
  deleteCategory,
  deviceId,
  drewFromTheRandomSource,
  everythingIn,
  failSecureStoreReads,
  forbiddenDraws,
  giveKey,
  goOffline,
  mark,
  memberIds,
  mostRequestsAtOnce,
  moveToTrash,
  randomId,
  randomKey,
  renameGroup,
  requestHolds,
  saveKey,
  secureStoreWorks,
  sent,
  setClock,
  setEpoch,
  stampOf,
  sync,
  twoPhones,
  uploadAs,
  uploads,
  utf8,
} from './sync-loop-app';
import {
  PIECE,
  WEEK,
  afterSixtySeconds,
  answerNext,
  answerUpload,
  associatedData,
  contentFor,
  endSnapshotWorld,
  faultsLeft,
  fetched,
  inviteEvent,
  inviteHeld,
  invitesIn,
  joined,
  loseAnswerTo,
  neverAnswer,
  newInvite,
  newcomer,
  noAnswerTo,
  opensWith,
  recordWith,
  sendSnapshot,
  sentSnapshot,
  snapshotRequests,
  startSnapshotWorld,
  uploadedChunks,
  whenAnswered,
} from './sync-snapshot-app';

// Runs in Node against the real API (sync-loop-app, sync-snapshot-app): a phone makes a
// snapshot of a shared ledger, encrypts it chunk by chunk and uploads it for another device
// (ADR-0028).

jest.mock(
  'expo-secure-store',
  () =>
    jest
      .requireActual<typeof import('./sync-loop-app')>('./sync-loop-app')
      .secureStoreOfStartingPhone(),
  { virtual: true },
);

jest.mock(
  'expo-crypto',
  () =>
    jest.requireActual<typeof import('./sync-loop-app')>('./sync-loop-app')
      .randomSource,
  { virtual: true },
);

jest.mock('../../src/storage/expo', () => ({}));
jest.mock('../../src/storage/expo-files', () => ({}));

beforeEach(startSnapshotWorld);
afterEach(endSnapshotWorld);

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Twelve titles of 60,000 characters: with them a snapshot of Brisbane takes three chunks. */
const LONG_TITLES = Array.from({ length: 12 }, (_, index) =>
  String(index).padStart(2, '0').padEnd(60_000, 'x'),
);

const UPLOADED = expect.objectContaining({ outcome: 'uploaded' });
const FAILED = { outcome: 'failed' };

const unitsOf = (record: { units: object } | undefined) =>
  record?.units as Record<string, { value: unknown; stamp: unknown }>;

describe('SYNC-114.2', () => {
  test('[SYNC-114.2] holds every record of the ledger with its stamps, tombstones and creation stamps, and the cursor it covers', async () => {
    const setup = await twoPhones({ expenses: ['Dinner'] });
    const { a, b, A, B, key, brisbane } = setup;
    const lunch = await created(b, 'Lunch', await stampOf(b, NOW));
    await uploadAs(b, key, [lunch]);
    await renameGroup(a, 'Brissie');
    await a.groups.removeGroupMember(
      a.database,
      brisbane,
      (await memberIds(a)).Blake,
    );
    await archiveCategory(a, 'Shopping');
    await deleteCategory(a, 'Other');
    await moveToTrash(a, 'Dinner');
    await sync(a);
    await sync(a);
    const uncategorized = await categoryOf(a, 'Uncategorized');
    const c = await newcomer(setup);

    const result = await sendSnapshot(a, c);

    expect(result).toEqual({
      outcome: 'uploaded',
      snapshotId: expect.stringMatching(UUID),
      sequence: 6,
    });
    const content = await contentFor(c, key);
    expect(checkSyncSnapshot(content)).toEqual({
      status: 'valid',
      snapshot: content,
    });
    expect(content).toMatchObject({
      version: 1,
      eventVersion: 1,
      groupId: brisbane,
      sequence: 6,
      uncategorized: uncategorized.id,
    });
    const count = (type: string) =>
      content.records.filter((record) => record.type === type).length;
    expect([
      count('group'),
      count('member'),
      count('category'),
      count('expense'),
    ]).toEqual([1, 3, 9, 2]);
    expect(content.records).toHaveLength(15);

    expect(recordWith(content, 'group', 'name', 'Brissie')?.id).toBe(brisbane);
    expect(
      unitsOf(recordWith(content, 'member', 'name', 'Blake')).removed.value,
    ).toBe(true);
    expect(
      unitsOf(recordWith(content, 'category', 'name', 'Shopping')).archived
        .value,
    ).toBe(true);
    const gone = content.records.filter((record) => record.deleted);
    expect(gone).toHaveLength(1);
    expect(gone[0]).toMatchObject({
      type: 'category',
      units: {},
      deleted: { ms: NOW, device: A },
    });

    const dinner = recordWith(content, 'expense', 'title', 'Dinner');
    expect(dinner).toMatchObject({
      seeded: true,
      created: { ms: T, device: A },
    });
    expect(unitsOf(dinner).trashed).toEqual({
      value: true,
      stamp: expect.objectContaining({ ms: NOW, device: A }),
    });
    expect(unitsOf(dinner).title.stamp).toEqual(dinner?.created);
    const stored = recordWith(content, 'expense', 'title', 'Lunch');
    expect(stored).toMatchObject({
      id: lunch.id,
      seeded: false,
      created: { ms: NOW, counter: 0, device: B },
    });
    expect(Object.keys(unitsOf(stored)).sort()).toEqual([
      'category',
      'date',
      'money',
      'note',
      'title',
      'trashed',
    ]);
  });

  test('[SYNC-114.2] holds only the invites that are neither revoked nor expired', async () => {
    const setup = await twoPhones();
    const { a, b, key } = setup;
    const kept = newInvite(T + WEEK);
    const revoked = newInvite(T + WEEK);
    const expired = newInvite(T + 30_000);
    const made = await stampOf(b, NOW, 0);
    await uploadAs(b, key, [
      inviteEvent(kept, made),
      inviteEvent(revoked, await stampOf(b, NOW, 1)),
      inviteEvent(expired, await stampOf(b, NOW, 2)),
      {
        version: 1,
        stamp: await stampOf(b, NOW, 3),
        type: 'invite',
        id: revoked.code,
        deleted: true,
      },
    ]);
    await sync(a);
    expect(await inviteHeld(a)).toEqual(kept);
    const c = await newcomer(setup);

    await sentSnapshot(a, c);

    const content = await contentFor(c, key);
    expect(invitesIn(content)).toEqual([
      {
        type: 'invite',
        id: kept.code,
        units: {
          link: {
            value: { secret: kept.secret, expiresAtMs: kept.expiresAtMs },
            stamp: made,
          },
        },
        created: made,
        seeded: false,
      },
    ]);
    const text = JSON.stringify(content);
    expect(text).not.toContain(revoked.code);
    expect(text).not.toContain(expired.code);
    expect(checkSyncSnapshot(content).status).toBe('valid');
  });

  test('[SYNC-114.2] holds a record whose units have not all arrived', async () => {
    const setup = await twoPhones();
    const { a, b, key } = setup;
    const id = randomId();
    await uploadAs(b, key, [
      {
        version: 1,
        stamp: await stampOf(b, NOW),
        type: 'expense',
        id,
        units: { title: { value: 'Brunch' } },
      },
    ]);
    await sync(a);
    const c = await newcomer(setup);

    await sentSnapshot(a, c);

    const brunch = (await contentFor(c, key)).records.find(
      (record) => record.id === id,
    );
    expect(brunch).toMatchObject({ type: 'expense', seeded: false });
    expect(Object.keys(unitsOf(brunch))).toEqual(['title']);
  });

  test('[SYNC-114.2] covers the cursor, and still holds what the phone uploaded after it', async () => {
    const setup = await twoPhones();
    const { a, key } = setup;
    await addExpense(a);
    await sync(a);
    const c = await newcomer(setup);

    const result = await sendSnapshot(a, c);

    expect(result).toMatchObject({ outcome: 'uploaded', sequence: 0 });
    const content = await contentFor(c, key);
    expect(content.sequence).toBe(0);
    expect(recordWith(content, 'expense', 'title', 'Dinner')).toBeDefined();
  });

  test('[SYNC-114.2] holds nothing the phone keeps to itself, and nothing of its other data', async () => {
    const setup = await twoPhones({ tokyoShared: true });
    const { a, b, A, key, brisbane, tokyo } = setup;
    await a.groups.setGroupArchived(a.database, brisbane, true);
    await addPersonalExpense(a, 'Zanzibar ferry');
    await addExpense(a, { title: 'Sushi', group: tokyo });
    // An event Casey's phone uploads under Taylor's device ID: Taylor's phone refuses it.
    await uploadAs(b, key, [
      await created(b, 'Hacked', { ms: NOW, counter: 7, device: A }),
    ]);
    await sync(a);
    const c = await newcomer(setup);

    await sentSnapshot(a, c);

    const stored = await fetched(c);
    const text = Buffer.from(joined(key, stored!, stored!.chunks)!).toString(
      'utf8',
    );
    for (const absent of [
      'Zanzibar',
      'Sushi',
      'Hacked',
      tokyo,
      a.identity.userId,
      'position',
      'archived":true',
    ]) {
      expect(text).not.toContain(absent);
    }
    const content = JSON.parse(text) as SyncSnapshot;
    // Every unit is one its record's type has: no unit holds the archive or an order.
    expect(checkSyncSnapshot(content)).toEqual({
      status: 'valid',
      snapshot: content,
    });
    expect(Object.keys(content).sort()).toEqual([
      'eventVersion',
      'groupId',
      'records',
      'sequence',
      'uncategorized',
      'version',
    ]);
    for (const record of content.records) {
      expect(Object.keys(record).sort()).toEqual(
        ['created', 'id', 'seeded', 'type', 'units'].sort(),
      );
    }
  });
});

describe('SYNC-115.1', () => {
  test('[SYNC-115.1] makes no snapshot while the ledger has unsent events', async () => {
    const setup = await twoPhones();
    const { a } = setup;
    const c = await newcomer(setup);
    await addExpense(a);
    const from = mark();

    expect(await sendSnapshot(a, c)).toEqual({ outcome: 'unsent-events' });
    expect(sent().slice(from)).toEqual([]);

    await sync(a);
    expect(await sendSnapshot(a, c)).toEqual(UPLOADED);
  });

  test("[SYNC-115.1] does not count another shared ledger's unsent events", async () => {
    const setup = await twoPhones({ tokyoShared: true });
    const { a, tokyo } = setup;
    const c = await newcomer(setup);
    await addExpense(a, { title: 'Sushi', group: tokyo });

    expect(await sendSnapshot(a, c)).toEqual(UPLOADED);
  });

  test('[SYNC-115.1] throws for a group that is no shared ledger, and sends nothing', async () => {
    const setup = await twoPhones();
    const { a, tokyo } = setup;
    const c = await newcomer(setup);
    expect(await sendSnapshot(a, c)).toEqual(UPLOADED);
    const from = mark();

    await expect(sendSnapshot(a, c, tokyo)).rejects.toThrow();

    expect(sent().slice(from)).toEqual([]);
  });

  test('[SYNC-115.1] says the ledger has unsent events before it says the phone lacks the key', async () => {
    const setup = await twoPhones({ keys: false });
    const { a } = setup;
    const c = await newcomer(setup, { key: false });
    expect(await sendSnapshot(a, c)).toEqual({ outcome: 'no-key' });
    await addExpense(a);

    expect(await sendSnapshot(a, c)).toEqual({ outcome: 'unsent-events' });
  });
});

describe('SYNC-116.1', () => {
  test('[SYNC-116.1] a small snapshot is one chunk, sealed with the group key and seven lines of associated data', async () => {
    const setup = await twoPhones({ expenses: ['Dinner'] });
    const { a, A, key, brisbane } = setup;
    const c = await newcomer(setup);

    const { snapshotId } = await sentSnapshot(a, c);

    const stored = await fetched(c);
    expect(stored).toMatchObject({
      snapshotId,
      deviceId: A,
      epoch: 1,
      count: 1,
    });
    const plaintext = opensWith(
      key,
      utf8(
        [
          'shared-expense/snapshot/v1',
          brisbane,
          snapshotId,
          A,
          '1',
          '0',
          '1',
        ].join('\n'),
      ),
      stored!.chunks[0],
    );
    expect(plaintext).toBeDefined();
    const text = Buffer.from(plaintext!).toString('utf8');
    expect(JSON.stringify(JSON.parse(text))).toBe(text);
    expect((JSON.parse(text) as SyncSnapshot).groupId).toBe(brisbane);
    expect(stored!.chunks[0].length).toBe(plaintext!.length + 41);
  });

  test('[SYNC-116.1] a larger snapshot is cut every 262,103 bytes, and its chunks join to the same JSON', async () => {
    const setup = await twoPhones({ expenses: LONG_TITLES });
    const { a, key } = setup;
    const c = await newcomer(setup);

    await sentSnapshot(a, c);

    const stored = await fetched(c);
    expect(stored!.count).toBe(3);
    expect(stored!.chunks.map((chunk) => chunk.length).slice(0, 2)).toEqual([
      262_144, 262_144,
    ]);
    const plaintext = joined(key, stored!, stored!.chunks)!;
    expect(plaintext.length).toBe(2 * PIECE + stored!.chunks[2].length - 41);
    const text = Buffer.from(plaintext).toString('utf8');
    expect(JSON.stringify(JSON.parse(text))).toBe(text);
    expect(
      (JSON.parse(text) as SyncSnapshot).records
        .filter((record) => record.type === 'expense')
        .map((record) => unitsOf(record).title.value)
        .sort(),
    ).toEqual(LONG_TITLES);
  });

  test('[SYNC-116.1] a chunk does not open when one line of its associated data differs', async () => {
    const setup = await twoPhones({ expenses: ['Dinner'] });
    const { a, B, key, tokyo } = setup;
    const c = await newcomer(setup);
    await sentSnapshot(a, c);
    const stored = (await fetched(c))!;
    const [chunk] = stored.chunks;
    expect(opensWith(key, associatedData(stored, 0), chunk)).toBeDefined();

    for (const data of [
      associatedData({ ...stored, groupId: tokyo }, 0),
      associatedData({ ...stored, snapshotId: randomId() }, 0),
      associatedData({ ...stored, deviceId: B }, 0),
      associatedData({ ...stored, epoch: 2 }, 0),
      associatedData(stored, 1),
      associatedData({ ...stored, count: 4 }, 0),
      utf8(`${Buffer.from(associatedData(stored, 0)).toString('utf8')}\n`),
    ]) {
      expect(opensWith(key, data, chunk)).toBeUndefined();
    }
  });

  test('[SYNC-116.1] every chunk has a nonce of its own from the random source, and every snapshot an ID of its own', async () => {
    const setup = await twoPhones({ expenses: LONG_TITLES });
    const { a } = setup;
    const c = await newcomer(setup);
    const from = mark();

    const first = await sentSnapshot(a, c);
    const second = await sentSnapshot(a, c);

    expect(first.snapshotId).toMatch(UUID);
    expect(second.snapshotId).toMatch(UUID);
    expect(second.snapshotId).not.toBe(first.snapshotId);
    const nonces = uploadedChunks(from).map((chunk) =>
      chunk.content.subarray(1, 25),
    );
    expect(nonces).toHaveLength(6);
    expect(
      new Set(nonces.map((nonce) => Buffer.from(nonce).toString('hex'))).size,
    ).toBe(6);
    for (const nonce of nonces) {
      expect(drewFromTheRandomSource(nonce)).toBe(true);
    }
    expect(forbiddenDraws()).toEqual([]);
  });

  test("[SYNC-116.1] encrypts under the phone's key epoch", async () => {
    const setup = await twoPhones({ expenses: ['Dinner'] });
    const { a, key, brisbane } = setup;
    const c = await newcomer(setup);
    const next = randomKey();
    await setEpoch(brisbane, 2);
    await saveKey(a, brisbane, 2, next);
    const from = mark();

    await sentSnapshot(a, c);

    expect(uploadedChunks(from).map((chunk) => chunk.epoch)).toEqual([2]);
    const stored = (await fetched(c))!;
    expect(stored.epoch).toBe(2);
    expect(joined(next, stored, stored.chunks)).toBeDefined();
    expect(joined(key, stored, stored.chunks)).toBeUndefined();
    expect(joined(key, { ...stored, epoch: 1 }, stored.chunks)).toBeUndefined();
  });

  test('[SYNC-116.1] the content leaves the phone only as ciphertext', async () => {
    const setup = await twoPhones();
    const { a } = setup;
    const c = await newcomer(setup);
    await addExpense(a, { title: 'Zanzibar ferry', note: 'Stone Town pier' });
    await sync(a);
    const from = mark();

    await sentSnapshot(a, c);

    const requests = sent().slice(from);
    expect(requests.length).toBeGreaterThan(0);
    for (const request of requests) {
      expect(requestHolds(request, 'Zanzibar')).toBe(false);
      expect(requestHolds(request, 'Stone Town')).toBe(false);
    }
    expect(await apiDatabaseHolds('Zanzibar')).toBe(false);
    expect(await apiDatabaseHolds('Stone Town')).toBe(false);
  });
});

describe('SYNC-117.1', () => {
  test('[SYNC-117.1] uploads the chunks in order, one at a time, each saying what the snapshot is', async () => {
    const setup = await twoPhones({ expenses: LONG_TITLES });
    const { a, b, A, key } = setup;
    const five = [];
    for (const title of ['One', 'Two', 'Three', 'Four', 'Five']) {
      five.push(await created(b, title, await stampOf(b, NOW)));
    }
    await uploadAs(b, key, five);
    await sync(a);
    const c = await newcomer(setup);
    const C = await deviceId(c);
    const from = mark();

    const result = await sendSnapshot(a, c);

    const chunks = uploadedChunks(from);
    expect(result).toEqual({
      outcome: 'uploaded',
      snapshotId: chunks[0].snapshotId,
      sequence: 5,
    });
    expect(
      chunks.map(({ content, ...said }) => [said, content.length > 41]),
    ).toEqual(
      [0, 1, 2].map((index) => [
        {
          groupId: a.brisbane,
          snapshotId: chunks[0].snapshotId,
          index,
          by: A,
          deviceId: C,
          epoch: 1,
          sequence: 5,
          count: 3,
          reached: true,
          status: 200,
        },
        true,
      ]),
    );
    expect(mostRequestsAtOnce()).toBe(1);
    expect((await fetched(c))?.snapshotId).toBe(chunks[0].snapshotId);
  });

  test('[SYNC-117.1] leaves the local data as it was', async () => {
    const setup = await twoPhones({ expenses: ['Dinner'] });
    const { a } = setup;
    const c = await newcomer(setup);
    const before = everythingIn(a);

    expect(await sendSnapshot(a, c)).toEqual(UPLOADED);

    expect(everythingIn(a)).toEqual(before);
  });
});

describe('SYNC-118.1', () => {
  test('[SYNC-118.1] reports a failure with no network, and changes nothing', async () => {
    const setup = await twoPhones({ expenses: ['Dinner'] });
    const { a } = setup;
    const c = await newcomer(setup);
    const before = everythingIn(a);
    goOffline();

    expect(await sendSnapshot(a, c)).toEqual(FAILED);

    expect(everythingIn(a)).toEqual(before);
  });

  test('[SYNC-118.1] stops at a chunk that gets no answer, and a later upload is a new snapshot', async () => {
    const setup = await twoPhones({ expenses: LONG_TITLES });
    const { a } = setup;
    const c = await newcomer(setup);
    noAnswerTo('PUT', 1);
    const from = mark();

    expect(await sendSnapshot(a, c)).toEqual(FAILED);

    const sentFirst = uploadedChunks(from);
    expect(sentFirst.map((chunk) => chunk.index)).toEqual([0]);
    expect(await fetched(c)).toBeUndefined();

    const again = mark();
    const second = await sentSnapshot(a, c);
    expect(second.snapshotId).not.toBe(sentFirst[0].snapshotId);
    expect(uploadedChunks(again).map((chunk) => chunk.index)).toEqual([
      0, 1, 2,
    ]);
    expect((await fetched(c))?.snapshotId).toBe(second.snapshotId);
  });

  test('[SYNC-118.1] reports a failure when the answer to the last chunk is lost', async () => {
    const setup = await twoPhones({ expenses: LONG_TITLES });
    const { a } = setup;
    const c = await newcomer(setup);
    loseAnswerTo('PUT', 2);
    const from = mark();

    expect(await sendSnapshot(a, c)).toEqual(FAILED);

    // The API has every chunk, so that snapshot is complete there until the next one.
    const [lost] = uploadedChunks(from);
    expect((await fetched(c))?.snapshotId).toBe(lost.snapshotId);
    const second = await sentSnapshot(a, c);
    expect(second.snapshotId).not.toBe(lost.snapshotId);
    expect((await fetched(c))?.snapshotId).toBe(second.snapshotId);
  });

  test.each<[string, (snapshotId: string) => unknown]>([
    ['an empty object', () => ({})],
    ['another snapshot ID', () => ({ snapshotId: randomId(), index: 0 })],
    ['another index', (snapshotId) => ({ snapshotId, index: 1 })],
    ['no JSON', () => 'not json'],
  ])(
    '[SYNC-118.1] does not take status 200 with %s for a confirmation',
    async (_case, body) => {
      const setup = await twoPhones({ expenses: LONG_TITLES });
      const { a } = setup;
      const c = await newcomer(setup);
      // The right answer is one: with it the upload goes on.
      answerUpload(0, (snapshotId) => ({ snapshotId, index: 0 }));
      noAnswerTo('PUT', 1);
      expect(await sendSnapshot(a, c)).toEqual(FAILED);
      expect(faultsLeft()).toBe(0);
      answerUpload(0, body);
      const from = mark();

      expect(await sendSnapshot(a, c)).toEqual(FAILED);

      expect(faultsLeft()).toBe(0);
      expect(snapshotRequests(from)).toEqual([]);
    },
  );

  test('[SYNC-118.1] reports a failure for status 500, and for a refusal that is not about room', async () => {
    const setup = await twoPhones({ expenses: LONG_TITLES });
    const { a } = setup;
    const c = await newcomer(setup);

    for (const [status, body] of [
      [500, ''],
      [403, { error: 'not-a-member' }],
      [404, { error: 'no-snapshot' }],
      [400, { error: 'request' }],
    ] as const) {
      answerNext('PUT', 0, status, body);
      const from = mark();

      expect(await sendSnapshot(a, c)).toEqual(FAILED);

      expect(faultsLeft()).toBe(0);
      expect(snapshotRequests(from)).toEqual([]);
    }
  });

  test('[SYNC-118.1] reports that the snapshots are full when the API says so, and sends no more chunks', async () => {
    const setup = await twoPhones({ expenses: LONG_TITLES });
    const { a } = setup;
    const c = await newcomer(setup);
    answerNext('PUT', 1, 413, { error: 'snapshots-full' });
    const from = mark();

    expect(await sendSnapshot(a, c)).toEqual({ outcome: 'snapshots-full' });

    expect(faultsLeft()).toBe(0);
    expect(uploadedChunks(from).map((chunk) => chunk.index)).toEqual([0]);
  });

  test('[SYNC-118.1] gives up a chunk that has had no answer for 60 seconds', async () => {
    const setup = await twoPhones({ expenses: ['Dinner'] });
    const { a } = setup;
    const c = await newcomer(setup);
    setClock(a, NOW);
    neverAnswer('PUT', 0);

    const result = await afterSixtySeconds(a, () => sendSnapshot(a, c));

    expect(result).toEqual(FAILED);
  });
});

describe('SYNC-119.1', () => {
  test('[SYNC-119.1] encrypts again under the key epoch the API names when the phone has that key', async () => {
    const setup = await twoPhones({ expenses: ['Dinner'] });
    const { a, key, brisbane } = setup;
    const c = await newcomer(setup);
    const next = randomKey();
    await setEpoch(brisbane, 2);
    giveKey(a, brisbane, 2, next);
    const from = mark();

    const result = await sendSnapshot(a, c);

    const chunks = uploadedChunks(from);
    expect(
      chunks.map(({ index, epoch, status }) => [index, epoch, status]),
    ).toEqual([
      [0, 1, 409],
      [0, 2, 200],
    ]);
    expect(chunks[1].snapshotId).not.toBe(chunks[0].snapshotId);
    expect(result).toMatchObject({
      outcome: 'uploaded',
      snapshotId: chunks[1].snapshotId,
    });
    const stored = (await fetched(c))!;
    expect(stored.epoch).toBe(2);
    expect(joined(next, stored, stored.chunks)).toBeDefined();
    expect(joined(key, { ...stored, epoch: 1 }, stored.chunks)).toBeUndefined();

    // The phone's own key epoch is as it was: its next upload of events still says 1 first.
    await addExpense(a, { title: 'Coffee' });
    const later = mark();
    await sync(a);
    expect((await uploads(a, later))[0].epoch).toBe(1);
  });

  test('[SYNC-119.1] reports a failure when the phone lacks the key of that epoch', async () => {
    const setup = await twoPhones({ expenses: ['Dinner'] });
    const { a, brisbane } = setup;
    const c = await newcomer(setup);
    await setEpoch(brisbane, 2);
    const from = mark();

    expect(await sendSnapshot(a, c)).toEqual(FAILED);

    expect(
      uploadedChunks(from).map(({ epoch, status }) => [epoch, status]),
    ).toEqual([[1, 409]]);
  });

  test('[SYNC-119.1] tries once more and no more', async () => {
    const setup = await twoPhones({ expenses: ['Dinner'] });
    const { a, brisbane } = setup;
    const c = await newcomer(setup);
    giveKey(a, brisbane, 2, randomKey());
    giveKey(a, brisbane, 3, randomKey());
    answerNext('PUT', 0, 409, { error: 'epoch', epoch: 2 });
    answerNext('PUT', 0, 409, { error: 'epoch', epoch: 3 });
    const from = mark();

    expect(await sendSnapshot(a, c)).toEqual(FAILED);

    expect(faultsLeft()).toBe(0);
    expect(snapshotRequests(from)).toEqual([]);
  });
});

describe('SYNC-120.1', () => {
  test('[SYNC-120.1] sends nothing without the group key', async () => {
    const setup = await twoPhones({ expenses: ['Dinner'], keys: false });
    const { a } = setup;
    const c = await newcomer(setup, { key: false });
    const from = mark();

    expect(await sendSnapshot(a, c)).toEqual({ outcome: 'no-key' });

    expect(sent().slice(from)).toEqual([]);
  });

  test('[SYNC-120.1] sends nothing while the secure store cannot be read', async () => {
    const setup = await twoPhones({ expenses: ['Dinner'] });
    const { a } = setup;
    const c = await newcomer(setup);
    expect(await sendSnapshot(a, c)).toEqual(UPLOADED);
    failSecureStoreReads(a);
    const from = mark();

    expect(await sendSnapshot(a, c)).toEqual({ outcome: 'no-key' });

    expect(snapshotRequests(from)).toEqual([]);
  });

  test('[SYNC-120.1] stops and reports no key when the secure store cannot be read after a chunk was uploaded, and starts over later', async () => {
    const setup = await twoPhones({ expenses: LONG_TITLES });
    const { a } = setup;
    const c = await newcomer(setup);
    const from = mark();
    whenAnswered('PUT', 0, async () => failSecureStoreReads(a));

    expect(await sendSnapshot(a, c)).toEqual({ outcome: 'no-key' });

    expect(faultsLeft()).toBe(0);
    const first = uploadedChunks(from);
    expect(first.map((chunk) => chunk.index)).toEqual([0]);
    expect(first[0].count).toBe(3);
    secureStoreWorks(a);
    const again = mark();
    expect(await sendSnapshot(a, c)).toEqual(UPLOADED);
    const second = uploadedChunks(again);
    expect(second.map((chunk) => chunk.index)).toEqual([0, 1, 2]);
    expect(second[0].snapshotId).not.toBe(first[0].snapshotId);
  });

  test('[SYNC-120.1] sends nothing of a snapshot that would take more than 64 chunks', async () => {
    const titles = Array.from({ length: 285 }, (_, index) =>
      String(index).padStart(3, '0').padEnd(60_000, 'x'),
    );
    const setup = await twoPhones({ expenses: titles });
    const { a } = setup;
    const c = await newcomer(setup);
    const from = mark();

    expect(await sendSnapshot(a, c)).toEqual({ outcome: 'too-large' });
    // Without the key it says that first (SYNC-115.1).
    failSecureStoreReads(a);
    expect(await sendSnapshot(a, c)).toEqual({ outcome: 'no-key' });

    expect(sent().slice(from)).toEqual([]);
  }, 120_000);
});
