import {
  NOW,
  Prepared,
  addExpense,
  addPersonalExpense,
  answerNext,
  copyOfData,
  created,
  downloads,
  endWorld,
  failSecureStoreReads,
  failingAtWrite,
  giveKey,
  goOffline,
  goOnline,
  keyOf,
  ledgerOf,
  mark,
  noAnswerTo,
  randomId,
  randomKey,
  refusals,
  restart,
  restoreData,
  saveKey,
  sealed,
  secureStoreEntries,
  secureStoreWorks,
  sent,
  sentBy,
  setApiTime,
  setClock,
  setEpoch,
  stampOf,
  startWorld,
  storedContents,
  storedEvents,
  sync,
  takeKey,
  titles,
  trySync,
  twoPhones,
  unsent,
  uploadAs,
  uploads,
  utf8,
  whenAnswered,
  writeKeyEntry,
  type Phone,
  type Setup,
} from './sync-loop-app';

// Runs in Node against the real API (sync-loop-app): what a phone does with what it
// downloads. "Casey uploads" is an upload the test writes and Casey's phone signs, so
// that these tests depend on Taylor's phone alone.

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

/** The first event of an expense titled `title`, as Casey's phone writes it at NOW. */
const expenseOf = async ({ b }: Setup, title: string, counter = 0) =>
  created(b, title, await stampOf(b, NOW, counter));

/** `count` first events of expenses, each with a stamp of its own. */
async function manyExpenses(setup: Setup, count: number) {
  const events = [];
  for (let index = 0; index < count; index += 1) {
    events.push(await expenseOf(setup, `Item ${index + 1}`, index));
  }
  return events;
}

/** The method and path of each request the phone sent since `from`. */
const requestsOf = async (phone: Phone, from: number) =>
  (await sentBy(phone, from)).map(
    (request) => `${request.method} ${request.path}`,
  );

describe('SYNC-66.1', () => {
  test('[SYNC-66.1] encrypts with the key the secure store holds under the group and the key epoch', async () => {
    const { a, brisbane, key } = await twoPhones();
    await addExpense(a);
    const [dinner] = await unsent(a);

    await sync(a);

    expect(await storedContents(brisbane, key)).toEqual([dinner.content]);
  });

  test.each([
    ['62 hexadecimal characters', 'ab'.repeat(31)],
    ['uppercase hexadecimal', 'AB'.repeat(32)],
    ['other text', 'not a key'],
  ])('[SYNC-66.1] takes an entry of %s for no key', async (_case, value) => {
    const { a, brisbane } = await twoPhones({ keys: false });
    writeKeyEntry(a, brisbane, 1, value);
    await addExpense(a);
    const from = mark();

    await sync(a);

    expect(await downloads(a, from)).toEqual(['after=0']);
    expect(await uploads(a, from)).toEqual([]);
    expect(await unsent(a)).toHaveLength(1);
  });

  test("[SYNC-66.1] does not use another ledger's key", async () => {
    const { a, tokyo } = await twoPhones({ keys: false });
    giveKey(a, tokyo, 1, randomKey());
    await addExpense(a);
    const from = mark();

    await sync(a);

    expect(await downloads(a, from)).toEqual(['after=0']);
    expect(await uploads(a, from)).toEqual([]);
    expect(await unsent(a)).toHaveLength(1);
  });
});

describe('SYNC-95.1', () => {
  test('[SYNC-95.1] uploads nothing while it has no key of the group, and uploads once it has one', async () => {
    const { a, brisbane, key } = await twoPhones({ keys: false });
    await addExpense(a);
    const from = mark();

    await sync(a);

    expect(await requestsOf(a, from)).toEqual([
      `GET /groups/${brisbane}/events?after=0`,
    ]);
    expect(await unsent(a)).toHaveLength(1);
    expect(await titles(a)).toEqual(['Dinner']);

    giveKey(a, brisbane, 1, key);
    await sync(a);

    expect(await storedEvents(brisbane)).toHaveLength(1);
    expect(await unsent(a)).toEqual([]);
  });

  test('[SYNC-95.1] keeps the events while the secure store cannot be read, and uploads them once it can', async () => {
    const { a, brisbane } = await twoPhones();
    await addExpense(a);
    const entries = secureStoreEntries(a);
    failSecureStoreReads(a);

    await trySync(a);

    expect(await unsent(a)).toHaveLength(1);
    expect(secureStoreEntries(a)).toEqual(entries);
    expect(await storedEvents(brisbane)).toEqual([]);

    secureStoreWorks(a);
    await sync(a);

    expect(await storedEvents(brisbane)).toHaveLength(1);
  });
});

describe('SYNC-68.2', () => {
  test('[SYNC-68.2] downloads, then uploads what is unsent, then downloads again, and sends nothing else', async () => {
    const { a, brisbane, key } = await twoPhones();
    await addExpense(a);
    const [dinner] = await unsent(a);
    const from = mark();

    await sync(a);

    expect(await requestsOf(a, from)).toEqual([
      `GET /groups/${brisbane}/events?after=0`,
      `POST /groups/${brisbane}/events`,
      `GET /groups/${brisbane}/events?after=0`,
    ]);
    expect(sent().slice(from)).toHaveLength(3);
    expect(
      (await storedEvents(brisbane)).map((event) => [
        event.sequence,
        event.eventId,
      ]),
    ).toEqual([[1, dinner.id]]);
    expect(await storedContents(brisbane, key)).toEqual([dinner.content]);
    expect(await unsent(a)).toEqual([]);
  });

  test('[SYNC-68.2] sends no upload when nothing is unsent', async () => {
    const { a, brisbane } = await twoPhones();
    const from = mark();

    await sync(a);

    expect(await requestsOf(a, from)).toEqual([
      `GET /groups/${brisbane}/events?after=0`,
    ]);
  });

  test('[SYNC-68.2] applies what another phone uploaded before it uploads its own change', async () => {
    const setup = await twoPhones();
    const { a, b, brisbane, key } = setup;
    const [lunch] = await uploadAs(b, key, [await expenseOf(setup, 'Lunch')]);
    await addExpense(a);
    const [dinner] = await unsent(a);
    const from = mark();

    await sync(a);

    expect(await requestsOf(a, from)).toEqual([
      `GET /groups/${brisbane}/events?after=0`,
      `POST /groups/${brisbane}/events`,
      `GET /groups/${brisbane}/events?after=1`,
    ]);
    expect(await titles(a)).toEqual(['Dinner', 'Lunch']);
    expect(
      (await storedEvents(brisbane)).map((event) => event.eventId),
    ).toEqual([lunch, dinner.id]);
  });

  test('[SYNC-68.2] syncs the one ledger, and leaves the other ledgers and the personal data alone', async () => {
    const { a, brisbane, tokyo } = await twoPhones({ tokyoShared: true });
    await addExpense(a);
    await addExpense(a, { title: 'Sushi', group: tokyo });
    await addPersonalExpense(a, 'Coffee run');
    const from = mark();

    await sync(a, brisbane);

    const paths = (await sentBy(a, from)).map((request) => request.path);
    expect(paths).toHaveLength(3);
    expect(paths.every((path) => path.startsWith(`/groups/${brisbane}/`))).toBe(
      true,
    );
    expect(await unsent(a, tokyo)).toHaveLength(1);
    expect(await storedEvents(tokyo)).toEqual([]);
  });
});

describe('SYNC-69.2', () => {
  /** Casey has uploaded Lunch and its change to Brunch; Taylor's phone has synced once. */
  async function withBrunch() {
    const setup = await twoPhones();
    const { a, b, key } = setup;
    const lunch = await expenseOf(setup, 'Lunch');
    const renamed = {
      version: 1,
      stamp: await stampOf(b, NOW, 1),
      type: 'expense',
      id: lunch.id,
      units: { title: { value: 'Brunch', base: lunch.stamp } },
    };
    await uploadAs(b, key, [lunch, renamed]);
    const from = mark();
    await sync(a);
    return { ...setup, from };
  }

  test('[SYNC-69.2] downloads from its cursor, applies the page and moves the cursor to its last event', async () => {
    const { a, from } = await withBrunch();

    expect(await downloads(a, from)).toEqual(['after=0']);
    expect(await titles(a)).toEqual(['Brunch']);

    const next = mark();
    await sync(a);

    expect(await downloads(a, next)).toEqual(['after=2']);
  });

  test('[SYNC-69.2] downloads page after page until one says no events follow', async () => {
    const setup = await twoPhones();
    const { a, b, key } = setup;
    await uploadAs(b, key, await manyExpenses(setup, 250));
    const from = mark();

    await sync(a);

    expect(await downloads(a, from)).toEqual([
      'after=0',
      'after=100',
      'after=200',
    ]);
    const { expenses } = await ledgerOf(a);
    expect(expenses).toHaveLength(250);
    expect(new Set(expenses.map((expense) => expense.title)).size).toBe(250);

    const next = mark();
    await sync(a);

    expect(await downloads(a, next)).toEqual(['after=250']);
  });

  test('[SYNC-69.2] asks for no third page when the second says no events follow', async () => {
    const setup = await twoPhones();
    const { a, b, key } = setup;
    await uploadAs(b, key, await manyExpenses(setup, 200));
    const from = mark();

    await sync(a);

    expect(await downloads(a, from)).toEqual(['after=0', 'after=100']);
    expect((await ledgerOf(a)).expenses).toHaveLength(200);
  });

  test('[SYNC-69.2] downloads the events it uploaded itself, which change nothing', async () => {
    const { a } = await twoPhones();
    await addExpense(a);
    const ledger = await ledgerOf(a);
    const from = mark();

    await sync(a);

    // The second download brings its own event back (SYNC-160.2).
    expect(await downloads(a, from)).toEqual(['after=0', 'after=0']);
    expect(await ledgerOf(a)).toEqual(ledger);
    expect(await unsent(a)).toEqual([]);
    expect(await refusals(a)).toEqual([]);

    const next = mark();
    await sync(a);

    expect(await downloads(a, next)).toEqual(['after=1']);
    expect(await ledgerOf(a)).toEqual(ledger);
  });

  test('[SYNC-69.2] keeps its cursor while the group has nothing new', async () => {
    const { a } = await withBrunch();
    const from = mark();

    await sync(a);
    await sync(a);
    await sync(a);

    expect(await downloads(a, from)).toEqual(['after=2', 'after=2', 'after=2']);
  });

  test('[SYNC-69.2] takes a page with no events for the last one, though it says more follow, and goes on to upload', async () => {
    const { a, brisbane } = await twoPhones();
    await addExpense(a);
    answerNext('GET', 200, { events: [], more: true });
    const from = mark();

    await sync(a);

    // One download before the upload, and the one after it (SYNC-160.2).
    expect(await requestsOf(a, from)).toEqual([
      `GET /groups/${brisbane}/events?after=0`,
      `POST /groups/${brisbane}/events`,
      `GET /groups/${brisbane}/events?after=0`,
    ]);
    expect(await unsent(a)).toEqual([]);
    expect(await storedEvents(brisbane)).toHaveLength(1);
  });

  test('[SYNC-69.2] judges an event by the device the API says uploaded it', async () => {
    const setup = await twoPhones();
    const { a, b, B, key } = setup;
    // Casey's phone uploads an event whose stamp names Taylor's phone.
    const [id] = await uploadAs(b, key, [
      await created(b, 'Lunch', await stampOf(a, NOW)),
    ]);

    await sync(a);

    expect(await titles(a)).toEqual([]);
    expect(
      (await refusals(a)).map((refusal) => [
        refusal.id,
        refusal.device,
        refusal.reason,
      ]),
    ).toEqual([[id, B, 'device']]);
  });

  test('[SYNC-69.2] judges an event by the time the API received it, whenever the phone downloads it', async () => {
    const setup = await twoPhones();
    const { a, b, key } = setup;
    // Stamped 11 minutes after the API receives it.
    const [id] = await uploadAs(b, key, [
      await created(b, 'Lunch', await stampOf(b, NOW + 660_000)),
    ]);
    const aDayLater = NOW + 24 * 3_600_000;
    setApiTime(aDayLater);
    setClock(a, aDayLater);

    await sync(a);

    expect(await titles(a)).toEqual([]);
    expect(
      (await refusals(a)).map((refusal) => [
        refusal.id,
        refusal.receivedAtMs,
        refusal.reason,
      ]),
    ).toEqual([[id, NOW, 'clock']]);
  });
});

describe('SYNC-70.1', () => {
  test('[SYNC-70.1] a page is applied whole with its cursor, or not at all, whichever write fails', async () => {
    const setup = await twoPhones();
    const { b, brisbane, key } = setup;
    await uploadAs(b, key, [
      await expenseOf(setup, 'Lunch'),
      await expenseOf(setup, 'Taxi', 1),
      {
        version: 1,
        stamp: await stampOf(b, NOW, 2),
        type: 'group',
        id: brisbane,
        units: { name: { value: 'Brissie' } },
      },
    ]);
    const copy = await copyOfData(setup.a);
    const before = await ledgerOf(setup.a);

    // What a sync with no failure leaves.
    let phone = await restoreData(setup.a, copy);
    await sync(phone);
    const after = await ledgerOf(phone);
    expect(after.name).toBe('Brissie');
    expect(after.expenses.map((expense) => expense.title).sort()).toEqual([
      'Lunch',
      'Taxi',
    ]);

    let everyWriteFailedOnce = false;
    for (let nth = 1; nth <= 500 && !everyWriteFailedOnce; nth += 1) {
      // Each round is over a minute after the last, so that the rounds never add up to
      // more requests than the API takes from a device in a minute.
      setApiTime(NOW + nth * 61_000);
      phone = await restoreData(phone, copy);
      setClock(phone, NOW + nth * 61_000);
      const failing = failingAtWrite(phone.database, nth);
      await trySync(phone, failing.database);
      if (!failing.failed()) {
        everyWriteFailedOnce = true;
        break;
      }
      const held = await ledgerOf(phone);
      const from = mark();

      await sync(phone);

      // The cursor the next sync asks from says whether the page was stored.
      const [cursor] = await downloads(phone, from);
      expect([cursor, held]).toEqual(
        cursor === 'after=0' ? ['after=0', before] : ['after=3', after],
      );
      expect(await ledgerOf(phone)).toEqual(after);
    }
    expect(everyWriteFailedOnce).toBe(true);
  });

  test('[SYNC-70.1] carries on from the last page it stored when the app is ended between two pages', async () => {
    const setup = await twoPhones();
    const { a, b, key } = setup;
    await uploadAs(b, key, await manyExpenses(setup, 250));
    // The answer to the second download never comes.
    whenAnswered('GET', async () => noAnswerTo('GET'));

    await sync(a);
    const restarted = await restart(a);
    const from = mark();
    await sync(restarted);

    expect(await downloads(restarted, from)).toEqual([
      'after=100',
      'after=200',
    ]);
    const { expenses } = await ledgerOf(restarted);
    expect(expenses).toHaveLength(250);
    expect(new Set(expenses.map((expense) => expense.title)).size).toBe(250);
  });

  test('[SYNC-70.1] keeps its cursor after a restart', async () => {
    const setup = await twoPhones();
    const { a, b, key } = setup;
    await uploadAs(b, key, await manyExpenses(setup, 3));
    await sync(a);

    const restarted = await restart(a);
    const from = mark();
    await sync(restarted);

    expect(await downloads(restarted, from)).toEqual(['after=3']);
    expect((await ledgerOf(restarted)).expenses).toHaveLength(3);
  });
});

describe('SYNC-71.3', () => {
  test('[SYNC-71.3] without a network it uploads nothing and keeps what is unsent', async () => {
    const { a, brisbane } = await twoPhones();
    await addExpense(a);
    const ledger = await ledgerOf(a);
    goOffline();
    const from = mark();

    await sync(a);

    expect(await uploads(a, from)).toEqual([]);
    expect(await unsent(a)).toHaveLength(1);
    expect(await ledgerOf(a)).toEqual(ledger);

    goOnline();
    const next = mark();
    await sync(a);

    expect((await downloads(a, next))[0]).toBe('after=0');
    expect(await storedEvents(brisbane)).toHaveLength(1);
    expect(await unsent(a)).toEqual([]);
  });

  test.each<[string, number, unknown]>([
    ['an empty object', 200, '{}'],
    ['a page whose `more` is text', 200, { events: [], more: 'no' }],
    ['a page with no `more`', 200, { events: [] }],
    ['text that is no JSON', 200, 'not json'],
    ['status 500', 500, ''],
    ['status 404', 404, 'not found'],
  ])(
    '[SYNC-71.3] applies nothing and uploads nothing when the answer to a download is %s',
    async (_case, status, body) => {
      const setup = await twoPhones();
      const { a, b, key } = setup;
      await uploadAs(b, key, [await expenseOf(setup, 'Lunch')]);
      await addExpense(a);
      answerNext('GET', status, body);
      const from = mark();

      await sync(a);

      expect(await uploads(a, from)).toEqual([]);
      expect(await unsent(a)).toHaveLength(1);
      expect(await titles(a)).toEqual(['Dinner']);

      const next = mark();
      await sync(a);

      expect((await downloads(a, next))[0]).toBe('after=0');
      expect(await titles(a)).toEqual(['Dinner', 'Lunch']);
    },
  );

  test('[SYNC-71.3] with [SYNC-300.1] uploads nothing when a download is refused as no member device, and sends nothing for the ledger after that', async () => {
    const { a } = await twoPhones();
    await addExpense(a);
    const before = await unsent(a);
    answerNext('GET', 403, { error: 'not-a-member' });
    const from = mark();

    await sync(a);

    expect(await uploads(a, from)).toEqual([]);
    expect(await unsent(a)).toEqual(before);
    expect(await titles(a)).toEqual(['Dinner']);

    const next = mark();
    await sync(a);

    expect(
      (await sentBy(a, next)).map(
        (request) => `${request.method} ${request.path}`,
      ),
    ).toEqual([]);
  });

  /** A page of events Casey's phone would have uploaded, as the tests answer it. */
  async function pageOf(
    setup: Setup,
    events: { sequence: number; content: string }[],
  ) {
    return {
      events: events.map(({ sequence, content }) => ({
        id: randomId(),
        sequence,
        deviceId: setup.B,
        epoch: 1,
        receivedAtMs: NOW,
        content,
      })),
      more: false,
    };
  }

  test('[SYNC-71.3] applies nothing of a page that does not start right after its cursor', async () => {
    const setup = await twoPhones();
    const { a, B, brisbane, key } = setup;
    const page = await pageOf(setup, [{ sequence: 2, content: '' }]);
    page.events[0].content = sealed(
      key,
      { groupId: brisbane, eventId: page.events[0].id, deviceId: B, epoch: 1 },
      await expenseOf(setup, 'Lunch'),
    );
    answerNext('GET', 200, page);

    await sync(a);

    expect(await titles(a)).toEqual([]);
    const from = mark();
    await sync(a);
    expect(await downloads(a, from)).toEqual(['after=0']);
  });

  test('[SYNC-71.3] applies nothing of an answer that holds an event over 65,536 bytes', async () => {
    const setup = await twoPhones();
    const { a, B, brisbane, key } = setup;
    const page = await pageOf(setup, [
      { sequence: 1, content: '' },
      { sequence: 2, content: 'ab'.repeat(65_537) },
    ]);
    page.events[0].content = sealed(
      key,
      { groupId: brisbane, eventId: page.events[0].id, deviceId: B, epoch: 1 },
      await expenseOf(setup, 'Lunch'),
    );
    answerNext('GET', 200, page);

    await sync(a);

    expect(await titles(a)).toEqual([]);
    expect(await refusals(a)).toEqual([]);
    const from = mark();
    await sync(a);
    expect(await downloads(a, from)).toEqual(['after=0']);
  });
});

describe('SYNC-72.1', () => {
  test('[SYNC-72.1] judges an event it cannot decrypt as empty content, and goes on to the events after it', async () => {
    const setup = await twoPhones();
    const { a, b, B, brisbane, key } = setup;
    const lunch = await expenseOf(setup, 'Lunch');
    const envelope = (eventId: string) => ({
      groupId: brisbane,
      eventId,
      deviceId: B,
      epoch: 1,
    });
    const ids = [randomId(), randomId(), randomId()];
    const good = sealed(key, envelope(ids[0]), lunch);
    const changed = good.slice(0, -1) + (good.endsWith('0') ? '1' : '0');
    const ownIds = await uploadAs(b, key, [
      new Prepared(ids[0], changed),
      new Prepared(ids[1], sealed(randomKey(), envelope(ids[1]), lunch)),
      new Prepared(ids[2], sealed(key, envelope(randomId()), lunch)),
      await expenseOf(setup, 'Taxi', 1),
    ]);

    await sync(a);

    expect(await titles(a)).toEqual(['Taxi']);
    expect(await refusals(a)).toEqual(
      ids.map((id) => ({
        groupId: brisbane,
        id,
        device: B,
        receivedAtMs: NOW,
        content: null,
        reason: 'structure',
      })),
    );
    expect(ownIds.slice(0, 3)).toEqual(ids);
    const from = mark();
    await sync(a);
    expect(await downloads(a, from)).toEqual(['after=4']);
  });

  test("[SYNC-72.1] cannot decrypt an event that was encrypted as another device's upload", async () => {
    const setup = await twoPhones();
    const { a, b, A, brisbane, key } = setup;
    const id = randomId();
    await uploadAs(b, key, [
      new Prepared(
        id,
        sealed(
          key,
          { groupId: brisbane, eventId: id, deviceId: A, epoch: 1 },
          // Stamped as the device that uploads it, so only the decryption can refuse it.
          await expenseOf(setup, 'Lunch'),
        ),
      ),
    ]);

    await sync(a);

    expect(await titles(a)).toEqual([]);
    expect(await refusals(a)).toMatchObject([
      { id, content: null, reason: 'structure' },
    ]);
  });

  test.each<[string, Uint8Array]>([
    ['text that is no JSON', utf8('hello')],
    ['bytes that are no UTF-8', new Uint8Array([0xff, 0xfe])],
  ])(
    '[SYNC-72.1] judges an event whose plaintext is %s as empty content',
    async (_case, plaintext) => {
      const { a, b, key } = await twoPhones();
      const [id] = await uploadAs(b, key, [plaintext]);

      await sync(a);

      expect(await refusals(a)).toMatchObject([
        { id, content: null, reason: 'structure' },
      ]);
      const from = mark();
      await sync(a);
      expect(await downloads(a, from)).toEqual(['after=1']);
    },
  );

  test('[SYNC-72.1] keeps what a decrypted event holds when it is JSON and no event', async () => {
    const { a, b, key } = await twoPhones();
    const [id] = await uploadAs(b, key, [[1, 2]]);

    await sync(a);

    expect(await refusals(a)).toMatchObject([
      { id, content: [1, 2], reason: 'structure' },
    ]);
  });
});

describe('SYNC-73.1', () => {
  /** Casey uploaded Lunch under key epoch 1, then Taxi and Coffee under key epoch 2, whose key Taylor's phone lacks. */
  async function afterARotation() {
    const setup = await twoPhones();
    const { b, brisbane, key } = setup;
    const second = randomKey();
    await uploadAs(b, key, [await expenseOf(setup, 'Lunch')]);
    await setEpoch(brisbane, 2);
    await uploadAs(
      b,
      second,
      [await expenseOf(setup, 'Taxi', 1), await expenseOf(setup, 'Coffee', 2)],
      { epoch: 2 },
    );
    return { ...setup, second };
  }

  test('[SYNC-73.1] stops at an event in a key epoch it has no key for, with its cursor before it', async () => {
    const { a } = await afterARotation();
    const from = mark();

    await sync(a);
    const next = mark();
    await sync(a);

    expect(await downloads(a, from)).toEqual(['after=0', 'after=1']);
    expect(await downloads(a, next)).toEqual(['after=1']);
    expect(await titles(a)).toEqual(['Lunch']);
    expect(await refusals(a)).toEqual([]);
  });

  test('[SYNC-73.1] carries on from there once it has the key', async () => {
    const { a, brisbane, second } = await afterARotation();
    await sync(a);
    await saveKey(a, brisbane, 2, second);
    const from = mark();

    await sync(a);
    const next = mark();
    await sync(a);

    expect(await downloads(a, from)).toEqual(['after=1', 'after=3']);
    expect(await downloads(a, next)).toEqual(['after=3']);
    expect(await titles(a)).toEqual(['Coffee', 'Lunch', 'Taxi']);
    expect(await refusals(a)).toEqual([]);
  });

  test('[SYNC-73.1] still uploads its own events while it is stopped there', async () => {
    const setup = await twoPhones();
    const { a, b, brisbane, key } = setup;
    const second = randomKey();
    await uploadAs(b, key, [await expenseOf(setup, 'Lunch')]);
    await setEpoch(brisbane, 2);
    // Taylor's phone has the key of the group's epoch, and not the earlier one.
    takeKey(a, brisbane, 1);
    await saveKey(a, brisbane, 2, second);
    await addExpense(a);
    const [dinner] = await unsent(a);

    await sync(a);

    expect(await titles(a)).toEqual(['Dinner']);
    expect(await unsent(a)).toEqual([]);
    expect(
      (await storedEvents(brisbane)).map((event) => [
        event.sequence,
        event.epoch,
      ]),
    ).toEqual([
      [1, 1],
      [2, 2],
    ]);
    expect((await storedContents(brisbane, second))[1]).toEqual(dinner.content);
    const from = mark();
    await sync(a);
    expect(await downloads(a, from)).toEqual(['after=0']);
  });
});

describe('SYNC-74.1', () => {
  /** Casey uploaded Lunch, an event in format version 2, and Taxi. */
  async function withANewerEvent(options = {}) {
    const setup = await twoPhones(options);
    const { b, key } = setup;
    await uploadAs(b, key, [
      await expenseOf(setup, 'Lunch'),
      { ...(await expenseOf(setup, 'Newer', 1)), version: 2, extra: true },
      await expenseOf(setup, 'Taxi', 2),
    ]);
    return setup;
  }

  test('[SYNC-74.1] stops at an event in a format version it does not know, and still uploads', async () => {
    const { a, brisbane } = await withANewerEvent();
    await addExpense(a);
    const [dinner] = await unsent(a);
    const from = mark();

    await sync(a);
    await sync(a);

    // The first sync downloads again after its upload, and stops at the same event.
    expect(await downloads(a, from)).toEqual(['after=0', 'after=1', 'after=1']);
    expect(await titles(a)).toEqual(['Dinner', 'Lunch']);
    expect(await refusals(a)).toEqual([]);
    expect(await unsent(a)).toEqual([]);
    expect(
      (await storedEvents(brisbane)).map((event) => event.eventId)[3],
    ).toBe(dinner.id);
  });

  test('[SYNC-74.1] stops at an event whose ciphertext is in a format version it does not know', async () => {
    const setup = await twoPhones();
    const { a, b, B, brisbane, key } = setup;
    const id = randomId();
    const version1 = sealed(
      key,
      { groupId: brisbane, eventId: id, deviceId: B, epoch: 1 },
      await expenseOf(setup, 'Lunch'),
    );
    await uploadAs(b, key, [
      new Prepared(id, `02${version1.slice(2)}`),
      await expenseOf(setup, 'Taxi', 1),
    ]);

    await sync(a);

    expect(await titles(a)).toEqual([]);
    expect(await refusals(a)).toEqual([]);
    const from = mark();
    await sync(a);
    expect(await downloads(a, from)).toEqual(['after=0']);
  });

  test('[SYNC-74.1] keeps recording and uploading in the ledger that is stopped', async () => {
    const { a, brisbane, key } = await withANewerEvent();
    await sync(a);

    await addExpense(a, { title: 'Coffee' });
    const [coffee] = await unsent(a);
    await sync(a);

    expect(await titles(a)).toEqual(['Coffee', 'Lunch']);
    expect(await unsent(a)).toEqual([]);
    expect((await storedContents(brisbane, key)).at(-1)).toEqual(
      coffee.content,
    );
  });

  test('[SYNC-74.1] syncs its other ledgers as usual', async () => {
    const setup = await withANewerEvent({ tokyoShared: true });
    const { a, b, tokyo } = setup;
    await uploadAs(
      b,
      keyOf(b, tokyo),
      [await created(b, 'Sushi', await stampOf(b, NOW), tokyo)],
      { groupId: tokyo },
    );
    await sync(a);

    await sync(a, tokyo);

    expect(await titles(a, tokyo)).toEqual(['Sushi']);
  });
});
