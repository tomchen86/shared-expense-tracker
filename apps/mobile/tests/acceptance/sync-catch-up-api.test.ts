import type { SyncSnapshot } from '@shared-expense/domain';
import {
  AWAY,
  DAY,
  UPDATE_NOTICE,
  WAITING_NOTICE,
  cleanUpAt,
  everyClockAt,
  noticesOf,
  requestsOf,
  taylorBehind,
  waits,
} from './sync-catch-up-app';
import {
  MINUTE,
  NOW,
  addExpense,
  answerNext,
  copyOfData,
  deviceId,
  editExpense,
  everythingIn,
  giveKey,
  goOffline,
  ledgerOf,
  mark,
  mostRequestsAtOnce,
  noAnswerTo as noAnswerToEvents,
  randomKey,
  renameGroup,
  restart,
  restoreData,
  saveKey,
  send,
  sentBy,
  setApiTime,
  setClock,
  setEpoch,
  storedEvents,
  sync,
  takeKey,
  titles,
  twoPhones,
  unsent,
  uploadedContent,
  uploads,
  whenAnswered,
  type Phone,
  type Setup,
} from './sync-loop-app';
import {
  answerNext as answerSnapshotRequest,
  contentFor,
  endSnapshotWorld,
  faultsLeft,
  fetched,
  newcomer,
  noAnswerTo,
  plant,
  recordWith,
  sentSnapshot,
  snapshotRequests,
  startSnapshotWorld,
  uploadedChunks,
} from './sync-snapshot-app';

// Runs in Node against the real API (sync-loop-app), with the API's own cleanup: a phone
// whose cursor is behind the events the cleanup has taken is told it needs a snapshot,
// waits while it still records, takes in the snapshot a phone that keeps up makes for it,
// and syncs on, so that every phone ends up with one ledger (ADR-0034).

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

beforeEach(startSnapshotWorld);
afterEach(endSnapshotWorld);

/** What a phone that waits sends in a sync while the group stores no snapshot for it. */
const ASKS = ['download after=0', 'ask'];

/** The expenses of Brisbane on the phone, as title and note, sorted. */
const notes = async (phone: Phone) =>
  (await ledgerOf(phone)).expenses
    .map(({ title, note }) => [title, note])
    .sort();

/** The content of the snapshot the API stores for Taylor's phone, which stays where it is. */
const snapshotFor = (setup: Setup): Promise<SyncSnapshot> =>
  contentFor(setup.a, setup.key);

describe('SYNC-164.1', () => {
  test('[SYNC-164.1] a phone that is told it needs a snapshot asks for one, and while there is none uploads nothing and keeps what is unsent', async () => {
    const { a } = await taylorBehind();
    await addExpense(a);
    const from = mark();

    await sync(a);
    await sync(a);

    expect(await requestsOf(a, from)).toEqual([...ASKS, ...ASKS]);
    expect((await sentBy(a, from)).map(({ status }) => status)).toEqual([
      410, 404, 410, 404,
    ]);
    expect(await unsent(a)).toHaveLength(1);
    expect(await titles(a)).toEqual(['Dinner']);
  });

  test('[SYNC-164.1] takes the snapshot in, downloads on from the number it covers, and uploads what was unsent', async () => {
    const setup = await taylorBehind();
    const { a, b, brisbane } = setup;
    await addExpense(a);
    const [dinner] = await unsent(a);
    await sync(a);
    expect(await sentSnapshot(b, a)).toMatchObject({ sequence: 1 });
    const from = mark();

    await sync(a);

    expect(await requestsOf(a, from)).toEqual([
      'download after=0',
      'ask',
      'get chunk 0',
      'download after=1',
      'upload',
      'download after=1',
    ]);
    expect(await titles(a)).toEqual(['Dinner', 'Lunch']);
    expect(await unsent(a)).toEqual([]);
    expect(
      (await storedEvents(brisbane)).map((event) => [
        event.sequence,
        event.eventId,
      ]),
    ).toEqual([[2, dinner.id]]);
    // The API has deleted the snapshot the phone no longer needs (SYNC-111.1).
    expect(await fetched(a)).toBeUndefined();
  });

  test('[SYNC-164.1] does not download a snapshot that covers no more than its cursor', async () => {
    const setup = await taylorBehind();
    const { a, b, key } = setup;
    await sentSnapshot(b, a);
    const content = await snapshotFor(setup);
    // The same ledger, said to cover nothing: no further than Taylor's phone already is.
    await plant(b, a, key, content, { sequence: 0 });
    const from = mark();

    await sync(a);

    expect(await requestsOf(a, from)).toEqual(ASKS);
    expect((await sentBy(a, from)).map(({ status }) => status)).toEqual([
      410, 200,
    ]);
    expect(await titles(a)).toEqual([]);
    expect(await waits(a)).toBe(true);

    // One that covers more is taken in.
    await plant(b, a, key, content, { sequence: 1 });
    await sync(a);
    expect(await titles(a)).toEqual(['Lunch']);
  });

  test('[SYNC-164.1] ends the sync when the download after the snapshot needs a snapshot again, and takes in one snapshot a sync', async () => {
    const setup = await twoPhones();
    const { a, b, key } = setup;
    await addExpense(b, { title: 'Lunch' });
    await sync(b);
    await sentSnapshot(b, a);
    const content = await snapshotFor(setup);
    await addExpense(b, { title: 'Taxi' });
    await addExpense(b, { title: 'Coffee' });
    await sync(b);
    everyClockAt(setup, AWAY);
    // Brisbane is cleared to 3, and the cleanup has taken the snapshot too (SYNC-147.1).
    await cleanUpAt(AWAY);
    expect(await fetched(a)).toBeUndefined();
    await plant(b, a, key, content, { sequence: 1 });
    await addExpense(a);
    const from = mark();

    await sync(a);

    expect(await requestsOf(a, from)).toEqual([
      'download after=0',
      'ask',
      'get chunk 0',
      'download after=1',
    ]);
    expect((await sentBy(a, from)).at(-1)?.status).toBe(410);
    expect(await titles(a)).toEqual(['Dinner', 'Lunch']);
    expect(await unsent(a)).toHaveLength(1);
    expect(await waits(a)).toBe(true);

    const next = mark();
    await sync(a);

    expect(await requestsOf(a, next)).toEqual(['download after=1', 'ask']);
    expect(await unsent(a)).toHaveLength(1);
  });

  test.each<[string, (setup: Setup, content: SyncSnapshot) => Promise<void>]>([
    [
      'has a chunk that does not open',
      async ({ a, b, key }, content) => {
        await plant(b, a, key, content, {
          sequence: 1,
          spoil: (chunks) => {
            chunks[0][chunks[0].length - 1] ^= 1;
            return chunks;
          },
        });
      },
    ],
    [
      'is asked for and the request gets no answer',
      async () => noAnswerTo('GET', 'ask'),
    ],
    [
      'has a chunk whose download gets no answer',
      async () => noAnswerTo('GET', 0),
    ],
  ])(
    '[SYNC-164.1] keeps waiting, with what is unsent, when the snapshot %s',
    async (_case, arrange) => {
      const setup = await taylorBehind();
      const { a, b } = setup;
      await addExpense(a);
      await sentSnapshot(b, a);
      await arrange(setup, await snapshotFor(setup));
      const from = mark();

      await sync(a);

      expect(faultsLeft()).toBe(0);
      expect(await uploads(a, from)).toEqual([]);
      expect(await unsent(a)).toHaveLength(1);
      expect(await titles(a)).toEqual(['Dinner']);
      expect(await waits(a)).toBe(true);

      // With a snapshot it can take in, the next sync catches up and uploads.
      await sentSnapshot(b, a);
      await sync(a);
      expect(await titles(a)).toEqual(['Dinner', 'Lunch']);
      expect(await unsent(a)).toEqual([]);
    },
  );
});

describe('SYNC-165.1', () => {
  test('[SYNC-165.1] a ledger that waits for a snapshot still records, and the phone’s other ledger syncs', async () => {
    const { a, tokyo } = await taylorBehind({ tokyoShared: true });

    await sync(a);

    expect(await waits(a)).toBe(true);
    expect(await waits(a, tokyo)).toBe(false);

    await addExpense(a);
    await renameGroup(a, 'Brissie');
    const from = mark();
    await sync(a, tokyo);

    expect((await sentBy(a, from)).map(({ status }) => status)).toEqual([200]);
    expect(await waits(a)).toBe(true);
    expect(await waits(a, tokyo)).toBe(false);
    expect((await ledgerOf(a)).name).toBe('Brissie');
    expect(await titles(a)).toEqual(['Dinner']);
    expect((await unsent(a)).map(({ content }) => content.type)).toEqual([
      'expense',
      'group',
    ]);
  });

  test('[SYNC-165.1] still waits after a restart with no network, and its unsent events are as they were', async () => {
    const { a } = await taylorBehind();
    await sync(a);
    await addExpense(a);
    await renameGroup(a, 'Brissie');
    const kept = await unsent(a);
    expect(kept).toHaveLength(2);
    goOffline();

    const restarted = await restart(a);

    expect(await waits(restarted)).toBe(true);
    expect(await unsent(restarted)).toEqual(kept);
    await sync(restarted);
    expect(await waits(restarted)).toBe(true);
    expect(await unsent(restarted)).toEqual(kept);
  });

  test('[SYNC-165.1] no longer waits once a download gets a page, also after a restart', async () => {
    const { a, b } = await taylorBehind();
    await sync(a);
    expect(await waits(a)).toBe(true);
    await sentSnapshot(b, a);

    await sync(a);

    expect(await titles(a)).toEqual(['Lunch']);
    expect(await waits(a)).toBe(false);
    expect(await waits(await restart(a))).toBe(false);
  });

  test('[SYNC-165.1] a ledger that keeps up is not waiting, and neither is a group that is no shared ledger', async () => {
    const { a, tokyo } = await twoPhones();

    await sync(a);

    expect(await waits(a)).toBe(false);
    expect(await waits(a, tokyo)).toBe(false);
  });
});

describe('SYNC-166.1', () => {
  test('[SYNC-166.1] a phone that keeps up uploads a snapshot for the phone its page names, and for nobody while its page names nobody', async () => {
    const setup = await taylorBehind();
    const { a, b, A, B } = setup;
    const before = mark();
    await sync(b);
    expect(await requestsOf(b, before)).toEqual(['download after=1']);
    // Taylor's phone is told it needs a snapshot: from now on the API names it.
    await sync(a);
    const from = mark();

    await sync(b);

    expect(await requestsOf(b, from)).toEqual([
      'download after=1',
      'put chunk 0',
    ]);
    expect(uploadedChunks(from)).toEqual([
      expect.objectContaining({
        by: B,
        deviceId: A,
        epoch: 1,
        sequence: 1,
        count: 1,
        status: 200,
      }),
    ]);
    const content = await snapshotFor(setup);
    expect(content.sequence).toBe(1);
    expect(recordWith(content, 'expense', 'title', 'Lunch')).toBeDefined();
  });

  test('[SYNC-166.1] uploads no second snapshot while the group stores one the phone can go on from', async () => {
    const { a, b } = await taylorBehind();
    await sync(a);
    const first = mark();
    await sync(b);
    expect(uploadedChunks(first)).toHaveLength(1);
    const from = mark();

    await sync(b);

    expect(await requestsOf(b, from)).toEqual(['download after=1']);
  });

  test('[SYNC-166.1] makes no snapshot while the ledger has unsent events, and makes it once they are uploaded', async () => {
    const setup = await taylorBehind();
    const { a, b, A, brisbane, key } = setup;
    await sync(a);
    takeKey(b, brisbane, 1);
    await addExpense(b, { title: 'Coffee' });
    const from = mark();

    await sync(b);

    expect(snapshotRequests(from)).toEqual([]);
    expect(await unsent(b)).toHaveLength(1);

    giveKey(b, brisbane, 1, key);
    const next = mark();
    await sync(b);

    expect(await requestsOf(b, next)).toEqual([
      'download after=1',
      'upload',
      'download after=1',
      'put chunk 0',
    ]);
    expect(uploadedChunks(next)).toEqual([
      expect.objectContaining({ deviceId: A, sequence: 2 }),
    ]);
    const content = await snapshotFor(setup);
    expect(recordWith(content, 'expense', 'title', 'Lunch')).toBeDefined();
    expect(recordWith(content, 'expense', 'title', 'Coffee')).toBeDefined();
  });

  test('[SYNC-166.1] goes by the answer to the download after its upload', async () => {
    const setup = await taylorBehind();
    const { a, b, A } = setup;
    await addExpense(b, { title: 'Coffee' });
    // Taylor's phone is told it needs a snapshot only once Casey's phone has uploaded.
    whenAnswered('POST', () => sync(a));
    const from = mark();

    await sync(b);

    expect(await requestsOf(b, from)).toEqual([
      'download after=1',
      'upload',
      'download after=1',
      'put chunk 0',
    ]);
    expect(uploadedChunks(from)).toEqual([
      expect.objectContaining({ deviceId: A, sequence: 2 }),
    ]);
  });

  test('[SYNC-166.1] a sync that ends early uploads no snapshot, and the next one that gets through does', async () => {
    const setup = await taylorBehind();
    const { a, b, A } = setup;
    await sync(a);
    await addExpense(b, { title: 'Coffee' });
    // The page that begins the sync names Taylor's phone; the download after the upload gets no answer.
    whenAnswered('POST', async () => noAnswerToEvents('GET'));
    const from = mark();

    await sync(b);

    expect(await requestsOf(b, from)).toEqual([
      'download after=1',
      'upload',
      'download after=1',
    ]);
    expect(uploadedChunks(from)).toEqual([]);

    const next = mark();
    await sync(b);
    expect(await requestsOf(b, next)).toEqual([
      'download after=1',
      'put chunk 0',
    ]);
    expect(uploadedChunks(next)).toEqual([
      expect.objectContaining({ deviceId: A, sequence: 2 }),
    ]);
  });

  /** Brisbane with a third member device; it and Taylor's phone, in that order, have been told they need a snapshot. */
  async function twoWaiting() {
    const setup = await twoPhones();
    const { a, b, brisbane } = setup;
    const c = await newcomer(setup);
    await addExpense(b, { title: 'Lunch' });
    await sync(b);
    everyClockAt(setup, AWAY);
    setClock(c, AWAY);
    await cleanUpAt(AWAY);
    expect(
      (await send(c, 'GET', `/groups/${brisbane}/events?after=0`)).status,
    ).toBe(410);
    // A second later, so that the API names the new phone first.
    everyClockAt(setup, AWAY + 1_000);
    await sync(a);
    return { ...setup, c, C: await deviceId(c) };
  }

  test('[SYNC-166.1] uploads a snapshot for each phone the page names, in its order, one after the other', async () => {
    const { b, A, C } = await twoWaiting();
    const from = mark();

    await sync(b);

    const chunks = uploadedChunks(from);
    expect(chunks.map((chunk) => chunk.deviceId)).toEqual([C, A]);
    expect(new Set(chunks.map((chunk) => chunk.snapshotId)).size).toBe(2);
    expect(chunks.map((chunk) => chunk.status)).toEqual([200, 200]);
    expect(await requestsOf(b, from)).toEqual([
      'download after=1',
      'put chunk 0',
      'put chunk 0',
    ]);
    expect(mostRequestsAtOnce()).toBe(1);
  });

  test('[SYNC-166.1] stops at a snapshot that does not upload, and makes both again at the next sync', async () => {
    const { b, A, C } = await twoWaiting();
    noAnswerTo('PUT', 0);
    const from = mark();

    await sync(b);

    expect(faultsLeft()).toBe(0);
    // The chunk that got no answer never reached the API, and none followed it.
    expect(uploadedChunks(from)).toEqual([]);

    const next = mark();
    await sync(b);

    expect(uploadedChunks(next).map((chunk) => chunk.deviceId)).toEqual([C, A]);
  });

  test.each<[string, (setup: Setup) => string]>([
    ['the word none', () => 'none'],
    ['one device ID twice', ({ A }) => `${A},${A}`],
    ['a device ID in capitals', ({ A }) => A.toUpperCase()],
  ])(
    '[SYNC-166.1] uploads no snapshot when the header holds %s',
    async (_case, value) => {
      const setup = await taylorBehind();
      const { b, A } = setup;
      const page = { events: [], more: false };
      answerNext('GET', 200, page, { 'x-snapshot-needed-by': value(setup) });
      const from = mark();

      await sync(b);

      expect(await requestsOf(b, from)).toEqual(['download after=1']);

      // The header written as SYNC-163.1 writes it has the phone upload one.
      answerNext('GET', 200, page, { 'x-snapshot-needed-by': A });
      const next = mark();
      await sync(b);
      expect(uploadedChunks(next)).toEqual([
        expect.objectContaining({ deviceId: A, sequence: 1 }),
      ]);
    },
  );
});

describe('SYNC-167.1', () => {
  test('[SYNC-167.1] a phone back after 31 days and the phone that kept up end with one ledger: nothing lost, nothing twice', async () => {
    const setup = await twoPhones({ expenses: ['Dinner'] });
    const { a, b, A, brisbane } = setup;
    await sync(a);
    await sync(b);
    // With no network, each phone changes the ledger; only Casey's phone syncs.
    await addExpense(a, { title: 'Coffee' });
    await editExpense(a, 'Dinner', { note: 'Window seat' });
    await addExpense(b, { title: 'Lunch' });
    await editExpense(b, 'Dinner', { title: 'Supper' });
    await renameGroup(b, 'Brissie');
    await sync(b);
    everyClockAt(setup, AWAY);
    await cleanUpAt(AWAY);
    expect(await storedEvents(brisbane)).toEqual([]);

    await sync(a);
    await sync(b);
    await sync(a);
    await sync(b);

    const ledger = await ledgerOf(a);
    expect(await ledgerOf(b)).toEqual(ledger);
    expect(ledger.name).toBe('Brissie');
    expect(await notes(a)).toEqual([
      ['Coffee', null],
      ['Lunch', null],
      ['Supper', 'Window seat'],
    ]);
    expect(await unsent(a)).toEqual([]);
    expect(await unsent(b)).toEqual([]);
    const stored = await storedEvents(brisbane);
    expect(stored.filter((event) => event.deviceId === A)).toHaveLength(2);

    const local = [everythingIn(a), everythingIn(b)];
    await sync(a);
    await sync(b);
    expect([everythingIn(a), everythingIn(b)]).toEqual(local);
    expect(await storedEvents(brisbane)).toHaveLength(stored.length);
  });

  test.each<[string, number, number, string]>([
    ['the other phone changed it later', NOW, NOW + MINUTE, 'Supper'],
    ['it changed it later itself', NOW + 2 * MINUTE, NOW + MINUTE, 'Brunch'],
  ])(
    '[SYNC-167.1] where both phones changed one unit and %s, the later stamp is kept on both',
    async (_case, taylorAt, caseyAt, kept) => {
      const setup = await twoPhones({ expenses: ['Dinner'] });
      const { a, b, A, brisbane } = setup;
      await sync(a);
      await sync(b);
      setClock(b, caseyAt);
      setApiTime(caseyAt);
      await editExpense(b, 'Dinner', { title: 'Supper' });
      await sync(b);
      // Taylor's phone has no network.
      setClock(a, taylorAt);
      await editExpense(a, 'Dinner', { title: 'Brunch' });
      everyClockAt(setup, NOW + 31 * DAY);
      await cleanUpAt(NOW + 31 * DAY);

      await sync(a);
      await sync(b);
      await sync(a);
      await sync(b);

      expect(await titles(a)).toEqual([kept]);
      expect(await titles(b)).toEqual([kept]);
      expect(await ledgerOf(b)).toEqual(await ledgerOf(a));
      expect(await unsent(a)).toEqual([]);
      expect(
        (await storedEvents(brisbane)).filter((event) => event.deviceId === A),
      ).toHaveLength(1);
    },
  );
});

describe('SYNC-92.2', () => {
  test('[SYNC-92.2] a phone whose local data went back behind the cleared events is told it needs a snapshot, and catches up from one', async () => {
    const setup = await twoPhones();
    const { b, brisbane } = setup;
    const copy = await copyOfData(setup.a);
    await addExpense(b, { title: 'Lunch' });
    await addExpense(b, { title: 'Taxi' });
    await sync(b);
    await sync(setup.a);
    expect(await titles(setup.a)).toEqual(['Lunch', 'Taxi']);
    everyClockAt(setup, AWAY);
    await cleanUpAt(AWAY);
    expect(await storedEvents(brisbane)).toEqual([]);
    const a = await restoreData(setup.a, copy);
    expect(await titles(a)).toEqual([]);
    const from = mark();

    await sync(a);

    expect(await requestsOf(a, from)).toEqual(['download after=0', 'ask']);
    expect((await sentBy(a, from)).map(({ status }) => status)).toEqual([
      410, 404,
    ]);
    expect(await waits(a)).toBe(true);

    await sync(b);
    await sync(a);

    expect(await titles(a)).toEqual(['Lunch', 'Taxi']);
    expect(await ledgerOf(a)).toEqual(await ledgerOf(b));
    expect(await waits(a)).toBe(false);
  });
});

describe('SYNC-314.1', () => {
  test('[SYNC-314.1] says the ledger is out of date while it waits for a snapshot the group does not store, also after a restart with no network', async () => {
    const { a } = await taylorBehind();

    await sync(a);

    expect(await waits(a)).toBe(true);
    expect(await noticesOf(a)).toEqual([WAITING_NOTICE]);

    goOffline();
    const restarted = await restart(a);
    expect(await noticesOf(restarted)).toEqual([WAITING_NOTICE]);
  });

  test('[SYNC-314.1] [SYNC-317.1] says only that the app needs an update while the snapshot it waits for is in a format version it does not know', async () => {
    const setup = await taylorBehind();
    const { a, b, key } = setup;
    await sentSnapshot(b, a);
    const content = await snapshotFor(setup);
    await plant(b, a, key, { ...content, version: 2 }, { sequence: 1 });

    await sync(a);

    expect(await waits(a)).toBe(true);
    expect(await noticesOf(a)).toEqual([UPDATE_NOTICE]);
  });

  test('[SYNC-314.1] says nothing once the phone has taken a snapshot in and got a page', async () => {
    const { a, b } = await taylorBehind();
    await sync(a);
    expect(await noticesOf(a)).toEqual([WAITING_NOTICE]);
    await sentSnapshot(b, a);

    await sync(a);

    expect(await titles(a)).toEqual(['Lunch']);
    expect(await waits(a)).toBe(false);
    expect(await noticesOf(a)).toEqual([]);
  });
});

describe('SYNC-169.1', () => {
  test('[SYNC-169.1] shows the update line while the snapshot it waits for is in a format version it does not know, and not once it has taken one in', async () => {
    const setup = await taylorBehind();
    const { a, b, key } = setup;
    await sentSnapshot(b, a);
    const content = await snapshotFor(setup);
    await plant(b, a, key, { ...content, version: 2 }, { sequence: 1 });
    const local = everythingIn(a).sync_records;

    await sync(a);

    expect(await noticesOf(a)).toEqual([UPDATE_NOTICE]);
    expect(await waits(a)).toBe(true);
    expect(everythingIn(a).sync_records).toEqual(local);
    expect(await titles(a)).toEqual([]);

    goOffline();
    const restarted = await restart(a);
    expect(await noticesOf(restarted)).toEqual([UPDATE_NOTICE]);
    expect(await waits(restarted)).toBe(true);
  });

  test('[SYNC-169.1] the line goes once a sync finds a snapshot it can take in', async () => {
    const setup = await taylorBehind();
    const { a, b, key } = setup;
    await sentSnapshot(b, a);
    const content = await snapshotFor(setup);
    await plant(b, a, key, { ...content, version: 2 }, { sequence: 1 });
    await sync(a);
    expect(await noticesOf(a)).toEqual([UPDATE_NOTICE]);
    // Casey's phone uploads its snapshot again, in the format version this app knows.
    await sentSnapshot(b, a);

    await sync(a);

    expect(await titles(a)).toEqual(['Lunch']);
    expect(await noticesOf(a)).toEqual([]);
    expect(await waits(a)).toBe(false);
  });

  /** Taylor's phone is behind, and Brisbane's screen shows the update line for the snapshot the group stores for it, of format version 2. */
  async function lineShown(): Promise<Setup> {
    const setup = await taylorBehind();
    const { a, b, key } = setup;
    await sentSnapshot(b, a);
    const content = await snapshotFor(setup);
    await plant(b, a, key, { ...content, version: 2 }, { sequence: 1 });
    await sync(a);
    expect(await noticesOf(a)).toEqual([UPDATE_NOTICE]);
    return setup;
  }

  test.each<[string, () => void]>([
    [
      'the request that asks for the snapshot gets no answer',
      () => noAnswerTo('GET', 'ask'),
    ],
    [
      'the request that asks for the snapshot is answered with status 500',
      () => answerSnapshotRequest('GET', 'ask', 500, ''),
    ],
    [
      'the request that asks for the snapshot is answered with what is no snapshot',
      () => answerSnapshotRequest('GET', 'ask', 200, '{}'),
    ],
    [
      'the download of that snapshot’s chunk gets no answer this time',
      () => noAnswerTo('GET', 0),
    ],
  ])('[SYNC-169.1] the line stays when %s', async (_case, arrange) => {
    const { a } = await lineShown();
    arrange();

    await sync(a);

    expect(faultsLeft()).toBe(0);
    expect(await noticesOf(a)).toEqual([UPDATE_NOTICE]);
    expect(await waits(a)).toBe(true);
  });

  test('[SYNC-169.1] [SYNC-314.1] the line goes once the phone is told the group stores no snapshot for it: the ledger still waits, and says so', async () => {
    const setup = await lineShown();
    const { a } = setup;
    // Thirty-one days on, the cleanup takes that snapshot (SYNC-148.1).
    everyClockAt(setup, AWAY + 31 * DAY);
    await cleanUpAt(AWAY + 31 * DAY);
    const from = mark();

    await sync(a);

    expect((await sentBy(a, from)).map(({ status }) => status)).toEqual([
      410, 404,
    ]);
    expect(await noticesOf(a)).toEqual([WAITING_NOTICE]);
    expect(await waits(a)).toBe(true);
  });

  test('[SYNC-169.1] [SYNC-314.1] the line goes once the group stores another snapshot for the phone, before the phone has read it: the ledger still waits, and says so', async () => {
    const { a, b } = await lineShown();
    // Casey's phone uploads its snapshot again, in the format version this app knows.
    await sentSnapshot(b, a);
    noAnswerTo('GET', 0);

    await sync(a);

    expect(faultsLeft()).toBe(0);
    expect(await noticesOf(a)).toEqual([WAITING_NOTICE]);
    expect(await waits(a)).toBe(true);
    expect(await titles(a)).toEqual([]);

    await sync(a);

    expect(await titles(a)).toEqual(['Lunch']);
    expect(await waits(a)).toBe(false);
  });
});

describe('SYNC-170.1', () => {
  test('[SYNC-170.1] waits while it has no key of the snapshot’s key epoch, and once it has one takes the snapshot in and uploads under that epoch', async () => {
    const setup = await taylorBehind();
    const { a, b, brisbane } = setup;
    await addExpense(a);
    const [dinner] = await unsent(a);
    await sync(a);
    // The group's key has changed while Taylor's phone was away, and Casey's phone has the new one.
    const newKey = randomKey();
    await setEpoch(brisbane, 2);
    await saveKey(b, brisbane, 2, newKey);
    await sync(b);
    expect(await fetched(a)).toMatchObject({ epoch: 2, sequence: 1 });
    const from = mark();

    await sync(a);

    // It may go on to ask the API for the key (SHARING-278.1); it takes no chunk and uploads nothing.
    const asked = await requestsOf(a, from);
    expect(asked.slice(0, 2)).toEqual(['download after=0', 'ask']);
    expect(
      asked.filter((line) => line === 'upload' || line.startsWith('get chunk')),
    ).toEqual([]);
    expect(await unsent(a)).toEqual([dinner]);
    expect(await titles(a)).toEqual(['Dinner']);
    expect(await waits(a)).toBe(true);

    await saveKey(a, brisbane, 2, newKey);
    const next = mark();
    await sync(a);

    expect(await titles(a)).toEqual(['Dinner', 'Lunch']);
    const sentUp = await uploads(a, next);
    expect(sentUp.map(({ epoch, status }) => [epoch, status])).toEqual([
      [2, 200],
    ]);
    expect(await uploadedContent(a, newKey, sentUp[0], 0)).toEqual(
      dinner.content,
    );
    expect(sentUp[0].events.map(({ id }) => id)).toEqual([dinner.id]);
    expect(await unsent(a)).toEqual([]);

    await sync(b);
    expect(await ledgerOf(b)).toEqual(await ledgerOf(a));
  });
});
