import {
  NOW,
  addExpense,
  answerNext,
  apiDatabaseHolds,
  associatedData,
  created,
  downloads,
  drewFromTheRandomSource,
  editExpense,
  endWorld,
  forbiddenDraws,
  fromHex,
  keyEntry,
  ledgerOf,
  loseAnswerTo,
  loseSeed,
  mark,
  moveToTrash,
  noAnswerTo,
  opened,
  opensWith,
  plaintextOf,
  randomId,
  randomKey,
  renameGroup,
  requestHolds,
  restart,
  restoreFromTrash,
  saveKey,
  secureStoreEntry,
  seedSettings,
  sent,
  sentBy,
  setClock,
  setEpoch,
  setStoredBytes,
  stampOf,
  startWorld,
  storedContents,
  storedEvents,
  sync,
  titles,
  toHex,
  twoPhones,
  unsent,
  uploadAs,
  uploadedContent,
  uploads,
  utf8,
  whenAnswered,
  writeKeyEntry,
  type Phone,
} from './sync-loop-app';

// Runs in Node against the real API (sync-loop-app): what a phone uploads, and what it
// does when an upload is not confirmed.

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

/** The API's limit on a request's body (SHARING-48.2). */
const BODY_LIMIT = 1_048_576;
/** The group limit of the event API (SYNC-56.1). */
const GROUP_LIMIT = 10_485_760;

/** The IDs of the phone's unsent events, in the order it wrote them. */
const unsentIds = async (phone: Phone) =>
  (await unsent(phone)).map((event) => event.id);

/** The IDs of the events the API has stored for Brisbane, in sequence order. */
const storedIds = async (groupId: string) =>
  (await storedEvents(groupId)).map((event) => event.eventId);

/** Writes `count` events on the phone, one for each rename of Brisbane. */
async function writeEvents(phone: Phone, count: number) {
  for (let index = 0; index < count; index += 1) {
    await renameGroup(phone, `Trip ${index + 1}`);
  }
  return unsentIds(phone);
}

describe('SYNC-67.1', () => {
  test('[SYNC-67.1] uploads each event encrypted under the group key, bound to the group, the event, the device and the key epoch', async () => {
    const { a, A, brisbane, key } = await twoPhones();
    await addExpense(a);
    const [dinner] = await unsent(a);
    const from = mark();

    await sync(a);

    const [upload] = await uploads(a, from);
    expect(upload.epoch).toBe(1);
    expect(upload.events.map((event) => event.id)).toEqual([dinner.id]);
    const [stored] = await storedEvents(brisbane);
    expect(toHex(stored.content)).toBe(upload.events[0].content);
    const plaintext = opensWith(
      key,
      utf8(`shared-expense/event/v1\n${brisbane}\n${dinner.id}\n${A}\n1`),
      stored.content,
    );
    expect(plaintext && toHex(plaintext)).toBe(
      toHex(plaintextOf(dinner.content)),
    );
    expect(stored.content).toHaveLength(
      plaintextOf(dinner.content).length + 41,
    );
  });

  test('[SYNC-67.1] encrypts text outside ASCII as UTF-8, and the other phone reads the same text', async () => {
    const { a, b, A, brisbane, key } = await twoPhones();
    // Characters that take two, three and four bytes in UTF-8.
    const title = '晚餐 🍜🧡';
    const note = 'Café ½ ₩ — naïve';
    await addExpense(a, { title, note });
    const [written] = await unsent(a);

    await sync(a);

    // What the API holds opens to the event's JSON as Node encodes it.
    const [stored] = await storedEvents(brisbane);
    const plaintext = opened(
      key,
      { groupId: brisbane, eventId: written.id, deviceId: A, epoch: 1 },
      stored.content,
    );
    expect(plaintext && toHex(plaintext)).toBe(
      toHex(plaintextOf(written.content)),
    );
    expect(stored.content).toHaveLength(
      plaintextOf(written.content).length + 41,
    );

    await sync(b);

    const [dinner] = (await ledgerOf(b)).expenses;
    expect([dinner.title, dinner.note]).toEqual([title, note]);
    expect(await ledgerOf(b)).toEqual(await ledgerOf(a));
  });

  test('[SYNC-67.1] the ciphertext opens with no other associated data', async () => {
    const { a, A, B, brisbane, tokyo, key } = await twoPhones();
    await addExpense(a);
    await sync(a);
    const [stored] = await storedEvents(brisbane);
    const envelope = {
      groupId: brisbane,
      eventId: stored.eventId,
      deviceId: A,
      epoch: 1,
    };

    expect(opened(key, envelope, stored.content)).toBeDefined();
    for (const other of [
      { ...envelope, groupId: tokyo },
      { ...envelope, eventId: randomId() },
      { ...envelope, deviceId: B },
      { ...envelope, epoch: 2 },
    ]) {
      expect(opened(key, other, stored.content)).toBeUndefined();
    }
    const withALineFeed = new Uint8Array([...associatedData(envelope), 0x0a]);
    expect(opensWith(key, withALineFeed, stored.content)).toBeUndefined();
    expect(opened(randomKey(), envelope, stored.content)).toBeUndefined();
  });

  test('[SYNC-67.1] takes a new nonce from expo-crypto for every encryption, also when an event is uploaded again', async () => {
    const { a } = await twoPhones();
    await addExpense(a);
    await addExpense(a, { title: 'Lunch' });
    await addExpense(a, { title: 'Taxi' });
    loseAnswerTo('POST');
    const from = mark();

    await sync(a);
    await sync(a);

    const contents = (await uploads(a, from)).flatMap((upload) =>
      upload.events.map((event) => fromHex(event.content)),
    );
    expect(contents).toHaveLength(6);
    // A ciphertext is its format version, the 24-byte nonce, then the rest (SHARING-1.1).
    const nonces = contents.map((content) => content.subarray(1, 25));
    expect(new Set(nonces.map(toHex)).size).toBe(6);
    expect(nonces.map(drewFromTheRandomSource)).toEqual(nonces.map(() => true));
    expect(forbiddenDraws()).toEqual([]);
  });

  test('[SYNC-67.1] encrypts under the key epoch of the phone', async () => {
    const { a, A, brisbane, key } = await twoPhones();
    const second = randomKey();
    await setEpoch(brisbane, 2);
    await saveKey(a, brisbane, 2, second);
    await addExpense(a);
    const [dinner] = await unsent(a);
    const from = mark();

    await sync(a);

    expect((await uploads(a, from)).map((upload) => upload.epoch)).toEqual([2]);
    const [stored] = await storedEvents(brisbane);
    const envelope = {
      groupId: brisbane,
      eventId: dinner.id,
      deviceId: A,
      epoch: 2,
    };
    expect(stored.epoch).toBe(2);
    expect(opened(second, envelope, stored.content)).toBeDefined();
    expect(opened(key, envelope, stored.content)).toBeUndefined();
    expect(opened(key, { ...envelope, epoch: 1 }, stored.content)).toBe(
      undefined,
    );
  });

  test('[SYNC-67.1] what an event holds leaves the phone as ciphertext only', async () => {
    const { a } = await twoPhones();
    await addExpense(a, { title: 'Zanzibar ferry', note: 'Stone Town pier' });
    const from = mark();

    await sync(a);

    const requests = sent().slice(from);
    expect(requests.length).toBeGreaterThan(1);
    for (const text of ['Zanzibar', 'Stone Town']) {
      expect(requests.filter((request) => requestHolds(request, text))).toEqual(
        [],
      );
      expect(await apiDatabaseHolds(text)).toBe(false);
    }
  });
});

describe('SYNC-76.1', () => {
  test('[SYNC-76.1] uploads the unsent events in the order the phone wrote them', async () => {
    const { a, brisbane } = await twoPhones();
    await addExpense(a);
    await editExpense(a, 'Dinner', { title: 'Supper' });
    await moveToTrash(a, 'Supper');
    await restoreFromTrash(a, 'Supper');
    const ids = await unsentIds(a);
    expect(ids).toHaveLength(4);
    const from = mark();

    await sync(a);

    expect(
      (await uploads(a, from)).map((upload) =>
        upload.events.map((event) => event.id),
      ),
    ).toEqual([ids]);
    expect(
      (await storedEvents(brisbane)).map((event) => [
        event.sequence,
        event.eventId,
      ]),
    ).toEqual(ids.map((id, index) => [index + 1, id]));
  });

  test('[SYNC-76.1] puts at most 100 events in a request, and sends the rest in the requests after it', async () => {
    const { a, brisbane } = await twoPhones();
    const ids = await writeEvents(a, 250);
    const from = mark();

    await sync(a);

    expect(
      (await uploads(a, from)).map((upload) => upload.events.length),
    ).toEqual([100, 100, 50]);
    expect(await storedIds(brisbane)).toEqual(ids);
    expect(await unsent(a)).toEqual([]);
  });

  test('[SYNC-76.1] sends exactly 100 events in one request', async () => {
    const { a, brisbane } = await twoPhones();
    const ids = await writeEvents(a, 100);
    const from = mark();

    await sync(a);

    expect(
      (await uploads(a, from)).map((upload) => upload.events.length),
    ).toEqual([100]);
    expect(await storedIds(brisbane)).toEqual(ids);
  });

  test('[SYNC-76.1] keeps a request within 1,048,576 bytes: seven events of 65,536 bytes, then the eighth', async () => {
    const { a, b, brisbane } = await twoPhones();
    // How long a note makes an event exactly 65,536 bytes, measured on the other phone:
    // the events differ only in what is as long on both.
    await addExpense(b, { title: 'Big 0', note: 'a' });
    const [trial] = await unsent(b);
    const noteLength = 1 + 65_536 - (plaintextOf(trial.content).length + 41);
    for (let index = 1; index <= 8; index += 1) {
      // A millisecond apart, so every stamp has counter 0 and is as long as the others.
      setClock(a, NOW + index);
      await addExpense(a, {
        title: `Big ${index}`,
        note: 'a'.repeat(noteLength),
      });
    }
    const events = await unsent(a);
    expect(
      events.map((event) => plaintextOf(event.content).length + 41),
    ).toEqual(Array.from({ length: 8 }, () => 65_536));
    const from = mark();

    await sync(a);

    const sentUploads = await uploads(a, from);
    expect(sentUploads.map((upload) => upload.events.length)).toEqual([7, 1]);
    expect(sentUploads.filter((upload) => upload.bytes > BODY_LIMIT)).toEqual(
      [],
    );
    expect(await storedIds(brisbane)).toEqual(events.map((event) => event.id));
  });
});

describe('SYNC-77.1', () => {
  test('[SYNC-77.1] forgets an unsent event once the API has confirmed its upload', async () => {
    const { a, brisbane } = await twoPhones();
    await addExpense(a);

    await sync(a);

    expect(await unsent(a)).toEqual([]);
    expect(await storedEvents(brisbane)).toHaveLength(1);
  });

  test('[SYNC-77.1] keeps an event whose answer was lost, and uploads it again under the same event ID', async () => {
    const { a, brisbane } = await twoPhones();
    await addExpense(a);
    const before = await unsent(a);
    loseAnswerTo('POST');

    await sync(a);

    expect(await unsent(a)).toEqual(before);
    expect(await storedIds(brisbane)).toEqual([before[0].id]);

    const from = mark();
    await sync(a);

    const [again] = await uploads(a, from);
    expect(again.events.map((event) => event.id)).toEqual([before[0].id]);
    expect(again.status).toBe(200);
    expect(await storedIds(brisbane)).toEqual([before[0].id]);
    expect(await unsent(a)).toEqual([]);
  });

  test('[SYNC-77.1] forgets the events of a confirmed request, and keeps those of the request after it that got no answer', async () => {
    const { a, brisbane } = await twoPhones();
    const ids = await writeEvents(a, 250);
    // The second upload never gets an answer, and never reaches the API.
    whenAnswered('POST', async () => noAnswerTo('POST'));

    await sync(a);

    expect(await unsentIds(a)).toEqual(ids.slice(100));
    expect(await storedIds(brisbane)).toEqual(ids.slice(0, 100));

    await sync(a);

    expect(await storedIds(brisbane)).toEqual(ids);
    expect(await unsent(a)).toEqual([]);
  });

  test.each<[string, (id: string) => unknown]>([
    ['an empty object', () => '{}'],
    ['a list of no events', () => ({ events: [] })],
    [
      'a list that names another event',
      () => ({ events: [{ id: randomId(), sequence: 1 }] }),
    ],
    [
      'a list that names one event more',
      (id) => ({
        events: [
          { id, sequence: 1 },
          { id: randomId(), sequence: 2 },
        ],
      }),
    ],
  ])(
    '[SYNC-77.1] keeps the events when the answer with status 200 is %s',
    async (_case, answer) => {
      const { a } = await twoPhones();
      await addExpense(a);
      const before = await unsent(a);
      answerNext('POST', 200, answer(before[0].id));
      const from = mark();

      await sync(a);

      expect(await uploads(a, from)).toHaveLength(1);
      expect(await unsent(a)).toEqual(before);
    },
  );
});

describe('SYNC-78.1', () => {
  test('[SYNC-78.1] keeps the events when the upload gets no answer, and uploads them at the next sync', async () => {
    const { a, brisbane } = await twoPhones();
    await addExpense(a);
    const before = await unsent(a);
    noAnswerTo('POST');

    await sync(a);

    expect(await unsent(a)).toEqual(before);
    expect(await storedEvents(brisbane)).toEqual([]);
    expect(await titles(a)).toEqual(['Dinner']);

    await sync(a);

    expect(await storedIds(brisbane)).toEqual([before[0].id]);
    expect(await unsent(a)).toEqual([]);
  });

  test('[SYNC-78.1] ends the sync when the API still asks it to wait after the one wait, and tries again at the next sync', async () => {
    const { a, brisbane } = await twoPhones();
    await addExpense(a);
    const before = await unsent(a);
    answerNext('POST', 429, { error: 'too-many-requests', retryAfterMs: 0 });
    answerNext('POST', 429, {
      error: 'too-many-requests',
      retryAfterMs: 30_000,
    });
    const from = mark();

    await sync(a);

    expect((await uploads(a, from)).map((upload) => upload.status)).toEqual([
      429, 429,
    ]);
    expect(await unsent(a)).toEqual(before);

    await sync(a);

    expect(await storedIds(brisbane)).toEqual([before[0].id]);
  });

  test.each<[string, number, unknown]>([
    ['a refusal as no member device', 403, { error: 'not-a-member' }],
    ['status 500', 500, ''],
    ['status 404', 404, 'not found'],
    ['status 200 with other text', 200, 'oops'],
  ])(
    '[SYNC-78.1] keeps the events when the answer to an upload is %s',
    async (_case, status, body) => {
      const { a } = await twoPhones();
      await addExpense(a);
      const before = await unsent(a);
      answerNext('POST', status, body);
      const from = mark();

      await sync(a);

      expect(await uploads(a, from)).toHaveLength(1);
      expect(await unsent(a)).toEqual(before);
      expect(await titles(a)).toEqual(['Dinner']);
    },
  );

  test('[SYNC-78.1] sends nothing, and keeps the events, on a phone that has lost its authorization', async () => {
    const { a } = await twoPhones();
    const start = mark();
    await sync(a);
    expect(await downloads(a, start)).toEqual(['after=0']);
    await loseSeed(a);
    await addExpense(a);
    const from = mark();

    await sync(a);

    expect(sent().slice(from)).toEqual([]);
    expect(await unsent(a)).toHaveLength(1);
    expect(await titles(a)).toEqual(['Dinner']);
  });

  test('[SYNC-78.1] keeps the order of the events across a failed upload and changes saved after it', async () => {
    const { a, brisbane } = await twoPhones();
    await addExpense(a);
    noAnswerTo('POST');
    await sync(a);
    await addExpense(a, { title: 'Lunch' });
    const ids = await unsentIds(a);
    expect(ids).toHaveLength(2);

    await sync(a);

    expect(await storedIds(brisbane)).toEqual(ids);
    expect(await unsent(a)).toEqual([]);
  });
});

describe('SYNC-79.1', () => {
  /** The API's key epoch of Brisbane is 2, and Taylor's phone, with the key of epoch 1 only, has synced Dinner and Lunch. */
  async function refusedForItsEpoch() {
    const setup = await twoPhones();
    const { a, brisbane } = setup;
    await setEpoch(brisbane, 2);
    await addExpense(a);
    await addExpense(a, { title: 'Lunch' });
    const before = await unsent(a);
    const from = mark();
    await sync(a);
    return { ...setup, before, from };
  }

  test('[SYNC-79.1] keeps the events of an upload refused for its key epoch while it has no key of the epoch the API names', async () => {
    const { a, brisbane, before, from } = await refusedForItsEpoch();

    expect(
      (await uploads(a, from)).map((upload) => [upload.epoch, upload.status]),
    ).toEqual([[1, 409]]);
    expect(await unsent(a)).toEqual(before);
    expect(await storedEvents(brisbane)).toEqual([]);
    expect(await titles(a)).toEqual(['Dinner', 'Lunch']);
  });

  test('[SYNC-79.1] encrypts the same events under the new key once it has it, and loses none', async () => {
    const { a, A, brisbane, key, before } = await refusedForItsEpoch();
    const second = randomKey();
    await saveKey(a, brisbane, 2, second);
    const from = mark();

    await sync(a);

    expect(
      (await uploads(a, from)).map((upload) => [upload.epoch, upload.status]),
    ).toEqual([[2, 200]]);
    const stored = await storedEvents(brisbane);
    expect(stored.map((event) => [event.eventId, event.epoch])).toEqual(
      before.map((event) => [event.id, 2]),
    );
    expect(await storedContents(brisbane, second)).toEqual(
      before.map((event) => event.content),
    );
    expect(
      opened(key, { ...stored[0], deviceId: A }, stored[0].content),
    ).toBeUndefined();
    expect(await unsent(a)).toEqual([]);
  });

  test('[SYNC-79.1] sends the upload again in the same sync under the epoch the API names, when it has that key', async () => {
    const { a, brisbane } = await twoPhones();
    const second = randomKey();
    await setEpoch(brisbane, 2);
    await saveKey(a, brisbane, 2, second);
    await saveKey(a, brisbane, 3, randomKey());
    await addExpense(a);
    const [dinner] = await unsent(a);
    const from = mark();

    await sync(a);

    expect(
      (await uploads(a, from)).map((upload) => [upload.epoch, upload.status]),
    ).toEqual([
      [3, 409],
      [2, 200],
    ]);
    expect(await storedContents(brisbane, second)).toEqual([dinner.content]);
    expect(await storedIds(brisbane)).toEqual([dinner.id]);
    expect(await unsent(a)).toEqual([]);
  });

  test('[SYNC-79.1] sends an upload again for its key epoch only once in a sync', async () => {
    const { a, brisbane } = await twoPhones();
    await saveKey(a, brisbane, 2, randomKey());
    await saveKey(a, brisbane, 3, randomKey());
    await addExpense(a);
    const before = await unsent(a);
    answerNext('POST', 409, { error: 'epoch', epoch: 2 });
    answerNext('POST', 409, { error: 'epoch', epoch: 3 });
    const from = mark();

    await sync(a);

    expect((await uploads(a, from)).map((upload) => upload.epoch)).toEqual([
      3, 2,
    ]);
    expect(await unsent(a)).toEqual(before);
  });
});

describe('SYNC-82.1', () => {
  /** Brisbane is 100 bytes short of its limit on the API, and Taylor's phone has synced Dinner. */
  async function full() {
    const setup = await twoPhones();
    const { a, brisbane } = setup;
    await setStoredBytes(brisbane, GROUP_LIMIT - 100);
    await addExpense(a);
    const from = mark();
    await sync(a);
    return { ...setup, from };
  }

  test('[SYNC-82.1] keeps the events of an upload refused because the group is full, and keeps recording', async () => {
    const { a, brisbane, from } = await full();

    expect((await uploads(a, from)).map((upload) => upload.status)).toEqual([
      413,
    ]);
    expect(await unsent(a)).toHaveLength(1);
    expect(await storedEvents(brisbane)).toEqual([]);

    await addExpense(a, { title: 'Lunch' });

    expect(await titles(a)).toEqual(['Dinner', 'Lunch']);
    expect(await unsent(a)).toHaveLength(2);
  });

  test('[SYNC-82.1] downloads as usual and tries the upload again at every sync', async () => {
    const setup = await full();
    const { a, b, brisbane, key } = setup;
    await addExpense(a, { title: 'Lunch' });
    const ids = await unsentIds(a);
    // Casey's phone uploads while the group has room for a moment.
    await setStoredBytes(brisbane, 0);
    await uploadAs(b, key, [await created(b, 'Taxi', await stampOf(b, NOW))]);
    await setStoredBytes(brisbane, GROUP_LIMIT - 100);
    const from = mark();

    await sync(a);

    expect(await downloads(a, from)).toEqual(['after=0']);
    expect(await titles(a)).toEqual(['Dinner', 'Lunch', 'Taxi']);
    expect(
      (await uploads(a, from)).map((upload) => [
        upload.events.map((event) => event.id),
        upload.status,
      ]),
    ).toEqual([[ids, 413]]);
    expect(await unsentIds(a)).toEqual(ids);
  });

  test('[SYNC-82.1] uploads the kept events, in their order, once the group has room', async () => {
    const { a, brisbane } = await full();
    await addExpense(a, { title: 'Lunch' });
    const ids = await unsentIds(a);
    await setStoredBytes(brisbane, 0);

    await sync(a);

    expect(await storedIds(brisbane)).toEqual(ids);
    expect(await unsent(a)).toEqual([]);
  });
});

describe('SYNC-94.1', () => {
  /** The key epoch and the status of each upload the phone sent since `from`. */
  const epochsOf = async (phone: Phone, from: number) =>
    (await uploads(phone, from)).map((upload) => [upload.epoch, upload.status]);

  test('[SYNC-94.1] writes a saved key as the entry of its group and key epoch, kept as the seed is', async () => {
    const { a, brisbane } = await twoPhones();
    const second = randomKey();

    await saveKey(a, brisbane, 2, second);

    expect(secureStoreEntry(a, keyEntry(brisbane, 2))).toEqual({
      value: toHex(second),
      options: await seedSettings(a),
    });
  });

  test('[SYNC-94.1] uploads under the highest key epoch a key was saved for', async () => {
    const { a, brisbane } = await twoPhones();
    await setEpoch(brisbane, 2);
    await saveKey(a, brisbane, 2, randomKey());
    await addExpense(a);
    const from = mark();

    await sync(a);

    expect(await epochsOf(a, from)).toEqual([[2, 200]]);

    // A key of an earlier epoch, saved later, does not take the phone back.
    await saveKey(a, brisbane, 1, randomKey());
    await addExpense(a, { title: 'Lunch' });
    const next = mark();

    await sync(a);

    expect(await epochsOf(a, next)).toEqual([[2, 200]]);
  });

  test('[SYNC-94.1] still knows its key epoch after a restart', async () => {
    const { a, brisbane } = await twoPhones();
    await setEpoch(brisbane, 2);
    await saveKey(a, brisbane, 2, randomKey());

    const restarted = await restart(a);
    await addExpense(restarted);
    const from = mark();
    await sync(restarted);

    expect(await epochsOf(restarted, from)).toEqual([[2, 200]]);
  });

  test('[SYNC-94.1] does not look in the secure store for a key epoch it was not given', async () => {
    const { a, brisbane } = await twoPhones();
    writeKeyEntry(a, brisbane, 2, toHex(randomKey()));
    await addExpense(a);
    const from = mark();

    await sync(a);

    expect(await epochsOf(a, from)).toEqual([[1, 200]]);
  });
});

test('[SYNC-67.1] an upload signed by the phone is what its own key epoch and events say', async () => {
  // The whole request, read as the API reads it: nothing but the key epoch and the events.
  const { a, key } = await twoPhones();
  await addExpense(a);
  const [dinner] = await unsent(a);
  const from = mark();

  await sync(a);

  const [request] = (await sentBy(a, from)).filter(
    (each) => each.method === 'POST',
  );
  const body = JSON.parse(Buffer.from(request.body).toString('utf8')) as {
    epoch: number;
    events: { id: string; content: string }[];
  };
  expect(Object.keys(body).sort()).toEqual(['epoch', 'events']);
  expect(body.events.map((event) => Object.keys(event).sort())).toEqual([
    ['content', 'id'],
  ]);
  const [upload] = await uploads(a, from);
  expect(await uploadedContent(a, key, upload, 0)).toEqual(dinner.content);
});
