import {
  AWAY,
  cleanUpAt,
  everyClockAt,
  requestsOf,
  taylorBehind,
  tokyoAlone,
  waits,
} from './sync-catch-up-app';
import {
  NOW,
  addExpense,
  answerNext,
  copyOfData,
  created,
  everythingIn,
  ledgerOf,
  mark,
  noAnswerTo,
  restart,
  restoreData,
  sentBy,
  stampOf,
  storedEvents,
  sync,
  titles,
  twoPhones,
  unsent,
  uploadAs,
  uploadedContent,
  uploads,
  whenAnswered,
  type Phone,
  type Setup,
} from './sync-loop-app';
import {
  endSnapshotWorld,
  newcomer,
  sendSnapshot,
  sentSnapshot,
  startSnapshotWorld,
  takeSnapshot,
  uploadedChunks,
} from './sync-snapshot-app';

// Runs in Node against the real API (sync-loop-app), with the API's own cleanup: the way
// out for a ledger no phone can make a snapshot of (ADR-0034). The API tells the phone
// that holds the most to go on from the number the group is cleared to, and the phone
// moves its cursor there and syncs on. An event the API confirmed stays with the phone
// until its cursor covers it, so that it goes up again when the cursor moves any other way.

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

const IMPORTED = { outcome: 'imported' };

/** A sync that uploads from cursor 0: the download, the upload, and the download after it. */
const DOWN_UP_DOWN = ['download after=0', 'upload', 'download after=0'];

/** The path and the status of each request the phone sent since `from`. */
const answersTo = async (phone: Phone, from: number) =>
  (await sentBy(phone, from)).map((request) => [request.path, request.status]);

/** The sequence numbers of the events the API stores for the group. */
const numbersOf = async (groupId: string) =>
  (await storedEvents(groupId)).map(({ sequence }) => sequence);

/**
 * Taylor's phone adds Dinner and syncs: the API confirms the upload, and the download
 * after it gets no answer. Its cursor stays at 0, before its own event, which is number 1.
 * Resolves with that event as the phone wrote it.
 */
async function uploadedAndNotCovered(phone: Phone, groupId = phone.brisbane) {
  await addExpense(phone, { group: groupId });
  const [written] = await unsent(phone, groupId);
  whenAnswered('POST', async () => noAnswerTo('GET'));
  const from = mark();
  await sync(phone, groupId);
  expect(await requestsOf(phone, from)).toEqual(DOWN_UP_DOWN);
  expect(await unsent(phone, groupId)).toEqual([]);
  return written;
}

/**
 * The phone's one upload since `from` holds exactly the event `written`, under its event
 * ID. The phone encrypts each upload anew, so the bytes it sends are not the same twice.
 */
async function expectUploadedAgain(
  phone: Phone,
  key: Uint8Array,
  from: number,
  written: Awaited<ReturnType<typeof uploadedAndNotCovered>>,
  groupId = phone.brisbane,
) {
  const sent = await uploads(phone, from, groupId);
  expect(sent.map(({ events }) => events.map(({ id }) => id))).toEqual([
    [written.id],
  ]);
  expect(await uploadedContent(phone, key, sent[0], 0, groupId)).toEqual(
    written.content,
  );
}

/** Casey's phone has uploaded Lunch, Taxi and Coffee, numbers 1 to 3, and so on for `titles`. */
async function caseyUploaded(
  { b, key }: Setup,
  expenses = ['Lunch', 'Taxi', 'Coffee'],
) {
  const events = [];
  for (const [counter, title] of expenses.entries()) {
    events.push(await created(b, title, await stampOf(b, NOW, counter)));
  }
  await uploadAs(b, key, events);
}

describe('SYNC-173.1', () => {
  test('[SYNC-173.1] with [SYNC-171.1] a phone alone in its ledger whose local data went back moves its cursor to the number the API names, and syncs on', async () => {
    const setup = await twoPhones();
    const { tokyo } = setup;
    await tokyoAlone(setup);
    await addExpense(setup.a, { group: tokyo });
    await sync(setup.a, tokyo);
    await sync(setup.a, tokyo);
    const copy = await copyOfData(setup.a);
    await addExpense(setup.a, { title: 'Lunch', group: tokyo });
    await sync(setup.a, tokyo);
    await sync(setup.a, tokyo);
    everyClockAt(setup, AWAY);
    await cleanUpAt(AWAY);
    expect(await storedEvents(tokyo)).toEqual([]);
    const a = {
      ...(await restoreData(setup.a, copy)),
      identity: setup.a.identity,
    };
    await addExpense(a, { title: 'Coffee', group: tokyo });
    const from = mark();

    await sync(a, tokyo);

    expect(await answersTo(a, from)).toEqual([
      [`/groups/${tokyo}/events?after=1`, 410],
      [`/groups/${tokyo}/events?after=2`, 200],
      [`/groups/${tokyo}/events`, 200],
      [`/groups/${tokyo}/events?after=2`, 200],
    ]);
    // Lunch went with the local data, and no phone holds it.
    expect((await titles(a, tokyo)).sort()).toEqual(['Coffee', 'Dinner']);
    expect(await unsent(a, tokyo)).toEqual([]);
    expect(await numbersOf(tokyo)).toEqual([3]);
    expect(await waits(a, tokyo)).toBe(false);
  });

  test('[SYNC-173.1] with [SYNC-161.1] uploads again the event the API confirmed and cleared before the phone’s cursor covered it', async () => {
    const setup = await twoPhones();
    const { a, tokyo } = setup;
    const key = await tokyoAlone(setup);
    const written = await uploadedAndNotCovered(a, tokyo);
    everyClockAt(setup, AWAY);
    await cleanUpAt(AWAY);
    expect(await storedEvents(tokyo)).toEqual([]);
    const from = mark();

    await sync(a, tokyo);

    expect(await answersTo(a, from)).toEqual([
      [`/groups/${tokyo}/events?after=0`, 410],
      [`/groups/${tokyo}/events?after=1`, 200],
      [`/groups/${tokyo}/events`, 200],
      [`/groups/${tokyo}/events?after=1`, 200],
    ]);
    // The same event, which the API stores as a new one (SYNC-139.1).
    await expectUploadedAgain(a, key, from, written, tokyo);
    expect(await numbersOf(tokyo)).toEqual([2]);
    expect(await titles(a, tokyo)).toEqual(['Dinner']);
    expect(await unsent(a, tokyo)).toEqual([]);

    // Its cursor covers the event now: the next sync only downloads.
    const next = mark();
    await sync(a, tokyo);
    expect(await requestsOf(a, next)).toEqual(['download after=2']);
  });

  test('[SYNC-173.1] with [SYNC-171.1] and [SYNC-161.1] when every phone is behind, the one told to go on makes the snapshot for the other, and no change is left on one phone alone', async () => {
    const setup = await twoPhones();
    const { a, b, A, brisbane } = setup;
    await uploadedAndNotCovered(a);
    everyClockAt(setup, AWAY);
    await cleanUpAt(AWAY);
    expect(await storedEvents(brisbane)).toEqual([]);

    // Casey's phone has never synced: it does not wait, so Taylor's phone is told to.
    const first = mark();
    await sync(a);
    expect(await requestsOf(a, first)).toEqual(['download after=0', 'ask']);

    // Every other member device waits, with a cursor no larger than Casey's phone has.
    const second = mark();
    await sync(b);
    expect(await answersTo(b, second)).toEqual([
      [`/groups/${brisbane}/events?after=0`, 410],
      [`/groups/${brisbane}/events?after=1`, 200],
      [expect.stringMatching(/\/chunks\/0$/), 200],
    ]);
    expect(await requestsOf(b, second)).toEqual([
      'download after=0',
      'download after=1',
      'put chunk 0',
    ]);
    expect(uploadedChunks(second)).toEqual([
      expect.objectContaining({ deviceId: A, sequence: 1 }),
    ]);
    // It never had Dinner, whose event the cleanup took.
    expect(await titles(b)).toEqual([]);

    const third = mark();
    await sync(a);
    expect(await requestsOf(a, third)).toEqual([
      'download after=0',
      'ask',
      'get chunk 0',
      'download after=1',
      'upload',
      'download after=1',
    ]);
    expect(await numbersOf(brisbane)).toEqual([2]);

    await sync(b);
    await sync(a);
    const ledger = await ledgerOf(a);
    expect(ledger).toEqual(await ledgerOf(b));
    expect(ledger.expenses.map(({ title }) => title)).toEqual(['Dinner']);
    expect(await unsent(a)).toEqual([]);
    expect(await unsent(b)).toEqual([]);
    expect([await waits(a), await waits(b)]).toEqual([false, false]);
  });

  test('[SYNC-173.1] applies none of the events before that number, keeps its records and its unsent events, and syncs on from it', async () => {
    const setup = await twoPhones();
    const { a, brisbane } = setup;
    await caseyUploaded(setup);
    await addExpense(a);
    const [waiting] = await unsent(a);
    answerNext('GET', 410, { error: 'continue', after: 3 });
    const from = mark();

    await sync(a);

    expect(await requestsOf(a, from)).toEqual([
      'download after=0',
      'download after=3',
      'upload',
      'download after=3',
    ]);
    expect(await titles(a)).toEqual(['Dinner']);
    expect(await unsent(a)).toEqual([]);
    const stored = await storedEvents(brisbane);
    expect(stored.map(({ sequence }) => sequence)).toEqual([1, 2, 3, 4]);
    expect(stored[3].eventId).toBe(waiting.id);
    expect(await waits(a)).toBe(false);
  });

  test('[SYNC-173.1] does not move its cursor back', async () => {
    const setup = await twoPhones();
    const { a } = setup;
    await caseyUploaded(setup);
    await sync(a);
    const before = await ledgerOf(a);
    answerNext('GET', 410, { error: 'continue', after: 1 });
    const from = mark();

    await sync(a);

    expect((await sentBy(a, from)).map(({ status }) => status)).toEqual([
      410, 200,
    ]);
    expect(await requestsOf(a, from)).toEqual([
      'download after=3',
      'download after=3',
    ]);
    expect(await ledgerOf(a)).toEqual(before);
  });

  test('[SYNC-173.1] moves its cursor once a sync: a second such answer ends the sync with nothing uploaded', async () => {
    const setup = await twoPhones();
    const { a } = setup;
    await caseyUploaded(setup, ['Lunch', 'Taxi', 'Coffee', 'Tea', 'Fuel']);
    await addExpense(a);
    answerNext('GET', 410, { error: 'continue', after: 3 });
    answerNext('GET', 410, { error: 'continue', after: 5 });
    const from = mark();

    await sync(a);

    expect(await requestsOf(a, from)).toEqual([
      'download after=0',
      'download after=3',
    ]);
    expect(await unsent(a)).toHaveLength(1);

    // The cursor is where the first answer put it.
    const next = mark();
    await sync(a);
    expect(await requestsOf(a, next)).toEqual([
      'download after=3',
      'upload',
      'download after=5',
    ]);
    expect(await titles(a)).toEqual(['Dinner', 'Fuel', 'Tea']);
  });

  test.each<[string, number, unknown]>([
    ['status 410 and the reason alone', 410, { error: 'continue' }],
    [
      'status 410 and a number written as text',
      410,
      { error: 'continue', after: '3' },
    ],
    ['status 410 and the number 0', 410, { error: 'continue', after: 0 }],
    [
      'status 410 and a sequence number beside the number',
      410,
      { error: 'continue', after: 3, sequence: 5 },
    ],
    ['status 200 and the answer', 200, { error: 'continue', after: 3 }],
  ])(
    '[SYNC-173.1] with [SYNC-172.1] takes %s for no answer to go on from: it moves nothing and uploads nothing',
    async (_case, status, body) => {
      const setup = await twoPhones();
      const { a } = setup;
      await caseyUploaded(setup);
      await addExpense(a);
      const localData = everythingIn(a);
      answerNext('GET', status, body);
      const from = mark();

      await sync(a);

      expect(await answersTo(a, from)).toEqual([
        [`/groups/${setup.brisbane}/events?after=0`, status],
      ]);
      expect(await unsent(a)).toHaveLength(1);
      expect(everythingIn(a)).toEqual(localData);

      // The answer itself is another matter: the phone goes on from its number.
      answerNext('GET', 410, { error: 'continue', after: 3 });
      const next = mark();
      await sync(a);
      expect((await requestsOf(a, next)).slice(0, 2)).toEqual([
        'download after=0',
        'download after=3',
      ]);
    },
  );

  test('[SYNC-173.1] a ledger that waited for a snapshot waits until the download after the move gets a page', async () => {
    const setup = await taylorBehind();
    const { a } = setup;
    const first = mark();
    await sync(a);
    expect(await requestsOf(a, first)).toEqual(['download after=0', 'ask']);
    expect(await waits(a)).toBe(true);
    answerNext('GET', 410, { error: 'continue', after: 1 });
    const from = mark();

    await sync(a);

    expect(await requestsOf(a, from)).toEqual([
      'download after=0',
      'download after=1',
    ]);
    expect(await waits(a)).toBe(false);
  });
});

describe('SYNC-161.1', () => {
  test('[SYNC-161.1] an event its cursor covers is not unsent again when the phone takes a snapshot in', async () => {
    const setup = await twoPhones();
    const { a, b, brisbane } = setup;
    await addExpense(a);
    const first = mark();
    await sync(a);
    expect(await requestsOf(a, first)).toEqual(DOWN_UP_DOWN);
    await sync(b);
    await sentSnapshot(b, a);

    expect(await takeSnapshot(a)).toEqual(IMPORTED);

    expect(await unsent(a)).toEqual([]);
    const from = mark();
    await sync(a);
    expect(await requestsOf(a, from)).toEqual(['download after=1']);
    expect(await numbersOf(brisbane)).toEqual([1]);
  });

  test('[SYNC-161.1] an event the API confirmed and its cursor does not cover yet is unsent again once the phone takes a snapshot in, and goes up as it was', async () => {
    const setup = await twoPhones();
    const { a, b, brisbane, key } = setup;
    const written = await uploadedAndNotCovered(a);
    await sync(b);
    await sentSnapshot(b, a);

    expect(await takeSnapshot(a)).toEqual(IMPORTED);

    expect(await unsent(a)).toEqual([written]);
    const from = mark();
    await sync(a);
    expect(await requestsOf(a, from)).toEqual([
      'download after=1',
      'upload',
      'download after=1',
    ]);
    await expectUploadedAgain(a, key, from, written);
    // The API still stores it, and answers with the number it has.
    expect(await numbersOf(brisbane)).toEqual([1]);
    expect(await unsent(a)).toEqual([]);

    // Confirmed under a number its cursor covers, it is kept no longer.
    await sentSnapshot(b, a);
    expect(await takeSnapshot(a)).toEqual(IMPORTED);
    expect(await unsent(a)).toEqual([]);
  });

  test('[SYNC-161.1] is kept no longer once a page of a later sync brings the event back', async () => {
    const setup = await twoPhones();
    const { a, b } = setup;
    await uploadedAndNotCovered(a);
    const from = mark();
    await sync(a);
    expect(await requestsOf(a, from)).toEqual(['download after=0']);
    await sync(b);
    await sentSnapshot(b, a);

    expect(await takeSnapshot(a)).toEqual(IMPORTED);

    expect(await unsent(a)).toEqual([]);
    const next = mark();
    await sync(a);
    expect(await requestsOf(a, next)).toEqual(['download after=1']);
  });

  test('[SYNC-161.1] does not keep the phone from making a snapshot, and is still kept after a restart', async () => {
    const setup = await twoPhones();
    const { b } = setup;
    const written = await uploadedAndNotCovered(setup.a);
    const c = await newcomer(setup);

    expect(await sendSnapshot(setup.a, c)).toMatchObject({
      outcome: 'uploaded',
      sequence: 0,
    });

    expect(await takeSnapshot(c)).toEqual(IMPORTED);
    expect(await titles(c)).toEqual(['Dinner']);
    const a = await restart(setup.a);
    expect(await unsent(a)).toEqual([]);
    await sync(b);
    await sentSnapshot(b, a);
    expect(await takeSnapshot(a)).toEqual(IMPORTED);
    expect(await unsent(a)).toEqual([written]);
  });

  test('[SYNC-161.1] with [SYNC-139.1] an event the cleanup took before the phone’s cursor covered it goes up again as a new event once the phone has caught up', async () => {
    const setup = await twoPhones();
    const { a, b, brisbane, key } = setup;
    const written = await uploadedAndNotCovered(a);
    await sync(b);
    everyClockAt(setup, AWAY);
    await cleanUpAt(AWAY);
    expect(await storedEvents(brisbane)).toEqual([]);
    // Taylor's phone is told it needs a snapshot, and Casey's phone, which keeps up, makes it.
    await sync(a);
    await sync(b);
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
    await expectUploadedAgain(a, key, from, written);
    expect(await numbersOf(brisbane)).toEqual([2]);

    await sync(b);
    await sync(a);
    const ledger = await ledgerOf(a);
    expect(ledger).toEqual(await ledgerOf(b));
    expect(ledger.expenses.map(({ title }) => title)).toEqual(['Dinner']);
    expect(await unsent(a)).toEqual([]);
    expect(await unsent(b)).toEqual([]);
  });
});
