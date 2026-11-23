import { AWAY, cleanUpAt, everyClockAt, requestsOf } from './sync-catch-up-app';
import {
  NOW,
  addExpense,
  answerNext,
  created,
  downloads,
  endWorld,
  goOffline,
  goOnline,
  loseAnswerTo,
  mark,
  noAnswerTo,
  randomId,
  renameGroup,
  sent,
  sentBy,
  setStoredBytes,
  stampOf,
  startWorld,
  storedEvents,
  sync,
  titles,
  twoPhones,
  unsent,
  uploadAs,
  uploads,
  whenAnswered,
} from './sync-loop-app';

// Runs in Node against the real API (sync-loop-app): once the API has confirmed an upload,
// the phone downloads again before the sync ends, so its cursor covers the events it has
// just uploaded (ADR-0034). A phone that uploads and is then not opened for more than 30
// days is thereby not behind the events the cleanup takes meanwhile, its own among them.

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

beforeEach(startWorld);
afterEach(endWorld);

/** The group limit of the event API (SYNC-56.1). */
const GROUP_LIMIT = 10_485_760;

/** What a sync with one unsent event sends once its upload is confirmed. */
const DOWN_UP_DOWN = ['download after=0', 'upload', 'download after=0'];

describe('SYNC-160.1', () => {
  test('[SYNC-160.1] downloads again once its upload is confirmed, and the next sync starts after its own event', async () => {
    const { a, brisbane } = await twoPhones();
    await addExpense(a);
    const from = mark();

    await sync(a);

    expect(await requestsOf(a, from)).toEqual(DOWN_UP_DOWN);
    expect(sent().slice(from)).toHaveLength(3);
    expect(await unsent(a)).toEqual([]);
    expect(await titles(a)).toEqual(['Dinner']);

    const next = mark();
    await sync(a);

    expect(await requestsOf(a, next)).toEqual(['download after=1']);
    expect(await storedEvents(brisbane)).toHaveLength(1);
  });

  test('[SYNC-160.1] a sync that uploads nothing downloads once', async () => {
    const { a } = await twoPhones();
    const from = mark();

    await sync(a);

    expect(await requestsOf(a, from)).toEqual(['download after=0']);

    // With something to upload, the same phone downloads a second time.
    await addExpense(a);
    const next = mark();
    await sync(a);
    expect(await requestsOf(a, next)).toEqual(DOWN_UP_DOWN);
  });

  test('[SYNC-160.1] a sync whose upload got no answer downloads once', async () => {
    const { a } = await twoPhones();
    await addExpense(a);
    loseAnswerTo('POST');
    const from = mark();

    await sync(a);

    expect(await requestsOf(a, from)).toEqual(['download after=0', 'upload']);
    expect(await unsent(a)).toHaveLength(1);

    // The next sync finds its event on the API, uploads it again and is told its number.
    const next = mark();
    await sync(a);
    expect(await requestsOf(a, next)).toEqual([
      'download after=0',
      'upload',
      'download after=1',
    ]);
    expect(await unsent(a)).toEqual([]);
  });

  test('[SYNC-160.1] a sync whose upload was refused because the group is full downloads once', async () => {
    const { a, brisbane } = await twoPhones();
    await addExpense(a);
    await setStoredBytes(brisbane, GROUP_LIMIT - 100);
    const from = mark();

    await sync(a);

    expect(await requestsOf(a, from)).toEqual(['download after=0', 'upload']);
    expect((await uploads(a, from)).map(({ status }) => status)).toEqual([413]);

    await setStoredBytes(brisbane, 0);
    const next = mark();
    await sync(a);
    expect(await requestsOf(a, next)).toEqual(DOWN_UP_DOWN);
  });

  test("[SYNC-160.1] the second download brings what another phone uploaded between this phone's download and its upload", async () => {
    const { a, b, brisbane, key } = await twoPhones();
    await addExpense(a);
    const [dinner] = await unsent(a);
    let lunch = '';
    whenAnswered('GET', async () => {
      [lunch] = await uploadAs(b, key, [
        await created(b, 'Lunch', await stampOf(b, NOW)),
      ]);
    });
    const from = mark();

    await sync(a);

    expect(await requestsOf(a, from)).toEqual(DOWN_UP_DOWN);
    expect(
      (await storedEvents(brisbane)).map((event) => event.eventId),
    ).toEqual([lunch, dinner.id]);
    expect(await titles(a)).toEqual(['Dinner', 'Lunch']);

    const next = mark();
    await sync(a);
    expect(await requestsOf(a, next)).toEqual(['download after=2']);
  });

  test('[SYNC-160.1] after several uploads it downloads page by page to the end', async () => {
    const { a } = await twoPhones();
    for (let index = 0; index < 250; index += 1) {
      await renameGroup(a, `Trip ${index + 1}`);
    }
    const from = mark();

    await sync(a);

    expect(await requestsOf(a, from)).toEqual([
      'download after=0',
      'upload',
      'upload',
      'upload',
      'download after=0',
      'download after=100',
      'download after=200',
    ]);

    const next = mark();
    await sync(a);
    expect(await requestsOf(a, next)).toEqual(['download after=250']);
  });

  test('[SYNC-160.1] downloads again when one upload was confirmed and the next did not reach the API', async () => {
    const { a, brisbane } = await twoPhones();
    for (let index = 0; index < 250; index += 1) {
      await renameGroup(a, `Trip ${index + 1}`);
    }
    // The second upload, once the first has been answered.
    whenAnswered('POST', async () => noAnswerTo('POST'));
    const from = mark();

    await sync(a);

    expect(await requestsOf(a, from)).toEqual([
      'download after=0',
      'upload',
      'upload',
      'download after=0',
    ]);
    expect(await storedEvents(brisbane)).toHaveLength(100);
    expect(await unsent(a)).toHaveLength(150);

    const next = mark();
    await sync(a);
    expect((await downloads(a, next))[0]).toBe('after=100');
  });

  test('[SYNC-160.1] a second download with no answer ends the sync, and the confirmed event is not uploaded again', async () => {
    const { a, brisbane } = await twoPhones();
    await addExpense(a);
    whenAnswered('POST', async () => goOffline());
    const from = mark();

    await sync(a);

    expect(await requestsOf(a, from)).toEqual(DOWN_UP_DOWN);
    expect((await sentBy(a, from)).map(({ reached }) => reached)).toEqual([
      true,
      true,
      false,
    ]);
    expect(await unsent(a)).toEqual([]);

    goOnline();
    const next = mark();
    await sync(a);
    await sync(a);

    expect(await requestsOf(a, next)).toEqual([
      'download after=0',
      'download after=1',
    ]);
    expect(await storedEvents(brisbane)).toHaveLength(1);
    expect(await titles(a)).toEqual(['Dinner']);
  });

  test.each<[string, number, unknown]>([
    ['status 500', 500, 'oops'],
    ['status 200 and no page', 200, {}],
    ['that it needs a snapshot', 410, { error: 'snapshot-needed' }],
    ['that it goes on from a number', 410, { error: 'continue', after: 5 }],
  ])(
    '[SYNC-160.1] ends the sync when the second download is answered with %s',
    async (_case, status, body) => {
      const { a } = await twoPhones();
      await addExpense(a);
      // The download that follows the upload, not the one the sync begins with.
      whenAnswered('POST', async () => answerNext('GET', status, body));
      const from = mark();

      await sync(a);

      expect(await requestsOf(a, from)).toEqual(DOWN_UP_DOWN);
      expect(sent().slice(from)).toHaveLength(3);
      expect(await unsent(a)).toEqual([]);

      // The next sync begins where this one did, finds the event and uploads nothing.
      const next = mark();
      await sync(a);
      await sync(a);
      expect(await requestsOf(a, next)).toEqual([
        'download after=0',
        'download after=1',
      ]);
    },
  );

  test('[SYNC-160.1] a change saved while it downloads again is uploaded by the next sync', async () => {
    const { a } = await twoPhones();
    await addExpense(a);
    whenAnswered('POST', async () =>
      whenAnswered('GET', async () => {
        await addExpense(a, { title: 'Lunch' });
      }),
    );
    const from = mark();

    await sync(a);

    expect(await requestsOf(a, from)).toEqual(DOWN_UP_DOWN);
    expect((await uploads(a, from)).map(({ events }) => events.length)).toEqual(
      [1],
    );
    expect(await unsent(a)).toHaveLength(1);

    const next = mark();
    await sync(a);
    expect(await requestsOf(a, next)).toEqual([
      'download after=1',
      'upload',
      'download after=1',
    ]);
    expect(await unsent(a)).toEqual([]);
  });

  test('[SYNC-160.1] the second download stops before an event in a format version it does not know, as the first did', async () => {
    const { a, b, brisbane, key } = await twoPhones();
    await uploadAs(b, key, [
      {
        version: 2,
        stamp: await stampOf(b, NOW),
        type: 'expense',
        id: randomId(),
        shape: 'something a later version of the app writes',
      },
    ]);
    await addExpense(a);
    const from = mark();

    await sync(a);
    await sync(a);

    expect(await requestsOf(a, from)).toEqual([
      'download after=0',
      'upload',
      'download after=0',
      'download after=0',
    ]);
    expect(
      (await storedEvents(brisbane)).map((event) => event.sequence),
    ).toEqual([1, 2]);
    expect(await unsent(a)).toEqual([]);
  });

  test('[SYNC-160.1] with [SYNC-136.2] a phone that uploaded and then stayed away for 31 days gets a page, though the cleanup deleted its event', async () => {
    const setup = await twoPhones();
    const { a, b, brisbane } = setup;
    await addExpense(a);
    await sync(a);
    everyClockAt(setup, AWAY);
    await cleanUpAt(AWAY);
    expect(await storedEvents(brisbane)).toEqual([]);
    const from = mark();

    await sync(a);

    expect(await requestsOf(a, from)).toEqual(['download after=1']);
    expect((await sentBy(a, from)).map(({ status }) => status)).toEqual([200]);
    expect(await titles(a)).toEqual(['Dinner']);

    // Casey's phone never had the event, and is behind what the group is cleared to.
    const other = mark();
    await sync(b);
    expect((await sentBy(b, other))[0]).toMatchObject({
      path: `/groups/${brisbane}/events?after=0`,
      status: 410,
    });
  });
});
